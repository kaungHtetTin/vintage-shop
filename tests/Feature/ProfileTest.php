<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_old_profile_page_redirects_to_the_settings_profile_tab(): void
    {
        $user = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);

        $response = $this
            ->actingAs($user)
            ->get('/admin/profile');

        $response->assertRedirect('/admin/settings?section=profile');
    }

    public function test_staff_can_manage_their_profile_in_settings_without_application_settings_access(): void
    {
        $user = User::factory()->create(['role' => 'staff', 'status' => 'active']);
        $this->actingAs($user)->getJson('/admin/settings?section=profile')->assertOk()
            ->assertJsonPath('component', 'Admin/Settings/Edit')
            ->assertJsonPath('props.initialSection', 'profile')
            ->assertJsonPath('props.canManageSettings', false);
        $this->getJson('/admin/settings?section=security')->assertOk()->assertJsonPath('props.initialSection', 'security');
        $this->getJson('/admin/settings?section=general')->assertForbidden();
        $this->postJson('/admin/settings', ['app_name' => 'Unauthorized change'])->assertForbidden();
    }

    public function test_profile_information_can_be_updated(): void
    {
        $user = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);

        $response = $this
            ->actingAs($user)
            ->from('/admin/profile')
            ->patch('/admin/profile', [
                'name' => 'Test User',
                'email' => 'test@example.com',
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect('/admin/settings?section=profile&saved=profile');

        $user->refresh();

        $this->assertSame('Test User', $user->name);
        $this->assertSame('test@example.com', $user->email);
        $this->assertNull($user->email_verified_at);
    }

    public function test_email_verification_status_is_unchanged_when_the_email_address_is_unchanged(): void
    {
        $user = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);

        $response = $this
            ->actingAs($user)
            ->from('/admin/profile')
            ->patch('/admin/profile', [
                'name' => 'Test User',
                'email' => $user->email,
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect('/admin/settings?section=profile&saved=profile');

        $this->assertNotNull($user->refresh()->email_verified_at);
    }

    

    

    

    public function test_other_roles_cannot_delete_accounts_from_either_profile_route(): void
    {
        foreach (['customer', 'staff', 'manager'] as $role) {
            $user = User::factory()->create(['role' => $role, 'status' => 'active']);

            $this->actingAs($user)->deleteJson('/profile', ['password' => 'password'])->assertNotFound();
            $this->actingAs($user)->deleteJson('/admin/profile', ['password' => 'password'])->assertStatus(405);
            $this->assertNotNull($user->fresh());
        }
    }

    public function test_super_admin_cannot_use_storefront_profile_route_to_delete_account(): void
    {
        $user = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);

        $this->actingAs($user)->deleteJson('/profile', ['password' => 'password'])->assertNotFound();
        $this->assertNotNull($user->fresh());
    }
}
