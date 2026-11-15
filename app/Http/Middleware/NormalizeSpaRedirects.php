<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class NormalizeSpaRedirects
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // 302 preserves PATCH/PUT/DELETE in fetch and XHR. A saved form must
        // open its destination with GET, never repeat the write on that URL.
        if (($request->headers->has('X-SPA') || $request->ajax())
            && ! $request->isMethodSafe() && $response->getStatusCode() === 302) {
            $response->setStatusCode(303);
        }

        return $response;
    }
}
