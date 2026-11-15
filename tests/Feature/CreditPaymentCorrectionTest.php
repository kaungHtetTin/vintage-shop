<?php

namespace Tests\Feature;

use App\Models\{CustomerCreditTransaction, FinancialEntry, Location, Order, Payment, User};
use App\Services\{CreditStatementService, CustomerCreditService};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CreditPaymentCorrectionTest extends TestCase
{
    use RefreshDatabase;

    private function shop(float $payment = 4000): array
    {
        $actor = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $customer = User::factory()->create(['role' => User::CUSTOMER_ROLE, 'credit_status' => 'active', 'credit_limit' => 50000]);
        $branch = Location::create(['code' => 'CORRECT', 'name' => 'Correction branch', 'type' => 'warehouse', 'is_active' => true]);
        $order = Order::create(['order_number' => 'CORRECT-ORDER', 'receipt_number' => 'CORRECT-RECEIPT', 'user_id' => $customer->id, 'location_id' => $branch->id, 'status' => 'completed', 'total_amount' => 10000, 'final_amount' => 10000, 'credit_amount' => 10000, 'paid_amount' => 0, 'payment_status' => 'unpaid']);
        DB::transaction(fn () => app(CustomerCreditService::class)->recordSale($customer, $order, 10000, $actor));
        $this->actingAs($actor)->postJson('/admin/customers/'.$customer->id.'/credit-payments', ['amount' => $payment, 'tender_type' => 'cash', 'reference' => 'ORIGINAL-RECEIPT'])->assertRedirect()->assertSessionHasNoErrors();
        return [$actor, $customer, $branch, $order->fresh(), CustomerCreditTransaction::where('type', 'payment')->firstOrFail()];
    }

    private function data(array $changes = []): array
    {
        return array_replace(['request_key' => (string) Str::uuid(), 'amount' => 3000, 'tender_type' => 'mmqr', 'reference' => 'BANK-CORRECTED', 'reason' => 'Entered the wrong amount.'], $changes);
    }

    private function correct(User $customer, CustomerCreditTransaction $entry, array $data)
    {
        return $this->postJson('/admin/customers/'.$customer->id.'/credit-payments/'.$entry->id.'/correct', $data);
    }

    public function test_correction_preserves_history_and_reconciles_balances_collections_finance_and_statement(): void
    {
        [$actor, $customer, $branch, $order, $entry] = $this->shop();
        $before = $entry->getAttributes();
        $originalFinance = FinancialEntry::firstOrFail()->getAttributes();
        $this->correct($customer, $entry, $this->data())->assertStatus(303)->assertSessionHasNoErrors();
        $reversal = $entry->reversal()->firstOrFail();
        $replacement = $entry->replacement()->firstOrFail();
        $this->assertSame($before, $entry->fresh()->getAttributes());
        $this->assertSame($originalFinance, FinancialEntry::firstOrFail()->getAttributes());
        $this->assertEquals(4000, $reversal->amount);
        $this->assertEquals(-3000, $replacement->amount);
        $this->assertSame($actor->id, $reversal->created_by);
        $this->assertSame($actor->id, $replacement->created_by);
        $this->assertNotNull($reversal->created_at);
        $this->assertSame('Entered the wrong amount.', $replacement->notes);
        $this->assertSame('reversed', $entry->payment->fresh()->status);
        $this->assertSame('paid', $replacement->payment->status);
        $this->assertEquals(3000, $order->fresh()->paid_amount);
        $this->assertSame('partially_paid', $order->fresh()->payment_status);
        $this->assertEquals(7000, app(CustomerCreditService::class)->balance($customer));
        $this->assertEquals(3000, Payment::where('status', 'paid')->sum('amount'));
        $this->assertEquals(3000, FinancialEntry::where('status', 'approved')->sum('amount'));
        $this->assertEquals(0, FinancialEntry::where('payment_method', 'cash')->sum('amount'));
        $this->assertEquals(3000, FinancialEntry::where('payment_method', 'mmqr')->sum('amount'));
        $this->assertDatabaseHas('audit_logs', ['action' => 'customer.credit.payment_corrected', 'subject_id' => $entry->id, 'user_id' => $actor->id]);
        $page = $this->getJson('/admin/customers/'.$customer->id)->assertOk();
        $entries = collect($page->json('props.creditTransactions'))->keyBy('id');
        $this->assertFalse($entries[$entry->id]['can_correct']);
        $this->assertTrue($entries[$replacement->id]['can_correct']);
        $history = $this->getJson('/admin/credit/collections')->assertOk()->assertJsonCount(3, 'props.payments.data');
        $this->assertEquals(3000, -collect($history->json('props.payments.data'))->sum('amount'));
        $this->getJson('/admin/credit/collections?q='.$entry->transaction_number)->assertOk()->assertJsonCount(3, 'props.payments.data');
        $statement = app(CreditStatementService::class)->data($customer);
        $this->assertEquals(10000, $statement['purchases']);
        $this->assertEquals(3000, $statement['credits']);
        $this->assertEquals(7000, $statement['closing']);
    }

    public function test_retries_are_idempotent_and_a_changed_or_duplicate_correction_is_rejected(): void
    {
        [, $customer, , , $entry] = $this->shop();
        $data = $this->data();
        $this->correct($customer, $entry, $data)->assertStatus(303);
        $this->correct($customer, $entry, $data)->assertStatus(303);
        $this->assertDatabaseCount('customer_credit_transactions', 4);
        $this->assertDatabaseCount('payments', 2);
        $this->assertDatabaseCount('financial_entries', 3);
        $this->correct($customer, $entry, array_replace($data, ['amount' => 2000]))->assertUnprocessable();
        $this->correct($customer, $entry, $this->data())->assertUnprocessable();
        $replacement = $entry->replacement()->firstOrFail();
        $this->correct($customer, $replacement, $data)->assertUnprocessable();
        $this->correct($customer, $replacement, $this->data(['amount' => 2000]))->assertStatus(303);
        $this->assertEquals(8000, app(CustomerCreditService::class)->balance($customer));
        $this->assertEquals(2000, FinancialEntry::sum('amount'));
    }

    public function test_invalid_amount_or_missing_reason_rolls_back_every_record(): void
    {
        [, $customer, , $order, $entry] = $this->shop();
        foreach ([['amount' => 10001], ['amount' => 0], ['amount' => 1.001], ['reason' => ''], ['reason' => '   ']] as $changes) {
            $this->correct($customer, $entry, $this->data($changes))->assertUnprocessable();
        }
        $this->assertDatabaseCount('customer_credit_transactions', 2);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('financial_entries', 1);
        $this->assertEquals(4000, $order->fresh()->paid_amount);
        $this->assertSame('paid', $entry->payment->status);
    }

    public function test_increasing_the_payment_can_clear_the_invoice_without_creating_extra_sales(): void
    {
        [, $customer, , $order, $entry] = $this->shop();
        $this->correct($customer, $entry, $this->data(['amount' => 10000]))->assertStatus(303);
        $this->assertSame('paid', $order->fresh()->payment_status);
        $this->assertEquals(10000, $order->fresh()->paid_amount);
        $this->assertEquals(0, app(CustomerCreditService::class)->balance($customer));
        $this->assertEquals(10000, FinancialEntry::sum('amount'));
        $this->assertEquals(10000, $order->fresh()->final_amount);
        $this->assertDatabaseCount('orders', 1);
        $this->getJson('/admin/customers/'.$customer->id)->assertOk()->assertJsonCount(0, 'props.creditOrders')->assertJsonPath('props.creditSummary.balance', 0);
    }

    public function test_correcting_a_fully_paid_invoice_reopens_its_debt_and_cancellation_uses_only_the_replacement(): void
    {
        [, $customer, , $order, $entry] = $this->shop(10000);
        $this->correct($customer, $entry, $this->data())->assertStatus(303);
        $this->assertSame('partially_paid', $order->fresh()->payment_status);
        $this->assertEquals(7000, app(CustomerCreditService::class)->balance($customer));
        $this->postJson('/admin/orders/'.$order->id.'/cancel', ['reason' => 'Customer cancelled'])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertEquals(0, app(CustomerCreditService::class)->balance($customer));
        $this->assertDatabaseHas('financial_entries', ['category' => FinancialEntry::CATEGORY_REFUND_PAYABLE, 'amount' => 3000]);
    }

    public function test_cancelled_and_returned_orders_and_nonpayment_entries_cannot_be_corrected(): void
    {
        [, $customer, , $order, $entry] = $this->shop();
        $order->update(['status' => 'cancelled']);
        $this->correct($customer, $entry, $this->data())->assertUnprocessable();
        $order->update(['status' => 'completed']);
        $order->returns()->create(['status' => 'refunded', 'amount' => 1000]);
        $this->correct($customer, $entry, $this->data())->assertUnprocessable();
        $this->correct($customer, CustomerCreditTransaction::where('type', 'sale')->firstOrFail(), $this->data())->assertUnprocessable();
        $this->assertDatabaseCount('payments', 1);
    }

    public function test_permission_customer_and_branch_checks_protect_the_payment(): void
    {
        [$actor, $customer, $branch, , $entry] = $this->shop();
        $viewer = User::factory()->create(['role' => 'staff', 'status' => 'active']);
        $this->actingAs($viewer);
        $this->correct($customer, $entry, $this->data())->assertForbidden();
        $manager = User::factory()->create(['role' => 'manager', 'status' => 'active', 'permissions' => ['credit.manage', 'view_customers']]);
        $role = \App\Models\Role::create(['name' => 'credit-corrector', 'display_name' => 'Credit corrector', 'is_admin' => true]);
        $role->permissions()->sync(collect(['view_customers', 'credit.manage'])->map(fn ($name) => \App\Models\Permission::firstOrCreate(['name' => $name], ['display_name' => $name, 'group' => 'Sales'])->id));
        $manager->roles()->sync([$role->id]);
        $this->actingAs($manager->fresh());
        $this->correct($customer, $entry, $this->data())->assertForbidden();
        $this->actingAs($actor);
        $other = User::factory()->create(['role' => User::CUSTOMER_ROLE]);
        $this->correct($other, $entry, $this->data())->assertNotFound();
        $this->assertDatabaseCount('payments', 1);
        $manager->locations()->sync([$branch->id]);
        $this->actingAs($manager->fresh());
        $this->correct($customer, $entry, $this->data())->assertStatus(303);
        $this->assertSame($manager->id, $entry->reversal()->firstOrFail()->created_by);
        $this->assertSame($manager->id, $entry->replacement()->firstOrFail()->created_by);
    }

    public function test_split_receipt_correction_does_not_change_other_invoice_allocations(): void
    {
        [$actor, $customer, $branch, $order, $entry] = $this->shop();
        $second = Order::create(['order_number' => 'CORRECT-SECOND', 'user_id' => $customer->id, 'location_id' => $branch->id, 'status' => 'completed', 'total_amount' => 5000, 'final_amount' => 5000, 'credit_amount' => 5000, 'paid_amount' => 0]);
        DB::transaction(fn () => app(CustomerCreditService::class)->recordSale($customer, $second, 5000, $actor));
        $this->postJson('/admin/customers/'.$customer->id.'/credit-payments', ['amount' => 8000, 'tender_type' => 'cash', 'reference' => 'SPLIT-RECEIPT'])->assertRedirect();
        $allocation = CustomerCreditTransaction::where('type', 'payment')->where('order_id', $order->id)->latest('id')->firstOrFail();
        $other = CustomerCreditTransaction::where('type', 'payment')->where('order_id', $second->id)->firstOrFail();
        $before = $other->getAttributes();
        $this->correct($customer, $allocation, $this->data(['amount' => 5000]))->assertStatus(303);
        $this->assertSame($before, $other->fresh()->getAttributes());
        $this->assertEquals(2000, $second->fresh()->paid_amount);
        $this->assertEquals(9000, $order->fresh()->paid_amount);
        $this->assertEquals(4000, app(CustomerCreditService::class)->balance($customer));
        $this->assertEquals(11000, FinancialEntry::sum('amount'));
    }
}
