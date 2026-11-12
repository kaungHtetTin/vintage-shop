<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Spa;

class DashboardController extends Controller
{
    public function uiShowcase()
    {
        return Spa::render('Admin/UiShowcase');
    }
}
