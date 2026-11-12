<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class EnsureAnyAdminPermission
{
    public function handle(Request $request, Closure $next, string ...$permissions)
    {
        $user = $request->user();

        if ($user && $user->status === 'active') {
            foreach ($permissions as $permission) {
                if ($user->hasAdminPermission($permission)) {
                    return $next($request);
                }
            }
        }

        if ($request->expectsJson() || $request->wantsJson()) {
            return response()->json(['message' => \App\Support\UiText::get('You do not have permission for this admin action.')], 403);
        }

        abort(403, \App\Support\UiText::get('You do not have permission for this admin action.'));
    }
}
