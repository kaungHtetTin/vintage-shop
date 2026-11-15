<?php

namespace Tests\Feature;

use App\Models\Location;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocationModalUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_branch_edit_returns_a_get_redirect_and_fresh_listing(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $branch = Location::create(['code' => 'EDIT-BRANCH', 'name' => 'Original branch', 'type' => 'warehouse', 'is_active' => true]);
        $data = ['code' => $branch->code, 'name' => 'Corrected branch', 'timezone' => 'Asia/Yangon', 'is_active' => true, 'is_default_fulfillment' => false, 'staff_ids' => []];
        $response = $this->actingAs($admin)->withHeader('X-SPA', 'true')->from('/admin/locations')->patchJson('/admin/locations/'.$branch->id, $data);
        $response->assertStatus(303)->assertRedirect('/admin/locations');
        $this->getJson('/admin/locations')->assertOk()->assertJsonFragment(['name' => 'Corrected branch']);
        $this->assertSame('Corrected branch', $branch->fresh()->name);
    }

    public function test_branch_validation_returns_field_errors_without_redirecting_or_saving(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $branch = Location::create(['code' => 'EDIT-BRANCH', 'name' => 'Original branch', 'type' => 'warehouse', 'is_active' => true]);
        $this->actingAs($admin)->withHeader('X-SPA', 'true')->patchJson('/admin/locations/'.$branch->id, [
            'code' => $branch->code, 'name' => '', 'timezone' => 'invalid-zone', 'is_active' => true, 'is_default_fulfillment' => false,
        ])->assertUnprocessable()->assertJsonValidationErrors(['name', 'timezone']);
        $this->assertSame('Original branch', $branch->fresh()->name);
    }
}
