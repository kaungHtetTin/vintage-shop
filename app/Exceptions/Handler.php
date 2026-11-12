<?php

namespace App\Exceptions;

use App\Support\AdminLandingPage;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class Handler extends ExceptionHandler
{
    public function render($request, Throwable $exception)
    {
        $response = parent::render($request, $exception);
        if ($response instanceof \Illuminate\Http\JsonResponse) {
            $payload = $response->getData(true);
            if (isset($payload['message']) && is_string($payload['message'])) {
                $payload['message'] = \App\Support\UiText::get($payload['message']);
            }
            if (isset($payload['errors']) && is_array($payload['errors'])) {
                $payload['errors'] = array_map(fn ($messages) => is_array($messages)
                    ? array_map(fn ($message) => is_string($message) ? \App\Support\UiText::get($message) : $message, $messages)
                    : (is_string($messages) ? \App\Support\UiText::get($messages) : $messages), $payload['errors']);
            }
            $response->setData($payload);
        }

        return $response;
    }

    /**
     * A list of the exception types that are not reported.
     *
     * @var array<int, class-string<Throwable>>
     */
    protected $dontReport = [
        //
    ];

    /**
     * A list of the inputs that are never flashed for validation exceptions.
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register the exception handling callbacks for the application.
     *
     * @return void
     */
    public function register()
    {
        $this->renderable(fn (AuthorizationException $exception, Request $request) => $this->redirectDeniedAdminPage($request));
        $this->renderable(fn (HttpExceptionInterface $exception, Request $request) => $exception->getStatusCode() === 403
            ? $this->redirectDeniedAdminPage($request)
            : null);

        $this->renderable(function (PostTooLargeException $exception, $request) {
            $isCheckout = $request->is('checkout');
            $field = $isCheckout ? 'payment_proof' : 'file';
            $message = $isCheckout
                ? 'The payment screenshot is too large. Please upload an image no larger than 10 MB.'
                : 'The uploaded file is too large.';

            if ($request->expectsJson()) {
                return response()->json([
                    'message' => $message,
                    'errors' => [$field => [$message]],
                ], 413);
            }

            return back()->withErrors([$field => $message]);
        });

        $this->reportable(function (Throwable $e) {
            //
        });
    }

    private function redirectDeniedAdminPage(Request $request): ?RedirectResponse
    {
        $user = $request->user();

        if (! $request->isMethod('GET')
            || ! $request->is('admin', 'admin/*')
            || ! $user?->isAdminStaff()
            || $user->status !== 'active'
            || ($request->expectsJson() && $request->header('X-SPA') !== 'true')) {
            return null;
        }

        $fallback = AdminLandingPage::path($user);
        $currentPath = '/'.trim($request->path(), '/');
        if ($currentPath === parse_url($fallback, PHP_URL_PATH)
            && $request->getQueryString() === (parse_url($fallback, PHP_URL_QUERY) ?: null)) {
            $fallback = '/admin/settings?section=profile';
        }

        if ($currentPath === '/admin/settings' && $request->query('section') === 'profile') {
            return null;
        }

        return redirect($fallback)->with('error', 'You do not have permission to view that page.');
    }
}
