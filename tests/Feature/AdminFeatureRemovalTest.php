<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminFeatureRemovalTest extends TestCase
{
    use RefreshDatabase;

    public function test_shift_and_register_management_is_removed(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super_admin', 'status' => 'active']));
        foreach (['/admin/registers', '/admin/pos/shifts', '/admin/pos/shifts/active?location_id=1'] as $path) {
            $this->getJson($path)->assertNotFound();
        }
        foreach (['/admin/registers', '/admin/pos/shifts/open', '/admin/pos/shifts/1/close'] as $path) {
            $this->postJson($path)->assertNotFound();
        }
        $this->patchJson('/admin/registers/1')->assertNotFound();
        $this->deleteJson('/admin/registers/1')->assertNotFound();
        $this->getJson('/admin/pos')->assertOk()->assertJsonMissingPath('props.registers');
        $groups = $this->getJson('/admin/roles')->assertOk()->json('props.permissionGroups');
        $this->assertNotContains('registers.manage', collect($groups)->flatMap(fn ($group) => array_column($group['items'], 'value'))->all());
        $this->assertDatabaseCount('pos_shifts', 0);
    }

    public function test_held_carts_use_branch_access_without_a_register(): void
    {
        $actor = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $branch = \App\Models\Location::create(['name' => 'Direct sales', 'code' => 'DIRECT-HOLD', 'type' => 'warehouse', 'is_active' => true]);
        $response = $this->actingAs($actor)->postJson('/admin/pos/held-carts', [
            'location_id' => $branch->id, 'cart_payload' => ['items' => []],
        ])->assertOk()->assertJsonPath('heldCart.location_id', $branch->id);
        $this->assertDatabaseHas('held_carts', ['id' => $response->json('heldCart.id'), 'pos_register_id' => null]);
        $this->deleteJson('/admin/pos/held-carts/'.$response->json('heldCart.id'))->assertOk();
        $this->assertDatabaseCount('held_carts', 0);
    }

    public function test_payment_method_management_is_removed_without_changing_historical_records(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super_admin', 'status' => 'active']));
        $method = \App\Models\PaymentMethod::create([
            'banking_service' => 'Historical bank',
            'account_name' => 'Shop',
            'account_no' => '123456',
            'is_active' => true,
            'sort_order' => 0,
        ]);

        $this->getJson('/admin/payment-methods')->assertNotFound();
        $this->postJson('/admin/payment-methods', ['banking_service' => 'New bank'])->assertNotFound();
        foreach (['POST', 'PUT', 'PATCH', 'DELETE'] as $verb) {
            $this->json($verb, '/admin/payment-methods/'.$method->id, ['banking_service' => 'Changed bank'])->assertNotFound();
        }
        $this->assertDatabaseCount('payment_methods', 1);
        $this->assertSame('Historical bank', $method->fresh()->banking_service);

        $groups = $this->getJson('/admin/roles')->assertOk()->json('props.permissionGroups');
        $this->assertNotContains('manage_payment_methods', collect($groups)->flatMap(fn ($group) => array_column($group['items'], 'value'))->all());
    }

    public function test_blog_pages_and_publishing_endpoints_are_removed(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super_admin', 'status' => 'active']));

        foreach (['/admin/blogs', '/admin/blogs/create', '/admin/blogs/1/edit'] as $path) {
            $this->getJson($path)->assertNotFound();
        }
        $this->postJson('/admin/blogs')->assertNotFound();
        $this->postJson('/admin/blogs/1')->assertNotFound();
        $this->patchJson('/admin/blogs/1')->assertNotFound();
        $this->deleteJson('/admin/blogs/1')->assertNotFound();
    }

    public function test_chat_reviews_and_promotion_endpoints_are_removed_for_admins(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super_admin', 'status' => 'active']));
        foreach (['/admin/chats', '/admin/chats/1', '/admin/reviews', '/admin/coupons', '/admin/flash-sales', '/admin/flash-sales/create', '/admin/marketing/point-configuration', '/api/admin/conversations', '/api/admin/conversations/unread', '/api/admin/conversations/1/messages', '/api/admin/messages/latest'] as $path) {
            $this->getJson($path)->assertNotFound();
        }
        foreach (['/admin/coupons', '/admin/flash-sales', '/admin/marketing/point-configuration', '/admin/customers/1/loyalty-adjustments', '/api/admin/messages/send', '/api/admin/messages/upload-image'] as $path) {
            $this->postJson($path)->assertNotFound();
        }
        $this->patchJson('/admin/reviews/1')->assertNotFound();
        $this->deleteJson('/admin/reviews/1')->assertNotFound();
    }

    public function test_customer_pages_keep_sales_and_credit_without_reviews_and_rewards(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $customer = User::factory()->create();

        $response = $this->actingAs($admin)->getJson('/admin/customers/'.$customer->id)->assertOk();
        $props = $response->json('props');
        foreach (['reviews', 'rewardHistories', 'canAdjustLoyalty', 'chat_unread_count'] as $removed) {
            $this->assertArrayNotHasKey($removed, $props);
        }
        $this->assertArrayHasKey('creditSummary', $props);
        $this->assertArrayHasKey('recentOrders', $props);
        $this->getJson('/admin/customers')->assertOk();
    }
}
