<?php

namespace Tests\Feature;

use App\Models\{Location, Order, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrderShippingRemovalTest extends TestCase
{
    use RefreshDatabase;

    private function branch(): Location
    {
        $this->actingAs(User::factory()->create(['role' => 'super_admin', 'status' => 'active']));
        return Location::create(['code' => 'ORDER-ONLY', 'name' => 'Sales branch', 'type' => 'warehouse', 'is_active' => true]);
    }

    private function order(Location $branch, string $status, array $attributes = []): Order
    {
        return Order::create(array_merge([
            'order_number' => 'ORDER-'.uniqid(), 'location_id' => $branch->id, 'sales_channel' => 'pos',
            'status' => $status, 'payment_status' => 'paid', 'total_amount' => 100,
            'final_amount' => 100, 'paid_amount' => 100, 'receiver_name' => 'Recorded customer',
        ], $attributes));
    }

    public function test_the_shipping_pipeline_is_removed_and_in_store_orders_use_completed_status(): void
    {
        $branch = $this->branch();
        $sale = $this->order($branch, 'completed');
        $this->order($branch, 'pending', ['payment_status' => 'pending_review', 'paid_amount' => 0]);
        $this->order($branch, 'cancelled', ['payment_status' => 'rejected', 'paid_amount' => 0]);

        foreach (['?status=completed'] as $filter) {
            $this->getJson('/admin/orders'.$filter)->assertOk()
                ->assertJsonCount(1, 'props.orders.data')
                ->assertJsonPath('props.stats.not_delivered', 0)
                ->assertJsonPath('props.stats.delivered', 0)
                ->assertJsonPath('props.stats.cancelled', 1)
                ->assertJsonPath('props.stats.pending_payment', 1)
                ->assertJsonMissingPath('props.stats.shipped');
        }
        $this->getJson('/admin/orders?payment_status=pending_review')->assertOk()->assertJsonCount(1, 'props.orders.data');
        foreach (['processing', 'shipped', 'delivered'] as $status) {
            $this->patchJson('/admin/orders/'.$sale->id.'/status', ['status' => $status])->assertNotFound();
        }
        $this->assertSame('completed', $sale->fresh()->status);
        $this->assertSame('completed', $sale->order_status);

        $rows = $this->spreadsheetRows($this->get('/admin/orders-export.xlsx?status=completed')->assertOk());
        $this->assertContains('Order status', $rows[0]);
        $this->assertNotContains('Fulfillment status', $rows[0]);
        $this->assertNotContains('Shipping', $rows[0]);
        $this->assertCount(2, $rows);
        foreach (array_slice($rows, 1) as $row) {
            $this->assertSame('completed', $row[array_key_last($row)]);
        }
    }

    public function test_invoice_uses_order_status_and_keeps_historical_totals_without_shipping_details(): void
    {
        $order = $this->order($this->branch(), 'completed', [
            'shipping_address' => 'OLD SHIPPING DESTINATION', 'shipping_fee' => 20,
            'final_amount' => 120, 'paid_amount' => 120,
        ]);
        $this->get('/admin/orders/'.$order->id.'/voucher')->assertOk()
            ->assertSee('Order status: Completed', false)
            ->assertSee('Additional charges')
            ->assertDontSee('Shipping')
            ->assertDontSee('OLD SHIPPING DESTINATION');
        $this->assertSame('completed', $order->fresh()->status);
        $this->assertSame('120.00', $order->final_amount);
        $this->assertSame('20.00', $order->shipping_fee);
    }
}
