<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CustomerRecordService
{
    public function validate(Request $request, ?User $customer = null): array
    {
        $request->merge([
            'name' => is_string($request->input('name')) ? trim($request->input('name')) : $request->input('name'),
            'phone' => is_string($request->input('phone')) ? (trim($request->input('phone')) ?: null) : $request->input('phone'),
            'default_address' => is_string($request->input('default_address')) ? (trim($request->input('default_address')) ?: null) : $request->input('default_address'),
        ]);
        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30', Rule::unique('users', 'phone')->ignore($customer?->id)],
            'default_address' => ['nullable', 'string', 'max:1000'],
        ];
        if (! $customer) {
            $rules += [
                'credit_limit' => [Rule::prohibitedIf(! $request->user()->hasAdminPermission('credit.manage')), 'nullable', 'numeric', 'min:0', 'max:999999999999.99', 'decimal:0,2'],
                'credit_terms_days' => [Rule::prohibitedIf(! $request->user()->hasAdminPermission('credit.manage')), 'nullable', 'integer', 'min:1', 'max:365'],
            ];
        }

        return $request->validate($rules);
    }

    public function create(array $data, User $actor): User
    {
        $limit = $actor->hasAdminPermission('credit.manage') ? (float) ($data['credit_limit'] ?? 0) : 0;

        return User::create([
            'name' => $data['name'],
            'phone' => $data['phone'] ?? null,
            'default_address' => $data['default_address'] ?? null,
            'email' => null,
            'password' => null,
            'auth_provider' => 'none',
            'role' => User::CUSTOMER_ROLE,
            'status' => 'active',
            'credit_status' => $limit > 0 ? 'active' : 'disabled',
            'credit_limit' => $limit,
            'credit_terms_days' => $actor->hasAdminPermission('credit.manage') ? ($data['credit_terms_days'] ?? 30) : 30,
        ]);
    }
}
