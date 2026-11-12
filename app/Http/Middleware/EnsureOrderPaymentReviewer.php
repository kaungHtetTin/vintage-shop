<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class EnsureOrderPaymentReviewer
{
    /**
     * @param  \Closure(\Illuminate\Http\Request): (\Illuminate\Http\Response|\Illuminate\Http\RedirectResponse)  $next
     */
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();

        if (! $user?->hasAdminPermission('orders.review_payment')) {
            if ($request->expectsJson() || $request->wantsJson()) {
                return response()->json(['message' => \App\Support\UiText::get('You do not have permission to review order payments.')], 403);
            }

            abort(403, \App\Support\UiText::get('You do not have permission to review order payments.'));
        }

        return $next($request);
    }
}
