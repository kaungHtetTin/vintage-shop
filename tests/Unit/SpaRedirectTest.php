<?php

namespace Tests\Unit;

use App\Http\Middleware\NormalizeSpaRedirects;
use Illuminate\Http\Request;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\RedirectResponse;

class SpaRedirectTest extends TestCase
{
    public function test_ajax_writes_redirect_to_a_get_without_repeating_the_mutation(): void
    {
        foreach (['POST', 'PUT', 'PATCH', 'DELETE'] as $method) {
            foreach (['HTTP_X_SPA' => 'true', 'HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest'] as $header => $value) {
                $request = Request::create('/admin/locations/1', $method, [], [], [], [$header => $value]);
                $response = (new NormalizeSpaRedirects)->handle($request, fn () => new RedirectResponse('/admin/locations'));
                $this->assertSame(303, $response->getStatusCode(), $method);
                $this->assertSame('/admin/locations', $response->headers->get('Location'));
            }
        }
    }

    public function test_get_and_explicit_redirect_semantics_are_preserved(): void
    {
        foreach ([['GET', 302, true], ['PATCH', 307, true], ['PATCH', 303, true], ['POST', 302, false]] as [$method, $status, $spa]) {
            $request = Request::create('/admin/locations/1', $method, [], [], [], $spa ? ['HTTP_X_SPA' => 'true'] : []);
            $response = (new NormalizeSpaRedirects)->handle($request, fn () => new RedirectResponse('/admin/locations', $status));
            $this->assertSame($status, $response->getStatusCode());
        }
    }
}
