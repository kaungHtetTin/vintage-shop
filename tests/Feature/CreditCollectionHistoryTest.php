<?php

namespace Tests\Feature;

use App\Models\{CustomerCreditTransaction, Location, Order, Permission, Role, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CreditCollectionHistoryTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(): array
    {
        $actor = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $customer = User::factory()->create(['name' => 'Avery Customer', 'phone' => '09123456789', 'role' => User::CUSTOMER_ROLE, 'status' => 'active']);
        $branch = Location::create(['code' => 'COLLECTION-A', 'name' => 'Collection branch', 'type' => 'warehouse', 'is_active' => true]);
        $order = Order::create(['order_number' => 'COLLECTION-ORDER', 'receipt_number' => 'COLLECTION-RECEIPT', 'user_id' => $customer->id, 'location_id' => $branch->id, 'status' => 'completed', 'total_amount' => 5000, 'final_amount' => 5000, 'paid_amount' => 1000, 'credit_amount' => 4000]);
        $this->actingAs($actor);
        return [$actor, $customer, $branch, $order];
    }

    private function transaction(User $customer, Order $order, string $type = 'payment', ?string $date = null): CustomerCreditTransaction
    {
        $entry = CustomerCreditTransaction::create(['transaction_number' => 'COL-'.uniqid(), 'customer_id' => $customer->id, 'order_id' => $order->id, 'type' => $type, 'amount' => $type === 'sale' ? 5000 : -1000, 'balance_after' => 4000, 'tender_type' => 'cash', 'reference' => 'BANK-REF']);
        if ($date) $entry->forceFill(['created_at' => $date])->save();
        return $entry;
    }

    public function test_credit_and_collections_are_separate_and_history_contains_only_repayments(): void
    {
        [, $customer, , $order] = $this->fixture();
        $payment = $this->transaction($customer, $order);
        $this->transaction($customer, $order, 'payment', now()->subDays(40)->toDateTimeString());
        $this->transaction($customer, $order, 'sale');
        $this->transaction($customer, $order, 'reversal');
        $this->getJson('/admin/credit')->assertOk()->assertJsonPath('component', 'Admin/Credit/Index')->assertJsonMissingPath('props.collections');
        $response = $this->getJson('/admin/credit/collections')->assertOk()
            ->assertJsonPath('component', 'Admin/Credit/Collections')->assertJsonCount(2, 'props.payments.data')
            ->assertJsonPath('props.payments.data.0.id', $payment->id)
            ->assertJsonPath('props.payments.data.0.customer.name', 'Avery Customer')
            ->assertJsonMissingPath('props.collections');
        $this->getJson('/admin/credit/collections?q=09123456789&from='.today()->toDateString().'&to='.today()->toDateString())->assertOk()->assertJsonCount(1, 'props.payments.data');
        foreach (['COLLECTION-RECEIPT', 'BANK-REF'] as $term) {
            $this->getJson('/admin/credit/collections?q='.$term)->assertOk()->assertJsonCount(2, 'props.payments.data');
        }
        $this->getJson('/admin/credit/collections?q='.$payment->transaction_number)->assertOk()->assertJsonCount(1, 'props.payments.data');
    }

    public function test_history_is_permission_and_branch_scoped_and_rejects_invalid_dates(): void
    {
        [, $customer, $branch, $order] = $this->fixture();
        $this->transaction($customer, $order);
        $other = Location::create(['code' => 'COLLECTION-B', 'name' => 'Other branch', 'type' => 'warehouse', 'is_active' => true]);
        $otherOrder = $order->replicate(['order_number', 'receipt_number']);
        $otherOrder->fill(['order_number' => 'OTHER-ORDER', 'location_id' => $other->id])->save();
        $this->transaction($customer, $otherOrder);
        $viewer = User::factory()->create(['role' => 'staff', 'status' => 'active']);
        $this->actingAs($viewer)->getJson('/admin/credit/collections')->assertForbidden();
        $role = Role::create(['name' => 'collections-clerk', 'display_name' => 'Collections clerk', 'is_admin' => true]);
        $role->permissions()->sync(collect(['view_customers', 'credit.manage'])->map(fn ($name) => Permission::firstOrCreate(['name' => $name], ['display_name' => $name, 'group' => 'Sales'])->id));
        $viewer->roles()->sync([$role->id]);
        $viewer->locations()->sync([$branch->id]);
        $response = $this->actingAs($viewer->fresh())->getJson('/admin/credit/collections')->assertOk()->assertJsonCount(1, 'props.payments.data');
        $response->assertJsonMissingPath('props.collections');
        $this->getJson('/admin/credit/collections?from=2026-11-12&to=2026-11-01')->assertUnprocessable()->assertJsonValidationErrors('to');
    }

    public function test_collection_period_presets_and_payment_method_filters(): void
    {
        $this->travelTo(now()->setDate(2026, 11, 12)->setTime(12, 0));
        [, $customer, , $order] = $this->fixture();
        foreach ([0, 6, 7, 29, 30] as $days) {
            $entry = $this->transaction($customer, $order, 'payment', today()->subDays($days)->setTime(10, 0)->toDateTimeString());
            if ($days === 6) $entry->update(['tender_type' => 'mmqr']);
        }
        foreach (['today' => 1, 'last_7' => 2, 'last_30' => 4, 'this_month' => 3] as $period => $count) {
            $this->getJson('/admin/credit/collections?period='.$period)->assertOk()
                ->assertJsonPath('props.filters.period', $period)->assertJsonCount($count, 'props.payments.data');
        }
        $this->getJson('/admin/credit/collections?q=Avery&period=last_30&tender_type=mmqr')->assertOk()
            ->assertJsonCount(1, 'props.payments.data')->assertJsonPath('props.payments.data.0.tender_type', 'mmqr');
        $day = today()->subDays(7)->toDateString();
        $this->getJson('/admin/credit/collections?period=custom&from='.$day.'&to='.$day)->assertOk()->assertJsonCount(1, 'props.payments.data');
        $this->getJson('/admin/credit/collections')->assertOk()->assertJsonCount(5, 'props.payments.data');
        $this->getJson('/admin/credit/collections?period=bad')->assertUnprocessable()->assertJsonValidationErrors('period');
        $this->getJson('/admin/credit/collections?tender_type=bad')->assertUnprocessable()->assertJsonValidationErrors('tender_type');
    }

    public function test_paginated_history_retains_search_filters(): void
    {
        [, $customer, , $order] = $this->fixture();
        for ($index = 0; $index < 21; $index++) $this->transaction($customer, $order);
        $response = $this->getJson('/admin/credit/collections?q=Avery')->assertOk()->assertJsonCount(20, 'props.payments.data')->assertJsonPath('props.payments.total', 21);
        $this->assertStringContainsString('q=Avery', $response->json('props.payments.next_page_url'));
        $this->getJson('/admin/credit/collections?q=Avery&page=2')->assertOk()->assertJsonCount(1, 'props.payments.data');
    }
}
