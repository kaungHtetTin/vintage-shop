<?php

namespace Tests\Feature;

use App\Models\{Category, FinancialEntry, Location, Order, PricingRule, Product, User};
use App\Services\AutomaticPricingService;
use App\Services\Inventory\StockReceiptService;
use App\Services\Inventory\InventoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class AutomaticPricingTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Concerns\TestsLegacyAccounting;

    private function fixture(bool $manual = false, string $cost = '1000'): array
    {
        $actor = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $category = Category::create(['name' => 'Pricing', 'slug' => 'pricing', 'is_active' => true]);
        $product = Product::create(['category_id' => $category->id, 'name' => 'Guitar', 'slug' => 'pricing-guitar', 'original_price' => $cost, 'pricing_base_cost' => $cost, 'min_quantity' => 0, 'status' => 'active', 'is_active' => true]);
        $unit = $product->units()->create(['name' => 'Piece', 'code' => 'pc', 'conversion_factor' => 1, 'is_base' => true, 'is_default_selling' => true, 'is_active' => true]);
        $rule = PricingRule::where('code', 'retail')->firstOrFail();
        $rule->update(['pricing_mode' => 'automatic', 'markup_percent' => '20', 'rounding' => 50, 'minimum_profit' => 100]);
        $type = $product->priceTypes()->create(['name' => 'retail', 'is_default' => true, 'pricing_rule_id' => $rule->id]);
        $price = $unit->prices()->create(['product_price_type_id' => $type->id, 'price' => 777, 'is_manual' => $manual]);
        $location = Location::create(['name' => 'Pricing store', 'code' => 'PRICING', 'type' => 'warehouse', 'is_active' => true, 'timezone' => 'Asia/Rangoon']);
        return [$actor, $product, $unit, $price, $rule, $location];
    }

    private function refresh(Product $product): array
    {
        return DB::transaction(function () use ($product) { $service = app(AutomaticPricingService::class); $service->lock(); return $service->refreshProduct($product, 'test'); });
    }

    public function test_decimal_formula_acceptance_examples_and_foc_cost(): void
    {
        $service = app(AutomaticPricingService::class);
        foreach ([['950',20,100,50,'1150.00'],['1000',10,300,100,'1300.00'],['1000',20,0,100,'1200.00'],['1050',0,0,100,'1100.00'],['0.1',0,0,1,'1.00']] as [$cost,$markup,$profit,$round,$expected]) {
            $this->assertSame($expected, $service->calculate($cost, ['markup_percent'=>$markup,'minimum_profit'=>$profit,'rounding'=>$round]));
        }
        $this->assertSame('8.333333', $service->effectiveCost('10','2','10','100'));
        $this->assertSame('10.000000', $service->purchaseCost('10', '100'));
        $this->assertNull($service->calculate('0', ['markup_percent'=>20,'minimum_profit'=>0,'rounding'=>1]));
    }

    

    

    public function test_auto_recalculation_is_idempotent_and_manual_override_is_preserved(): void
    {
        [, $product, , $price] = $this->fixture();
        $this->assertSame(1, $this->refresh($product)['changed_row_count']);
        $this->assertSame('1200.00', $price->fresh()->price);
        $this->assertSame(0, $this->refresh($product)['changed_row_count']);
        $this->assertDatabaseCount('price_changes', 1);
        $price->update(['is_manual'=>true,'price'=>555]);
        $this->refresh($product);
        $this->assertSame('555.00', $price->fresh()->price);
    }

    public function test_new_buying_price_does_not_change_manual_selling_price_or_past_sale_cost(): void
    {
        [$actor, $product, $unit, $price, , $location] = $this->fixture(true, '200');
        $price->update(['price' => 500]);
        $receipts = app(StockReceiptService::class);
        $first = $receipts->createDraft($location, [['product_unit_id' => $unit->id, 'received_quantity' => 2, 'unit_cost' => 200]], $actor);
        $receipts->post($first, $actor);

        $firstSaleCost = $product->fresh()->original_price;
        $order = Order::create(['order_number' => 'PRICE-'.uniqid(), 'receipt_number' => 'PR-'.uniqid(), 'sales_channel' => 'pos', 'location_id' => $location->id, 'served_by' => $actor->id, 'total_amount' => 500, 'final_amount' => 500, 'discount_amount' => 0, 'shipping_fee' => 0, 'status' => 'completed', 'payment_status' => 'paid', 'paid_amount' => 500, 'receiver_name' => 'Walk-in']);
        $saleItem = $order->items()->create(['product_id' => $product->id, 'product_unit_id' => $unit->id, 'quantity' => 1, 'base_quantity' => 1, 'conversion_factor' => 1, 'unit_name' => 'Piece', 'unit_price' => 500, 'cost_price' => $firstSaleCost, 'total_price' => 500]);
        app(InventoryService::class)->completeSale($location, $product, 1, reference: $order);
        $second = $receipts->createDraft($location, [['product_unit_id' => $unit->id, 'received_quantity' => 2, 'unit_cost' => 300]], $actor);
        $receipts->post($second, $actor);

        $this->assertSame('200.000000', $firstSaleCost);
        $this->assertSame('200.000000', $saleItem->fresh()->cost_price);
        $this->assertSame('500.00', $saleItem->fresh()->unit_price);
        $this->assertSame('266.666667', $product->fresh()->original_price);
        $this->assertSame('500.00', $price->fresh()->price);
        $this->assertTrue($price->fresh()->is_manual);
        $price->update(['price' => 600]);
        $this->assertSame('600.00', $price->fresh()->price);
        $this->assertSame('266.666667', $product->fresh()->original_price);
        $this->assertSame('200.000000', $saleItem->fresh()->cost_price);
        $this->assertSame('500.00', $saleItem->fresh()->unit_price);

        $lastOrder = Order::create(['order_number' => 'PRICE-'.uniqid(), 'receipt_number' => 'PR-'.uniqid(), 'sales_channel' => 'pos', 'location_id' => $location->id, 'served_by' => $actor->id, 'total_amount' => 1800, 'final_amount' => 1800, 'discount_amount' => 0, 'shipping_fee' => 0, 'status' => 'completed', 'payment_status' => 'paid', 'paid_amount' => 1800, 'receiver_name' => 'Walk-in']);
        $lastOrder->items()->create(['product_id' => $product->id, 'product_unit_id' => $unit->id, 'quantity' => 3, 'base_quantity' => 3, 'conversion_factor' => 1, 'unit_name' => 'Piece', 'unit_price' => 600, 'cost_price' => $product->fresh()->original_price, 'total_price' => 1800]);
        app(InventoryService::class)->completeSale($location, $product, 3, reference: $lastOrder);
        $summary = $this->actingAs($actor)->getJson('/test-legacy/finance')->assertOk()->json('props.summary');
        $this->assertEquals(1000, $summary['cost_of_goods']);
        $this->assertEquals(1300, $summary['net_profit']);
    }

    public function test_missing_cost_retains_saved_price_and_blocks_new_zero_auto_row(): void
    {
        [, $product, $unit, $price] = $this->fixture(false, '0');
        $this->assertSame(1, $this->refresh($product)['skipped_cost_count']);
        $this->assertSame('777.00', $price->fresh()->price);
        $price->update(['price'=>0]);
        $this->assertNull($unit->fresh()->priceFor('retail'));
        $product->update(['pricing_base_cost'=>1000]);
        $this->refresh($product);
        $this->assertNotNull($unit->fresh()->priceFor('retail'));
    }

    

    

    public function test_purchase_foc_updates_latest_cost_and_selling_price_without_changing_finance_basis(): void
    {
        [$actor,$product,$unit,$price,,$location] = $this->fixture();
        $service=app(StockReceiptService::class);
        $receipt=$service->createDraft($location,[['product_unit_id'=>$unit->id,'received_quantity'=>10,'free_quantity'=>2,'unit_cost'=>1200]],$actor);
        $posted=$service->post($receipt,$actor);
        $this->assertSame('1200.000000',$product->fresh()->pricing_buying_cost);
        $this->assertSame('1450.00',$price->fresh()->price);
        $this->assertDatabaseHas('inventory_balances',['product_id'=>$product->id,'on_hand_qty'=>12]);
        $this->assertDatabaseHas('financial_entries',['reference'=>$receipt->receipt_number,'amount'=>12000]);
        $this->assertSame(1,$posted->pricing_summary['changed_row_count']);
        $service->delete($receipt,$actor);
        $this->assertNull($product->fresh()->pricing_source_receipt_id);
        $this->assertSame('1000.000000',$product->fresh()->pricing_buying_cost);
        $this->assertSame('1000.000000',$product->fresh()->original_price);
    }

    public function test_below_cost_purchase_requires_acknowledgment_and_rolls_back_inventory(): void
    {
        [$actor,$product,$unit,$price,,$location]=$this->fixture(true);
        $service=app(StockReceiptService::class);
        $receipt=$service->createDraft($location,[['product_unit_id'=>$unit->id,'received_quantity'=>1,'unit_cost'=>2000]],$actor);
        try { $service->post($receipt,$actor); $this->fail('Expected warning'); }
        catch (ValidationException $exception) { $this->assertArrayHasKey('acknowledge_below_cost',$exception->errors()); }
        $this->assertSame('draft',$receipt->fresh()->status);
        $this->assertDatabaseMissing('inventory_balances',['product_id'=>$product->id]);
        $service->post($receipt,$actor,true);
        $this->assertSame('777.00',$price->fresh()->price);
    }

    public function test_older_receipt_posting_does_not_replace_latest_created_purchase_cost(): void
    {
        [$actor,$product,$unit,,,$location]=$this->fixture();
        $service=app(StockReceiptService::class);
        $old=$service->createDraft($location,[['product_unit_id'=>$unit->id,'received_quantity'=>1,'unit_cost'=>100]],$actor);
        $new=$service->createDraft($location,[['product_unit_id'=>$unit->id,'received_quantity'=>1,'unit_cost'=>200]],$actor);
        $service->post($new,$actor);
        $service->post($old,$actor);
        $this->assertSame('200.000000',$product->fresh()->pricing_buying_cost);
        $this->assertSame($new->id,$product->fresh()->pricing_source_receipt_id);
    }

    

    

    

    

    

    public function test_pos_price_refresh_returns_zero_for_unavailable_auto_prices_and_manual_flags_in_purchase_search(): void
    {
        [$actor,$product,$unit,$price,,$location] = $this->fixture(false,'0');
        $price->update(['price'=>0]); $this->refresh($product);
        $this->actingAs($actor)->getJson('/admin/pos/products/prices?unit_ids[]='.$unit->id)->assertOk()->assertJsonPath('0.prices.0.price',0);
        $response=$this->getJson('/admin/inventory/products/search?location_id='.$location->id.'&q=Guitar')->assertOk();
        $this->assertFalse($response->json('0.prices.0.is_manual'));
    }
}
