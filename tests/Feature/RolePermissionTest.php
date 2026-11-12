<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RolePermissionTest extends TestCase
{
    use RefreshDatabase;

    public function test_default_admin_roles_and_permissions_are_seeded(): void
    {
        $this->assertDatabaseHas('roles', ['name' => 'super_admin', 'display_name' => 'Super Admin']);
        $this->assertDatabaseHas('roles', ['name' => 'manager']);
        $this->assertDatabaseHas('roles', ['name' => 'staff']);
        $this->assertDatabaseHas('permissions', ['name' => 'roles.manage']);
        $this->assertDatabaseMissing('permissions', ['name' => 'inventory.import']);
    }

    public function test_staff_permissions_are_resolved_from_the_assigned_role(): void
    {
        $sales = $this->staffWithRole('staff');

        $this->assertTrue($sales->hasAdminPermission('orders.manage'));
        $this->assertTrue($sales->hasAdminPermission('inventory.view'));
        $this->assertFalse($sales->hasAdminPermission('roles.manage'));
    }

    public function test_admin_can_open_role_management_and_manager_cannot(): void
    {
        $admin = $this->staffWithRole('super_admin');
        $manager = $this->staffWithRole('manager');

        $this->actingAs($admin)->get('/admin/roles')->assertOk();
        $this->actingAs($manager)->get('/admin/roles')->assertRedirect('/admin/dashboard');
    }

    public function test_admin_can_update_a_role_permission_set(): void
    {
        $admin = $this->staffWithRole('super_admin');
        $role = Role::create([
            'name' => 'customer_care',
            'display_name' => 'Customer Care',
            'description' => 'Customer care team.',
            'is_admin' => true,
            'is_system' => false,
            'sort_order' => 60,
        ]);

        $this->actingAs($admin)
            ->patch("/admin/roles/{$role->id}", [
                'display_name' => 'Store Staff',
                'description' => 'Daily store operations team.',
                'permissions' => ['dashboard.view', 'pos.access', 'view_customers'],
            ])
            ->assertRedirect();

        $this->assertSame('Store Staff', $role->fresh()->display_name);
        $this->assertEqualsCanonicalizing(
            ['dashboard.view', 'pos.access', 'view_customers'],
            $role->fresh()->permissions()->pluck('name')->all(),
        );
    }

    public function test_json_role_update_returns_updated_role_without_a_patch_redirect(): void
    {
        $admin = $this->staffWithRole('super_admin');
        $role = Role::create([
            'name' => 'inventory_helper',
            'display_name' => 'Inventory Helper',
            'is_admin' => true,
            'is_system' => false,
            'sort_order' => 60,
        ]);

        $this->actingAs($admin)->patchJson("/admin/roles/{$role->id}", [
            'display_name' => 'Inventory Assistant',
            'description' => 'Updated access',
            'permissions' => ['dashboard.view', 'inventory.view'],
        ])->assertOk()
            ->assertJsonPath('role.id', $role->id)
            ->assertJsonPath('role.display_name', 'Inventory Assistant')
            ->assertJsonPath('role.permissions.0', 'dashboard.view')
            ->assertJsonPath('role.permissions.1', 'inventory.view');
    }

    public function test_custom_role_can_be_deleted_and_is_absent_from_refreshed_list(): void
    {
        $admin = $this->staffWithRole('super_admin');
        $role = Role::create([
            'name' => 'temporary_role',
            'display_name' => 'Temporary Role',
            'is_admin' => true,
            'is_system' => false,
            'sort_order' => 60,
        ]);

        $this->actingAs($admin)->deleteJson("/admin/roles/{$role->id}")
            ->assertOk()
            ->assertJsonPath('deleted_role_id', $role->id);

        $this->assertDatabaseMissing('roles', ['id' => $role->id]);
        $this->getJson('/admin/roles')->assertOk()
            ->assertJsonMissing(['name' => 'temporary_role']);
    }

    public function test_assigned_role_delete_returns_a_modal_validation_error(): void
    {
        $admin = $this->staffWithRole('super_admin');
        $role = Role::create([
            'name' => 'assigned_role',
            'display_name' => 'Assigned Role',
            'is_admin' => true,
            'is_system' => false,
            'sort_order' => 60,
        ]);
        $this->staffWithRole('assigned_role');

        $this->actingAs($admin)->deleteJson("/admin/roles/{$role->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');

        $this->assertDatabaseHas('roles', ['id' => $role->id]);
    }

    public function test_custom_admin_role_can_be_assigned_without_code_changes(): void
    {
        $role = Role::create([
            'name' => 'regional_manager',
            'display_name' => 'Regional Manager',
            'is_admin' => true,
            'is_system' => false,
            'sort_order' => 60,
        ]);
        $role->permissions()->sync([
            Permission::query()->where('name', 'dashboard.view')->value('id'),
        ]);

        $user = User::factory()->create([
            'role' => $role->name,
            'status' => 'active',
            'permissions' => [],
        ]);
        $user->roles()->sync([$role->id]);

        $this->assertTrue($user->fresh()->isAdminStaff());
        $this->assertTrue($user->fresh()->hasAdminPermission('dashboard.view'));
    }

    public function test_staff_manager_cannot_assign_the_protected_admin_role(): void
    {
        $role = Role::create([
            'name' => 'team_lead',
            'display_name' => 'Team Lead',
            'is_admin' => true,
            'is_system' => false,
            'sort_order' => 60,
        ]);
        $role->permissions()->sync(Permission::query()
            ->whereIn('name', ['dashboard.view', 'staff.manage'])
            ->pluck('id'));

        $actor = User::factory()->create([
            'role' => $role->name,
            'status' => 'active',
        ]);
        $actor->roles()->sync([$role->id]);

        $this->actingAs($actor)
            ->post('/admin/users', [
                'name' => 'Unauthorized Admin',
                'email' => 'unauthorized-admin@example.com',
                'password' => 'password',
                'password_confirmation' => 'password',
                'role' => 'super_admin',
                'status' => 'active',
                'permissions' => [],
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'unauthorized-admin@example.com']);
    }

    private function staffWithRole(string $roleName, array $directPermissions = []): User
    {
        $role = Role::query()->where('name', $roleName)->firstOrFail();
        $user = User::factory()->create([
            'role' => $roleName,
            'status' => 'active',
            'permissions' => $directPermissions,
        ]);
        $user->roles()->sync([$role->id]);

        return $user->fresh();
    }

    public function test_permission_catalog_explains_current_features_and_legacy_keys(): void
    {
        $response = $this->actingAs($this->staffWithRole('super_admin'))->getJson('/admin/roles')->assertOk();
        $items = collect($response->json('props.permissionGroups'))->pluck('items')->flatten(1)->keyBy('value');

        $this->assertStringContainsString('receipt', $items['settings.manage']['label']);
        $this->assertStringContainsString('reversals', $items['inventory.transfer.create']['label']);
        $this->assertSame('POS sales and receipts', $items['pos.access']['label']);
        $this->assertArrayNotHasKey('registers.manage', $items->all());
        $this->assertStringContainsString('PDFs', $items['orders.view']['label']);
        $this->assertArrayNotHasKey('pos.refund', $items->all());
        $this->assertFalse($items['inventory.adjust.approve']['inactive']);
        $this->assertSame('Undo stock adjustments', $items['inventory.adjust.approve']['label']);
        $this->assertArrayNotHasKey('pricing.manage', $items->all());
    }

    

    public function test_settings_permission_preserves_receipts_without_price_management(): void
    {
        $this->actingAs($this->staffWithPermissions(['settings.manage']))
            ->getJson('/admin/settings?section=receipts')->assertOk()
            ->assertJsonPath('props.canManageSettings', true);
        $this->getJson('/admin/settings?section=prices')->assertOk();
        $this->get('/admin/settings/prices/create')->assertNotFound();
    }

    

    public function test_obsolete_permissions_are_hidden_in_both_roles_and_catalogue(): void
    {
        $response = $this->actingAs($this->staffWithRole('super_admin'))->getJson('/admin/roles')->assertOk();
        $catalogue = collect($response->json('props.permissionGroups'))->pluck('items')->flatten(1)->pluck('value');
        foreach (['chat.manage', 'registers.manage', 'pos.shift.close', 'pos.refund', 'reports.inventory', 'manage_payment_methods'] as $removed) {
            $this->assertNotContains($removed, $catalogue);
            foreach ($response->json('props.roles') as $role) $this->assertNotContains($removed, $role['permissions']);
        }
    }

    public function test_hidden_permissions_cannot_be_assigned_through_role_api(): void
    {
        $this->actingAs($this->staffWithRole('super_admin'))->postJson('/admin/roles', [
            'name' => 'obsolete_access', 'display_name' => 'Obsolete Access', 'permissions' => ['chat.manage'],
        ])->assertUnprocessable()->assertJsonValidationErrors('permissions.0');
        $this->assertDatabaseMissing('roles', ['name' => 'obsolete_access']);
    }

    public function test_role_dependencies_are_validated_before_saving(): void
    {
        $admin = $this->staffWithRole('super_admin');
        foreach ([['orders.manage'], ['credit.manage'], ['pos.discount']] as $permissions) {
            $this->actingAs($admin)->postJson('/admin/roles', [
                'name' => 'missing_access', 'display_name' => 'Missing Access', 'permissions' => $permissions,
            ])->assertUnprocessable()->assertJsonValidationErrors('permissions');
        }
        $this->assertDatabaseMissing('roles', ['name' => 'missing_access']);
        $this->postJson('/admin/roles', [
            'name' => 'credit_clerk', 'display_name' => 'Credit Clerk',
            'permissions' => ['view_customers', 'credit.manage'],
        ])->assertRedirect();
        $this->assertDatabaseHas('roles', ['name' => 'credit_clerk']);
    }

    public function test_label_manager_lands_on_the_accessible_bale_page(): void
    {
        $user = $this->staffWithPermissions(['catalog.manage']);
        $this->actingAs($user)->get('/admin')->assertRedirect('/admin/bales');
        $this->getJson('/admin/bales')->assertOk();
        $this->getJson('/admin/roles')->assertForbidden();
    }

    public function test_removed_grants_do_not_leak_into_effective_permissions(): void
    {
        $role = Role::create(['name' => 'old_support', 'display_name' => 'Old Support', 'is_admin' => true, 'is_system' => false]);
        $role->permissions()->sync(Permission::whereIn('name', ['dashboard.view', 'chat.manage', 'pos.shift.close'])->pluck('id'));
        $user = $this->staffWithRole('old_support');
        $this->assertSame(['dashboard.view'], $user->effectiveAdminPermissions());
        $this->assertFalse($user->hasAdminPermission('chat.manage'));
    }

    public function test_system_roles_stay_protected_from_mutation(): void
    {
        $this->actingAs($this->staffWithRole('super_admin'));
        $role = Role::where('name', 'staff')->firstOrFail();
        $before = $role->permissions()->pluck('name')->all();
        $this->patchJson('/admin/roles/'.$role->id, ['display_name' => 'Changed', 'permissions' => []])
            ->assertUnprocessable()->assertJsonValidationErrors('role');
        $this->deleteJson('/admin/roles/'.$role->id)->assertUnprocessable()->assertJsonValidationErrors('role');
        $this->assertSame($before, $role->fresh()->permissions()->pluck('name')->all());
    }

    private function staffWithPermissions(array $permissions): User
    {
        $role = Role::create([
            'name' => 'scoped_settings', 'display_name' => 'Scoped Settings',
            'is_admin' => true, 'is_system' => false, 'sort_order' => 60,
        ]);
        $role->permissions()->sync(Permission::whereIn('name', $permissions)->pluck('id'));
        return $this->staffWithRole($role->name);
    }
}
