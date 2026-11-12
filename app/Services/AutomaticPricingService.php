<?php

namespace App\Services;

use App\Models\{Product, PricingRule};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AutomaticPricingService
{
    public const MAX_PRICE = '999999999999.99';

    /** All catalog-pricing mutations acquire this lock before product locks. */
    public function lock(): int
    {
        return (int) DB::table('pricing_states')->where('id', 1)->lockForUpdate()->value('version');
    }

    public function changed(): void
    {
        DB::table('pricing_states')->where('id', 1)->increment('version');
    }

    public function belowCostWarnings(Product $product): array
    {
        $cost = $this->readCost($product);
        $warnings = [];
        foreach ($product->units()->with('prices')->get() as $unit) {
            foreach ($unit->prices as $price) {
                if ($price->is_manual && bccomp((string) $price->price, '0', 2) > 0 && bccomp((string) $price->price, bcmul($cost, (string) $unit->conversion_factor, 6), 6) < 0) {
                    $warnings[] = \App\Support\UiText::get(':product / :unit / :type is below buying cost.', ['product' => $product->name, 'unit' => $unit->name, 'type' => $price->price_type]);
                }
            }
        }
        return $warnings;
    }

    /** Decimal only; ceil after choosing the larger floor, never binary floats. */
    public function calculate(string $cost, array $rule, string $factor = '1'): ?string
    {
        if (bccomp($cost, '0', 6) <= 0) return null;
        $markup = bcmul($cost, bcadd('1', bcdiv((string) $rule['markup_percent'], '100', 10), 10), 12);
        $floor = bcadd($cost, (string) $rule['minimum_profit'], 12);
        $candidate = bccomp($markup, $floor, 12) >= 0 ? $markup : $floor;
        $increment = (string) $rule['rounding'];
        $steps = bcdiv($candidate, $increment, 0);
        if (bccomp(bcmul($steps, $increment, 12), $candidate, 12) < 0) $steps = bcadd($steps, '1', 0);
        $unitAmount = bcmul(bcmul($steps, $increment, 12), $factor, 12);
        $cents = bcmul($unitAmount, '100', 12);
        $whole = bcdiv($cents, '1', 0);
        if (bccomp($whole, $cents, 12) < 0) $whole = bcadd($whole, '1', 0);
        $amount = bcdiv($whole, '100', 2);
        if (bccomp($amount, self::MAX_PRICE, 2) > 0) {
            throw ValidationException::withMessages(['pricing' => \App\Support\UiText::get('Calculated selling price exceeds the supported amount. Reduce cost, conversion or markup.')]);
        }
        return $amount;
    }

    public function effectiveCost(string $paid, string $free, string $factor, string $unitCost): string
    {
        if (bccomp($paid, '0', 4) <= 0 || bccomp($factor, '0', 6) <= 0 || bccomp($free, '0', 4) < 0 || bccomp($unitCost, '0', 2) < 0) {
            throw ValidationException::withMessages(['items' => \App\Support\UiText::get('Paid quantity and conversion must be positive; free quantity and cost cannot be negative.')]);
        }
        $total = bcmul($paid, $unitCost, 6);
        $quantity = bcmul(bcadd($paid, $free, 4), $factor, 10);
        $cost = bcadd(bcdiv($total, $quantity, 12), '0.0000005', 6);
        if (bccomp($cost, '999999999999.999999', 6) > 0) throw ValidationException::withMessages(['items' => \App\Support\UiText::get('Effective buying cost exceeds the supported amount.')]);
        return $cost;
    }

    /** Latest paid purchase cost per base unit; FOC does not lower the automatic-pricing basis. */
    public function purchaseCost(string $factor, string $unitCost): string
    {
        if (bccomp($factor, '0', 6) <= 0 || bccomp($unitCost, '0', 2) < 0) {
            throw ValidationException::withMessages(['items' => \App\Support\UiText::get('Conversion must be positive and purchase cost cannot be negative.')]);
        }

        $cost = bcadd(bcdiv($unitCost, $factor, 12), '0.0000005', 6);
        if (bccomp($cost, '999999999999.999999', 6) > 0) {
            throw ValidationException::withMessages(['items' => \App\Support\UiText::get('Purchase cost exceeds the supported amount.')]);
        }

        return $cost;
    }

    public function resolveCost(Product $product): string
    {
        $line = $this->latestLine($product);
        $cost = $line ? $this->purchaseCost((string) $line->conversion_factor, (string) $line->unit_cost)
            : (string) ($product->pricing_base_cost ?? $product->original_price ?? '0');
        $product->forceFill(['pricing_base_cost' => $product->pricing_base_cost ?? $product->original_price, 'pricing_buying_cost' => $cost,
            'pricing_source_receipt_id' => $line?->stock_receipt_id])->save();
        return $cost;
    }

    /** Caller holds the pricing lock; no completed order/item is ever changed. */
    public function refreshProduct(Product $product, string $trigger, ?int $actorId = null, ?string $operation = null): array
    {
        $product = Product::query()->lockForUpdate()->findOrFail($product->id);
        $cost = $this->resolveCost($product);
        $operation ??= $trigger.':'.bin2hex(random_bytes(12));
        $units = $product->units()->get();
        $changes = [];
        $skipped = 0;
        foreach ($product->priceTypes()->with('unitPrices')->get() as $type) {
            $rule = $type->pricingRule ?: PricingRule::where('code', $type->name)->first();
            if (! $rule) continue;
            if (! $type->pricing_rule_id) $type->update(['pricing_rule_id' => $rule->id]);
            foreach ($type->unitPrices as $price) {
                if ($rule->pricing_mode === 'manual') {
                    $price->update(['is_manual' => true, 'calculation_status' => 'manual']);
                    continue;
                }
                if ($price->is_manual) continue;
                $unit = $units->firstWhere('id', $price->product_unit_id);
                if (! $unit) continue;
                $amount = $this->calculate($cost, $rule->toArray(), (string) $unit->conversion_factor);
                if ($amount === null) {
                    $price->update(['calculation_status' => 'cost_required', 'applied_rule_version' => $rule->version]);
                    $skipped++;
                    continue;
                }
                $old = (string) $price->price;
                $price->update(['price' => $amount, 'calculation_status' => 'calculated', 'applied_rule_version' => $rule->version]);
                if (bccomp($old, $amount, 2) === 0) continue;
                $change = ['product_id' => $product->id, 'product_unit_id' => $unit->id, 'pricing_rule_id' => $rule->id,
                    'old_price' => $old, 'new_price' => $amount, 'cost_used' => $cost,
                    'rule_snapshot' => json_encode($rule->toArray()), 'trigger' => $trigger, 'actor_id' => $actorId,
                    'operation_id' => $operation, 'created_at' => now(), 'updated_at' => now()];
                DB::table('price_changes')->insert($change);
                $changes[] = array_merge($change, ['product_name' => $product->name, 'price_type' => $rule->name, 'unit_name' => $unit->name]);
            }
        }
        $product->increment('pricing_version');
        $this->changed();
        return ['price_changes' => $changes, 'changed_row_count' => count($changes), 'skipped_cost_count' => $skipped, 'operation_id' => $operation];
    }

    

    public function readCost(Product $product): string
    {
        $line = $this->latestLine($product);
        return $line ? $this->purchaseCost((string) $line->conversion_factor, (string) $line->unit_cost)
            : (string) ($product->pricing_base_cost ?? $product->original_price ?? '0');
    }

    public function latestLine(Product $product): ?object
    {
        return DB::table('stock_receipt_items as items')->join('stock_receipts as receipts', 'receipts.id', '=', 'items.stock_receipt_id')
            ->where('items.product_id', $product->id)->where('receipts.status', 'posted')->whereNotNull('items.unit_cost')
            ->orderByDesc('receipts.created_at')->orderByDesc('receipts.id')->orderByDesc('items.id')->first(['items.*']);
    }

    

    
}
