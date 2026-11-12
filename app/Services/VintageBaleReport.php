<?php

namespace App\Services;

use App\Models\{InventoryMovement, OrderItem, OrderReturn, VintageBale};

class VintageBaleReport
{
    public function summary(VintageBale $bale): array
    {
        $items = OrderItem::where('product_id', $bale->product_id)->whereHas('order', fn ($q) => $q->recognizedSale())->with('order:id,total_amount,final_amount')->get();
        $returns = OrderReturn::whereIn('order_item_id', $items->pluck('id'))->whereIn('status', ['refunded', 'completed'])->get();
        $movements = InventoryMovement::where('product_id', $bale->product_id)->where(fn ($q) => $q->whereIn('type', ['sale', 'sale_return'])->orWhere(fn ($finished) => $finished->where('type', 'adjustment_loss')->where('reason_code', 'bale_finished')))->get(['product_unit_id', 'quantity_delta']);
        $sold = (int) round(-$movements->sum('quantity_delta'));
        $revenue = round($items->sum(fn ($item) => (float) $item->total_price * ((float) $item->order->final_amount / max((float) $item->order->total_amount, .01))) - $returns->sum('amount'), 2);
        $cost = round((float) $bale->purchase_cost + (float) $bale->laundry_cost, 2);
        $labels = $bale->labels->map(function ($label) use ($items, $returns, $movements) {
            $lines = $items->where('product_unit_id', $label->product_unit_id);
            return array_merge($label->toArray(), [
                'pieces_sold' => (int) round(-$movements->where('product_unit_id', $label->product_unit_id)->sum('quantity_delta')),
                'revenue' => round($lines->sum(fn ($item) => (float) $item->total_price * ((float) $item->order->final_amount / max((float) $item->order->total_amount, .01))) - $returns->whereIn('order_item_id', $lines->pluck('id'))->sum('amount'), 2),
            ]);
        })->values();
        return array_merge($bale->toArray(), ['pieces_sold' => $sold, 'remaining' => $bale->status === 'closed' ? 0 : ($bale->total_pieces === null ? null : max(0, $bale->total_pieces - $sold)), 'sales_revenue' => $revenue, 'total_cost' => $cost, 'bale_result' => round($revenue - $cost, 2), 'labels' => $labels]);
    }
}
