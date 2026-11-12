<?php

use App\Http\Controllers\Admin\VintageBaleController;
use App\Http\Controllers\Admin\AdminUserController;
use App\Http\Controllers\Admin\AuditLogController;
use App\Http\Controllers\Admin\CustomerController;
use App\Http\Controllers\Admin\CreditReportController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\CategoryController;
use App\Http\Controllers\Admin\FinanceController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\LocationController;
use App\Http\Controllers\Admin\InventoryController;
use App\Http\Controllers\Admin\StockAdjustmentController;
use App\Http\Controllers\Admin\StockReceiptController;
use App\Http\Controllers\Admin\StockTransferController;
use App\Http\Controllers\Admin\OrderController;
use App\Http\Controllers\Admin\OrderVoucherController;
use App\Http\Controllers\Admin\PosController;
use App\Http\Controllers\Admin\SettingController;
use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\Auth\PasswordController;
use App\Http\Controllers\ProfileController;
use App\Support\AdminLandingPage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Route;

Route::get('/csrf-token', function (Request $request) {
    return response()
        ->json(['csrf_token' => $request->session()->token()])
        ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
})->name('csrf-token');
Route::post('/locale', function (Request $request) {
    $supportedLocales = array_keys(config('app.supported_locales'));
    $data = $request->validate([
        'locale' => ['required', 'string', 'in:'.implode(',', $supportedLocales)],
    ]);

    $request->session()->put('locale', $data['locale']);
    App::setLocale($data['locale']);

    return back();
})->name('locale.update');

Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthenticatedSessionController::class, 'create'])->name('login');
    Route::post('/login', [AuthenticatedSessionController::class, 'store'])->name('login.store');
});

