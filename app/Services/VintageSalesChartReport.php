<?php

namespace App\Services;

use App\Models\{FinancialEntry, Order, OrderReturn};
use Carbon\CarbonImmutable;

class VintageSalesChartReport
{
    public function build(array $locationIds, int $year, int $month): array
    {
        $start = CarbonImmutable::create($year, 1, 1, 0, 0, 0, config('vintage.timezone'));
        $end = $start->endOfYear();
        $utcRange = [$start->utc(), $end->utc()];
        $offset = $start->format('P');

        $sales = Order::recognizedSale()->whereIn('location_id', $locationIds)
            ->whereBetween('created_at', $utcRange)
            ->selectRaw("DATE(CONVERT_TZ(created_at, '+00:00', ?)) AS day, SUM(final_amount) AS amount", [$offset])
            ->groupBy('day')->get()->keyBy('day');
        $returns = OrderReturn::query()->whereIn('status', ['completed', 'refunded'])
            ->whereHas('order', fn ($orders) => $orders->recognizedSale()->whereIn('location_id', $locationIds))
            ->whereRaw('COALESCE(processed_at, created_at) BETWEEN ? AND ?', $utcRange)
            ->selectRaw("DATE(CONVERT_TZ(COALESCE(processed_at, created_at), '+00:00', ?)) AS day, SUM(amount) AS amount", [$offset])
            ->groupBy('day')->get()->keyBy('day');
        $cash = FinancialEntry::external()->whereIn('location_id', $locationIds)->where('status', 'approved')
            ->where('category', '!=', FinancialEntry::CATEGORY_STOCK_ADJUSTMENT)
            ->whereBetween('entry_date', [$start->toDateString(), $end->toDateString()])
            ->selectRaw("DATE(entry_date) AS day, SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income, SUM(CASE WHEN type = 'expense' OR (type = 'asset' AND category = 'stock_receipt') THEN amount ELSE 0 END) AS expenses")
            ->groupBy('day')->get()->keyBy('day');

        $monthly = [];
        $yearly = [];
        for ($number = 1; $number <= 12; $number++) {
            $yearly[$number] = ['period' => sprintf('%04d-%02d', $year, $number), 'sales' => 0.0, 'income' => 0.0, 'expenses' => 0.0, 'profit' => 0.0];
        }
        for ($date = $start; $date->lte($end); $date = $date->addDay()) {
            $key = $date->toDateString();
            $row = [
                'period' => $key,
                'sales' => round((float) ($sales->get($key)?->amount ?? 0) - (float) ($returns->get($key)?->amount ?? 0), 2),
                'income' => round((float) ($cash->get($key)?->income ?? 0), 2),
                'expenses' => round((float) ($cash->get($key)?->expenses ?? 0), 2),
            ];
            $row['profit'] = round($row['income'] - $row['expenses'], 2);
            if ($date->month === $month) $monthly[] = $row;
            foreach (['sales', 'income', 'expenses', 'profit'] as $metric) {
                $yearly[$date->month][$metric] = round($yearly[$date->month][$metric] + $row[$metric], 2);
            }
        }
        return ['monthly' => $monthly, 'yearly' => array_values($yearly)];
    }
}
