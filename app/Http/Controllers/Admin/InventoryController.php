<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\InventoryBalance;
use App\Models\InventoryMovement;
use App\Models\Location;
use App\Models\Order;
use App\Models\Product;
use App\Services\ExcelExportService;
use App\Models\ProductUnit;
use App\Models\StockAdjustment;
use App\Models\StockReceipt;
use App\Models\StockTransfer;
use App\Support\Spa;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class InventoryController extends Controller
{
    public function show(Request $request, Product $product)
    {
        abort_unless($request->user()->hasAdminPermission('inventory.history'), 403);
        $returnTo = $request->query('return_to');
        $returnParts = is_string($returnTo) && strlen($returnTo) <= 2000 ? parse_url($returnTo) : false;
        $returnToInventory = $returnParts
            && ! isset($returnParts['scheme']) && ! isset($returnParts['host'])
            && ($returnParts['path'] ?? '') === route('admin.inventory.index', [], false)
                ? $returnTo : null;
        $locationIds = $request->user()->accessibleLocationIds();
        $product->load(['baseUnit', 'defaultSellingUnit', 'units.prices']);
        $movements = InventoryMovement::query()->where('product_id', $product->id)->whereIn('location_id', $locationIds)->with(['location:id,code,name,type', 'creator:id,name', 'unit:id,name,code,conversion_factor']);
        if ($request->filled('location')) {
            $movements->where('location_id', (int) $request->location);
        }
        if ($request->filled('type')) {
            $movements->where('type', $request->type);
        }
        if ($request->filled('from')) {
            $movements->where('occurred_at', '>=', Carbon::parse($request->from)->startOfDay());
        }
        if ($request->filled('to')) {
            $movements->where('occurred_at', '<=', Carbon::parse($request->to)->endOfDay());
        }

        $balances = InventoryBalance::query()->where('product_id', $product->id)->whereIn('location_id', $locationIds)->with('location:id,code,name,type')->orderBy('location_id')->get();
        $balances->each(fn (InventoryBalance $balance) => $balance->setAttribute('stock_display', $product->displayQuantity($balance->available_qty)));

        return Spa::render('Admin/Inventory/ProductShow', [
            'product' => $product,
            'balances' => $balances,
            'movements' => $movements->latest('occurred_at')->paginate(30)->withQueryString()->through(fn (InventoryMovement $movement) => array_merge($movement->toArray(), ['document' => $this->movementDocument($movement)])),
            'locations' => Location::query()->whereIn('id', $locationIds)->orderBy('name')->get(['id', 'code', 'name']),
            'types' => InventoryMovement::query()->where('product_id', $product->id)->distinct()->orderBy('type')->pluck('type'),
            'filters' => array_merge($request->only(['location', 'type', 'from', 'to']), $returnToInventory ? ['return_to' => $returnToInventory] : []),
            'returnToInventory' => $returnToInventory,
            'realtime' => ['locationIds' => $locationIds, 'canAll' => $request->user()->isSuperAdmin()],
            'lastUpdated' => now()->toIso8601String(),
            'pollIntervalMs' => 20000,
        ]);
    }

    public function searchProducts(Request $request)
    {
        abort_unless($request->user()->hasAdminPermission('inventory.view') || $request->user()->hasAdminPermission('inventory.receive') || $request->user()->hasAdminPermission('inventory.adjust.create') || $request->user()->hasAdminPermission('inventory.transfer.create'), 403);
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'location_id' => ['required', 'integer', 'exists:locations,id'],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'paginated' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
            'group_by_product' => ['nullable', 'boolean'],
        ]);
        $location = Location::findOrFail($validated['location_id']);
        abort_unless($request->user()->canAccessLocation($location), 403);
        $term = trim($validated['q'] ?? '');

        if ($request->boolean('group_by_product')) {
            $products = Product::query()
                ->where('is_active', true)
                ->whereHas('units', fn ($scope) => $scope->where('is_active', true)->where('is_base', true))
                ->with([
                    'primaryImage:id,product_id,image_path',
                    'inventoryBalances' => fn ($scope) => $scope->where('location_id', $location->id),
                    'units' => fn ($scope) => $scope->where('is_active', true)->with('prices')->orderByDesc('is_base')->orderBy('sort_order'),
                ])
                ->when($term !== '', fn ($scope) => $scope->where(fn ($inner) => $inner
                    ->where('name', 'like', "%{$term}%")
                    ->orWhere('product_code', 'like', "%{$term}%")
                    ->orWhere('sku', 'like', "%{$term}%")
                    ->orWhere('barcode', 'like', "%{$term}%")
                    ->orWhereHas('units', fn ($units) => $units->where('is_active', true)->where(fn ($unit) => $unit
                        ->where('name', 'like', "%{$term}%")
                        ->orWhere('code', 'like', "%{$term}%")))))
                ->when(! empty($validated['category_id']), fn ($scope) => $scope->where('category_id', $validated['category_id']))
                ->orderBy('name');

            $mapProduct = function (Product $product) {
                $balance = $product->inventoryBalances->first();
                $baseAvailable = (float) ($balance?->available_qty ?? 0);
                $baseOnHand = (float) ($balance?->on_hand_qty ?? 0);
                $baseUnit = $product->units->firstWhere('is_base', true);
                $buyingCost = app(\App\Services\AutomaticPricingService::class)->readCost($product);

                $unitPayload = fn (ProductUnit $unit) => [
                    'id' => $unit->id,
                    'product_unit_id' => $unit->id,
                    'product_id' => $product->id,
                    'product_code' => $product->product_code,
                    'product_sku' => $product->sku,
                    'barcode' => $product->barcode,
                    'product_name' => $product->name,
                    'unit_name' => $unit->name,
                    'unit_code' => $unit->code,
                    'name' => $unit->name,
                    'code' => $unit->code,
                    'conversion_factor' => (float) $unit->conversion_factor,
                    'is_base' => (bool) $unit->is_base,
                    'is_default_selling' => (bool) $unit->is_default_selling,
                    'image_path' => $product->primaryImage?->image_path,
                    'original_price' => (float) $product->original_price,
                    'buying_cost' => (float) $buyingCost,
                    'prices' => $unit->prices->map(fn ($price) => ['price_type' => $price->price_type, 'price' => (string) $price->price, 'is_manual' => $price->is_manual, 'calculation_status' => $price->calculation_status])->values(),
                    'on_hand_qty' => $unit->fromBaseQuantity($baseOnHand),
                    'available_base_qty' => $baseAvailable,
                    'available_qty' => $unit->fromBaseQuantity($baseAvailable),
                ];

                return array_merge($unitPayload($baseUnit), [
                    'unit_options' => $product->units->map($unitPayload)->values(),
                ]);
            };

            return $request->boolean('paginated')
                ? $products->paginate((int) ($validated['per_page'] ?? 10))->withQueryString()->through($mapProduct)
                : $products->limit(20)->get()->map($mapProduct);
        }

        $query = ProductUnit::query()
            ->where('is_active', true)
            ->with(['prices', 'product:id,name,product_code,sku,barcode,original_price,pricing_base_cost,pricing_buying_cost,category_id', 'product.primaryImage:id,product_id,image_path', 'product.inventoryBalances' => fn ($scope) => $scope->where('location_id', $location->id)])
            ->when($term !== '', fn ($scope) => $scope->where(fn ($inner) => $inner
                ->where('name', 'like', "%{$term}%")
                ->orWhere('code', 'like', "%{$term}%")
                ->orWhereHas('product', fn ($product) => $product->where('name', 'like', "%{$term}%")->orWhere('product_code', 'like', "%{$term}%")->orWhere('sku', 'like', "%{$term}%")->orWhere('barcode', 'like', "%{$term}%"))))
            ->when(! empty($validated['category_id']), fn ($scope) => $scope->whereHas('product', fn ($product) => $product->where('category_id', $validated['category_id'])))
            ->whereHas('product', fn ($scope) => $scope->where('is_active', true))
            ->orderBy(Product::select('name')->whereColumn('products.id', 'product_units.product_id'))
            ->orderBy('sort_order');

        $map = function (ProductUnit $unit) {
            $balance = $unit->product->inventoryBalances->first();
            $baseAvailable = (float) ($balance?->available_qty ?? 0);
            $buyingCost = app(\App\Services\AutomaticPricingService::class)->readCost($unit->product);

            return [
                'id' => $unit->id,
                'product_unit_id' => $unit->id,
                'product_id' => $unit->product_id,
                'product_code' => $unit->product->product_code,
                'product_sku' => $unit->product->sku,
                'barcode' => $unit->product->barcode,
                'product_name' => $unit->product->name,
                'unit_name' => $unit->name,
                'unit_code' => $unit->code,
                'conversion_factor' => (float) $unit->conversion_factor,
                'is_base' => $unit->is_base,
                'is_default_selling' => $unit->is_default_selling,
                'image_path' => $unit->product->primaryImage?->image_path,
                'original_price' => (float) $unit->product->original_price,
                'buying_cost' => (float) $buyingCost,
                'prices' => $unit->prices->map(fn ($price) => ['price_type' => $price->price_type, 'price' => (string) $price->price, 'is_manual' => $price->is_manual, 'calculation_status' => $price->calculation_status])->values(),
                'on_hand_qty' => (float) ($balance?->on_hand_qty ?? 0),
                'available_base_qty' => $baseAvailable,
                'available_qty' => $unit->fromBaseQuantity($baseAvailable),
            ];
        };

        return $request->boolean('paginated')
            ? $query->paginate((int) ($validated['per_page'] ?? 10))->withQueryString()->through($map)
            : $query->limit(20)->get()->map($map);
    }

    public function exportMovements(Request $request, Product $product, ExcelExportService $excel)
    {
        abort_unless($request->user()->hasAdminPermission('inventory.history'), 403);
        $rows = InventoryMovement::query()->where('product_id', $product->id)->whereIn('location_id', $request->user()->accessibleLocationIds())->with(['location:id,code', 'creator:id,name', 'unit:id,code'])->latest('occurred_at')->cursor();

        $data = $rows->map(fn ($movement) => [$movement->occurred_at, $movement->location->code, $movement->type, $movement->unit?->code, $movement->unit_quantity, $movement->quantity_delta, $movement->on_hand_before, $movement->on_hand_after, $movement->reserved_delta, $movement->creator?->name, $movement->reason_code, $movement->notes]);
        $path = $excel->create('Inventory Movements', ['occurred_at', 'location', 'type', 'unit', 'unit_quantity', 'base_quantity_delta', 'before', 'after', 'reserved_delta', 'user', 'reason', 'notes'], $data);
        return response()->download($path, "movements-{$product->product_code}-".now()->format('Ymd-His').'.xlsx', ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])->deleteFileAfterSend(true);
    }

    private function movementDocument(InventoryMovement $movement): ?array
    {
        if (! $movement->reference_type || ! $movement->reference_id) {
            return null;
        }

        return match ($movement->reference_type) {
            Order::class => ($model = Order::query()->find($movement->reference_id)) ? ['label' => $model->order_number, 'href' => route('admin.orders.show', $model)] : null,
            StockReceipt::class => ($model = StockReceipt::query()->find($movement->reference_id)) ? ['label' => $model->receipt_number, 'href' => route('admin.inventory.receipts.show', $model)] : null,
            StockAdjustment::class => ($model = StockAdjustment::query()->find($movement->reference_id)) ? ['label' => $model->adjustment_number, 'href' => route('admin.inventory.adjustments.index')] : null,
            StockTransfer::class => ($model = StockTransfer::query()->find($movement->reference_id)) ? ['label' => $model->transfer_number, 'href' => route('admin.inventory.transfers.show', $model)] : null,
            default => null,
        };
    }
}
