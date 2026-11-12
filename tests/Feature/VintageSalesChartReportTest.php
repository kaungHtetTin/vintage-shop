<?php

namespace Tests\Feature;

use App\Models\{FinancialEntry, Location, Order, OrderReturn, Permission, Role, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VintageSalesChartReportTest extends TestCase
{
    use RefreshDatabase;

    private function shop(): array
    {
        $actor = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $branch = Location::create(['code' => 'CHART-A', 'name' => 'Chart shop', 'type' => 'warehouse', 'is_active' => true]);
        $this->actingAs($actor);
        return [$actor, $branch];
    }

    private function sale(Location $branch, string $date, float $amount, array $extra = []): Order
    {
        $order = Order::create($extra + ['order_number' => 'CHART-'.uniqid(), 'location_id' => $branch->id, 'status' => 'completed', 'sales_channel' => 'pos', 'payment_status' => 'paid', 'total_amount' => $amount, 'final_amount' => $amount]);
        $order->forceFill(['created_at' => $date])->save();
        return $order;
    }

    private function cash(Location $branch, string $date, string $type, string $category, float $amount, string $status = 'approved'): void
    {
        FinancialEntry::create(['location_id' => $branch->id, 'recorded_by' => auth()->id(), 'entry_date' => $date, 'type' => $type, 'category' => $category, 'title' => 'Chart entry', 'amount' => $amount, 'status' => $status, 'payment_method' => 'cash']);
    }

    public function test_month_and_year_charts_separate_sales_cash_and_expenses_and_use_shop_timezone(): void
    {
        [, $branch] = $this->shop();
        $paid = $this->sale($branch, '2026-11-01 03:00:00', 100);
        $this->sale($branch, '2026-11-02 01:00:00', 200, ['payment_status' => 'unpaid', 'credit_amount' => 200]);
        $this->sale($branch, '2026-11-01 03:00:00', 900, ['status' => 'cancelled']);
        $this->sale($branch, '2026-11-01 03:00:00', 800, ['status' => 'pending', 'payment_status' => 'pending_review']);
        $this->sale($branch, '2025-12-31 20:00:00', 50);
        $this->sale($branch, '2026-11-30 20:00:00', 40);
        $this->sale($branch, '2026-12-31 18:00:00', 999);
        OrderReturn::create(['order_id' => $paid->id, 'type' => 'refund', 'status' => 'completed', 'quantity' => 1, 'amount' => 10, 'processed_at' => '2026-11-03 01:00:00']);
        $this->cash($branch, '2026-11-01', 'income', 'pos_sale', 100);
        $this->cash($branch, '2026-11-02', 'income', 'pos_sale', 20);
        $this->cash($branch, '2026-11-04', 'income', 'other_income', 30);
        $this->cash($branch, '2026-11-01', 'expense', 'bale_purchase', 60);
        $this->cash($branch, '2026-11-02', 'expense', 'bale_laundry', 10);
        $this->cash($branch, '2026-11-03', 'expense', 'bale_refund', 10);
        $this->cash($branch, '2026-11-04', 'expense', 'rent', 20);
        $this->cash($branch, '2026-11-04', 'asset', 'stock_receipt', 15);
        $this->cash($branch, '2026-11-04', 'expense', 'stock_adjustment', 500);
        $this->cash($branch, '2026-11-04', 'expense', 'internal_transfer', 2000);
        $this->cash($branch, '2026-11-04', 'expense', 'rent', 100, 'pending');
        $this->cash($branch, '2026-11-04', 'expense', 'rent', 100, 'void');

        $response = $this->getJson('/admin/reports?year=2026&month=11')->assertOk()
            ->assertJsonPath('component', 'Admin/Bales/Reports')->assertJsonMissingPath('props.bales')->assertJsonMissingPath('props.entries')
            ->assertJsonCount(30, 'props.charts.monthly')->assertJsonCount(12, 'props.charts.yearly');
        $november = $response->json('props.charts.yearly.10');
        $this->assertSame(290.0, (float) $november['sales']);
        $this->assertSame(150.0, (float) $november['income']);
        $this->assertSame(115.0, (float) $november['expenses']);
        $this->assertSame(35.0, (float) $november['profit']);
        $this->assertSame(-10.0, (float) $response->json('props.charts.monthly.2.profit'));
        $this->assertSame(50.0, (float) $response->json('props.charts.yearly.0.sales'));
        $this->assertSame(40.0, (float) $response->json('props.charts.yearly.11.sales'));
        $this->assertSame(0.0, (float) $response->json('props.charts.monthly.29.sales'));
    }

    public function test_empty_leap_month_and_validation(): void
    {
        $this->shop();
        $this->getJson('/admin/reports?year=2024&month=2')->assertOk()->assertJsonCount(29, 'props.charts.monthly')->assertJsonPath('props.charts.yearly.0.profit', 0);
        $this->getJson('/admin/reports?year=1999&month=13')->assertUnprocessable()->assertJsonValidationErrors(['year', 'month']);
    }

    public function test_report_permissions_and_location_scope(): void
    {
        [, $allowed] = $this->shop();
        $other = Location::create(['code' => 'CHART-B', 'name' => 'Other shop', 'type' => 'warehouse', 'is_active' => true]);
        $this->sale($allowed, '2026-11-01 03:00:00', 100);
        $this->sale($other, '2026-11-01 03:00:00', 900);
        $this->cash($allowed, '2026-11-01', 'income', 'pos_sale', 100);
        $this->cash($other, '2026-11-01', 'income', 'pos_sale', 900);
        $viewer = User::factory()->create(['role' => 'staff', 'status' => 'active']);
        $this->actingAs($viewer)->getJson('/admin/reports')->assertForbidden();
        $role = Role::create(['name' => 'chart-viewer', 'display_name' => 'Chart viewer', 'is_admin' => true]);
        $sales = Permission::firstOrCreate(['name' => 'reports.sales'], ['display_name' => 'Sales reports', 'group' => 'Reports']);
        $role->permissions()->sync([$sales->id]);
        $viewer->roles()->sync([$role->id]);
        $viewer->locations()->sync([$allowed->id]);
        $this->actingAs($viewer->fresh())->getJson('/admin/reports?year=2026&month=11')->assertOk()
            ->assertJsonPath('props.charts.yearly.10.sales', 100)->assertJsonPath('props.charts.yearly.10.income', 100);
        $this->getJson('/admin/reports?year=2026&month=11&location_id='.$other->id)->assertForbidden();
        $inventory = Permission::firstOrCreate(['name' => 'reports.inventory'], ['display_name' => 'Inventory reports', 'group' => 'Reports']);
        $role->permissions()->sync([$inventory->id]);
        $this->actingAs($viewer->fresh())->getJson('/admin/reports')->assertForbidden();
    }
}
