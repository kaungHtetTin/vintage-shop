<?php

namespace App\Services;

use App\Models\{FinancialEntry, Order, OrderItem, OrderReturn, User, VintageBale};
use App\Services\Inventory\InventoryService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class VintageReturnService
{
    public function __construct(private InventoryService $inventory, private AuditLogService $audit) {}

    public function returnItem(OrderItem $item, array $data, User $actor): OrderReturn
    {
        return DB::transaction(function () use ($item, $data, $actor) {
            $order = Order::whereKey($item->order_id)->lockForUpdate()->firstOrFail();
            $item = OrderItem::whereKey($item->id)->lockForUpdate()->firstOrFail();
            $bale = VintageBale::where('product_id', $item->product_id)->firstOrFail();
            abort_unless($actor->canAccessLocation($bale->location), 403);
            if ($existing = OrderReturn::where('request_key', $data['request_key'])->first()) {
                $method = FinancialEntry::where('reference', 'bale-return:'.$existing->id)->value('payment_method');
                if ((int) $existing->order_item_id !== (int) $item->id || (int) $existing->quantity !== (int) $data['quantity'] || (int) $existing->processed_by !== (int) $actor->id || $method !== $data['payment_method']) throw ValidationException::withMessages(['request_key' => \App\Support\UiText::get('This refund request was already used.')]);
                return $existing;
            }
            if ($order->status === 'cancelled' || $order->payment_status !== 'paid' || (float) $order->credit_amount > 0) throw ValidationException::withMessages(['quantity' => \App\Support\UiText::get('Only completed, fully paid bale sales can be returned here.')]);
            $returned = (float) OrderReturn::where('order_item_id', $item->id)->whereNotNull('restocked_at')->sum('quantity');
            if ($returned + $data['quantity'] > (float) $item->quantity) throw ValidationException::withMessages(['quantity' => \App\Support\UiText::get('You cannot return more garments than were sold.')]);
            $paidBack = (float) OrderReturn::where('order_id', $order->id)->whereIn('status', ['completed', 'refunded'])->sum('amount');
            $amount = min(round((float) $item->unit_price * $data['quantity'] * (float) $order->final_amount / max((float) $order->total_amount, .01), 2), round((float) $order->final_amount - $paidBack, 2));
            $return = OrderReturn::create(['request_key' => $data['request_key'], 'order_id' => $order->id, 'order_item_id' => $item->id, 'user_id' => $order->user_id, 'type' => 'return', 'status' => 'completed', 'quantity' => $data['quantity'], 'amount' => $amount, 'reason' => $data['reason'] ?? 'Garments returned', 'processed_by' => $actor->id, 'processed_at' => now(), 'restocked_by' => $actor->id, 'restocked_at' => now()]);
            $movement = $this->inventory->returnSale($bale->location, $bale->product, $data['quantity'], $actor, 'bale:return:'.$return->id, $return, $item->unit, $data['quantity']);
            $return->update(['inventory_movement_id' => $movement->id]);
            FinancialEntry::create(['bale_id' => $bale->id, 'recorded_by' => $actor->id, 'location_id' => $bale->location_id, 'type' => 'expense', 'category' => 'bale_refund', 'title' => 'Garment refund '.$order->receipt_number, 'reference' => 'bale-return:'.$return->id, 'amount' => $amount, 'entry_date' => now(config('vintage.timezone'))->toDateString(), 'payment_method' => $data['payment_method'], 'status' => 'approved']);
            $this->audit->record('bale.garment.returned', $return, ['bale' => $bale->code, 'refund_paid' => $amount]);
            return $return;
        }, 3);
    }

    public function payPending(FinancialEntry $entry, string $method, User $actor): void
    {
        DB::transaction(function () use ($entry, $method, $actor) {
            $entry = FinancialEntry::whereKey($entry->id)->lockForUpdate()->firstOrFail();
            abort_unless($entry->location && $actor->canAccessLocation($entry->location), 403);
            if ($entry->category !== 'refund_payable' || $entry->status !== 'pending') throw ValidationException::withMessages(['refund' => \App\Support\UiText::get('This refund is no longer pending. Refresh the ledger.')]);
            $entry->update(['status' => 'approved', 'payment_method' => $method, 'entry_date' => now(config('vintage.timezone'))->toDateString()]);
            $this->audit->record('bale.refund.paid', $entry, ['method' => $method, 'amount' => $entry->amount]);
        }, 3);
    }

}
