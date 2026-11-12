<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\AppSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsFeatureRemovalTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $user->roles()->sync([Role::where('name', 'super_admin')->value('id')]);
        return $user;
    }

    public function test_removed_sections_fall_back_to_general_without_loading_price_management(): void
    {
        $this->actingAs($this->admin());
        foreach (['contacts', 'prices', 'danger'] as $section) {
            $response = $this->getJson('/admin/settings?section='.$section)->assertOk()
                ->assertJsonPath('props.initialSection', 'general');
            $this->assertArrayNotHasKey('pricing', $response->json('props'));
            $this->assertArrayNotHasKey('pricingAction', $response->json('props'));
            $this->assertArrayNotHasKey('pricingRule', $response->json('props'));
        }
    }

    public function test_price_management_endpoints_are_removed(): void
    {
        $this->actingAs($this->admin());
        foreach (['/admin/settings/prices', '/admin/settings/prices/create', '/admin/settings/prices/1/edit'] as $url) {
            $this->getJson($url)->assertNotFound();
        }
        $this->postJson('/admin/settings/prices', [])->assertNotFound();
        $this->postJson('/admin/settings/prices/preview', [])->assertNotFound();
        $this->patchJson('/admin/settings/prices/1', [])->assertNotFound();
        $this->deleteJson('/admin/settings/prices/1')->assertNotFound();
        $response = $this->getJson('/admin/roles')->assertOk();
        $this->assertNotContains('pricing.manage', collect($response->json('props.permissionGroups'))->pluck('items')->flatten(1)->pluck('value'));
    }

    public function test_contacts_cannot_be_edited_and_existing_receipt_contacts_are_preserved(): void
    {
        $this->actingAs($this->admin());
        $settings = app(AppSettingsService::class);
        $settings->setMany(['contacts' => ['phone' => ['09123456789']]]);
        $payload = ['app_name' => 'Vintage Shop', 'currency_label' => 'MMK', 'theme_color' => '#a45138'];
        $this->postJson('/admin/settings', $payload + ['contacts' => ['phone' => ['09999999999']]])
            ->assertUnprocessable()->assertJsonValidationErrors('contacts');
        $this->post('/admin/settings', $payload)->assertSessionHasNoErrors()->assertRedirect();
        $this->assertDatabaseHas('settings', ['key' => 'contacts', 'value' => json_encode(['phone' => ['09123456789']])]);
        $this->assertArrayNotHasKey('contacts', $settings->all());
        $this->getJson('/admin/settings')->assertOk()->assertJsonMissingPath('props.app_settings.contacts');
    }

    public function test_self_service_deletion_is_removed_and_the_account_remains_active(): void
    {
        $user = $this->admin();
        $this->actingAs($user)->deleteJson('/admin/profile', ['password' => 'password'])->assertStatus(405);
        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->fresh());
        $this->assertNull($user->fresh()->deleted_at);
    }

    public function test_branding_bookmarks_open_general_and_color_is_no_longer_configurable(): void
    {
        $this->actingAs($this->admin())->getJson('/admin/settings?section=branding')
            ->assertOk()->assertJsonPath('props.initialSection', 'general');
        $settings = app(AppSettingsService::class);
        $settings->setMany(['theme_color' => '#a45138']);
        $payload = ['app_name' => 'Updated Shop', 'currency_label' => 'MMK'];
        $this->post('/admin/settings', $payload)->assertSessionHasNoErrors()->assertRedirect();
        $this->assertSame('Updated Shop', $settings->all()['app_name']);
        $this->post('/admin/settings', $payload + ['theme_color' => '#ffffff'])->assertSessionHasNoErrors()->assertRedirect();
        $this->assertSame('#a45138', $settings->all()['theme_color']);
    }
}
