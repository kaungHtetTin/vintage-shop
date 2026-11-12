<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\HeldCart;
use App\Models\InventoryBalance;
use App\Models\Location;
use App\Models\Order;
use App\Models\ProductUnit;
use App\Models\ProductPriceType;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\CustomerRecordService;
use App\Services\POS\PosCheckoutService;
use App\Services\POS\PosSaleRevisionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use App\Support\Spa;

class PosController extends Controller
{
private function renderPos(Request $request, ?Order $editOrder = null, $editCart = []): \Symfony\Component\HttpFoundation\Response
    {
        abort_unless($request->user()->hasAdminPermission('pos.access') && config('inventory.pos_enabled', true), 403);

        $locationIds = $request->user()->accessibleLocationIds();
        $locations = Location::query()
            ->whereIn('id', $locationIds)
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'code', 'name', 'type']);

        $categories = Category::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'parent_id', 'name']);

        return Spa::render('Admin/POS/Index', [
            'locations' => $locations,
            'categories' => $categories,
            'priceTypes' => ProductPriceType::query()
                ->whereHas('product', fn ($query) => $query->where('status', 'active')->where('is_active', true))
                ->orderBy('name')
                ->pluck('name')
                ->unique()
                ->sortBy(fn ($name) => $name === 'retail' ? '0' : '1'.$name)
                ->values(),
            'can' => [
                'discount' => $request->user()->hasAdminPermission('pos.discount'),
                'credit' => $request->user()->hasAdminPermission('credit.manage'),

                'editVoucher' => $request->user()->hasAdminPermission('orders.manage') || $request->user()->hasAdminPermission('pos.void'),
            ],

            'editOrder' => $editOrder,
            'editCart' => $editCart,
        ]);
    }

    public function editSale(Request $request, Order $order)
    {
        abort_unless($request->user()->hasAdminPermission('pos.access') && config('inventory.pos_enabled', true), 403);
        abort_unless($order->sales_channel === 'pos' && $order->status !== 'cancelled', 404);
        $order->loadMissing('location');
        abort_unless($order->location && $request->user()->canAccessLocation($order->location), 403);
        $this->ensureLegacySale($order);
        $order->load([
            'items.product.primaryImage',
            'items.product.inventoryBalances' => fn ($query) => $query->where('location_id', $order->location_id),
            'items.product.units' => fn ($query) => $query->where('is_active', true)->with(['prices.typeDefinition.pricingRule'])->orderByDesc('is_default_selling')->orderBy('sort_order'),
            'items.product.baseUnit.prices',
            'items.unit',
            'items.focUnit',
            'payments',
            'user:id,name,email,phone,credit_limit,credit_terms_days,credit_status',
        ]);
        abort_unless($order->location_id && $request->user()->canAccessLocation($order->location), 403);
        abort_if($order->returns()->exists(), 422, \App\Support\UiText::get('A sale with returned items cannot be edited.'));
        if ($order->user) {
            $balance = (float) $order->user->creditTransactions()->sum('amount');
            $order->user->setAttribute('available_credit', max(0, round((float) $order->user->credit_limit - $balance + (float) $order->credit_amount, 2)));
        }

        $originalUsage = $order->items->groupBy('product_id')->map(fn ($items) => (float) $items->sum(fn ($item) => (float) $item->base_quantity + (float) $item->foc_base_quantity));
        $editCart = $order->items->map(function ($item) use ($originalUsage) {
            $product = $item->product;
            abort_unless($product && $item->unit && $product->is_active && $product->status === 'active', 422, \App\Support\UiText::get('One or more original products are no longer available.'));
            $availableBase = (float) ($product->inventoryBalances->first()?->available_qty ?? 0) + (float) ($originalUsage[$product->id] ?? 0);
            $basePrices = $product->baseUnit?->prices?->keyBy('price_type') ?? collect();
            $options = $product->units->map(function (ProductUnit $unit) use ($availableBase, $basePrices) {
                $factor = max((float) $unit->conversion_factor, 0.000001);
                $prices = $unit->prices->map(function ($price) use ($basePrices, $factor) {
                    $configured = (float) $price->price;
                    $basePrice = (float) ($basePrices->get($price->price_type)?->price ?? 0);
                    return [
                        'price_type' => $price->price_type,
                        'price' => ! $price->is_manual && $price->calculation_status === 'cost_required' && $configured <= 0 ? 0 : ($configured > 0 ? $configured : round($basePrice * $factor, 2)),
                        'display_name' => $price->typeDefinition?->pricingRule?->name ?? $price->price_type,
                    ];
                })->values();
                return [
                    'id' => $unit->id,
                    'name' => $unit->name,
                    'code' => $unit->code,
                    'conversion_factor' => (float) $unit->conversion_factor,
                    'is_base' => (bool) $unit->is_base,
                    'is_default_selling' => (bool) $unit->is_default_selling,
                    'available_qty' => floor((($availableBase / $factor) + 0.0000001) * 10000) / 10000,
                    'prices' => $prices,
                    'flash_sale' => null,
                ];
            })->values();
            $selected = $options->firstWhere('id', $item->product_unit_id);
            abort_unless($selected, 422, \App\Support\UiText::get('One or more original product units are no longer available.'));

            return [
                'id' => 'edit-'.$item->id,
                'product_unit_id' => $item->product_unit_id,
                'product_id' => $product->id,
                'product_code' => $product->product_code,
                'barcode' => $product->barcode,
                'product_name' => $product->name,
                'name' => collect([$product->name, $selected['name']])->filter()->join(' · '),
                'unit_name' => $selected['name'],
                'unit_code' => $selected['code'],
                'image_path' => $product->primaryImage?->image_path,
                'available_qty' => $selected['available_qty'],
                'available_base_qty' => $availableBase,
                'conversion_factor' => (float) $item->conversion_factor,
                'prices' => $selected['prices'],
                'flash_sale' => null,
                'unit_options' => $options,
                'price_type' => $item->price_type,
                'unit_price' => (float) $item->unit_price,
                'use_flash_sale' => false,
                'quantity' => (float) $item->quantity,
                'foc_quantity' => (float) $item->foc_quantity,
                'foc_product_unit_id' => $item->foc_product_unit_id ?: $item->product_unit_id,
            ];
        })->values();

        return $this->renderPos($request, $order, $editCart);
    }

    public function products(Request $request)
    {
        abort_unless($request->user()->hasAdminPermission('pos.access'), 403);
        $validated = $request->validate([
            'location_id' => ['required', 'integer', 'exists:locations,id'],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'q' => ['nullable', 'string', 'max:120'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:12', 'max:60'],
        ]);

        $location = Location::query()->where('is_active', true)->findOrFail($validated['location_id']);
        abort_unless($request->user()->canAccessLocation($location), 403);

        $term = trim($validated['q'] ?? '');
        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 24);

        $products = ProductUnit::query()
            ->where('is_active', true)
            ->where('is_default_selling', true)
            ->with([
                'prices',
                'product:id,product_code,barcode,name,status,is_active,category_id',
                'product.primaryImage:id,product_id,image_path',
                'product.inventoryBalances' => fn ($query) => $query->where('location_id', $location->id),
                'product.units' => fn ($query) => $query
                    ->where('is_active', true)
                    ->with('prices')
                    ->orderByDesc('is_default_selling')
                    ->orderBy('sort_order'),
            ])
            ->withSum([
                'orderItems as pos_sold_qty' => fn ($query) => $query->whereHas('order', fn ($order) => $order
                    ->where('sales_channel', 'pos')
                    ->where('location_id', $location->id)
                    ->recognizedSale()),
            ], 'quantity')
            ->when(! empty($validated['category_id']), function ($query) use ($validated) {
                $query->whereHas('product', fn ($product) => $product->where('category_id', $validated['category_id']));
            })
            ->when($term !== '', function ($query) use ($term) {
                $query->where(function ($inner) use ($term) {
                    $inner->where('code', 'like', "%{$term}%")
                        ->orWhereHas('product', fn ($product) => $product
                            ->where('name', 'like', "%{$term}%")
                            ->orWhere('product_code', 'like', "%{$term}%")
                            ->orWhere('barcode', 'like', "%{$term}%")
                            ->orWhereHas('units', fn ($units) => $units->where('is_active', true)->where(fn ($unit) => $unit
                                ->where('name', 'like', "%{$term}%")
                                ->orWhere('code', 'like', "%{$term}%"))));
                });
            })
            ->whereHas('product', fn ($product) => $product->where('status', 'active')->where('is_active', true))
            ->when($term !== '', function ($query) use ($term) {
                $query->orderByRaw(
                    'CASE WHEN EXISTS (SELECT 1 FROM products WHERE products.id = product_units.product_id AND products.barcode = ?) AND product_units.is_default_selling = 1 THEN 0 WHEN product_units.code = ? THEN 1 ELSE 2 END',
                    [$term, $term]
                );
            })
            ->orderByDesc('pos_sold_qty')
            ->orderByDesc('is_default_selling')
            ->orderBy('sort_order')
            ->offset(($page - 1) * $perPage)
            ->limit($perPage + 1)
            ->get();
        $products = $products->map(function (ProductUnit $unit)  {
                $balance = $unit->product->inventoryBalances->first();
                $availableBaseQuantity = (float) ($balance?->available_qty ?? 0);
                $factor = max((float) $unit->conversion_factor, 0.000001);
                $baseUnit = $unit->product->units->firstWhere('is_base', true);
                $basePrices = $baseUnit?->prices?->keyBy('price_type') ?? collect();
                $effectivePrices = function (ProductUnit $option) use ($basePrices) {
                    $factor = max((float) $option->conversion_factor, 0.000001);

                    return $option->prices->map(function ($price) use ($basePrices, $factor) {
                        $configured = (float) $price->price;
                        $basePrice = (float) ($basePrices->get($price->price_type)?->price ?? 0);

                        return [
                            'price_type' => $price->price_type,
                            'price' => ! $price->is_manual && $price->calculation_status === 'cost_required' && $configured <= 0 ? 0 : ($configured > 0 ? $configured : round($basePrice * $factor, 2)),
                            'display_name' => $price->typeDefinition?->pricingRule?->name ?? $price->price_type,
                            'is_derived' => $configured <= 0 && $basePrice > 0,
                        ];
                    })->values();
                };
                $unitPrices = $effectivePrices($unit);

                return [
                    'id' => $unit->id,
                    'product_unit_id' => $unit->id,
                    'product_id' => $unit->product_id,
                    'product_code' => $unit->product->product_code,
                    'barcode' => $unit->product->barcode,
                    'unit_name' => $unit->name,
                    'unit_code' => $unit->code,
                    'conversion_factor' => (float) $unit->conversion_factor,
                    'is_base' => (bool) $unit->is_base,
                    'is_default_selling' => $unit->is_default_selling,
                    'product_name' => $unit->product->name,
                    'image_path' => $unit->product->primaryImage?->image_path,
                    'prices' => $unitPrices,
                    'price' => (float) ($unitPrices->firstWhere('price_type', 'retail')['price'] ?? 0),
                    'flash_sale' => null,
                    'available_base_qty' => $availableBaseQuantity,
                    'available_qty' => floor((($availableBaseQuantity / $factor) + 0.0000001) * 10000) / 10000,
                    'unit_options' => $unit->product->units->map(function (ProductUnit $option) use ($availableBaseQuantity, $effectivePrices) {
                        $optionFactor = max((float) $option->conversion_factor, 0.000001);
                        $optionPrices = $effectivePrices($option);

                        return [
                            'id' => $option->id,
                            'name' => $option->name,
                            'code' => $option->code,
                            'conversion_factor' => (float) $option->conversion_factor,
                            'is_base' => $option->is_base,
                            'is_default_selling' => $option->is_default_selling,
                            'available_qty' => floor((($availableBaseQuantity / $optionFactor) + 0.0000001) * 10000) / 10000,
                            'prices' => $optionPrices,
                            'flash_sale' => null,
                        ];
                    })->values(),
                    'sold_qty' => (float) ($unit->pos_sold_qty ?? 0),
                ];
            });

        $hasMore = $products->count() > $perPage;

        return [
            'data' => $products->take($perPage)->values(),
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'has_more' => $hasMore,
                'next_page' => $hasMore ? $page + 1 : null,
                'mode' => $term === '' ? 'popular' : 'search',
            ],
        ];
    }

    public function customers(Request $request)
    {
        abort_unless($request->user()->hasAdminPermission('pos.access'), 403);
        $term = trim($request->string('q')->toString());

        return User::query()
            ->where('role', User::CUSTOMER_ROLE)
            ->when($term !== '', function ($query) use ($term) {
                $like = "%{$term}%";
                $query->where(fn ($inner) => $inner->where('name', 'like', $like)->orWhere('default_address', 'like', $like)->orWhere('phone', 'like', $like));
            })
            ->orderBy('name')
            ->limit(20)
            ->select(['id', 'name', 'phone', 'default_address', 'credit_limit', 'credit_terms_days', 'credit_status'])
            ->withSum('creditTransactions as credit_balance', 'amount')
            ->get()
            ->each(function (User $customer) {
                $customer->setAttribute('available_credit', max(0, round((float) $customer->credit_limit - (float) ($customer->credit_balance ?? 0), 2)));
            });
    }

    public function storeCustomer(Request $request, AuditLogService $audit, CustomerRecordService $records): \Illuminate\Http\JsonResponse
    {
        abort_unless($request->user()->hasAdminPermission('pos.access'), 403);
        $customer = $records->create($records->validate($request), $request->user());
        $audit->record('customer.created_from_pos', $customer, $customer->only(['name', 'phone', 'default_address', 'credit_limit', 'credit_terms_days']), $request);
        $customer->setAttribute('credit_balance', 0);
        $customer->setAttribute('available_credit', (float) $customer->credit_limit);

        return response()->json(['customer' => $customer->only([
            'id', 'name', 'phone', 'default_address', 'credit_limit', 'credit_terms_days',
            'credit_status', 'credit_balance', 'available_credit',
        ])], 201);
    }

    public function prices(Request $request)
    {
        $validated = $request->validate(['unit_ids' => ['required', 'array', 'max:200'], 'unit_ids.*' => ['integer']]);
        $units = ProductUnit::whereIn('id', $validated['unit_ids'])->where('is_active', true)
            ->whereHas('product', fn ($q) => $q->where('status', 'active')->where('is_active', true))
            ->with(['prices', 'product.baseUnit.prices'])->get();

        return $units->map(function (ProductUnit $unit)  {
            $prices = $unit->prices->map(function ($price) use ($unit) {
                    $base = (float) ($unit->product->baseUnit?->priceFor($price->price_type)?->price ?? 0);
                    $amount = $unit->hasUnavailableAutomaticPrice($price->price_type) ? 0 : ((float) $price->price > 0 ? (float) $price->price : round($base * (float) $unit->conversion_factor, 2));
                    return ['price_type' => $price->price_type, 'price' => $amount, 'display_name' => $price->typeDefinition?->pricingRule?->name ?? $price->price_type];
                })->values();

            return [
                'id' => $unit->id,
                'prices' => $prices,
                'flash_sale' => null,
            ];
        })->values();
    }

    public function checkout(Request $request, PosCheckoutService $service)
    {
        abort_unless($request->user()->hasAdminPermission('pos.access'), 403);
        $validated = $this->validateCheckout($request);

        try {
            $order = $service->checkout($validated, $request->user());
        } catch (ValidationException $exception) {
            return response()->json(['errors' => $exception->errors()], 422);
        }

        return response()->json([
            'order' => $order,
            'receipt_url' => route('admin.pos.orders.receipt', $order),
        ]);
    }

    public function reviseSale(Request $request, Order $order, PosSaleRevisionService $service)
    {
        abort_unless($request->user()->hasAdminPermission('pos.access'), 403);
        $order->loadMissing('location');
        abort_unless($order->location && $request->user()->canAccessLocation($order->location), 403);
        $this->ensureLegacySale($order);
        $validated = $this->validateCheckout($request);
        if ((int) $validated['location_id'] !== (int) $order->location_id) {
            throw ValidationException::withMessages(['location_id' => \App\Support\UiText::get('A revised sale must remain in its original warehouse.')]);
        }
        try {
            $replacement = $service->revise($order, $validated, $request->user());
        } catch (ValidationException $exception) {
            return response()->json(['errors' => $exception->errors()], 422);
        }

        return response()->json([
            'order' => $replacement,
            'message' => \App\Support\UiText::get('POS sale updated successfully.'),
            'receipt_url' => route('admin.pos.orders.receipt', $replacement),
        ]);
    }

    private function validateCheckout(Request $request): array
    {
        return $request->validate([
            'is_online_sale' => ['sometimes', 'boolean'],
            'location_id' => ['required', 'integer', 'exists:locations,id'],

            'customer_id' => ['nullable', 'integer', Rule::exists('users', 'id')->where('role', User::CUSTOMER_ROLE)],
            'customer_name' => ['nullable', 'string', 'max:255'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_unit_id' => ['required', 'integer', 'exists:product_units,id'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0', 'max:9999'],
            'items.*.price_type' => ['required', 'string', 'max:60'],
            'items.*.expected_unit_price' => ['sometimes', 'numeric', 'min:0'],
            'items.*.use_flash_sale' => ['sometimes', 'boolean'],
            'items.*.foc_quantity' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'items.*.foc_product_unit_id' => ['nullable', 'integer', 'exists:product_units,id'],
            'discount_type' => ['nullable', 'string', Rule::in(['percent', 'amount'])],
            'discount_value' => ['nullable', 'numeric', 'min:0'],
            'tender_type' => ['required_without:tenders', 'nullable', 'string', Rule::in(['cash', 'mmqr', 'credit'])],
            'credit_deposit_method' => ['nullable', 'string', Rule::in(['cash', 'mmqr'])],
            'amount_tendered' => ['required_without:tenders', 'nullable', 'numeric', 'min:0'],
            'tenders' => ['nullable', 'array', 'min:1', 'max:3'],
            'tenders.*.type' => ['required_with:tenders', 'string', 'distinct', Rule::in(['cash', 'mmqr', 'credit'])],
            'tenders.*.amount' => ['required_with:tenders', 'numeric', 'gt:0'],
            'tenders.*.amount_tendered' => ['nullable', 'numeric', 'min:0'],
            'tenders.*.reference' => ['nullable', 'string', 'max:100'],
            'payment_details' => ['nullable', 'array'],
            'payment_details.reference' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
    }

    public function holdCart(Request $request, AuditLogService $audit)
    {
        abort_unless($request->user()->hasAdminPermission('pos.hold'), 403);
        $validated = $request->validate([
            'location_id' => ['required', 'integer', 'exists:locations,id'],
            'customer_id' => ['nullable', 'integer', Rule::exists('users', 'id')->where('role', User::CUSTOMER_ROLE)],
            'label' => ['nullable', 'string', 'max:80'],
            'cart_payload' => ['required', 'array'],
        ]);

        $location = Location::query()->where('is_active', true)->findOrFail($validated['location_id']);
        abort_unless($request->user()->canAccessLocation($location), 403);

        $cart = HeldCart::create([
            'location_id' => $location->id,
            'cashier_id' => $request->user()->id,
            'customer_id' => $validated['customer_id'] ?? null,
            'label' => ($validated['label'] ?? null) ?: 'Held cart',
            'cart_payload' => $validated['cart_payload'],
            'expires_at' => now()->addDay(),
        ]);

        $audit->record('pos.cart.held', $cart, ['location_id' => $location->id], $request);

        return response()->json(['heldCart' => $cart, 'heldCarts' => $this->heldCarts($request)]);
    }

    public function deleteHeldCart(Request $request, HeldCart $heldCart)
    {
        abort_unless($request->user()->hasAdminPermission('pos.hold'), 403);
        abort_unless((int) $heldCart->cashier_id === (int) $request->user()->id || $request->user()->hasAdminPermission('pos.void'), 403);

        $heldCart->delete();

        return response()->json(['heldCarts' => $this->heldCarts($request)]);
    }

    public function receipt(Request $request, Order $order)
    {
        abort_unless($request->user()->hasAdminPermission('pos.access') || $request->user()->hasAdminPermission('orders.view'), 403);
        abort_unless($order->sales_channel === 'pos', 404);
        $order->loadMissing('location');
        abort_unless($order->location
            ? $request->user()->canAccessLocation($order->location)
            : $request->user()->isSuperAdmin(), 403);

        $order->load(['items.product', 'items.unit', 'items.focUnit', 'payments', 'location', 'register', 'server', 'user']);

        return Spa::render('Admin/POS/Receipt', [
            'order' => $order,
            'canEditVoucher' => ($request->user()->hasAdminPermission('orders.manage') || $request->user()->hasAdminPermission('pos.void'))
                && $order->status !== 'cancelled' && ! $order->isBaleSale() && ! $order->returns()->exists(),
        ]);
    }

    private function ensureLegacySale(Order $order): void
    {
        if ($order->isBaleSale()) {
            throw ValidationException::withMessages(['order' => \App\Support\UiText::get('Bale receipts keep their original prices. Return garments and record a new sale to correct them.')]);
        }
    }

    public function updateVoucher(Request $request, Order $order, AuditLogService $audit)
    {
        abort_unless($order->sales_channel === 'pos', 404);
        $order->loadMissing('location');
        abort_unless($order->location && $request->user()->canAccessLocation($order->location), 403);
        if ($order->status === 'cancelled') {
            throw ValidationException::withMessages(['voucher' => \App\Support\UiText::get('Cancelled sale vouchers cannot be edited.')]);
        }
        $data = $request->validate([
            'receiver_name' => ['required', 'string', 'max:255'],
            'receiver_phone' => ['nullable', 'string', 'max:50'],
            'order_notes' => ['nullable', 'string', 'max:2000'],
            'payment_references' => ['nullable', 'array'],
            'payment_references.*' => ['nullable', 'string', 'max:100'],
        ]);
        $before = $order->only(['receiver_name', 'receiver_phone', 'order_notes']);

        DB::transaction(function () use ($order, $data, $request, $audit, $before) {
            $order->forceFill([
                'receiver_name' => trim($data['receiver_name']),
                'receiver_phone' => trim((string) ($data['receiver_phone'] ?? '')) ?: null,
                'order_notes' => trim((string) ($data['order_notes'] ?? '')) ?: null,
            ])->save();

            foreach (($data['payment_references'] ?? []) as $paymentId => $reference) {
                $payment = $order->payments()->whereKey((int) $paymentId)->first();
                if (! $payment) continue;
                $details = $payment->payment_details ?: [];
                $cleanReference = trim((string) $reference);
                if ($cleanReference === '') unset($details['reference']);
                else $details['reference'] = $cleanReference;
                $payment->update(['payment_details' => $details ?: null]);
            }

            $audit->record('pos.voucher.updated', $order, [
                'before' => $before,
                'after' => $order->only(['receiver_name', 'receiver_phone', 'order_notes']),
            ], $request);
        });

        if ($request->header('X-SPA') === 'true') {
            return response()->json(['success' => true, 'message' => \App\Support\UiText::get('Voucher details updated.')]);
        }

        return back()->with('success', \App\Support\UiText::get('Voucher details updated.'));
    }

    private function heldCarts(Request $request)
    {
        return HeldCart::query()
            ->where('cashier_id', $request->user()->id)
            ->where(fn ($query) => $query->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->with(['location:id,code,name', 'customer:id,name,email,phone'])
            ->latest()
            ->get();
    }
}
