<?php

namespace Tests\Feature;

use App\Models\{Category, CycleCount, FinancialEntry, InventoryBalance, InventoryMovement, Location, Product, StockAdjustment, User};
use App\Services\Inventory\InventoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CycleCountingRemovalTest extends TestCase
{
    use RefreshDatabase;

    public function test_removed_cycle_count_endpoints_cannot_change_stock_or_historical_counts(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $location = Location::create(['name' => 'Main branch', 'code' => 'COUNT-HISTORY', 'type' => 'warehouse', 'is_active' => true]);
        $category = Category::create(['name' => 'Garments', 'slug' => 'count-history', 'is_active' => true]);
        $product = Product::create(['category_id' => $category->id, 'name' => 'Historical garment', 'slug' => 'count-history-garment', 'original_price' => 1000, 'status' => 'active', 'is_active' => true]);
        $unit = $product->units()->create(['name' => 'Piece', 'code' => 'PC', 'conversion_factor' => 1, 'is_base' => true, 'is_default_selling' => true, 'is_active' => true]);
        app(InventoryService::class)->receive($location, $product, 10);
        $count = CycleCount::create(['count_number' => 'CC-HISTORY', 'location_id' => $location->id, 'created_by' => $admin->id, 'snapshot_at' => now(), 'status' => 'draft', 'revision' => 1]);
        $item = $count->items()->create(['product_id' => $product->id, 'product_unit_id' => $unit->id, 'product_name' => $product->name, 'unit_name' => $unit->name, 'system_quantity' => 10, 'counted_quantity' => 8, 'base_cost' => 1000, 'balance_version' => 1]);
        $balance = InventoryBalance::where('product_id', $product->id)->firstOrFail();
        $originalBalance = $balance->getAttributes();
        $originalCount = $count->refresh()->getAttributes();
        $originalItem = $item->refresh()->getAttributes();
        $movements = InventoryMovement::count();
        $adjustments = StockAdjustment::count();
        $financialEntries = FinancialEntry::count();
        $this->actingAs($admin);

        $base = '/admin/inventory/cycle-counts';
        foreach ([$base, $base.'?location_id='.$location->id, $base.'/create', $base.'/'.$count->id, $base.'/'.$count->id.'/export'] as $path) {
            $this->getJson($path)->assertNotFound();
        }
        $this->postJson($base, ['location_id' => $location->id, 'product_ids' => [$product->id]])->assertNotFound();
        foreach (['PUT', 'PATCH', 'DELETE'] as $verb) {
            $this->json($verb, $base.'/'.$count->id, ['revision' => 1])->assertNotFound();
        }
        foreach (['refresh', 'post', 'save-and-post', 'cancel'] as $action) {
            $this->postJson($base.'/'.$count->id.'/'.$action, ['revision' => 1, 'items' => [['id' => $item->id, 'counted_quantity' => 8]]])->assertNotFound();
        }

        $this->assertSame($originalBalance, $balance->fresh()->getAttributes());
        $this->assertSame($originalCount, $count->fresh()->getAttributes());
        $this->assertSame($originalItem, $item->fresh()->getAttributes());
        $this->assertDatabaseCount('inventory_movements', $movements);
        $this->assertDatabaseCount('stock_adjustments', $adjustments);
        $this->assertDatabaseCount('financial_entries', $financialEntries);
        $this->getJson('/admin/locations')->assertOk()->assertJsonMissingPath('props.canCycleCount');
    }
}
