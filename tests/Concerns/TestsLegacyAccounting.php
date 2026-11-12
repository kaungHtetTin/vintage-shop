<?php

namespace Tests\Concerns;

use App\Http\Controllers\Admin\{FinanceController, ReportController};
use Illuminate\Support\Facades\Route;

trait TestsLegacyAccounting
{
    protected function setUp(): void
    {
        parent::setUp();

        // Keep exercising historical product accounting independently of the new bale UI.
        Route::middleware(['web', 'auth', 'admin'])->group(function () {
            Route::get('/test-legacy/finance', [FinanceController::class, 'index'])->middleware('admin.permission:manage_finance');
            Route::get('/test-legacy/reports', [ReportController::class, 'index'])->middleware('admin.any_permission:view_reports,reports.sales,reports.inventory');
            Route::get('/test-legacy/reports/export', [ReportController::class, 'export'])->middleware('admin.any_permission:view_reports,reports.sales,reports.inventory');
        });
    }
}
