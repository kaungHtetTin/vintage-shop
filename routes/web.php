<?php

use App\Http\Controllers\PublicInvoiceController;
use Illuminate\Support\Facades\Route;

// The application now serves the staff console only.
Route::get('/', fn () => redirect()->route('admin.home'))->name('home');
Route::get('/login', fn () => redirect()->route('admin.login'))->name('login');

// Shared invoice links issued by the admin order tools remain available.
Route::get('/invoices/{token}', [PublicInvoiceController::class, 'show'])->name('public.invoices.show');
