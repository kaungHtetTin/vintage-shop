<?php

namespace App\Support;

use App\Models\User;

class AdminLandingPage
{
    public static function path(?User $user): string
    {
        if (! $user) {
            return '/admin/login';
        }

        $pages = [
            ['dashboard.view', '/admin/dashboard'],
            ['pos.access', '/admin/pos'],
            ['orders.view', '/admin/orders'],
            ['view_customers', '/admin/customers'],
            ['manage_finance', '/admin/finance'],
            ['finance_book.manage', '/admin/finance-book'],
            ['view_reports', '/admin/reports'],
            ['reports.sales', '/admin/reports'],
            ['catalog.view', '/admin/bales'],
            ['catalog.manage', '/admin/bales'],
            ['inventory.view', '/admin/inventory'],
            ['inventory.receive', '/admin/bales'],
            ['inventory.adjust.create', '/admin/inventory/adjustments'],
            ['inventory.transfer.create', '/admin/inventory/transfers'],
            ['locations.view', '/admin/locations'],
            ['staff.manage', '/admin/users'],
            ['roles.manage', '/admin/roles'],
            ['settings.manage', '/admin/settings'],
            ['view_audit_logs', '/admin/audit-logs'],
        ];

        foreach ($pages as [$permission, $path]) {
            if ($permission === 'pos.access' && ! config('inventory.pos_enabled', true)) {
                continue;
            }

            if ($user->hasAdminPermission($permission)) {
                return $path;
            }
        }

        return '/admin/settings?section=profile';
    }
}
