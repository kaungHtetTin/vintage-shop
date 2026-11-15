<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CustomerCreditTransaction;
use App\Models\Order;
use App\Services\ExcelExportService;
use App\Support\Spa;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

class CreditReportController extends Controller
{
    public function index(Request $request)
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'bucket' => ['nullable', 'in:all,current,1_30,31_60,61_90,90_plus'],
        ]);
        $bucket = $filters['bucket'] ?? 'all';
        $base = $this->openOrders();
        $filtered = $this->applyBucket(clone $base, $bucket);

        $customers = $filtered
            ->join('users', 'users.id', '=', 'orders.user_id')
            ->when($filters['q'] ?? null, function ($query, $search) {
                $term = '%'.trim($search).'%';
                $query->where(fn ($nested) => $nested->where('users.name', 'like', $term)->orWhere('users.default_address', 'like', $term)->orWhere('users.phone', 'like', $term));
            })
            ->groupBy('users.id', 'users.name', 'users.default_address', 'users.phone', 'users.credit_limit', 'users.credit_status')
            ->orderByDesc('outstanding')
            ->selectRaw('users.id, users.name, users.default_address, users.phone, users.credit_limit, users.credit_status, SUM(orders.final_amount - orders.paid_amount) outstanding, SUM(CASE WHEN orders.credit_due_date < CURRENT_DATE THEN orders.final_amount - orders.paid_amount ELSE 0 END) overdue, MIN(orders.credit_due_date) oldest_due_date, COUNT(*) invoice_count')
            ->paginate(20)
            ->withQueryString();

        $aging = [
            'current' => $this->bucketTotal('current'),
            'days_1_30' => $this->bucketTotal('1_30'),
            'days_31_60' => $this->bucketTotal('31_60'),
            'days_61_90' => $this->bucketTotal('61_90'),
            'days_90_plus' => $this->bucketTotal('90_plus'),
        ];

        return Spa::render('Admin/Credit/Index', [
            'customers' => $customers,
            'filters' => ['q' => $filters['q'] ?? '', 'bucket' => $bucket],
            'aging' => $aging + ['total' => array_sum($aging)],
        ]);
    }

    public function collections(Request $request)
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'period' => ['nullable', 'in:today,last_7,last_30,this_month,custom'],
            'tender_type' => ['nullable', 'in:cash,mmqr'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', ...($request->filled('from') ? ['after_or_equal:from'] : [])],
        ]);
        $search = trim($filters['q'] ?? '');
        $period = $filters['period'] ?? '';
        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;
        if ($period && $period !== 'custom') {
            $from = match ($period) {
                'today' => today()->toDateString(),
                'last_7' => today()->subDays(6)->toDateString(),
                'last_30' => today()->subDays(29)->toDateString(),
                'this_month' => today()->startOfMonth()->toDateString(),
            };
            $to = today()->toDateString();
        }
        $base = CustomerCreditTransaction::query()->whereIn('type', ['payment', 'payment_reversal'])
            ->when(! $request->user()->isSuperAdmin(), fn ($query) => $query->whereHas('order', fn ($orders) => $orders->whereIn('location_id', $request->user()->accessibleLocationIds())));
        $payments = (clone $base)
            ->withCorrectionDetails()->with(['customer:id,name,phone', 'creator:id,name'])
            ->when($search !== '', function ($query) use ($search) {
                $term = '%'.$search.'%';
                $query->where(fn ($nested) => $nested->where('transaction_number', 'like', $term)
                    ->orWhere('reference', 'like', $term)
                    ->orWhere('metadata->original_transaction', 'like', $term)
                    ->orWhere('metadata->reference', 'like', $term)
                    ->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', $term)->orWhere('phone', 'like', $term))
                    ->orWhereHas('order', fn ($order) => $order->where('order_number', 'like', $term)->orWhere('receipt_number', 'like', $term)));
            })
            ->when($filters['tender_type'] ?? null, fn ($query, $method) => $query->where('tender_type', $method))
            ->when($from, fn ($query, $from) => $query->whereDate('created_at', '>=', $from))
            ->when($to, fn ($query, $to) => $query->whereDate('created_at', '<=', $to))
            ->orderByDesc('created_at')->orderByDesc('id')->paginate(20)->withQueryString();
        $payments->getCollection()->each(fn ($entry) => $entry->setAttribute('can_correct', $entry->canBeCorrectedBy($request->user())));

        return Spa::render('Admin/Credit/Collections', [
            'payments' => $payments,
            'filters' => [
                'q' => $search,
                'period' => $period ?: ($from || $to ? 'custom' : ''),
                'tender_type' => $filters['tender_type'] ?? '',
                'from' => $period && $period !== 'custom' ? '' : ($filters['from'] ?? ''),
                'to' => $period && $period !== 'custom' ? '' : ($filters['to'] ?? ''),
            ],
        ]);
    }

    public function export(Request $request, ExcelExportService $excel)
    {
        $bucket = $request->string('bucket')->toString() ?: 'all';
        abort_unless(in_array($bucket, ['all', 'current', '1_30', '31_60', '61_90', '90_plus'], true), 422);
        $rows = $this->applyBucket($this->openOrders(), $bucket)
            ->join('users', 'users.id', '=', 'orders.user_id')
            ->groupBy('users.id', 'users.name', 'users.default_address', 'users.phone', 'users.credit_limit', 'users.credit_status')
            ->orderByDesc('outstanding')
            ->selectRaw('users.name, users.default_address, users.phone, users.credit_limit, users.credit_status, SUM(orders.final_amount - orders.paid_amount) outstanding, SUM(CASE WHEN orders.credit_due_date < CURRENT_DATE THEN orders.final_amount - orders.paid_amount ELSE 0 END) overdue, MIN(orders.credit_due_date) oldest_due_date, COUNT(*) invoice_count')->cursor();

        $data = $rows->map(fn ($row) => [$row->name, $row->default_address, $row->phone, $row->credit_status, $row->credit_limit, $row->outstanding, $row->overdue, $row->oldest_due_date, $row->invoice_count]);
        $path = $excel->create('Credit Aging', ['Customer', 'Address', 'Phone', 'Status', 'Credit limit', 'Outstanding', 'Overdue', 'Oldest due', 'Invoices'], $data);
        return response()->download($path, 'credit-aging-'.now()->format('Y-m-d').'.xlsx', ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])->deleteFileAfterSend(true);
    }

    private function openOrders(): Builder
    {
        return Order::query()->whereIn('orders.location_id', request()->user()->accessibleLocationIds())->where('orders.credit_amount', '>', 0)->where('orders.status', '!=', 'cancelled')->whereRaw('orders.final_amount > orders.paid_amount');
    }

    private function applyBucket(Builder $query, string $bucket): Builder
    {
        return match ($bucket) {
            'current' => $query->where(fn ($q) => $q->whereNull('credit_due_date')->orWhereDate('credit_due_date', '>=', now()->toDateString())),
            '1_30' => $query->whereRaw('DATEDIFF(CURRENT_DATE, credit_due_date) BETWEEN 1 AND 30'),
            '31_60' => $query->whereRaw('DATEDIFF(CURRENT_DATE, credit_due_date) BETWEEN 31 AND 60'),
            '61_90' => $query->whereRaw('DATEDIFF(CURRENT_DATE, credit_due_date) BETWEEN 61 AND 90'),
            '90_plus' => $query->whereRaw('DATEDIFF(CURRENT_DATE, credit_due_date) > 90'),
            default => $query,
        };
    }

    private function bucketTotal(string $bucket): float
    {
        return round((float) $this->applyBucket($this->openOrders(), $bucket)->selectRaw('COALESCE(SUM(final_amount - paid_amount), 0) total')->value('total'), 2);
    }
}
