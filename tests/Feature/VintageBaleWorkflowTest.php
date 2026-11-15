<?php

namespace Tests\Feature;

use App\Models\{FinancialEntry, InventoryBalance, InventoryMovement, Location, Order, OrderItem, OrderReturn, User, VintageBale, VintagePriceLabel, VintageSupplier};
use App\Services\{OrderManagementService, VintageBaleReport};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class VintageBaleWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private function setupShop(): array
    {
        $actor = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $branch = Location::create(['code' => 'BALE-TEST', 'name' => 'Vintage shop', 'type' => 'warehouse', 'is_active' => true]);
        $supplier = VintageSupplier::create(['name' => 'Bale supplier']);
        $this->actingAs($actor);
        return [$actor, $branch, $supplier];
    }
    private function purchase(Location $branch, VintageSupplier $supplier, ?int $count = null): VintageBale
    {
        $this->post('/admin/bales', ['purchase_key' => (string) Str::uuid(), 'supplier_id' => $supplier->id, 'location_id' => $branch->id, 'purchased_at' => today()->toDateString(), 'purchase_cost' => 10000, 'purchase_payment_method' => 'cash', 'total_pieces' => $count])->assertStatus(303)->assertSessionHasNoErrors();
        return VintageBale::latest('id')->firstOrFail();
    }
    private function ready(VintageBale $bale): VintagePriceLabel
    {
        $this->post('/admin/bales/'.$bale->id.'/status', ['status' => 'laundry'])->assertSessionHasNoErrors();
        $this->post('/admin/bales/'.$bale->id.'/status', ['status' => 'ready', 'laundry_cost' => 2000, 'laundry_payment_method' => 'mmqr'])->assertSessionHasNoErrors();
        $this->post('/admin/bales/'.$bale->id.'/labels', ['price' => 5000])->assertSessionHasNoErrors();
        return $bale->labels()->firstOrFail();
    }
    private function sale(Location $branch, VintagePriceLabel $label, int $quantity = 1): array
    {
        return ['request_key' => (string) Str::uuid(), 'location_id' => $branch->id, 'items' => [['label_id' => $label->id, 'quantity' => $quantity, 'expected_price' => $label->price]], 'tender_type' => 'cash', 'amount_tendered' => $quantity * (float) $label->price];
    }

    public function test_saved_legacy_requests_retry_without_a_shift_and_do_not_create_new_shift_links(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $label = $this->ready($this->purchase($branch, $supplier, 2));
        $payload = $this->sale($branch, $label) + ['shift_id' => 999999];
        $response = $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk();
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk()->assertJsonPath('order.id', $response->json('order.id'));
        $order = Order::findOrFail($response->json('order.id'));
        $this->assertNull($order->shift_id);
        $this->assertNull($order->register_id);
        $this->assertNull($order->payments->sole()->shift_id);
        $this->assertNull($order->payments->sole()->register_id);
        $this->assertSame($actor->id, $order->served_by);
        $this->assertSame($branch->id, $order->location_id);
        $this->assertDatabaseCount('pos_shifts', 0);
        $this->assertDatabaseCount('orders', 1);
    }

    public function test_purchase_retry_does_not_duplicate_the_bale_or_finance_entry(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $data = ['purchase_key' => (string) Str::uuid(), 'supplier_id' => $supplier->id, 'location_id' => $branch->id, 'purchased_at' => today()->toDateString(), 'purchase_cost' => 10000, 'purchase_payment_method' => 'cash'];
        $this->post('/admin/bales', $data)->assertStatus(303);
        $this->post('/admin/bales', $data)->assertStatus(303);
        $this->assertDatabaseCount('vintage_bales', 1);
        $this->assertSame(1, FinancialEntry::where('category', 'bale_purchase')->count());
        $this->assertSame(0, Order::count());
        $this->assertDatabaseHas('financial_entries', ['category' => 'bale_purchase', 'amount' => 10000, 'status' => 'approved']);
        $this->postJson('/admin/bales', array_merge($data, ['purchase_cost' => 11000]))->assertUnprocessable();
    }

    public function test_laundry_is_required_and_labels_are_reusable_without_stock_changes(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $bale = $this->purchase($branch, $supplier, 10);
        $this->getJson('/admin/bale-pos/catalog?location_id='.$branch->id)->assertExactJson([]);
        $this->postJson('/admin/bales/'.$bale->id.'/labels', ['price' => 5000])->assertUnprocessable();
        $this->postJson('/admin/bales/'.$bale->id.'/status', ['status' => 'ready', 'laundry_cost' => 2000, 'laundry_payment_method' => 'cash'])->assertUnprocessable();
        $label = $this->ready($bale);
        $this->post('/admin/bales/'.$bale->id.'/labels', ['price' => '5000.00'])->assertSessionHasNoErrors();
        $this->assertDatabaseCount('vintage_price_labels', 1);
        $this->assertSame(2, $bale->product->units()->count());
        $before = InventoryMovement::count();
        $this->getJson('/admin/bales/'.$bale->id.'/labels')->assertOk()->assertJsonPath('props.bale.labels.0.barcode', $label->barcode);
        $this->getJson('/admin/bales/'.$bale->id.'/labels')->assertOk();
        $this->assertSame($before, InventoryMovement::count());
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $bale->product_id, 'on_hand_qty' => 10]);
        $this->assertSame(1, FinancialEntry::where('category', 'bale_laundry')->count());
    }

    public function test_different_price_groups_reduce_one_shared_bale_and_sale_retry_is_safe(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $bale = $this->purchase($branch, $supplier, 5);
        $first = $this->ready($bale);
        $this->post('/admin/bales/'.$bale->id.'/labels', ['price' => 7000]);
        $second = $bale->labels()->where('price', 7000)->firstOrFail();

        $payload = $this->sale($branch, $first, 2);
        $payload['items'][] = ['label_id' => $second->id, 'quantity' => 1, 'expected_price' => 7000];
        $payload['amount_tendered'] = 20000;
        $response = $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk()->assertJsonPath('order.final_amount', '17000.00');
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk()->assertJsonPath('order.id', $response->json('order.id'));
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('order_items', 2);
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $bale->product_id, 'on_hand_qty' => 2]);
        $this->assertSame(1, FinancialEntry::where('category', 'pos_sale')->count());
        $summary = app(VintageBaleReport::class)->summary($bale->fresh());
        $this->assertSame(3, $summary['pieces_sold']);
        $this->assertSame(17000.0, $summary['sales_revenue']);
        $this->assertSame(5000.0, $summary['bale_result']);
        $this->assertSame(17000.0, (float) $this->cashTotal());
    }

    public function test_unknown_count_allows_sales_and_manual_finish_without_fake_stock(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $bale = $this->purchase($branch, $supplier);
        $label = $this->ready($bale);

        $this->postJson('/admin/bale-pos/checkout', $this->sale($branch, $label, 3))->assertOk();
        $summary = app(VintageBaleReport::class)->summary($bale->fresh());
        $this->assertSame(3, $summary['pieces_sold']);
        $this->assertNull($summary['remaining']);
        $this->post('/admin/bales/'.$bale->id.'/status', ['status' => 'closed'])->assertSessionHasNoErrors();
        $this->postJson('/admin/bale-pos/checkout', $this->sale($branch, $label))->assertUnprocessable();
    }

    public function test_last_sale_finishes_a_counted_bale_and_refund_reopens_it(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $bale = $this->purchase($branch, $supplier, 2);
        $label = $this->ready($bale);

        $this->postJson('/admin/bale-pos/checkout', $this->sale($branch, $label, 3))->assertUnprocessable();
        $this->postJson('/admin/bale-pos/checkout', $this->sale($branch, $label, 2))->assertOk();
        $this->assertSame('closed', $bale->fresh()->status);
        $item = OrderItem::firstOrFail();
        $data = ['request_key' => (string) Str::uuid(), 'quantity' => 1, 'payment_method' => 'cash'];
        $this->post('/admin/bale-sale-items/'.$item->id.'/return', $data)->assertSessionHasNoErrors();
        $this->post('/admin/bale-sale-items/'.$item->id.'/return', $data)->assertSessionHasNoErrors();
        $this->assertSame('ready', $bale->fresh()->status);
        $this->assertDatabaseCount('order_returns', 1);
        $this->assertSame(5000.0, (float) $this->cashTotal());
        $summary = app(VintageBaleReport::class)->summary($bale->fresh());
        $this->assertSame(1, $summary['remaining']);
        $this->assertSame(1, $summary['pieces_sold']);
        $this->assertSame(5000.0, $summary['sales_revenue']);
        $this->postJson('/admin/bale-sale-items/'.$item->id.'/return', ['request_key' => (string) Str::uuid(), 'quantity' => 2, 'payment_method' => 'cash'])->assertUnprocessable();
    }

    public function test_printed_price_wins_over_generic_price_edits_and_fractional_sales_are_rejected(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $label = $this->ready($this->purchase($branch, $supplier, 10));
        $label->unit->prices()->update(['price' => 1]);

        $payload = $this->sale($branch, $label);
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk()->assertJsonPath('order.final_amount', '5000.00');
        $payload = $this->sale($branch, $label);
        $payload['items'][0]['quantity'] = 1.5;
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertUnprocessable();
    }

    public function test_cancel_after_partial_return_tracks_only_the_refund_still_due(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $bale = $this->purchase($branch, $supplier, 2);
        $label = $this->ready($bale);

        $response = $this->postJson('/admin/bale-pos/checkout', $this->sale($branch, $label, 2))->assertOk();
        $order = Order::findOrFail($response->json('order.id'));
        $this->post('/admin/bale-sale-items/'.$order->items->first()->id.'/return', ['request_key' => (string) Str::uuid(), 'quantity' => 1, 'payment_method' => 'cash'])->assertSessionHasNoErrors();
        app(OrderManagementService::class)->cancelOrder($order, $actor);
        $entry = FinancialEntry::where('category', 'refund_payable')->firstOrFail();
        $this->assertSame(5000.0, (float) $entry->amount);
        $this->assertSame(5000.0, (float) $this->cashTotal());
        $this->post('/admin/finance/refunds/'.$entry->id.'/paid', ['payment_method' => 'cash'])->assertSessionHasNoErrors();
        $this->assertSame(0.0, (float) $this->cashTotal());
        $this->assertSame(0, app(VintageBaleReport::class)->summary($bale->fresh())['pieces_sold']);
    }

    public function test_bale_finance_inventory_dashboard_and_exports_render(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $bale = $this->purchase($branch, $supplier, 10);
        $this->ready($bale);
        foreach (['/admin/dashboard', '/admin/bales', '/admin/inventory', '/admin/suppliers', '/admin/pos', '/admin/bales/'.$bale->id, '/admin/finance', '/admin/reports'] as $path) $this->getJson($path)->assertOk();
        $this->getJson('/admin/finance')->assertJsonPath('props.summary.cash_out', 12000)->assertJsonPath('props.summary.bale_purchases', 10000)->assertJsonPath('props.summary.laundry', 2000)->assertJsonPath('props.bales', null);
        $this->getJson('/admin/bales')->assertJsonPath('props.bales.data.0.total_cost', 12000)->assertJsonPath('props.bales.data.0.bale_result', -12000);
        $this->getJson('/admin/reports')->assertJsonPath('component', 'Admin/Bales/Reports')->assertJsonCount(12, 'props.charts.yearly')->assertJsonMissingPath('props.bales');
        $this->get('/admin/finance/export')->assertOk()->assertDownload();
        $this->get('/admin/reports/export')->assertOk()->assertDownload();
    }

    public function test_branch_access_applies_to_bales_catalog_checkout_finance_and_exports(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $bale = $this->purchase($branch, $supplier, 5);
        $label = $this->ready($bale);
        $other = Location::create(['code' => 'OTHER', 'name' => 'Other branch', 'type' => 'warehouse', 'is_active' => true]);
        $staff = User::factory()->create(['role' => 'manager', 'status' => 'active']);
        $role = \App\Models\Role::create(['name' => 'bale_staff', 'display_name' => 'Bale staff', 'is_admin' => true]);
        $role->permissions()->sync(\App\Models\Permission::whereIn('name', ['catalog.view', 'catalog.manage', 'inventory.receive', 'pos.access', 'manage_finance', 'reports.sales'])->pluck('id'));
        $staff->roles()->sync([$role->id]);
        $staff->locations()->sync([$other->id]);
        $this->actingAs($staff);
        $this->getJson('/admin/bales/'.$bale->id)->assertForbidden();
        $this->patchJson('/admin/bales/'.$bale->id, $this->baleEditData($bale->fresh()))->assertForbidden();
        $this->getJson('/admin/bales')->assertOk()->assertJsonCount(0, 'props.bales.data');
        $this->getJson('/admin/bale-pos/catalog?location_id='.$branch->id)->assertForbidden();
        $this->getJson('/admin/finance?location_id='.$branch->id)->assertForbidden();
        $this->getJson('/admin/reports/export?location_id='.$branch->id)->assertForbidden();

        $this->postJson('/admin/bale-pos/checkout', $this->sale($other, $label))->assertUnprocessable();
        $this->postJson('/admin/bales', ['purchase_key' => (string) Str::uuid(), 'supplier_id' => $supplier->id, 'location_id' => $branch->id, 'purchased_at' => today()->toDateString(), 'purchase_cost' => 100, 'purchase_payment_method' => 'cash'])->assertForbidden();
        $this->assertDatabaseCount('vintage_bales', 1);
        $this->assertDatabaseCount('orders', 0);
    }

    public function test_cash_and_bank_refunds_work_without_a_shift(): void
    {
        [, $branch, $supplier] = $this->setupShop();
        $label = $this->ready($this->purchase($branch, $supplier, 2));
        $this->postJson('/admin/bale-pos/checkout', $this->sale($branch, $label, 2))->assertOk();
        $item = OrderItem::firstOrFail();
        foreach (['cash', 'mmqr'] as $method) {
            $this->postJson('/admin/bale-sale-items/'.$item->id.'/return', ['request_key' => (string) Str::uuid(), 'quantity' => 1, 'payment_method' => $method])->assertRedirect();
            $this->assertDatabaseHas('financial_entries', ['category' => 'bale_refund', 'amount' => 5000, 'payment_method' => $method, 'shift_id' => null]);
        }
        $this->assertDatabaseCount('order_returns', 2);
    }

    public function test_purchase_and_laundry_ledger_entries_cannot_be_edited_or_deleted(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $this->ready($this->purchase($branch, $supplier, 2));
        foreach (FinancialEntry::whereIn('category', ['bale_purchase', 'bale_laundry'])->get() as $entry) {
            $this->patch('/admin/finance/entries/'.$entry->id, ['amount' => 1])->assertSessionHas('error');
            $this->delete('/admin/finance/entries/'.$entry->id)->assertSessionHas('error');
            $this->assertEquals($entry->amount, $entry->fresh()->amount);
        }
    }

    public function test_legacy_product_editor_cannot_replace_or_delete_a_bale_record(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $bale = $this->purchase($branch, $supplier);
        $this->patchJson('/admin/products/'.$bale->product_id, ['name' => 'Wrong flow'])->assertNotFound();
        $this->patchJson('/admin/products/'.$bale->product_id.'/toggle-status')->assertNotFound();
        $this->deleteJson('/admin/products/'.$bale->product_id)->assertNotFound();
        $this->assertDatabaseHas('vintage_bales', ['id' => $bale->id]);
        $this->assertDatabaseHas('products', ['id' => $bale->product_id, 'name' => $bale->code]);
    }
    private function baleEditData(VintageBale $bale, array $changes = []): array
    {
        return array_replace($bale->only(['code', 'supplier_id', 'purchase_cost', 'purchase_payment_method', 'laundry_cost', 'laundry_payment_method', 'total_pieces', 'notes', 'edit_token']), ['purchased_at' => $bale->purchased_at->toDateString()], $changes);
    }

    public function test_bale_edits_during_sales_reconcile_stock_and_finance_without_rewriting_sales(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $bale = $this->purchase($branch, $supplier, 10);
        $label = $this->ready($bale);
        $this->postJson('/admin/bale-pos/checkout', $this->sale($branch, $label, 2))->assertOk();
        $item = OrderItem::firstOrFail();
        $originalItem = $item->getAttributes();
        $other = VintageSupplier::create(['name' => 'Correct supplier']);
        $data = $this->baleEditData($bale->fresh(), ['code' => 'CORRECTED-BALE', 'supplier_id' => $other->id, 'purchase_cost' => 14000, 'laundry_cost' => 4000, 'purchase_payment_method' => 'mmqr', 'total_pieces' => 12, 'notes' => 'Corrected after counting.']);
        $this->patchJson('/admin/bales/'.$bale->id, $data)->assertStatus(303)->assertSessionHasNoErrors();
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $bale->product_id, 'on_hand_qty' => 10]);
        $this->assertDatabaseHas('financial_entries', ['bale_id' => $bale->id, 'category' => 'bale_purchase', 'amount' => 14000, 'payment_method' => 'mmqr']);
        $this->assertDatabaseHas('financial_entries', ['bale_id' => $bale->id, 'category' => 'bale_laundry', 'amount' => 4000]);
        $this->assertSame(2, FinancialEntry::where('bale_id', $bale->id)->count());
        $this->assertEquals(1500, $bale->product->fresh()->original_price);
        $this->assertSame($originalItem, $item->fresh()->getAttributes());
        $this->assertSame($label->barcode, $label->fresh()->barcode);
        $this->assertSame(2, app(VintageBaleReport::class)->summary($bale->fresh())['pieces_sold']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'bale.updated', 'subject_id' => $bale->id]);
        $this->patchJson('/admin/bales/'.$bale->id, $data)->assertUnprocessable()->assertJsonValidationErrors('edit_token');
    }

    public function test_bale_count_can_be_set_after_uncounted_sales_but_cannot_drop_below_sold_pieces(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $bale = $this->purchase($branch, $supplier);
        $label = $this->ready($bale);
        $this->postJson('/admin/bale-pos/checkout', $this->sale($branch, $label, 3))->assertOk();
        $this->patchJson('/admin/bales/'.$bale->id, $this->baleEditData($bale->fresh(), ['total_pieces' => 2]))->assertUnprocessable()->assertJsonValidationErrors('total_pieces');
        $this->patchJson('/admin/bales/'.$bale->id, $this->baleEditData($bale->fresh(), ['total_pieces' => 8]))->assertStatus(303)->assertSessionHasNoErrors();
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $bale->product_id, 'on_hand_qty' => 5]);
        $balance = InventoryBalance::where('product_id', $bale->product_id)->firstOrFail();
        $balance->update(['reserved_qty' => 2]);
        $this->patchJson('/admin/bales/'.$bale->id, $this->baleEditData($bale->fresh(), ['total_pieces' => 4]))->assertUnprocessable()->assertJsonValidationErrors('total_pieces');
        $balance->update(['reserved_qty' => 0]);
        $this->patchJson('/admin/bales/'.$bale->id, $this->baleEditData($bale->fresh(), ['total_pieces' => 6]))->assertStatus(303);
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $bale->product_id, 'on_hand_qty' => 3]);
        $this->patchJson('/admin/bales/'.$bale->id, $this->baleEditData($bale->fresh(), ['total_pieces' => null]))->assertUnprocessable()->assertJsonValidationErrors('total_pieces');
    }

    public function test_purchased_laundry_and_finished_bales_allow_information_edits(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $bale = $this->purchase($branch, $supplier, 5);
        foreach (['purchased', 'laundry', 'ready', 'closed'] as $status) {
            if ($status !== 'purchased') {
                $this->post('/admin/bales/'.$bale->id.'/status', ['status' => $status, 'laundry_cost' => 2000, 'laundry_payment_method' => 'cash'])->assertSessionHasNoErrors();
            }
            $this->patchJson('/admin/bales/'.$bale->id, $this->baleEditData($bale->fresh(), ['notes' => 'Edited '.$status, 'laundry_cost' => 2000]))->assertStatus(303)->assertSessionHasNoErrors();
            $this->assertSame('Edited '.$status, $bale->fresh()->notes);
            $this->assertSame(1, FinancialEntry::where('bale_id', $bale->id)->where('category', 'bale_laundry')->count());
        }
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $bale->product_id, 'on_hand_qty' => 0]);
        $this->patchJson('/admin/bales/'.$bale->id, $this->baleEditData($bale->fresh(), ['total_pieces' => 6]))->assertUnprocessable()->assertJsonValidationErrors('total_pieces');
        $this->assertSame('closed', $bale->fresh()->status);
    }

    public function test_bale_edit_requires_inventory_permission(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $bale = $this->purchase($branch, $supplier, 5);
        $viewer = User::factory()->create(['role' => 'staff', 'status' => 'active']);
        $this->actingAs($viewer)->patchJson('/admin/bales/'.$bale->id, $this->baleEditData($bale))->assertForbidden();
    }

    public function test_laundry_cost_corrected_before_ready_is_not_duplicated_or_left_stale(): void
    {
        [$actor, $branch, $supplier] = $this->setupShop();
        $bale = $this->purchase($branch, $supplier, 5);
        $this->patchJson('/admin/bales/'.$bale->id, $this->baleEditData($bale->fresh(), ['laundry_cost' => 2000]))->assertStatus(303);
        $this->post('/admin/bales/'.$bale->id.'/status', ['status' => 'laundry'])->assertSessionHasNoErrors();
        $this->post('/admin/bales/'.$bale->id.'/status', ['status' => 'ready', 'laundry_cost' => 0, 'laundry_payment_method' => 'cash'])->assertSessionHasNoErrors();
        $this->assertSame(1, FinancialEntry::where('bale_id', $bale->id)->where('category', 'bale_laundry')->count());
        $this->assertDatabaseHas('financial_entries', ['bale_id' => $bale->id, 'category' => 'bale_laundry', 'amount' => 0]);
    }

    private function cashTotal(): float
    {
        return round((float) FinancialEntry::where('status', 'approved')->where('payment_method', 'cash')
            ->whereIn('category', ['pos_sale', 'bale_refund', 'refund_payable'])
            ->get()->sum(fn ($entry) => $entry->type === 'income' ? (float) $entry->amount : -(float) $entry->amount), 2);
    }

}
