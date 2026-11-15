<?php

namespace App\Services;

use App\Models\{Category, FinancialEntry, InventoryBalance, Location, OrderItem, OrderReturn, Product, VintageBale, VintagePriceLabel, User};
use App\Services\Inventory\InventoryService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class VintageBaleService
{
    public function __construct(private InventoryService $inventory, private AuditLogService $audit) {}

    public function purchase(array $data, User $actor): VintageBale
    {
        return DB::transaction(function () use ($data, $actor) {
            User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            ksort($data);
            $hash = hash('sha256', json_encode($data));
            if ($existing = VintageBale::where('purchase_key', $data['purchase_key'])->first()) {
                if ((int) $existing->created_by !== (int) $actor->id || $existing->purchase_hash !== $hash) throw ValidationException::withMessages(['purchase_key' => \App\Support\UiText::get('This purchase request was already used. Refresh before recording another bale.')]);
                return $existing;
            }
            $category = Category::firstOrCreate(['slug' => 'vintage-bales'], ['name' => 'Vintage bales', 'is_active' => true]);
            $code = 'VB-'.Str::upper((string) Str::ulid());
            // One internal stock record per bale; never one record per garment.
            $product = Product::create(['category_id' => $category->id, 'product_code' => $code, 'name' => $code, 'slug' => strtolower($code), 'status' => 'inactive', 'is_active' => false, 'original_price' => 0, 'metadata' => ['vintage_bale' => true]]);
            $code = 'VB-'.str_pad((string) $product->id, 6, '0', STR_PAD_LEFT);
            $product->update(['product_code' => $code, 'name' => $code, 'slug' => strtolower($code)]);
            $product->units()->create(['name' => 'Piece', 'code' => 'PC', 'conversion_factor' => 1, 'is_base' => true, 'is_active' => false]);
            $product->priceTypes()->create(['name' => 'retail', 'is_default' => true]);
            $bale = VintageBale::create($data + ['purchase_hash' => $hash, 'code' => $code, 'product_id' => $product->id, 'created_by' => $actor->id, 'status' => 'purchased']);
            $product->update(['metadata' => ['vintage_bale' => true, 'vintage_bale_id' => $bale->id]]);
            $this->inventory->ensureBalance(Location::findOrFail($bale->location_id), $product);
            $this->expense($bale, 'bale_purchase', (float) $bale->purchase_cost, $actor, $bale->purchased_at->toDateString());
            $this->audit->record('bale.purchased', $bale, ['purchase_cost' => $bale->purchase_cost]);
            return $bale;
        }, 3);
    }

    public function update(VintageBale $bale, array $data, User $actor): VintageBale
    {
        return DB::transaction(function () use ($bale, $data, $actor) {
            $product = Product::whereKey($bale->product_id)->lockForUpdate()->firstOrFail();
            $locked = VintageBale::whereKey($bale->id)->lockForUpdate()->firstOrFail();
            if (! hash_equals($locked->edit_token, $data['edit_token'])) {
                throw ValidationException::withMessages(['edit_token' => \App\Support\UiText::get('This bale changed. Reload its details before editing again.')]);
            }
            unset($data['edit_token']);
            $before = $locked->only(array_keys($data));
            $count = $data['total_pieces'] ?? null;
            $countChanged = $count !== null ? (int) $count !== $locked->total_pieces : $locked->total_pieces !== null;
            if ($locked->status === 'closed' && $countChanged) {
                throw ValidationException::withMessages(['total_pieces' => \App\Support\UiText::get('The garment count is fixed after a bale is finished.')]);
            }
            if ($locked->status === 'ready' && $countChanged) {
                if ($count === null) {
                    throw ValidationException::withMessages(['total_pieces' => \App\Support\UiText::get('Keep the counted quantity once selling has started.')]);
                }
                $sold = -(float) \App\Models\InventoryMovement::where('product_id', $product->id)->whereIn('type', ['sale', 'sale_return'])->sum('quantity_delta');
                $balance = InventoryBalance::where('product_id', $product->id)->where('location_id', $locked->location_id)->lockForUpdate()->firstOrFail();
                $remaining = (int) $count - $sold;
                if ($remaining < (float) $balance->reserved_qty || $remaining < 0) {
                    throw ValidationException::withMessages(['total_pieces' => \App\Support\UiText::get('The garment count must cover sold and reserved pieces.')]);
                }
                $delta = $remaining - (float) $balance->on_hand_qty;
                if (abs($delta) > .00005) {
                    $this->inventory->adjust($locked->location, $product, $delta, 'bale_count_correction', $actor, 'bale:'.$locked->id.':count:'.Str::uuid(), $locked, 'Garment count corrected from bale details.');
                }
            }
            $locked->update($data);
            $product->update(['product_code' => $locked->code, 'name' => $locked->code]);
            if (in_array($locked->status, ['ready', 'closed'], true)) {
                $product->update(['original_price' => $locked->total_pieces ? round(((float) $locked->purchase_cost + (float) $locked->laundry_cost) / $locked->total_pieces, 6) : 0]);
            }
            foreach (['bale_purchase' => 'purchase', 'bale_laundry' => 'laundry'] as $category => $prefix) {
                $entry = FinancialEntry::where('bale_id', $locked->id)->where('category', $category)->lockForUpdate()->first();
                $amount = (float) $locked->{$prefix.'_cost'};
                if ($entry) {
                    $entry->update(['amount' => $amount, 'payment_method' => $locked->{$prefix.'_payment_method'}, 'title' => ($prefix === 'purchase' ? 'Bale purchase ' : 'Laundry ').$locked->code, 'reference' => $locked->code.':'.$category] + ($prefix === 'purchase' ? ['entry_date' => $locked->purchased_at->toDateString()] : []));
                } elseif ($amount > 0) {
                    $this->expense($locked, $category, $amount, $actor, $prefix === 'purchase' ? $locked->purchased_at->toDateString() : ($locked->ready_at ?? now())->timezone(config('vintage.timezone'))->toDateString());
                }
            }
            $this->audit->record('bale.updated', $locked, ['before' => $before, 'after' => $locked->only(array_keys($data))]);
            return $locked->fresh();
        }, 3);
    }

    public function transition(VintageBale $bale, string $next, array $data, User $actor): VintageBale
    {
        return DB::transaction(function () use ($bale, $next, $data, $actor) {
            $product = Product::whereKey($bale->product_id)->lockForUpdate()->firstOrFail();
            $locked = VintageBale::whereKey($bale->id)->lockForUpdate()->firstOrFail();
            $allowed = ['purchased' => 'laundry', 'laundry' => 'ready', 'ready' => 'closed'];
            if (($allowed[$locked->status] ?? null) !== $next) throw ValidationException::withMessages(['status' => \App\Support\UiText::get('This bale has already moved on. Refresh before continuing.')]);
            if ($next === 'laundry') $locked->update(['status' => $next, 'laundry_started_at' => now()]);
            if ($next === 'ready') {
                $count = array_key_exists('total_pieces', $data) ? $data['total_pieces'] : $locked->total_pieces;
                $laundry = round((float) ($data['laundry_cost'] ?? 0), 2);
                $locked->update(['total_pieces' => $count, 'laundry_cost' => $laundry, 'laundry_payment_method' => $data['laundry_payment_method'] ?? 'cash']);
                if ($count !== null) $this->inventory->openingBalance($locked->location, $product, $count, $actor, 'bale:'.$locked->id.':opening');
                $product->update(['original_price' => $count ? round(((float) $locked->purchase_cost + $laundry) / $count, 6) : 0, 'status' => 'active', 'is_active' => true]);
                if ($laundry > 0 || $locked->entries()->where('category', 'bale_laundry')->exists()) $this->expense($locked, 'bale_laundry', $laundry, $actor, now(config('vintage.timezone'))->toDateString());
                $locked->update(['status' => 'ready', 'ready_at' => now()]);
            }
            if ($next === 'closed') {
                $balance = InventoryBalance::where('product_id', $product->id)->where('location_id', $locked->location_id)->lockForUpdate()->first();
                // Finishing confirms that no garments remain, even if not every sale was scanned.
                if ((float) $balance?->reserved_qty > 0) throw ValidationException::withMessages(['status' => \App\Support\UiText::get('Complete or cancel reserved sales before finishing this bale.')]);
                if ((float) $balance?->on_hand_qty > 0) {
                    $this->inventory->adjust($locked->location, $product, -(float) $balance->on_hand_qty, 'bale_finished', $actor, 'bale:'.$locked->id.':finish:'.Str::uuid(), $locked, 'Confirmed sold out when finishing bale. No additional sales income recorded.');
                }
                $locked->update(['status' => 'closed', 'closed_at' => now()]);
                $product->update(['status' => 'inactive', 'is_active' => false]);
            }
            $this->audit->record('bale.'.$next, $locked, $data);
            return $locked->fresh();
        }, 3);
    }

    public function label(VintageBale $bale, string $price, User $actor): VintagePriceLabel
    {
        return DB::transaction(function () use ($bale, $price, $actor) {
            $product = Product::whereKey($bale->product_id)->lockForUpdate()->firstOrFail();
            $locked = VintageBale::whereKey($bale->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== 'ready') throw ValidationException::withMessages(['price' => \App\Support\UiText::get('Finish laundry before creating selling labels.')]);
            if ($existing = $locked->labels()->where('price', $price)->first()) return $existing;
            do { $barcode = '83'.random_int(10000000, 99999999); } while (VintagePriceLabel::where('barcode', $barcode)->exists());
            $unit = $product->units()->create(['name' => number_format((float) $price, 2, '.', '').' price group', 'code' => $barcode, 'conversion_factor' => 1, 'is_active' => true]);
            $unit->prices()->create(['product_price_type_id' => $product->priceTypes()->where('name', 'retail')->firstOrFail()->id, 'price' => $price, 'is_manual' => true]);
            $label = $locked->labels()->create(['product_unit_id' => $unit->id, 'barcode' => $barcode, 'price' => $price]);
            $this->audit->record('bale.label.created', $label, ['bale' => $bale->code, 'price' => $price]);
            return $label;
        }, 3);
    }

    private function expense(VintageBale $bale, string $category, float $amount, User $actor, string $date): void
    {
        FinancialEntry::updateOrCreate(['bale_id' => $bale->id, 'category' => $category], ['location_id' => $bale->location_id, 'recorded_by' => $actor->id, 'type' => 'expense', 'amount' => $amount, 'title' => ($category === 'bale_purchase' ? 'Bale purchase ' : 'Laundry ').$bale->code, 'reference' => $bale->code.':'.$category, 'entry_date' => $date, 'payment_method' => $category === 'bale_purchase' ? $bale->purchase_payment_method : $bale->laundry_payment_method, 'status' => 'approved']);
    }
}
