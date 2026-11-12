<?php

namespace Tests\Feature;

use App\Models\{CustomerCreditTransaction, FinancialEntry, InventoryMovement, Location, Order, Permission, Role, User, VintageBale, VintagePriceLabel, VintageSupplier};
use App\Services\{CustomerCreditService, VintageBaleReport, VintageBaleService};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class VintageBaleCreditCheckoutTest extends TestCase
{
    use RefreshDatabase;

    private function shop(): array
    {
        $actor = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $branch = Location::create(['code' => 'CREDIT-BALE', 'name' => 'Credit shop', 'type' => 'warehouse', 'is_active' => true]);
        $supplier = VintageSupplier::create(['name' => 'Credit supplier']);
        $service = app(VintageBaleService::class);
        $bale = $service->purchase(['purchase_key' => (string) Str::uuid(), 'supplier_id' => $supplier->id, 'location_id' => $branch->id, 'purchased_at' => today()->toDateString(), 'purchase_cost' => 10000, 'purchase_payment_method' => 'cash', 'total_pieces' => 10], $actor);
        $service->transition($bale, 'laundry', [], $actor);
        $service->transition($bale, 'ready', ['laundry_cost' => 0, 'laundry_payment_method' => 'cash', 'total_pieces' => 10], $actor);
        $label = $service->label($bale, '5000.00', $actor);

        $customer = User::factory()->create(['role' => User::CUSTOMER_ROLE, 'status' => 'active', 'credit_status' => 'active', 'credit_limit' => 20000, 'credit_terms_days' => 14]);
        $this->actingAs($actor);

        return [$actor, $branch, $bale, $label, $customer];
    }

    private function payload(Location $branch, VintagePriceLabel $label, ?User $customer): array
    {
        return ['request_key' => (string) Str::uuid(), 'location_id' => $branch->id, 'customer_id' => $customer?->id, 'items' => [['label_id' => $label->id, 'quantity' => 1, 'expected_price' => $label->price]], 'tender_type' => 'credit', 'amount_tendered' => 0];
    }

    public function test_bale_receipts_do_not_offer_or_open_the_legacy_sale_editor(): void
    {
        [, $branch, $bale, $label, $customer] = $this->shop();
        $response = $this->postJson('/admin/bale-pos/checkout', $this->payload($branch, $label, $customer))
            ->assertOk();
        $orderId = $response->json('order.id');
        $this->getJson('/admin/pos/orders/'.$orderId.'/receipt')->assertOk()
            ->assertJsonPath('props.canEditVoucher', false);
        $this->getJson('/admin/orders/'.$orderId.'/edit-pos-sale')->assertUnprocessable()
            ->assertJsonValidationErrors('order');
        $this->postJson('/admin/orders/'.$orderId.'/revise-pos-sale', [])->assertUnprocessable()
            ->assertJsonValidationErrors('order');
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $bale->product_id, 'on_hand_qty' => 9]);
    }

    public function test_pos_receipt_is_visible_only_within_assigned_branches(): void
    {
        [, $branch, , $label, $customer] = $this->shop();
        $response = $this->postJson('/admin/bale-pos/checkout', $this->payload($branch, $label, $customer))->assertOk();
        $url = '/admin/pos/orders/'.$response->json('order.id').'/receipt';
        $staff = User::factory()->create(['role' => 'staff', 'status' => 'active', 'permissions' => ['pos.access']]);
        $staff->syncAdminRole('staff');
        $this->assertTrue($staff->fresh()->hasAdminPermission('pos.access'));
        $this->actingAs($staff)->getJson($url)->assertForbidden();
        $staff->locations()->sync([$branch->id]);
        $this->actingAs($staff->fresh())->getJson($url)->assertOk()->assertJsonPath('component', 'Admin/POS/Receipt');
    }

    public function test_credit_collection_does_not_award_loyalty_points(): void
    {
        [, $branch, , $label, $customer] = $this->shop();
        $customer->update(['loyalty_points' => 73, 'tier' => 'Silver']);
        app(\App\Services\AppSettingsService::class)->setMany(['loyalty_is_enabled' => '1']);
        $response = $this->postJson('/admin/bale-pos/checkout', $this->payload($branch, $label, $customer))->assertOk();
        $this->postJson('/admin/customers/'.$customer->id.'/credit-payments', [
            'amount' => 5000, 'tender_type' => 'cash',
        ])->assertSessionHasNoErrors()->assertRedirect();
        $order = Order::findOrFail($response->json('order.id'));
        $this->assertSame('paid', $order->payment_status);
        $this->assertEquals(5000, $order->paid_amount);
        $this->assertSame(73, (int) $customer->fresh()->loyalty_points);
        $this->assertSame('Silver', $customer->fresh()->tier);
        $this->assertNull($order->loyalty_awarded_at);
        $this->assertDatabaseCount('reward_histories', 0);
    }

    public function test_historical_point_reversals_remain_idempotent(): void
    {
        $customer = User::factory()->create(['loyalty_points' => 100]);
        $order = Order::create([
            'user_id' => $customer->id, 'order_number' => 'LEGACY-POINTS', 'sales_channel' => 'pos',
            'status' => 'completed', 'payment_status' => 'paid', 'total_amount' => 1000, 'final_amount' => 1000,
            'earned_points' => 20, 'redeemed_points' => 30, 'loyalty_awarded_at' => now(),
        ]);
        $history = app(\App\Services\LoyaltyService::class);
        $history->reverseEarnedPoints($order);
        $history->restoreRedeemedPoints($order);
        $history->reverseEarnedPoints($order->fresh());
        $history->restoreRedeemedPoints($order->fresh());
        $this->assertSame(110, (int) $customer->fresh()->loyalty_points);
        $this->assertDatabaseCount('reward_histories', 2);
    }

    public function test_online_cash_sales_require_a_customer_and_delivery_changes_do_not_repeat_the_sale(): void
    {
        [$actor, $branch, $bale, $label, $customer] = $this->shop();
        $payload = array_merge($this->payload($branch, $label, null), ['is_online_sale' => true, 'tender_type' => 'cash', 'amount_tendered' => 5000]);
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertUnprocessable()->assertJsonValidationErrors('customer_id');
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $bale->product_id, 'on_hand_qty' => 10]);
        $payload['customer_id'] = $actor->id;
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertUnprocessable()->assertJsonValidationErrors('customer_id');
        $customer->update(['credit_status' => 'disabled']);
        $payload['customer_id'] = $customer->id;
        $response = $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk()
            ->assertJsonPath('order.is_online_sale', true)->assertJsonPath('order.order_status', 'not_delivered');
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk()->assertJsonPath('order.id', $response->json('order.id'));
        $order = Order::findOrFail($response->json('order.id'));
        $this->assertSame($customer->name, $order->receiver_name);
        $this->assertSame('completed', $order->status);
        $this->assertDatabaseCount('orders', 1);
        $this->getJson('/admin/orders?tab=not_delivered')->assertOk()->assertJsonCount(1, 'props.orders.data');
        $this->getJson('/admin/orders?sale_type=online&status=not_delivered')->assertOk()
            ->assertJsonPath('props.filters.sale_type', 'online')->assertJsonCount(1, 'props.orders.data');
        $this->getJson('/admin/orders?sale_type=in_store')->assertOk()->assertJsonCount(0, 'props.orders.data');
        $this->getJson('/admin/orders?sale_type=unknown')->assertOk()
            ->assertJsonPath('props.filters.sale_type', null)->assertJsonCount(1, 'props.orders.data');
        $this->patch('/admin/orders/'.$order->id.'/delivery', ['delivered' => true])->assertRedirect();
        $stamp = $order->fresh()->delivered_at->toDateTimeString();
        $this->patch('/admin/orders/'.$order->id.'/delivery', ['delivered' => true])->assertRedirect();
        $this->assertSame($stamp, $order->fresh()->delivered_at->toDateTimeString());
        $this->assertSame($actor->id, $order->fresh()->delivered_by);
        $this->assertSame('delivered', $order->fresh()->order_status);
        $this->getJson('/admin/orders?tab=not_delivered')->assertOk()->assertJsonCount(0, 'props.orders.data');
        $this->getJson('/admin/orders?tab=delivered')->assertOk()->assertJsonCount(1, 'props.orders.data');
        $this->assertSame(1, InventoryMovement::where('type', 'sale')->count());
        $this->assertSame(1, FinancialEntry::where('category', 'pos_sale')->count());
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $bale->product_id, 'on_hand_qty' => 9]);
        $this->patch('/admin/orders/'.$order->id.'/delivery', ['delivered' => false])->assertRedirect();
        $this->assertNull($order->fresh()->delivered_at);
        $this->assertSame('not_delivered', $order->fresh()->order_status);
        $this->patchJson('/admin/orders/'.$order->id.'/delivery', ['delivered' => 'wrong'])->assertUnprocessable();
        app(\App\Services\OrderManagementService::class)->cancelOrder($order->fresh(), $actor);
        $this->patchJson('/admin/orders/'.$order->id.'/delivery', ['delivered' => true])->assertUnprocessable();
        $this->assertSame('cancelled', $order->fresh()->order_status);
    }

    public function test_online_credit_counts_as_a_sale_before_delivery_and_delivery_respects_branch_permissions(): void
    {
        [$actor, $branch, $bale, $label, $customer] = $this->shop();
        $response = $this->postJson('/admin/bale-pos/checkout', $this->payload($branch, $label, $customer) + ['is_online_sale' => true])->assertOk();
        $order = Order::findOrFail($response->json('order.id'));
        $this->assertSame('not_delivered', $order->order_status);
        $this->assertEquals(5000, Order::recognizedSale()->sum('final_amount'));
        $this->assertSame(5000.0, app(CustomerCreditService::class)->balance($customer));
        $this->assertDatabaseCount('payments', 0);
        $other = Location::create(['code' => 'OTHER-DELIVERY', 'name' => 'Other branch', 'type' => 'warehouse', 'is_active' => true]);
        $role = Role::create(['name' => 'delivery_clerk', 'display_name' => 'Delivery clerk', 'is_admin' => true]);
        $role->permissions()->attach(Permission::where('name', 'orders.manage')->firstOrFail());
        $staff = User::factory()->create(['role' => $role->name, 'status' => 'active']);
        $staff->roles()->sync([$role->id]);
        $staff->locations()->sync([$other->id]);
        $this->actingAs($staff)->patchJson('/admin/orders/'.$order->id.'/delivery', ['delivered' => true])->assertForbidden();
        $staff->locations()->sync([$branch->id]);
        $this->actingAs($staff->fresh())->patch('/admin/orders/'.$order->id.'/delivery', ['delivered' => true])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertSame('delivered', $order->fresh()->order_status);
        $this->assertSame('unpaid', $order->fresh()->payment_status);
        $this->assertSame(5000.0, app(CustomerCreditService::class)->balance($customer));
        $this->assertSame(1, CustomerCreditTransaction::where('type', 'sale')->count());
        $viewer = User::factory()->create(['role' => 'staff', 'status' => 'active']);
        $this->actingAs($viewer)->patchJson('/admin/orders/'.$order->id.'/delivery', ['delivered' => false])->assertForbidden();
    }

    public function test_full_credit_sale_records_debt_stock_revenue_and_due_date_without_cash_income(): void
    {
        [, $branch, $bale, $label, $customer] = $this->shop();
        $payload = $this->payload($branch, $label, $customer);
        $response = $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk()
            ->assertJsonPath('order.user_id', $customer->id)
            ->assertJsonPath('order.status', 'completed')
            ->assertJsonPath('order.payment_status', 'unpaid')
            ->assertJsonPath('order.credit_amount', '5000.00')
            ->assertJsonPath('order.paid_amount', '0.00');
        $order = Order::findOrFail($response->json('order.id'));
        $this->assertSame(now()->addDays(14)->toDateString(), $order->credit_due_date->toDateString());
        $this->assertDatabaseHas('customer_credit_transactions', ['customer_id' => $customer->id, 'order_id' => $order->id, 'type' => 'sale', 'amount' => 5000]);
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $bale->product_id, 'on_hand_qty' => 9]);
        $this->assertSame(0, $order->payments()->count());
        $this->assertSame(0, FinancialEntry::where('category', 'pos_sale')->count());
        $this->assertSame(5000.0, app(CustomerCreditService::class)->balance($customer));
        $this->assertSame(5000.0, app(VintageBaleReport::class)->summary($bale->fresh())['sales_revenue']);
        $this->getJson('/admin/pos/customers/search?q='.urlencode($customer->name))->assertOk()->assertJsonPath('0.available_credit', 15000);
        $this->getJson($response->json('receipt_url'))->assertOk()->assertJsonPath('props.order.user.id', $customer->id);
    }

    public static function deposits(): array
    {
        return [['cash', 1500.0], ['mmqr', 0.0]];
    }

    #[DataProvider('deposits')]
    public function test_credit_deposits_and_retries_are_recorded_once(string $method, float $expectedCash): void
    {
        [, $branch, $bale, $label, $customer] = $this->shop();
        $payload = $this->payload($branch, $label, $customer) + ['credit_deposit_method' => $method, 'reference' => 'BANK-REF'];
        $payload['amount_tendered'] = 1500;
        $response = $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk()
            ->assertJsonPath('order.payment_status', 'partially_paid')
            ->assertJsonPath('order.credit_amount', '3500.00')
            ->assertJsonPath('order.paid_amount', '1500.00');
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk()->assertJsonPath('order.id', $response->json('order.id'));
        $this->assertDatabaseCount('orders', 1);
        $this->assertSame(1, CustomerCreditTransaction::where('type', 'sale')->count());
        $this->assertSame(1, InventoryMovement::where('type', 'sale')->count());
        $this->assertDatabaseHas('payments', ['order_id' => $response->json('order.id'), 'amount' => 1500, 'tender_type' => $method]);
        $this->assertSame(1500.0, (float) FinancialEntry::where('category', 'pos_sale')->sum('amount'));
        $this->assertSame($expectedCash, (float) $this->cashTotal());
        $this->postJson('/admin/bale-pos/checkout', array_merge($payload, ['amount_tendered' => 1501]))->assertUnprocessable()->assertJsonValidationErrors('request_key');
        $this->assertSame(3500.0, app(CustomerCreditService::class)->balance($customer));
    }

    public function test_credit_requires_a_saved_customer_and_rejects_staff_or_deleted_accounts(): void
    {
        [$actor, $branch, $bale, $label, $customer] = $this->shop();
        $payload = $this->payload($branch, $label, null);
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertUnprocessable()->assertJsonValidationErrors('customer_id');
        $payload['customer_id'] = $actor->id;
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertUnprocessable()->assertJsonValidationErrors('customer_id');
        $customer->delete();
        $payload['customer_id'] = $customer->id;
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertUnprocessable()->assertJsonValidationErrors('customer_id');
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $bale->product_id, 'on_hand_qty' => 10]);
    }

    public function test_credit_status_limit_and_deposit_validation_leave_stock_and_debt_unchanged(): void
    {
        [, $branch, $bale, $label, $customer] = $this->shop();
        $payload = $this->payload($branch, $label, $customer);
        foreach (['disabled', 'suspended'] as $status) {
            $customer->update(['credit_status' => $status]);
            $this->postJson('/admin/bale-pos/checkout', $payload)->assertUnprocessable()->assertJsonValidationErrors('customer_id');
        }
        $customer->update(['credit_status' => 'active', 'credit_limit' => 1000]);
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertUnprocessable()->assertJsonValidationErrors('credit_amount');
        foreach ([-1, 5000, 5001] as $deposit) {
            $this->postJson('/admin/bale-pos/checkout', array_merge($payload, ['amount_tendered' => $deposit]))->assertUnprocessable()->assertJsonValidationErrors('amount_tendered');
        }
        $this->postJson('/admin/bale-pos/checkout', $payload + ['credit_deposit_method' => 'card'])->assertUnprocessable()->assertJsonValidationErrors('credit_deposit_method');
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('customer_credit_transactions', 0);
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $bale->product_id, 'on_hand_qty' => 10]);
        $this->postJson('/admin/bale-pos/checkout', array_merge($payload, ['amount_tendered' => 4500]))->assertOk()->assertJsonPath('order.credit_amount', '500.00');
    }

    public function test_cashier_without_credit_permission_cannot_create_credit_debt(): void
    {
        [$actor, $branch, , $label, $customer] = $this->shop();
        $role = Role::create(['name' => 'cash-sales-only', 'display_name' => 'Cash sales only', 'is_admin' => true]);
        $role->permissions()->sync(Permission::where('name', 'pos.access')->pluck('id'));
        $actor->update(['role' => 'staff']);
        $actor->roles()->sync([$role->id]);
        $actor->locations()->sync([$branch->id]);
        $this->actingAs($actor->fresh());
        $this->postJson('/admin/bale-pos/checkout', $this->payload($branch, $label, $customer))->assertUnprocessable()->assertJsonValidationErrors('tenders');
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('customer_credit_transactions', 0);
    }

    public function test_credit_sale_can_be_repaid_through_the_customer_account(): void
    {
        [, $branch, , $label, $customer] = $this->shop();
        $response = $this->postJson('/admin/bale-pos/checkout', $this->payload($branch, $label, $customer))->assertOk();
        $this->post('/admin/customers/'.$customer->id.'/credit-payments', ['order_id' => $response->json('order.id'), 'amount' => 5000, 'tender_type' => 'cash'])->assertSessionHasNoErrors()->assertRedirect();
        $this->assertSame(0.0, app(CustomerCreditService::class)->balance($customer));
        $this->assertDatabaseHas('orders', ['id' => $response->json('order.id'), 'payment_status' => 'paid', 'paid_amount' => 5000]);
        $this->assertDatabaseHas('payments', ['order_id' => $response->json('order.id'), 'amount' => 5000, 'shift_id' => null]);
        $this->assertSame(5000.0, (float) FinancialEntry::where('category', 'pos_sale')->sum('amount'));
        $this->assertSame(5000.0, (float) $this->cashTotal());
    }

    public function test_cash_sales_can_be_assigned_to_saved_customers_without_credit(): void
    {
        [, $branch, , $label, $customer] = $this->shop();
        $customer->update(['credit_status' => 'disabled']);
        $payload = array_merge($this->payload($branch, $label, $customer), ['tender_type' => 'cash', 'amount_tendered' => 5000]);
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk()->assertJsonPath('order.user_id', $customer->id)->assertJsonPath('order.payment_status', 'paid');
        $this->assertDatabaseCount('customer_credit_transactions', 0);
    }

    public function test_checkout_can_create_a_customer_without_granting_credit_or_staff_access(): void
    {
        $this->shop();
        $response = $this->postJson('/admin/pos/customers', [
            'name' => 'New checkout customer', 'phone' => '09123456789', 'default_address' => '12 Main Street',
            'role' => 'super_admin', 'credit_status' => 'active', 'password' => 'IgnoredPassword123!', 'email' => 'ignored@example.test',
        ])->assertCreated()->assertJsonPath('customer.name', 'New checkout customer')->assertJsonPath('customer.credit_status', 'disabled');
        $this->assertDatabaseHas('users', ['id' => $response->json('customer.id'), 'role' => User::CUSTOMER_ROLE, 'credit_status' => 'disabled', 'credit_limit' => 0, 'email' => null, 'password' => null]);
        $this->getJson('/admin/pos/customers/search?q=09123456789')->assertOk()->assertJsonPath('0.id', $response->json('customer.id'));
        $this->postJson('/admin/pos/customers', ['name' => 'Duplicate', 'phone' => '09123456789'])
            ->assertUnprocessable()->assertJsonValidationErrors(['phone']);
        $this->assertSame(1, User::where('phone', '09123456789')->count());
        $this->assertDatabaseCount('orders', 0);
    }

    public function test_new_customer_record_can_be_used_for_credit_without_login_details(): void
    {
        [, $branch, , $label] = $this->shop();
        $response = $this->postJson('/admin/pos/customers', ['name' => 'Credit-only customer', 'phone' => '09998887777', 'credit_limit' => 10000, 'credit_terms_days' => 14])->assertCreated()->assertJsonPath('customer.credit_status', 'active');
        $customer = User::findOrFail($response->json('customer.id'));
        $this->assertNull($customer->email);
        $this->assertNull($customer->password);
        $this->postJson('/admin/bale-pos/checkout', $this->payload($branch, $label, $customer))->assertOk()->assertJsonPath('order.user_id', $customer->id)->assertJsonPath('order.credit_amount', '5000.00');
        $this->assertSame(5000.0, app(CustomerCreditService::class)->balance($customer));
        $this->getJson('/admin/credit')->assertOk();
    }

    public function test_cashier_cannot_grant_credit_when_creating_a_customer_record(): void
    {
        [$actor, $branch] = $this->shop();
        $role = Role::create(['name' => 'record-only', 'display_name' => 'Record only', 'is_admin' => true]);
        $role->permissions()->sync(Permission::where('name', 'pos.access')->pluck('id'));
        $actor->update(['role' => 'staff']);
        $actor->roles()->sync([$role->id]);
        $actor->locations()->sync([$branch->id]);
        $this->actingAs($actor->fresh());
        $this->postJson('/admin/pos/customers', ['name' => 'Cannot approve', 'credit_limit' => 10000])->assertUnprocessable()->assertJsonValidationErrors('credit_limit');
        $this->postJson('/admin/pos/customers', ['name' => 'Contact only'])->assertCreated()->assertJsonPath('customer.credit_status', 'disabled');
    }

    public function test_amount_discount_changes_payment_change_revenue_and_refund_without_changing_label_price(): void
    {
        [, $branch, $bale, $label, $customer] = $this->shop();
        $payload = array_merge($this->payload($branch, $label, $customer), ['tender_type' => 'cash', 'amount_tendered' => 5000, 'discount_value' => 500]);
        $response = $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk()
            ->assertJsonPath('order.total_amount', '5000.00')->assertJsonPath('order.discount_amount', '500.00')
            ->assertJsonPath('order.final_amount', '4500.00')->assertJsonPath('order.pos_tender_summary.change_due', 500);
        $order = Order::findOrFail($response->json('order.id'));
        $this->assertSame('5000.00', $order->items()->firstOrFail()->unit_price);
        $this->assertSame('5000.00', $label->fresh()->price);
        $this->assertSame(4500.0, (float) $order->payments()->sum('amount'));
        $this->assertSame(4500.0, (float) $this->cashTotal());
        $this->assertSame(4500.0, app(VintageBaleReport::class)->summary($bale->fresh())['sales_revenue']);
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk()->assertJsonPath('order.id', $order->id);
        $this->postJson('/admin/bale-pos/checkout', array_merge($payload, ['discount_value' => 600]))->assertUnprocessable()->assertJsonValidationErrors('request_key');
        $this->assertDatabaseCount('orders', 1);
        $this->post('/admin/bale-sale-items/'.$order->items()->firstOrFail()->id.'/return', ['request_key' => (string) Str::uuid(), 'quantity' => 1, 'payment_method' => 'cash'])
            ->assertSessionHasNoErrors()->assertRedirect();
        $this->assertDatabaseHas('order_returns', ['order_id' => $order->id, 'amount' => 4500]);
        $this->assertSame(0.0, (float) $this->cashTotal());
    }

    public function test_discount_reduces_the_credit_balance_after_deposit(): void
    {
        [, $branch, , $label, $customer] = $this->shop();
        $payload = array_merge($this->payload($branch, $label, $customer), ['discount_value' => 500, 'amount_tendered' => 1000]);
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertOk()->assertJsonPath('order.final_amount', '4500.00')
            ->assertJsonPath('order.paid_amount', '1000.00')->assertJsonPath('order.credit_amount', '3500.00');
        $this->assertSame(3500.0, app(CustomerCreditService::class)->balance($customer));
        $this->assertSame(1000.0, (float) FinancialEntry::where('category', 'pos_sale')->sum('amount'));
    }

    public function test_invalid_discounts_do_not_create_sales_or_reduce_stock(): void
    {
        [, $branch, $bale, $label, $customer] = $this->shop();
        $payload = array_merge($this->payload($branch, $label, $customer), ['tender_type' => 'mmqr', 'amount_tendered' => 5000]);
        foreach ([-1, 5001, 'invalid', 1.234] as $discount) {
            $this->postJson('/admin/bale-pos/checkout', $payload + ['discount_value' => $discount])->assertUnprocessable()->assertJsonValidationErrors('discount_value');
        }
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseHas('inventory_balances', ['product_id' => $bale->product_id, 'on_hand_qty' => 10]);
    }

    public function test_cashier_needs_discount_permission_even_when_submitting_a_direct_request(): void
    {
        [$actor, $branch, , $label, $customer] = $this->shop();
        $role = Role::create(['name' => 'no-discounts', 'display_name' => 'No discounts', 'is_admin' => true]);
        $role->permissions()->sync(Permission::where('name', 'pos.access')->pluck('id'));
        $actor->update(['role' => 'staff']);
        $actor->roles()->sync([$role->id]);
        $actor->locations()->sync([$branch->id]);
        $this->actingAs($actor->fresh());
        $payload = array_merge($this->payload($branch, $label, $customer), ['tender_type' => 'cash', 'amount_tendered' => 5000, 'discount_value' => 500]);
        $this->postJson('/admin/bale-pos/checkout', $payload)->assertUnprocessable()->assertJsonValidationErrors('discount_value');
        $this->assertDatabaseCount('orders', 0);
    }
    private function cashTotal(): float
    {
        return round((float) FinancialEntry::where('status', 'approved')->where('payment_method', 'cash')
            ->whereIn('category', ['pos_sale', 'bale_refund', 'refund_payable'])
            ->get()->sum(fn ($entry) => $entry->type === 'income' ? (float) $entry->amount : -(float) $entry->amount), 2);
    }

}
