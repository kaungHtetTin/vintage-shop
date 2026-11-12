<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\{FinancialEntry, InventoryBalance, Location, Order, OrderItem, VintageBale, VintagePriceLabel, VintageSupplier};
use App\Services\{AutomaticPricingService, VintageBaleReport, VintageBaleService};
use App\Services\POS\PosCheckoutService;
use App\Support\Spa;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class VintageBaleController extends Controller
{
    private function bales(Request $request)
    {
        return VintageBale::whereIn('location_id', $request->user()->accessibleLocationIds());
    }
    private function access(Request $request, VintageBale $bale): void
    {
        abort_unless($request->user()->canAccessLocation($bale->location), 403);
    }
    private function locations(Request $request)
    {
        return Location::whereIn('id', $request->user()->accessibleLocationIds())->where('is_active', true)->orderBy('name')->get(['id', 'name', 'code']);
    }
    public function index(Request $request, VintageBaleReport $report)
    {
        $filters = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'status' => ['nullable', Rule::in(['purchased', 'laundry', 'ready', 'closed'])], 'location_id' => ['nullable', Rule::in($request->user()->accessibleLocationIds())]]);
        $query = $this->bales($request)->with(['supplier', 'location', 'labels'])
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($filters['location_id'] ?? null, fn ($q, $id) => $q->where('location_id', $id))
            ->when($filters['q'] ?? null, fn ($q, $term) => $q->where(fn ($q) => $q->where('code', 'like', '%'.$term.'%')->orWhereHas('supplier', fn ($s) => $s->where('name', 'like', '%'.$term.'%'))));
        return Spa::render('Admin/Bales/Index', ['bales' => $query->latest()->paginate(20)->withQueryString()->through(fn ($bale) => $report->summary($bale)), 'filters' => $filters, 'locations' => $this->locations($request), 'suppliers' => VintageSupplier::orderBy('name')->get(), 'counts' => $this->bales($request)->selectRaw('status, COUNT(*) AS count')->groupBy('status')->pluck('count', 'status')]);
    }
    public function store(Request $request, VintageBaleService $service)
    {
        $data = $request->validate(['purchase_key' => ['required', 'uuid'], 'supplier_id' => ['required', 'exists:vintage_suppliers,id'], 'location_id' => ['required', Rule::in($request->user()->accessibleLocationIds()), Rule::exists('locations', 'id')->where('is_active', true)], 'purchased_at' => ['required', 'date', 'before_or_equal:'.now(config('vintage.timezone'))->toDateString()], 'purchase_cost' => ['required', 'numeric', 'min:0.01', 'max:999999999.99', 'decimal:0,2'], 'purchase_payment_method' => ['required', Rule::in(['cash', 'mmqr'])], 'total_pieces' => ['nullable', 'integer', 'min:1', 'max:1000000'], 'notes' => ['nullable', 'string', 'max:2000']]);
        $bale = $service->purchase($data, $request->user());
        return redirect()->route('admin.bales.show', $bale, 303)->with('success', \App\Support\UiText::get('Bale purchase recorded.'));
    }
    public function show(Request $request, VintageBale $bale, VintageBaleReport $report)
    {
        $this->access($request, $bale);
        $bale->load(['supplier', 'location', 'labels']);
        $sales = OrderItem::where('product_id', $bale->product_id)->with(['order:id,order_number,receipt_number,status,payment_status,created_at,final_amount,total_amount', 'unit'])->latest()->paginate(20)->withQueryString();
        $sales->through(function ($item) {
            $item->setAttribute('returned_quantity', (float) \App\Models\OrderReturn::where('order_item_id', $item->id)->whereNotNull('restocked_at')->sum('quantity'));
            return $item;
        });
        return Spa::render('Admin/Bales/Show', ['bale' => $report->summary($bale), 'sales' => $sales]);
    }
    public function transition(Request $request, VintageBale $bale, VintageBaleService $service)
    {
        $this->access($request, $bale);
        $data = $request->validate(['status' => ['required', Rule::in(['laundry', 'ready', 'closed'])], 'laundry_cost' => ['required_if:status,ready', 'nullable', 'numeric', 'min:0', 'max:999999999.99', 'decimal:0,2'], 'laundry_payment_method' => ['required_if:status,ready', 'nullable', Rule::in(['cash', 'mmqr'])], 'total_pieces' => ['nullable', 'integer', 'min:1', 'max:1000000']]);
        $service->transition($bale, $data['status'], $data, $request->user());
        return back()->with('success', \App\Support\UiText::get('Bale status updated.'));
    }
    public function label(Request $request, VintageBale $bale, VintageBaleService $service)
    {
        $this->access($request, $bale);
        $data = $request->validate(['price' => ['required', 'numeric', 'min:0.01', 'max:99999999.99', 'decimal:0,2']]);
        $service->label($bale, number_format((float) $data['price'], 2, '.', ''), $request->user());
        return back()->with('success', \App\Support\UiText::get('Price label ready to print.'));
    }
    public function labels(Request $request, VintageBale $bale)
    {
        $this->access($request, $bale);
        return Spa::render('Admin/Bales/Labels', ['bale' => $bale->load('labels')]);
    }
    public function suppliers(Request $request)
    {
        return Spa::render('Admin/Bales/Suppliers', ['suppliers' => VintageSupplier::withCount(['bales' => fn ($q) => $q->whereIn('location_id', $request->user()->accessibleLocationIds())])->orderBy('name')->get()]);
    }
    public function supplierStore(Request $request)
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:255'], 'phone' => ['nullable', 'string', 'max:50'], 'notes' => ['nullable', 'string', 'max:2000']]);
        VintageSupplier::create($data);
        return back()->with('success', \App\Support\UiText::get('Supplier added.'));
    }
    public function pos(Request $request)
    {
        abort_unless(config('inventory.pos_enabled', true), 403);
        return Spa::render('Admin/Bales/POS', ['locations' => $this->locations($request)]);
    }
    public function catalog(Request $request)
    {
        abort_unless(config('inventory.pos_enabled', true), 403);
        $data = $request->validate(['location_id' => ['required', Rule::in($request->user()->accessibleLocationIds()), Rule::exists('locations', 'id')->where('is_active', true)], 'q' => ['nullable', 'string', 'max:100']]);
        return VintagePriceLabel::with('bale')->whereHas('bale', fn ($q) => $q->where('location_id', $data['location_id'])->where('status', 'ready'))
            ->when($data['q'] ?? null, fn ($q, $term) => $q->where(fn ($q) => $q->where('barcode', $term)->orWhereHas('bale', fn ($b) => $b->where('code', 'like', '%'.$term.'%'))))
            ->orderBy('bale_id')->orderBy('price')->limit(100)->get()->map(function ($label) {
                $balance = InventoryBalance::where('product_id', $label->bale->product_id)->where('location_id', $label->bale->location_id)->first();
                return ['id' => $label->id, 'barcode' => $label->barcode, 'bale_id' => $label->bale_id, 'bale_code' => $label->bale->code, 'price' => $label->price, 'remaining' => $label->bale->total_pieces === null ? null : (int) $balance?->on_hand_qty];
            });
    }
    public function checkout(Request $request, PosCheckoutService $service)
    {
        abort_unless(config('inventory.pos_enabled', true), 403);
        $data = $request->validate([
            'request_key' => ['required', 'uuid'],
            'location_id' => ['required', Rule::in($request->user()->accessibleLocationIds())],
            // Accept only as part of the original hash when retrying a saved legacy request.
            'shift_id' => ['sometimes', 'nullable', 'integer'],
            'customer_id' => ['required_if:tender_type,credit', 'nullable', 'integer', Rule::exists('users', 'id')->where('role', \App\Models\User::CUSTOMER_ROLE)->whereNull('deleted_at')],
            'is_online_sale' => ['sometimes', 'boolean'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.label_id' => ['required', 'integer', 'exists:vintage_price_labels,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:9999'],
            'items.*.expected_price' => ['required', 'numeric', 'gt:0'],
            'tender_type' => ['required', Rule::in(['cash', 'mmqr', 'credit'])],
            'amount_tendered' => ['required', 'numeric', 'min:0', 'max:99999999.99'],
            'credit_deposit_method' => ['nullable', Rule::in(['cash', 'mmqr'])],
            'discount_value' => ['nullable', 'numeric', 'min:0', 'max:99999999.99', 'decimal:0,2'],
            'reference' => ['nullable', 'string', 'max:100'],
        ]);
        return DB::transaction(function () use ($data, $request, $service) {
            app(AutomaticPricingService::class)->lock();
            $hash = hash('sha256', json_encode($data));
            $existing = Order::where('bale_checkout_key', $data['request_key'])->first();
            if ($existing && ((int) $existing->served_by !== (int) $request->user()->id || $existing->bale_checkout_hash !== $hash)) throw ValidationException::withMessages(['request_key' => \App\Support\UiText::get('This sale request has already been used.')]);
            if (! $existing) {
                $items = collect($data['items'])->map(function ($line) {
                    $label = VintagePriceLabel::findOrFail($line['label_id']);
                    if (bccomp((string) $label->price, (string) $line['expected_price'], 2) !== 0) throw ValidationException::withMessages(['items' => \App\Support\UiText::get('The scanned price does not match this label. Scan it again.')]);
                    return ['product_unit_id' => $label->product_unit_id, 'quantity' => $line['quantity'], 'price_type' => 'retail', 'expected_unit_price' => (float) $label->price];
                })->all();
                if (collect($items)->sum(fn ($line) => $line['quantity'] * $line['expected_unit_price']) > 99999999.99) throw ValidationException::withMessages(['items' => \App\Support\UiText::get('This sale exceeds the receipt limit. Split it into smaller sales.')]);
                $existing = $service->checkout([
                    'location_id' => $data['location_id'],
                    'customer_id' => $data['customer_id'] ?? null,
                    'is_online_sale' => $data['is_online_sale'] ?? false,
                    'items' => $items,
                    'tender_type' => $data['tender_type'],
                    'amount_tendered' => $data['amount_tendered'],
                    'credit_deposit_method' => $data['credit_deposit_method'] ?? 'cash',
                    'discount_type' => (float) ($data['discount_value'] ?? 0) > 0 ? 'amount' : null,
                    'discount_value' => $data['discount_value'] ?? 0,
                    'payment_details' => ['reference' => $data['reference'] ?? null],
                ], $request->user());
                $existing->forceFill(['bale_checkout_key' => $data['request_key'], 'bale_checkout_hash' => $hash])->save();
            }
            return response()->json(['order' => $existing->load('items.product'), 'receipt_url' => route('admin.pos.orders.receipt', $existing)]);
        }, 3);
    }
    public function overview(Request $request, VintageBaleReport $report)
    {
        $bales = $this->bales($request)->with(['supplier', 'location', 'labels'])->latest()->get();
        $summaries = $bales->map(fn ($bale) => $report->summary($bale));
        $orders = Order::recognizedSale()->whereIn('location_id', $request->user()->accessibleLocationIds())->whereHas('items.product.vintageBale');
        return Spa::render('Admin/Bales/Dashboard', ['bales' => $summaries->take(6)->values(), 'counts' => $bales->countBy('status'), 'pieces_sold' => $summaries->sum('pieces_sold'), 'revenue' => $summaries->sum('sales_revenue'), 'today_revenue' => (float) (clone $orders)->whereBetween('created_at', [now(config('vintage.timezone'))->startOfDay()->utc(), now(config('vintage.timezone'))->endOfDay()->utc()])->sum('final_amount'), 'recentOrders' => (clone $orders)->latest()->limit(5)->get()]);
    }
    public function finance(Request $request, VintageBaleReport $report)
    {
        if ($request->routeIs('admin.reports.index') && ! $request->user()->hasAdminPermission('view_reports') && ! $request->user()->hasAdminPermission('reports.sales')) return $this->index($request, $report);
        $filters = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date', 'after_or_equal:from'], 'location_id' => ['nullable', Rule::in($request->user()->accessibleLocationIds())]]);
        $scope = fn ($q) => $q->whereIn('location_id', $request->user()->accessibleLocationIds())->when($filters['location_id'] ?? null, fn ($q, $id) => $q->where('location_id', $id));
        $entries = FinancialEntry::external()->where($scope)->when($filters['from'] ?? null, fn ($q, $date) => $q->whereDate('entry_date', '>=', $date))->when($filters['to'] ?? null, fn ($q, $date) => $q->whereDate('entry_date', '<=', $date));
        $approved = (clone $entries)->where('status', 'approved');
        $in = (float) (clone $approved)->where('type', 'income')->sum('amount');
        $out = (float) (clone $approved)->where(fn ($q) => $q->where('type', 'expense')->orWhere(fn ($q) => $q->where('type', 'asset')->where('category', 'stock_receipt')))->sum('amount');
        $bales = $request->routeIs('admin.reports.index')
            ? $this->bales($request)->where($scope)->with(['supplier', 'location', 'labels'])->latest()->paginate(20, ['*'], 'bales_page')->withQueryString()->through(fn ($b) => $report->summary($b))
            : null;
        $refundDue = (float) (clone $entries)->where('category', 'refund_payable')->where('status', 'pending')->sum('amount');
        return Spa::render('Admin/Bales/Finance', ['filters' => $filters, 'locations' => $this->locations($request), 'bales' => $bales, 'entries' => (clone $entries)->latest('entry_date')->latest('id')->paginate(30)->withQueryString(), 'summary' => ['cash_in' => $in, 'cash_out' => $out, 'net_cash' => round($in - $out, 2), 'bale_purchases' => (float) (clone $approved)->where('category', 'bale_purchase')->sum('amount'), 'laundry' => (float) (clone $approved)->where('category', 'bale_laundry')->sum('amount'), 'refund_due' => $refundDue], 'isReport' => $request->routeIs('admin.reports.index'), 'manualCategories' => collect(FinancialEntry::categoryOptions()['expense'])->reject(fn ($c) => in_array($c['value'], FinancialEntry::SYSTEM_CATEGORIES, true))->values()]);
    }
    public function salesReport(Request $request, \App\Services\VintageSalesChartReport $report)
    {
        $locationIds = $request->user()->accessibleLocationIds();
        $values = $request->validate([
            'year' => ['nullable', 'integer', 'between:2000,2100'],
            'month' => ['nullable', 'integer', 'between:1,12'],
            'location_id' => ['nullable', Rule::in($locationIds)],
        ]);
        $today = now(config('vintage.timezone'));
        $filters = ['year' => (int) ($values['year'] ?? $today->year), 'month' => (int) ($values['month'] ?? $today->month), 'location_id' => $values['location_id'] ?? ''];
        return Spa::render('Admin/Bales/Reports', [
            'filters' => $filters,
            'defaults' => ['year' => $today->year, 'month' => $today->month],
            'locations' => $this->locations($request),
            'charts' => $report->build($filters['location_id'] ? [(int) $filters['location_id']] : $locationIds, $filters['year'], $filters['month']),
        ]);
    }
    public function returnItem(Request $request, OrderItem $item, \App\Services\VintageReturnService $service)
    {
        $data = $request->validate(['request_key' => ['required', 'uuid'], 'quantity' => ['required', 'integer', 'min:1'], 'payment_method' => ['required', Rule::in(['cash', 'mmqr'])], 'reason' => ['nullable', 'string', 'max:500']]);
        $service->returnItem($item, $data, $request->user());
        return back()->with('success', \App\Support\UiText::get('Garments returned and refund payment recorded.'));
    }
    public function payRefund(Request $request, FinancialEntry $entry, \App\Services\VintageReturnService $service)
    {
        $data = $request->validate(['payment_method' => ['required', Rule::in(['cash', 'mmqr'])]]);
        $service->payPending($entry, $data['payment_method'], $request->user());
        return back()->with('success', \App\Support\UiText::get('Refund payment recorded.'));
    }
    public function exportBales(Request $request, VintageBaleReport $report, \App\Services\ExcelExportService $excel)
    {
        $filters = $request->validate(['location_id' => ['nullable', Rule::in($request->user()->accessibleLocationIds())]]);
        $rows = $this->bales($request)->when($filters['location_id'] ?? null, fn ($q, $id) => $q->where('location_id', $id))->with(['supplier', 'location', 'labels'])->get()->map(function ($bale) use ($report) {
            $s = $report->summary($bale);
            return [$bale->code, $bale->supplier->name, $bale->location->name, \App\Support\UiText::get($bale->status), $bale->total_pieces ?? 'Not counted', $s['pieces_sold'], $s['remaining'] ?? \App\Support\UiText::get('Unknown'), $bale->purchase_cost, $bale->laundry_cost, $s['sales_revenue'], $s['bale_result'], \App\Support\UiText::get($bale->status === 'closed' ? 'Final before overhead' : 'Provisional before overhead')];
        });
        $path = $excel->create('Bale results', ['Bale', 'Supplier', 'Branch', 'Status', 'Pieces received', 'Net pieces sold', 'Remaining', 'Purchase', 'Laundry', 'Net sales', 'Sales less bale costs', 'Result basis'], $rows);
        return response()->download($path, 'bale-results.xlsx')->deleteFileAfterSend(true);
    }
    public function exportLedger(Request $request, \App\Services\ExcelExportService $excel)
    {
        $filters = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date', 'after_or_equal:from'], 'location_id' => ['nullable', Rule::in($request->user()->accessibleLocationIds())]]);
        $entries = FinancialEntry::external()->whereIn('location_id', $request->user()->accessibleLocationIds())->when($filters['location_id'] ?? null, fn ($q, $id) => $q->where('location_id', $id))->when($filters['from'] ?? null, fn ($q, $d) => $q->whereDate('entry_date', '>=', $d))->when($filters['to'] ?? null, fn ($q, $d) => $q->whereDate('entry_date', '<=', $d))->orderBy('entry_date')->get();
        $path = $excel->create('Cash ledger', ['Date', 'Type', 'Category', 'Description', 'Amount', 'Payment method', 'Reference', 'Status'], $entries->map(fn ($e) => [$e->entry_date->toDateString(), $e->type, $e->category, $e->title, $e->amount, $e->payment_method, $e->reference, $e->status]));
        return response()->download($path, 'cash-ledger.xlsx')->deleteFileAfterSend(true);
    }
}