Route::middleware(['auth', 'admin'])->group(function () {
    Route::get('/', fn (Request $request) => redirect(AdminLandingPage::path($request->user())))->name('home');
    Route::get('/dashboard', [VintageBaleController::class, 'overview'])->middleware('admin.permission:dashboard.view')->name('dashboard');
    Route::get('/ui-showcase', [DashboardController::class, 'uiShowcase'])->middleware('admin.permission:dashboard.view')->name('ui-showcase');

    // Categories
    Route::get('/categories', [CategoryController::class, 'index'])->middleware('admin.permission:catalog.view')->name('categories.index');
    Route::post('/categories', [CategoryController::class, 'store'])->middleware('admin.permission:catalog.manage')->name('categories.store');
    Route::post('/categories/{category}', [CategoryController::class, 'update'])->middleware('admin.permission:catalog.manage')->name('categories.update.post');
    Route::patch('/categories/{category}', [CategoryController::class, 'update'])->middleware('admin.permission:catalog.manage')->name('categories.update');
    Route::delete('/categories/{category}', [CategoryController::class, 'destroy'])->middleware('admin.permission:catalog.manage')->name('categories.destroy');

    Route::get('/orders', [OrderController::class, 'index'])->middleware('admin.permission:orders.view')->name('orders.index');
    Route::get('/orders-export.xlsx', [OrderController::class, 'export'])->middleware('admin.permission:orders.view')->name('orders.export');
    Route::get('/orders/{order}', [OrderController::class, 'show'])->middleware('admin.permission:orders.view')->name('orders.show');
    Route::get('/orders/{order}/voucher', [OrderVoucherController::class, 'show'])->middleware('admin.permission:orders.view')->name('orders.voucher.show');
    Route::get('/orders/{order}/voucher/pdf', [OrderVoucherController::class, 'pdf'])->middleware('admin.permission:orders.view')->name('orders.voucher.pdf');
    Route::post('/orders/{order}/voucher/link', [OrderVoucherController::class, 'link'])->middleware('admin.permission:orders.manage')->name('orders.voucher.link');
    Route::post('/orders/{order}/confirm-payment', [OrderController::class, 'confirmPayment'])
        ->middleware('order.payment.reviewer')
        ->name('orders.confirm-payment');
    Route::post('/orders/{order}/reject-payment', [OrderController::class, 'rejectPayment'])
        ->middleware('order.payment.reviewer')
        ->name('orders.reject-payment');
    Route::patch('/orders/{order}/notes', [OrderController::class, 'updateNotes'])
        ->middleware('order.staff')
        ->name('orders.update-notes');
    Route::patch('/orders/{order}/delivery', [OrderController::class, 'updateDelivery'])
        ->middleware('admin.permission:orders.manage')->name('orders.delivery.update');
    Route::patch('/orders/{order}/voucher', [PosController::class, 'updateVoucher'])
        ->middleware('admin.any_permission:orders.manage,pos.void')
        ->name('orders.voucher.update');
    Route::get('/orders/{order}/edit-pos-sale', [PosController::class, 'editSale'])
        ->middleware('admin.any_permission:orders.manage,pos.void')
        ->name('orders.pos-sale.edit');
    Route::post('/orders/{order}/revise-pos-sale', [PosController::class, 'reviseSale'])
        ->middleware('admin.any_permission:orders.manage,pos.void')
        ->name('orders.pos-sale.revise');
    Route::post('/orders/{order}/cancel', [OrderController::class, 'cancel'])
        ->middleware('admin.permission:orders.cancel')
        ->name('orders.cancel');
    Route::delete('/orders/{order}', [OrderController::class, 'destroy'])
        ->middleware('admin.permission:orders.cancel')
        ->name('orders.destroy');








    Route::middleware('admin.permission:view_customers')->group(function () {
        Route::get('/credit', [CreditReportController::class, 'index'])->middleware('admin.permission:credit.manage')->name('credit.index');
        Route::get('/credit/export', [CreditReportController::class, 'export'])->middleware('admin.permission:credit.manage')->name('credit.export');
        Route::get('/credit/collections', [CreditReportController::class, 'collections'])->middleware('admin.permission:credit.manage')->name('credit.collections');
        Route::get('/customers', [CustomerController::class, 'index'])->name('customers.index');
        Route::post('/customers', [CustomerController::class, 'store'])->name('customers.store');
        Route::get('/customers/{customer}', [CustomerController::class, 'show'])->name('customers.show');
        Route::patch('/customers/{customer}', [CustomerController::class, 'update'])->name('customers.update');
        Route::delete('/customers/{customer}', [CustomerController::class, 'destroy'])->name('customers.destroy');
        Route::get('/customers/{customer}/credit-statement', [CustomerController::class, 'creditStatement'])->middleware('admin.permission:credit.manage')->name('customers.credit-statement');
        Route::patch('/customers/{customer}/credit-settings', [CustomerController::class, 'updateCreditSettings'])
            ->middleware('admin.permission:credit.manage')
            ->name('customers.credit-settings.update');
        Route::post('/customers/{customer}/credit-payments', [CustomerController::class, 'recordCreditPayment'])
            ->middleware('admin.permission:credit.manage')
            ->name('customers.credit-payments.store');
    });

    Route::middleware('admin.any_permission:view_reports,reports.sales')->group(function () {
        Route::get('/reports', [VintageBaleController::class, 'salesReport'])->name('reports.index');
        Route::get('/reports/export', [VintageBaleController::class, 'exportBales'])->name('reports.export');
    });

    Route::middleware('admin.permission:finance_book.manage')->group(function () {
        Route::get('/finance-book', [\App\Http\Controllers\Admin\FinanceBookController::class, 'index'])->name('finance-book.index');
        Route::post('/finance-book', [\App\Http\Controllers\Admin\FinanceBookController::class, 'store'])->name('finance-book.store');
        Route::post('/finance-book/counts', [\App\Http\Controllers\Admin\FinanceBookController::class, 'saveCount'])->name('finance-book.counts.store');
        Route::delete('/finance-book/funds/{fund}', [\App\Http\Controllers\Admin\FinanceBookController::class, 'destroyFund'])->whereNumber('fund')->name('finance-book.funds.destroy');
    });

    Route::middleware('admin.permission:manage_finance')->group(function () {
        Route::get('/finance', [VintageBaleController::class, 'finance'])->name('finance.index');
        Route::get('/finance/export', [VintageBaleController::class, 'exportLedger'])->name('finance.export');
        Route::post('/finance/entries', [FinanceController::class, 'store'])->name('finance.entries.store');
        Route::patch('/finance/entries/{entry}', [FinanceController::class, 'update'])->name('finance.entries.update');
        Route::delete('/finance/entries/{entry}', [FinanceController::class, 'destroy'])->name('finance.entries.destroy');
    });


    Route::get('/audit-logs', [AuditLogController::class, 'index'])
        ->middleware('admin.permission:view_audit_logs')
        ->name('audit-logs.index');

    Route::middleware('admin.permission:staff.manage')->group(function () {
        Route::get('/users', [AdminUserController::class, 'index'])->name('users.index');
        Route::post('/users', [AdminUserController::class, 'store'])->name('users.store');
        Route::patch('/users/{user}', [AdminUserController::class, 'update'])->name('users.update');
        Route::patch('/users/{user}/toggle-status', [AdminUserController::class, 'toggleStatus'])->name('users.toggle-status');
        Route::delete('/users/{user}', [AdminUserController::class, 'destroy'])->name('users.destroy');

    });

    Route::middleware('admin.permission:roles.manage')->group(function () {
        Route::get('/roles', [RoleController::class, 'index'])->name('roles.index');
        Route::post('/roles', [RoleController::class, 'store'])->name('roles.store');
        Route::patch('/roles/{role}', [RoleController::class, 'update'])->name('roles.update');
        Route::delete('/roles/{role}', [RoleController::class, 'destroy'])->name('roles.destroy');
    });

    Route::get('/locations', [LocationController::class, 'index'])
        ->middleware('admin.permission:locations.view')
        ->name('locations.index');
    Route::post('/locations', [LocationController::class, 'store'])
        ->middleware('admin.permission:locations.manage')
        ->name('locations.store');
    Route::patch('/locations/{location}', [LocationController::class, 'update'])
        ->middleware('admin.permission:locations.manage')
        ->name('locations.update');
    Route::delete('/locations/{location}', [LocationController::class, 'destroy'])
        ->middleware('admin.permission:locations.manage')
        ->name('locations.destroy');

    Route::middleware('admin.any_permission:catalog.view,catalog.manage,inventory.view,inventory.receive')->group(function () {
        Route::get('/bales', [VintageBaleController::class, 'index'])->name('bales.index');
        Route::get('/suppliers', [VintageBaleController::class, 'suppliers'])->name('suppliers.index');
        Route::get('/bales/{bale}', [VintageBaleController::class, 'show'])->name('bales.show');
        Route::get('/bales/{bale}/labels', [VintageBaleController::class, 'labels'])->name('bales.labels');
    });
    Route::middleware('admin.permission:inventory.receive')->group(function () {
        Route::post('/suppliers', [VintageBaleController::class, 'supplierStore'])->name('suppliers.store');
        Route::post('/bales', [VintageBaleController::class, 'store'])->name('bales.store');
        Route::post('/bales/{bale}/status', [VintageBaleController::class, 'transition'])->name('bales.status');
    });
    Route::post('/bales/{bale}/labels', [VintageBaleController::class, 'label'])->middleware('admin.permission:catalog.manage')->name('bales.labels.store');
    Route::get('/bale-pos/catalog', [VintageBaleController::class, 'catalog'])->middleware('admin.permission:pos.access')->name('bales.catalog');
    Route::post('/bale-pos/checkout', [VintageBaleController::class, 'checkout'])->middleware('admin.permission:pos.access')->name('bales.checkout');
    Route::post('/bale-sale-items/{item}/return', [VintageBaleController::class, 'returnItem'])->middleware('admin.permission:orders.returns')->name('bales.return');
    Route::post('/finance/refunds/{entry}/paid', [VintageBaleController::class, 'payRefund'])->middleware('admin.permission:manage_finance')->name('bales.refunds.paid');

    Route::get('/pos', [VintageBaleController::class, 'pos'])
        ->middleware('admin.permission:pos.access')->name('pos.index');
    Route::get('/pos/products/search', [PosController::class, 'products'])
        ->middleware('admin.permission:pos.access')->name('pos.products.search');
    Route::get('/pos/products/prices', [PosController::class, 'prices'])
        ->middleware('admin.permission:pos.access')->name('pos.products.prices');
    Route::get('/pos/customers/search', [PosController::class, 'customers'])
        ->middleware('admin.permission:pos.access')->name('pos.customers.search');
    Route::post('/pos/customers', [PosController::class, 'storeCustomer'])
        ->middleware('admin.permission:pos.access')->name('pos.customers.store');
    Route::post('/pos/checkout', [PosController::class, 'checkout'])
        ->middleware('admin.permission:pos.access')->name('pos.checkout');
    Route::post('/pos/held-carts', [PosController::class, 'holdCart'])
        ->middleware('admin.permission:pos.hold')->name('pos.held-carts.store');
    Route::delete('/pos/held-carts/{heldCart}', [PosController::class, 'deleteHeldCart'])
        ->middleware('admin.permission:pos.hold')->name('pos.held-carts.destroy');
    Route::get('/pos/orders/{order}/receipt', [PosController::class, 'receipt'])
        ->middleware('admin.permission:pos.access')->name('pos.orders.receipt');

    Route::get('/inventory', [VintageBaleController::class, 'index'])
        ->middleware('admin.permission:inventory.view')->name('inventory.index');
    Route::get('/inventory/export', [VintageBaleController::class, 'exportBales'])
        ->middleware('admin.permission:inventory.view')->name('inventory.export');
    Route::get('/inventory/products/search', [InventoryController::class, 'searchProducts'])
        ->name('inventory.products.search');
    Route::get('/inventory/products/{product}/export', [InventoryController::class, 'exportMovements'])
        ->middleware('admin.permission:inventory.history')->name('inventory.products.export');
    Route::get('/inventory/products/{product}', [InventoryController::class, 'show'])
        ->middleware('admin.permission:inventory.history')->name('inventory.products.show');

    Route::get('/inventory/receipts', [StockReceiptController::class, 'index'])
        ->middleware('admin.permission:inventory.receive')->name('inventory.receipts.index');
    Route::get('/inventory/receipts/create', [StockReceiptController::class, 'create'])
        ->middleware('admin.permission:inventory.receive')->name('inventory.receipts.create');
    Route::get('/inventory/receipts/import/template', [StockReceiptController::class, 'importTemplate'])
        ->middleware('admin.permission:inventory.receive')->name('inventory.receipts.import.template');
    Route::post('/inventory/receipts/import/preview', [StockReceiptController::class, 'importPreview'])
        ->middleware('admin.permission:inventory.receive')->name('inventory.receipts.import.preview');
    Route::post('/inventory/receipts', [StockReceiptController::class, 'store'])
        ->middleware('admin.permission:inventory.receive')->name('inventory.receipts.store');
    Route::get('/inventory/receipts/{receipt}', [StockReceiptController::class, 'show'])
        ->middleware('admin.permission:inventory.receive')->name('inventory.receipts.show');
    Route::post('/inventory/receipts/{receipt}/corrections', [StockReceiptController::class, 'correct'])
        ->middleware('admin.permission:inventory.receive')->name('inventory.receipts.correct');
    Route::get('/inventory/receipts/{receipt}/edit', [StockReceiptController::class, 'edit'])
        ->middleware('admin.permission:inventory.receive')->name('inventory.receipts.edit');
    Route::put('/inventory/receipts/{receipt}', [StockReceiptController::class, 'update'])
        ->middleware('admin.permission:inventory.receive')->name('inventory.receipts.update');
    Route::delete('/inventory/receipts/{receipt}', [StockReceiptController::class, 'destroy'])
        ->middleware('admin.permission:inventory.receive')->name('inventory.receipts.destroy');

    Route::get('/inventory/adjustments', [StockAdjustmentController::class, 'index'])
        ->middleware('admin.any_permission:inventory.adjust.create,inventory.adjust.approve')->name('inventory.adjustments.index');
    Route::get('/inventory/adjustments/create', [StockAdjustmentController::class, 'create'])
        ->middleware('admin.permission:inventory.adjust.create')->name('inventory.adjustments.create');
    Route::post('/inventory/adjustments', [StockAdjustmentController::class, 'store'])
        ->middleware('admin.permission:inventory.adjust.create')->name('inventory.adjustments.store');
    Route::post('/inventory/adjustments/{adjustment}/undo', [StockAdjustmentController::class, 'undo'])
        ->middleware('admin.permission:inventory.adjust.approve')->name('inventory.adjustments.undo');

    Route::get('/inventory/transfers', [StockTransferController::class, 'index'])->name('inventory.transfers.index');
    Route::get('/inventory/transfers/create', [StockTransferController::class, 'create'])
        ->middleware('admin.permission:inventory.transfer.create')->name('inventory.transfers.create');
    Route::get('/inventory/transfers/export', [StockTransferController::class, 'export'])->name('inventory.transfers.export');
    Route::post('/inventory/transfers', [StockTransferController::class, 'store'])
        ->middleware('admin.permission:inventory.transfer.create')->name('inventory.transfers.store');
    Route::get('/inventory/transfers/{transfer}', [StockTransferController::class, 'show'])->name('inventory.transfers.show');
    Route::delete('/inventory/transfers/{transfer}', [StockTransferController::class, 'destroy'])
        ->middleware('admin.permission:inventory.transfer.create')->name('inventory.transfers.destroy');

    Route::middleware('admin.permission:settings.manage')->group(function () {

        Route::post('/settings', [SettingController::class, 'update'])->middleware('admin.permission:settings.manage')->name('settings.update');
    });

    Route::post('/logout', [AuthenticatedSessionController::class, 'destroy'])->name('logout');

    Route::get('/settings', [SettingController::class, 'edit'])->name('settings.edit');
    Route::get('/profile', fn () => redirect()->route('admin.settings.edit', ['section' => 'profile']))->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::post('/profile', [ProfileController::class, 'update'])->name('profile.update.post');
    Route::put('/profile/password', [PasswordController::class, 'update'])->name('profile.password.update');
});
