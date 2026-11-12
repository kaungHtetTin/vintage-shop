<?php

namespace App\Http\Middleware;

use App\Support\AdminLandingPage;
use Closure;
use Illuminate\Http\Request;

class EnsureAdminPermission
{
    public function handle(Request $request, Closure $next, string $permission)
    {
        $user = $request->user();

        if (
            $user
            && $user->status === 'active'
            && $user->hasAdminPermission($permission)
        ) {
            return $next($request);
        }

        if ($user && $request->isMethod('GET') && $request->routeIs('admin.dashboard') && $request->header('X-SPA') === 'true') {
            return redirect(AdminLandingPage::path($user));
        }

        if ($request->expectsJson() || $request->wantsJson()) {
            return response()->json(['message' => \App\Support\UiText::get('You do not have permission for this admin action.')], 403);
        }

        abort(403, \App\Support\UiText::get('You do not have permission for this admin action.'));
    }
}
