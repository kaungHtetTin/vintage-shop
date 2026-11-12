<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocaleTest extends TestCase
{
    use RefreshDatabase;

    public function test_language_switch_persists_and_supplies_translations_to_the_spa(): void
    {
        $user = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $user->roles()->sync([Role::where('name', 'super_admin')->value('id')]);
        $this->actingAs($user)->post('/admin/locale', ['locale' => 'my'])->assertRedirect()->assertSessionHas('locale', 'my');
        $this->getJson('/admin/dashboard')->assertOk()
            ->assertJsonPath('props.locale', 'my')
            ->assertJsonPath('props.translations.navigation.phrases.Buy a bale', 'အထည်ထုပ်ဝယ်ရန်')
            ->assertJsonPath('props.translations.navigation.phrases.Find a permission', 'ခွင့်ပြုချက်ရှာရန်');
        $this->post('/admin/locale', ['locale' => 'en'])->assertRedirect()->assertSessionHas('locale', 'en');
        $this->getJson('/admin/dashboard')->assertOk()
            ->assertJsonPath('props.locale', 'en')
            ->assertJsonPath('props.translations.navigation.phrases.Buy a bale', 'Buy a bale');
    }

    public function test_unsupported_locale_is_rejected(): void
    {
        $this->postJson('/admin/locale', ['locale' => 'invalid'])->assertUnprocessable()->assertJsonValidationErrors('locale');
    }

    public function test_myanmar_validation_messages_include_translated_field_names(): void
    {
        app()->setLocale('my');
        $validator = validator(['name' => '', 'credit_limit' => -1], ['name' => 'required', 'credit_limit' => 'numeric|min:0']);
        $this->assertSame('အမည် ကို ဖြည့်ရန်လိုအပ်သည်။', $validator->errors()->first('name'));
        $this->assertStringContainsString('အကြွေးကန့်သတ်ငွေ', $validator->errors()->first('credit_limit'));
        $this->assertStringNotContainsString('credit limit', $validator->errors()->first('credit_limit'));
        $summary = (new \Illuminate\Validation\ValidationException($validator))->getMessage();
        $this->assertStringContainsString('နောက်ထပ် အမှား', $summary);
        $this->assertStringNotContainsString('(and', $summary);
    }

    public function test_server_success_and_permission_errors_follow_the_session_language(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'status' => 'active']);
        $admin->roles()->sync([Role::where('name', 'super_admin')->value('id')]);
        $this->actingAs($admin)->withSession(['locale' => 'my'])
            ->post('/admin/suppliers', ['name' => 'Cash'])
            ->assertRedirect()->assertSessionHas('success', 'ပေးသွင်းသူထည့်ပြီး။');
        $response = $this->postJson('/admin/roles', [
            'name' => 'delivery_clerk', 'display_name' => 'Delivery Clerk', 'permissions' => ['orders.manage'],
        ])->assertUnprocessable();
        $this->assertStringContainsString('လိုအပ်သည်', $response->json('errors.permissions.0'));
        $this->assertStringNotContainsString('Manage orders', $response->json('errors.permissions.0'));
        $this->assertDatabaseHas('vintage_suppliers', ['name' => 'Cash']);
        $this->withSession(['locale' => 'en'])->post('/admin/suppliers', ['name' => 'Another Supplier'])
            ->assertRedirect()->assertSessionHas('success', 'Supplier added.');
    }

    public function test_receipt_and_statement_labels_translate_without_changing_customer_data(): void
    {
        $customer = User::factory()->create(['name' => 'Cash', 'role' => User::CUSTOMER_ROLE]);
        $order = \App\Models\Order::create([
            'user_id' => $customer->id, 'order_number' => 'POS-LOCALE-1', 'receipt_number' => 'RCT-LOCALE-1',
            'sales_channel' => 'pos', 'status' => 'completed', 'payment_status' => 'paid',
            'total_amount' => 1000, 'final_amount' => 1000, 'paid_amount' => 1000,
        ]);
        app()->setLocale('my');
        $voucher = app(\App\Services\OrderVoucherService::class)->renderHtml($order);
        $this->assertStringContainsString('အရောင်းပြေစာ', $voucher);
        $this->assertStringContainsString('Cash', $voucher);
        $this->assertStringContainsString('lang="my"', $voucher);
        $this->assertStringNotContainsString('>Customer<', $voucher);
        $service = app(\App\Services\CreditStatementService::class);
        $data = $service->data($customer);
        $html = view('credit.statement', $data)->render();
        $this->assertStringContainsString('ဖောက်သည်အကြွေးစာရင်းရှင်းတမ်း', $html);
        $this->assertStringContainsString('Cash', $html);
        $this->assertStringStartsWith('%PDF-', $service->pdf($data));
        app()->setLocale('en');
        $this->assertStringContainsString('Customer Credit Statement', view('credit.statement', $data)->render());
    }

    public function test_new_catalogues_have_matching_keys_and_interpolation_tokens(): void
    {
        foreach (['current-ui', 'admin-ui', 'remaining-ui', 'workflow-ui', 'status-ui', 'server-ui', 'shared-ui', 'print-ui'] as $catalogue) {
            $en = json_decode(file_get_contents(lang_path('en/'.$catalogue.'.json')), true, 512, JSON_THROW_ON_ERROR);
            $my = json_decode(file_get_contents(lang_path('my/'.$catalogue.'.json')), true, 512, JSON_THROW_ON_ERROR);
            $this->assertSame(array_keys($en), array_keys($my), $catalogue);
            foreach ($en as $key => $value) {
                $this->assertNotSame('', trim($my[$key]), $key);
                $this->assertStringNotContainsString("\u{FFFD}", $my[$key], $key);
                preg_match_all('/:[A-Za-z_][A-Za-z0-9_]*/', $value, $enTokens);
                preg_match_all('/:[A-Za-z_][A-Za-z0-9_]*/', $my[$key], $myTokens);
                $this->assertEqualsCanonicalizing(array_unique($enTokens[0]), array_unique($myTokens[0]), $key);
            }
        }
    }
}
