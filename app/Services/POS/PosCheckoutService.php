<?php

namespace App\Services\POS;

use App\Models\FinancialEntry;
use App\Models\InventoryBalance;
use App\Models\Location;
use App\Models\Order;
use App\Models\Payment;
use App\Models\ProductUnit;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\CustomerCreditService;
use App\Services\Inventory\InventoryService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PosCheckoutService
{
    public function __construct(private InventoryService $inventoryService, private AuditLogService $auditLogService, private CustomerCreditService $creditService)
    {
    }

    public function checkout(array $payload, User $cashier): Order
    {
        return DB::transaction(function () use ($payload, $cashier) {
            app(\App\Services\AutomaticPricingService::class)->lock();
            $location = Location::query()->where('is_active', true)->findOrFail((int) $payload['location_id']);
            if (! $cashier->canAccessLocation($location)) {
                throw ValidationException::withMessages(['location_id' => \App\Support\UiText::get('You cannot sell from this warehouse.')]);
            }
            $customer = filled($payload['customer_id'] ?? null)
                ? User::query()
                    ->where('role', User::CUSTOMER_ROLE)
                    ->lockForUpdate()
                    ->find((int) $payload['customer_id'])
                : null;
            if (filled($payload['customer_id'] ?? null) && ! $customer) {
                throw ValidationException::withMessages([
                    'customer_id' => \App\Support\UiText::get('Choose a saved customer before completing the sale.'),
                ]);
            }
            $isOnlineSale = filter_var($payload['is_online_sale'] ?? false, FILTER_VALIDATE_BOOLEAN);
            if ($isOnlineSale && ! $customer) {
                throw ValidationException::withMessages(['customer_id' => \App\Support\UiText::get('Select or add a customer for an online sale.')]);
            }

            $lines = collect($payload['items']);
            $unitIds = $lines->pluck('product_unit_id')
                ->merge($lines->pluck('foc_product_unit_id')->filter())
                ->unique();
            $units = ProductUnit::query()
                ->whereIn('id', $unitIds)
                ->where('is_active', true)
                ->with([
                    'prices',
                    'product' => fn ($query) => $query->where('status', 'active')->where('is_active', true)->orderBy('id')->lockForUpdate(),
                    'product.baseUnit.prices',
                ])
                ->get()
                ->keyBy('id');
            $subtotal = 0.0;
            $items = [];

            foreach ($lines as $line) {
                $unit = $units->get((int) $line['product_unit_id']);
                if (! $unit || ! $unit->product) {
                    throw ValidationException::withMessages(['items' => \App\Support\UiText::get('One or more POS items are unavailable.')]);
                }
                $bale = \App\Models\VintageBale::where('product_id', $unit->product_id)->lockForUpdate()->first();
                $baleLabel = $bale ? \App\Models\VintagePriceLabel::where('product_unit_id', $unit->id)->first() : null;
                if ($bale && ($bale->status !== 'ready' || (int) $bale->location_id !== (int) $location->id || ! $baleLabel)) {
                    throw ValidationException::withMessages(['items' => \App\Support\UiText::get('This bale is not ready for sale at this branch.')]);
                }
                if ($bale && (floor((float) $line['quantity']) !== (float) $line['quantity'] || ($line['price_type'] ?? 'retail') !== 'retail' || (float) ($line['foc_quantity'] ?? 0) !== 0.0)) {
                    throw ValidationException::withMessages(['items' => \App\Support\UiText::get('Bale labels sell whole garments at their printed retail price.')]);
                }
                $quantity = round((float) $line['quantity'], 4);
                if ($quantity <= 0) {
                    throw ValidationException::withMessages(['items' => \App\Support\UiText::get('Every POS quantity must be greater than zero.')]);
                }
                $priceType = strtolower((string) ($line['price_type'] ?? 'retail'));
                $focQuantity = round((float) ($line['foc_quantity'] ?? 0), 4);
                if ($focQuantity < 0) {
                    throw ValidationException::withMessages(['items' => \App\Support\UiText::get('FOC quantity cannot be negative.')]);
                }
                $focUnit = null;
                $focBaseQuantity = 0.0;
                if ($focQuantity > 0) {
                    if (! $cashier->hasAdminPermission('pos.discount')) {
                        throw ValidationException::withMessages(['items' => \App\Support\UiText::get('You cannot add free-of-charge quantities.')]);
                    }
                    $focUnit = $units->get((int) ($line['foc_product_unit_id'] ?? 0));
                    if (! $focUnit || ! $focUnit->product || (int) $focUnit->product_id !== (int) $unit->product_id) {
                        throw ValidationException::withMessages(['items' => \App\Support\UiText::get('FOC unit for :value1 must belong to the same product.', ['value1' => $unit->product->name])]);
                    }
                    $focBaseQuantity = $focUnit->toBaseQuantity($focQuantity);
                }
                $resolveUnitPrice = function (string $type) use ($unit): ?float {
                    $price = $unit->priceFor($type);
                    if (! $price) return null;

                    $configuredPrice = (float) $price->price;
                    $basePrice = (float) ($unit->product->baseUnit?->priceFor($type)?->price ?? 0);

                    return round($configuredPrice > 0
                        ? $configuredPrice
                        : ($basePrice > 0 ? $basePrice * (float) $unit->conversion_factor : 0), 2);
                };
                $unitPrice = $resolveUnitPrice($priceType);
                if ($baleLabel) $unitPrice = (float) $baleLabel->price;
                if (in_array($priceType, ['wholesale', 'whole_sale'], true) && (! $unitPrice || $unitPrice <= 0)) {
                    $priceType = 'retail';
                    $unitPrice = $resolveUnitPrice($priceType);
                }
                if ($unitPrice === null) {
                    throw ValidationException::withMessages(['items' => \App\Support\UiText::get(':value1 has no :value2 price for :value3.', ['value1' => $unit->product->name, 'value2' => $priceType, 'value3' => $unit->name])]);
                }
                if ($unitPrice <= 0) {
                    throw ValidationException::withMessages([
                        'items' => \App\Support\UiText::get(':value1 has no positive :value2 selling price for :value3 or its base unit.', ['value1' => $unit->product->name, 'value2' => $priceType, 'value3' => $unit->name]),
                    ]);
                }
                if (! empty($line['use_flash_sale'])) {
                    throw ValidationException::withMessages(['items' => \App\Support\UiText::get('Flash sale is no longer available for :value1 / :value2. Review the cart price.', ['value1' => $unit->product->name, 'value2' => $unit->name])]);
                }
                $lineTotal = round($unitPrice * $quantity, 2);
                if (isset($line['expected_unit_price']) && bccomp((string) $line['expected_unit_price'], (string) $unitPrice, 2) !== 0) {
                    throw ValidationException::withMessages(['items' => \App\Support\UiText::get('Selling prices changed. Reopen the payment dialog to review the updated total.')]);
                }
                $baseQuantity = $unit->toBaseQuantity($quantity);
                $subtotal += $lineTotal;
                $items[] = compact('unit', 'quantity', 'baseQuantity', 'priceType', 'unitPrice', 'lineTotal', 'focUnit', 'focQuantity', 'focBaseQuantity');
            }



            $requiredByProduct = collect($items)->groupBy(fn ($item) => $item['unit']->product_id)
                ->map(fn ($rows) => $rows->sum(fn ($item) => $item['baseQuantity'] + $item['focBaseQuantity']));
            foreach ($requiredByProduct as $productId => $required) {
                $bale = \App\Models\VintageBale::where('product_id', $productId)->first();
                if ($bale && $bale->total_pieces === null) continue;
                $balance = InventoryBalance::query()->where('location_id', $location->id)->where('product_id', $productId)->lockForUpdate()->first();
                if (! $balance || $balance->available_qty + 0.00005 < $required) {
                    $product = collect($items)
                        ->first(fn ($item) => (int) $item['unit']->product_id === (int) $productId)['unit']
                        ->product;
                    throw ValidationException::withMessages(['items' => \App\Support\UiText::get('Not enough warehouse stock for :value1 (:value2).', ['value1' => $product->name, 'value2' => $product->product_code])]);
                }
            }

            $discount = $this->discountAmount($payload, $subtotal, $cashier);
            $final = round(max(0, $subtotal - $discount), 2);
            $tenders = $this->resolveTenders($payload, $final);
            $creditAmount = round((float) $tenders->where('type', 'credit')->sum('amount'), 2);
            $paidNow = round((float) $tenders->whereIn('type', ['cash', 'mmqr'])->sum('amount'), 2);
            $usesCredit = $creditAmount > 0;
            if ($usesCredit) {
                if (! $cashier->hasAdminPermission('credit.manage')) {
                    throw ValidationException::withMessages(['tenders' => \App\Support\UiText::get('You cannot create credit sales.')]);
                }
                if (! $customer) {
                    throw ValidationException::withMessages(['customer_id' => \App\Support\UiText::get('Choose a saved customer for a credit sale.')]);
                }
                $this->creditService->assertCanBorrow($customer, $creditAmount);
            }
            $paymentStatus = $usesCredit ? ($paidNow > 0 ? 'partially_paid' : 'unpaid') : 'paid';
            $dueDate = $usesCredit ? now()->addDays(max(1, (int) $customer->credit_terms_days))->toDateString() : null;
            $tenderType = $tenders->count() > 1 ? 'split' : $tenders->first()['type'];
            $amountTendered = round((float) $tenders->whereIn('type', ['cash', 'mmqr'])->sum('amount_tendered'), 2);
            $changeDue = round((float) $tenders->sum('change_due'), 2);
            $order = Order::create([
                'user_id' => $customer?->id,
                'order_number' => $this->number('POS'),
                'receipt_number' => $this->number('RCT'),
                'sales_channel' => 'pos',
                'is_online_sale' => $isOnlineSale,
                'location_id' => $location->id,
                'served_by' => $cashier->id,
                'total_amount' => round($subtotal, 2),
                'discount_amount' => $discount,
                'admin_discount_type' => $payload['discount_type'] ?? null,
                'admin_discount_value' => round((float) ($payload['discount_value'] ?? 0), 2),
                'admin_discount_amount' => $discount,
                'tax_amount' => 0,
                'shipping_fee' => 0,
                'final_amount' => $final,
                'status' => 'completed',
                'payment_status' => $paymentStatus,
                'credit_due_date' => $dueDate,
                'credit_amount' => $creditAmount,
                'paid_amount' => $paidNow,
                'payment_method' => $tenderType,
                'pos_tender_summary' => [
                    'tender_type' => $tenderType,
                    'amount_tendered' => $amountTendered,
                    'change_due' => $changeDue,
                    'credit_amount' => $creditAmount,
                    'tenders' => $tenders->values()->all(),
                ],
                'receiver_name' => $customer?->name ?: trim((string) ($payload['customer_name'] ?? '')) ?: 'Walk-in customer',
                'receiver_phone' => $customer?->phone ?: ($payload['customer_phone'] ?? null),
                'order_notes' => $payload['notes'] ?? null,
                'status_updated_at' => now(),
            ]);

            foreach ($items as $item) {
                $unit = $item['unit'];
                $orderItem = $order->items()->create([
                    'product_id' => $unit->product_id,
                    'product_unit_id' => $unit->id,
                    'foc_product_unit_id' => $item['focUnit']?->id,
                    'quantity' => $item['quantity'],
                    'foc_quantity' => $item['focQuantity'],
                    'base_quantity' => $item['baseQuantity'],
                    'foc_base_quantity' => $item['focBaseQuantity'],
                    'conversion_factor' => $unit->conversion_factor,
                    'unit_name' => $unit->name,
                    'price_type' => $item['priceType'],
                    'unit_price' => $item['unitPrice'],
                    'cost_price' => round((float) $unit->product->original_price * (float) $unit->conversion_factor, 6),
                    'foc_cost_price' => round((float) $unit->product->original_price * $item['focBaseQuantity'], 6),
                    'total_price' => $item['lineTotal'],
                    'promotion_snapshot' => null,
                ]);

                $this->inventoryService->completeSale($location, $unit->product, $item['baseQuantity'], 0, $cashier, "pos:order:{$order->id}:item:{$orderItem->id}:paid", $order, $unit, $item['quantity']);
                if ($item['focUnit'] && $item['focQuantity'] > 0) {
                    $this->inventoryService->completeSale($location, $unit->product, $item['focBaseQuantity'], 0, $cashier, "pos:order:{$order->id}:item:{$orderItem->id}:foc", $order, $item['focUnit'], $item['focQuantity']);
                }
            }

            foreach ($tenders->whereIn('type', ['cash', 'mmqr']) as $tender) {
                Payment::create([
                'order_id' => $order->id,
                'received_by' => $cashier->id,
                'transaction_id' => $this->paymentTransactionId(),
                    'amount' => $tender['amount'],
                    'amount_tendered' => $tender['amount_tendered'],
                    'change_due' => $tender['change_due'],
                    'method' => $tender['type'],
                    'tender_type' => $tender['type'],
                'status' => 'paid',
                    'payment_details' => array_filter(['reference' => $tender['reference'] ?? null]),
                ]);
                FinancialEntry::create([
                'recorded_by' => $cashier->id,
                'location_id' => $location->id,
                'type' => 'income',
                'category' => FinancialEntry::CATEGORY_POS_SALE,
                'title' => "POS sale {$order->receipt_number}",
                    'amount' => $tender['amount'],
                'entry_date' => collect($items)->contains(fn ($line) => (bool) ($line['unit']->product->metadata['vintage_bale'] ?? false)) ? now(config('vintage.timezone'))->toDateString() : now()->toDateString(),
                    'payment_method' => $tender['type'],
                'reference' => $order->receipt_number,
                'status' => 'approved',
                'notes' => "Auto-created from POS sale in {$location->name}.",
                ]);
            }
            if ($usesCredit) {
                $this->creditService->recordSale($customer, $order, $creditAmount, $cashier);
            }
            $this->auditLogService->record('pos.sale.completed', $order, [
                'receipt_number' => $order->receipt_number,
                'location_id' => $location->id,
                'total' => $final,
                'paid_now' => $paidNow,
                'credit_amount' => $creditAmount,
                'tenders' => $tenders->map(fn ($tender) => ['type' => $tender['type'], 'amount' => $tender['amount']])->values()->all(),
                'foc_line_count' => collect($items)->where('focQuantity', '>', 0)->count(),
                'foc_base_quantity' => round((float) collect($items)->sum('focBaseQuantity'), 4),
            ]);
            return $order->fresh(['items.product', 'items.unit', 'items.focUnit', 'payments', 'location', 'server', 'user']);
        }, 3);
    }

    private function resolveTenders(array $payload, float $final): \Illuminate\Support\Collection
    {
        if (! empty($payload['tenders'])) {
            $tenders = collect($payload['tenders'])->map(function (array $tender) {
                $type = strtolower((string) ($tender['type'] ?? ''));
                if (! in_array($type, ['cash', 'mmqr', 'credit'], true)) {
                    throw ValidationException::withMessages(['tenders' => \App\Support\UiText::get('Choose only cash, MMQR, or credit payment methods.')]);
                }
                $amount = round((float) ($tender['amount'] ?? 0), 2);
                $amountTendered = $type === 'cash'
                    ? round((float) ($tender['amount_tendered'] ?? $amount), 2)
                    : $amount;
                if ($amount <= 0) {
                    throw ValidationException::withMessages(['tenders' => \App\Support\UiText::get('Every selected payment amount must be greater than zero.')]);
                }
                if ($type === 'cash' && $amountTendered + 0.009 < $amount) {
                    throw ValidationException::withMessages(['tenders' => \App\Support\UiText::get('Cash received cannot be less than the cash payment amount.')]);
                }

                return [
                    'type' => $type,
                    'amount' => $amount,
                    'amount_tendered' => $amountTendered,
                    'change_due' => $type === 'cash' ? round($amountTendered - $amount, 2) : 0.0,
                    'reference' => trim((string) ($tender['reference'] ?? '')) ?: null,
                ];
            })->values();
            if ($tenders->pluck('type')->unique()->count() !== $tenders->count()) {
                throw ValidationException::withMessages(['tenders' => \App\Support\UiText::get('Each payment method can only be used once.')]);
            }
            if (abs((float) $tenders->sum('amount') - $final) > 0.009) {
                throw ValidationException::withMessages(['tenders' => \App\Support\UiText::get('Cash, MMQR, and credit amounts must equal the sale total.')]);
            }

            return $tenders;
        }

        $type = strtolower((string) ($payload['tender_type'] ?? 'cash'));
        if (! in_array($type, ['cash', 'mmqr', 'credit'], true)) {
            throw ValidationException::withMessages(['tender_type' => \App\Support\UiText::get('Choose cash, MMQR, or credit.')]);
        }
        $amountTendered = round((float) ($payload['amount_tendered'] ?? 0), 2);
        if ($type === 'credit') {
            if ($amountTendered < 0 || $amountTendered >= $final) {
                throw ValidationException::withMessages(['amount_tendered' => \App\Support\UiText::get('Credit deposit must be zero or less than the sale total.')]);
            }
            $depositMethod = strtolower((string) ($payload['credit_deposit_method'] ?? 'cash'));
            if (! in_array($depositMethod, ['cash', 'mmqr'], true)) {
                throw ValidationException::withMessages(['credit_deposit_method' => \App\Support\UiText::get('Choose cash or MMQR for the credit deposit.')]);
            }
            $rows = collect();
            if ($amountTendered > 0) {
                $rows->push(['type' => $depositMethod, 'amount' => $amountTendered, 'amount_tendered' => $amountTendered, 'change_due' => 0.0, 'reference' => $payload['payment_details']['reference'] ?? null]);
            }
            return $rows->push(['type' => 'credit', 'amount' => round($final - $amountTendered, 2), 'amount_tendered' => round($final - $amountTendered, 2), 'change_due' => 0.0, 'reference' => null]);
        }
        if ($amountTendered < $final || ($type !== 'cash' && abs($amountTendered - $final) > 0.009)) {
            throw ValidationException::withMessages(['amount_tendered' => $type === 'cash' ? \App\Support\UiText::get('Amount tendered must cover the sale total.') : \App\Support\UiText::get('MMQR payments must equal the sale total.')]);
        }

        return collect([[
            'type' => $type,
            'amount' => $final,
            'amount_tendered' => $amountTendered,
            'change_due' => $type === 'cash' ? round($amountTendered - $final, 2) : 0.0,
            'reference' => $payload['payment_details']['reference'] ?? null,
        ]]);
    }

    private function discountAmount(array $payload, float $subtotal, User $cashier): float
    {
        $type = $payload['discount_type'] ?? null;
        $value = round((float) ($payload['discount_value'] ?? 0), 2);
        if (! $type || $value <= 0) {
            return 0.0;
        }
        if (! $cashier->hasAdminPermission('pos.discount')) {
            throw ValidationException::withMessages(['discount_value' => \App\Support\UiText::get('You cannot apply POS discounts.')]);
        }
        if (! in_array($type, ['percent', 'amount'], true)) {
            throw ValidationException::withMessages(['discount_type' => \App\Support\UiText::get('Choose a valid discount mode.')]);
        }
        $amount = $type === 'percent' ? round($subtotal * ($value / 100), 2) : $value;
        if ($amount > $subtotal) {
            throw ValidationException::withMessages(['discount_value' => \App\Support\UiText::get('Discount cannot exceed subtotal.')]);
        }

        return $amount;
    }

    private function number(string $prefix): string
    {
        do {
            $number = $prefix.'-'.now()->format('ymd').'-'.str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        } while (Order::query()->where('order_number', $number)->orWhere('receipt_number', $number)->exists());

        return $number;
    }

    private function paymentTransactionId(): string
    {
        do {
            $id = 'PAY-'.now()->format('ymd').'-'.strtoupper(Str::random(8));
        } while (Payment::query()->where('transaction_id', $id)->exists());

        return $id;
    }
}
