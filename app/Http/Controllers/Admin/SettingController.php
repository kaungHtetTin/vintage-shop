<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\AppSettingsService;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use App\Support\Spa;

class SettingController extends Controller
{
    public function edit(Request $request, AppSettingsService $settings)
    {
        $canManageSettings = $request->user()->hasAdminPermission('settings.manage');
        $section = $request->query('section', $canManageSettings ? 'general' : 'profile');
        abort_unless($canManageSettings || in_array($section, ['profile', 'security'], true), 403);
        return Spa::render('Admin/Settings/Edit', [
            'canManageSettings' => $canManageSettings,
            'settings' => $settings->publicSettings(),
            'initialSection' => in_array($section, ['general', 'receipts', 'profile', 'security'], true)
                ? $section
                : 'general',
            'status' => match ($request->query('saved')) {
                'password' => 'password-updated',
                'profile' => 'profile-updated',
                default => session('status'),
            },
        ]);
    }

    public function update(Request $request, AppSettingsService $settings, AuditLogService $auditLogService)
    {
        $validated = $request->validate([
            'receipt' => ['sometimes', 'array:shop_name,address,phone,footer,paper_size,show_logo,show_customer,show_cashier,show_foc,auto_print,qz_printing,qz_printer_name,cash_drawer'],
            'receipt.shop_name' => ['nullable', 'string', 'max:80'],
            'receipt.address' => ['nullable', 'string', 'max:300'],
            'receipt.phone' => ['nullable', 'string', 'max:80'],
            'receipt.footer' => ['nullable', 'string', 'max:300'],
            'receipt.paper_size' => ['required_with:receipt', 'in:'.implode(',', AppSettingsService::RECEIPT_PAPER_SIZES)],
            'receipt.show_logo' => ['required_with:receipt', 'boolean'],
            'receipt.show_customer' => ['required_with:receipt', 'boolean'],
            'receipt.show_cashier' => ['required_with:receipt', 'boolean'],
            'receipt.show_foc' => ['required_with:receipt', 'boolean'],
            'receipt.auto_print' => ['required_with:receipt', 'boolean'],
            'receipt.qz_printing' => ['required_with:receipt', 'boolean'],
            'receipt.qz_printer_name' => ['nullable', 'required_if:receipt.qz_printing,true,1', 'string', 'max:180'],
            'receipt.cash_drawer' => ['required_with:receipt', 'boolean'],
            'contacts' => ['prohibited'],
            'app_name' => ['required', 'string', 'max:80'],
            'currency_label' => ['required', 'string', 'max:12'],
            'logo' => ['nullable', 'file', 'max:5120'],
            'favicon' => ['nullable', 'file', 'max:2048'],
            'remove_logo' => ['nullable', 'boolean'],
            'remove_favicon' => ['nullable', 'boolean'],
        ]);

        $current = $settings->all();
        $this->ensureAllowedUpload($request, 'logo', ['jpg', 'jpeg', 'png', 'webp', 'svg']);
        $this->ensureAllowedUpload($request, 'favicon', ['ico', 'jpg', 'jpeg', 'png', 'webp', 'svg']);

        $payload = [
            'app_name' => trim($validated['app_name']),
            'currency_label' => trim($validated['currency_label']),
        ];

        if (isset($validated['receipt'])) {
            $receipt = array_replace(AppSettingsService::RECEIPT_DEFAULTS, $validated['receipt']);
            foreach (['shop_name', 'address', 'phone', 'footer', 'qz_printer_name'] as $key) {
                $receipt[$key] = trim((string) $receipt[$key]);
            }
            foreach (['show_logo', 'show_customer', 'show_cashier', 'show_foc', 'auto_print', 'qz_printing', 'cash_drawer'] as $key) {
                $receipt[$key] = (bool) $receipt[$key];
            }
            $payload['receipt'] = $receipt;
        }

        $payload['logo_path'] = $this->resolveUpload(
            $request,
            'logo',
            'remove_logo',
            $current['logo_path'] ?? null,
            'logo',
        );

        $payload['favicon_path'] = $this->resolveUpload(
            $request,
            'favicon',
            'remove_favicon',
            $current['favicon_path'] ?? null,
            'favicon',
        );

        $settings->setMany($payload);

        $auditLogService->record('settings.updated', null, [
            'receipt_changed' => isset($payload['receipt']) && ($current['receipt'] ?? null) !== $payload['receipt'],
            'app_name' => $payload['app_name'],
            'currency_label' => $payload['currency_label'],
            'logo_changed' => ($current['logo_path'] ?? null) !== $payload['logo_path'],
            'favicon_changed' => ($current['favicon_path'] ?? null) !== $payload['favicon_path'],
        ], $request);

        return back()->with('success', \App\Support\UiText::get('Application settings updated.'));
    }

    private function ensureAllowedUpload(Request $request, string $fileKey, array $extensions): void
    {
        if (! $request->hasFile($fileKey)) {
            return;
        }

        $extension = strtolower($request->file($fileKey)->getClientOriginalExtension());

        if (! in_array($extension, $extensions, true)) {
            throw ValidationException::withMessages([
                $fileKey => \App\Support\UiText::get('The :field must be a :types file.', ['field' => trans('validation.attributes.'.$fileKey), 'types' => implode(', ', $extensions)]),
            ]);
        }
    }

    private function resolveUpload(Request $request, string $fileKey, string $removeKey, ?string $currentPath, string $name): ?string
    {
        if ($request->boolean($removeKey)) {
            $this->deletePublicFile($currentPath);

            return null;
        }

        if (! $request->hasFile($fileKey)) {
            return $currentPath;
        }

        $this->deletePublicFile($currentPath);

        $file = $request->file($fileKey);
        $extension = strtolower($file->getClientOriginalExtension() ?: $file->extension());

        return $file->storeAs('settings', $name.'-'.time().'.'.$extension, 'public');
    }

    private function deletePublicFile(?string $path): void
    {
        if (! $path || str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return;
        }

        Storage::disk('public')->delete($path);
    }
}
