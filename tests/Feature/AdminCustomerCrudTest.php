<?php

namespace Tests\Feature;

use App\Models\CustomerCreditTransaction;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminCustomerCrudTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_a_credit_record_without_email_or_password(): void
    {
        $this->actingAs($this->admin())->post('/admin/customers', [
            'name' => 'Credit customer', 'phone' => '09123456789', 'default_address' => '12 Main Street',
            'credit_limit' => 25000, 'credit_terms_days' => 14,
        ])->assertStatus(303)->assertRedirect('/admin/customers');
        $customer = User::where('phone', '09123456789')->firstOrFail();
        $this->assertSame(User::CUSTOMER_ROLE, $customer->role);
        $this->assertNull($customer->email);
        $this->assertNull($customer->password);
        $this->assertSame('none', $customer->auth_provider);
        $this->assertSame('active', $customer->credit_status);
        $this->assertSame('25000.00', $customer->credit_limit);
        $this->assertSame('12 Main Street', $customer->default_address);
        $this->getJson('/admin/customers/'.$customer->id)->assertOk()->assertJsonMissingPath('props.customer.email')->assertJsonMissingPath('props.customer.auth_provider');
    }

    public function test_multiple_name_only_records_do_not_need_placeholder_login_details(): void
    {
        $this->actingAs($this->admin());
        foreach (['First customer', 'Second customer'] as $name) {
            $this->post('/admin/customers', ['name' => $name])->assertStatus(303)->assertSessionHasNoErrors();
            $this->assertDatabaseHas('users', ['name' => $name, 'email' => null, 'password' => null, 'role' => User::CUSTOMER_ROLE]);
        }
    }

    public function test_customer_record_requires_a_name_and_unique_phone(): void
    {
        User::factory()->create(['phone' => '09111111111']);
        $this->actingAs($this->admin())->post('/admin/customers', ['name' => '   ', 'phone' => '09111111111'])
            ->assertSessionHasErrors(['name', 'phone']);
    }

    public function test_customer_edits_update_contacts_without_changing_credentials_or_credit_history(): void
    {
        $customer = User::factory()->create(['role' => User::CUSTOMER_ROLE, 'status' => 'active']);
        $password = $customer->password;
        $email = $customer->email;
        CustomerCreditTransaction::create(['transaction_number' => 'CONTACT-EDIT', 'customer_id' => $customer->id, 'type' => 'sale', 'amount' => 1000, 'balance_after' => 1000]);
        $this->actingAs($this->admin())->patch('/admin/customers/'.$customer->id, [
            'name' => 'Updated customer', 'phone' => '09999999999', 'default_address' => 'Updated address',
            'email' => 'ignored@example.com', 'password' => 'IgnoredPassword123!', 'role' => 'super_admin', 'status' => 'suspended',
        ])->assertStatus(303)->assertSessionHasNoErrors();
        $customer->refresh();
        $this->assertSame('Updated customer', $customer->name);
        $this->assertSame('Updated address', $customer->default_address);
        $this->assertSame('active', $customer->status);
        $this->assertSame(User::CUSTOMER_ROLE, $customer->role);
        $this->assertSame($email, $customer->email);
        $this->assertSame($password, $customer->password);
        $this->assertSame(1000.0, (float) $customer->creditTransactions()->sum('amount'));
    }

    public function test_malformed_contact_fields_are_rejected(): void
    {
        $this->actingAs($this->admin())->postJson('/admin/customers', ['name' => ['invalid'], 'phone' => ['invalid'], 'default_address' => ['invalid']])
            ->assertUnprocessable()->assertJsonValidationErrors(['name', 'phone', 'default_address']);
    }

    public function test_legacy_customer_credentials_cannot_log_in_to_staff_tools(): void
    {
        $customer = User::factory()->create(['role' => User::CUSTOMER_ROLE, 'password' => Hash::make('Password123!')]);
        $this->post('/admin/login', ['email' => $customer->email, 'password' => 'Password123!'])->assertSessionHasErrors('email');
        $this->assertGuest();
    }

    public function test_admin_can_soft_delete_customer_without_credit_balance(): void
    {
        $customer = User::factory()->create(['role' => User::CUSTOMER_ROLE]);

        $this->actingAs($this->admin())
            ->delete("/admin/customers/{$customer->id}")
            ->assertStatus(303)
            ->assertRedirect('/admin/customers');

        $this->assertSoftDeleted('users', ['id' => $customer->id]);
    }

    public function test_deleted_customer_phone_can_be_reused(): void
    {
        $customer = User::factory()->create(['role' => User::CUSTOMER_ROLE, 'phone' => '09111111111']);
        $this->actingAs($this->admin())->delete('/admin/customers/'.$customer->id)->assertStatus(303);
        $this->post('/admin/customers', ['name' => 'Replacement customer', 'phone' => '09111111111'])->assertStatus(303)->assertSessionHasNoErrors();
        $this->assertDatabaseHas('users', ['name' => 'Replacement customer', 'phone' => '09111111111', 'email' => null, 'password' => null, 'deleted_at' => null]);
    }

    public function test_customer_with_outstanding_credit_cannot_be_deleted(): void
    {
        $customer = User::factory()->create(['role' => User::CUSTOMER_ROLE]);
        CustomerCreditTransaction::create([
            'transaction_number' => 'CRUD-CREDIT-1',
            'customer_id' => $customer->id,
            'type' => 'sale',
            'amount' => 1000,
            'balance_after' => 1000,
        ]);

        $this->actingAs($this->admin())
            ->delete("/admin/customers/{$customer->id}")
            ->assertSessionHasErrors('customer');

        $this->assertNotSoftDeleted('users', ['id' => $customer->id]);
    }

    private function admin(): User
    {
        $role = Role::where('name', 'super_admin')->firstOrFail();
        $admin = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $admin->roles()->sync([$role->id]);

        return $admin->fresh();
    }
}
