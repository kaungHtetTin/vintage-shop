<?php

namespace Tests\Feature;

use Tests\TestCase;

class ClientShopRemovalTest extends TestCase
{
    public function test_project_entry_points_redirect_to_the_admin_console(): void
    {
        $this->get('/')->assertRedirect('/admin');
        $this->get('/login')->assertRedirect('/admin/login');
        $this->get('/admin')->assertRedirect('/admin/login');
    }

    public function test_customer_shop_pages_are_unavailable(): void
    {
        foreach ([
            '/products', '/products/example', '/categories', '/categories/example',
            '/blogs', '/blogs/example', '/buying-guide', '/cart', '/wishlist',
            '/checkout', '/orders', '/orders/1', '/my-credit', '/my-credit/statement',
            '/profile', '/chat', '/register', '/forgot-password', '/reset-password/token',
            '/auth/google', '/auth/google/callback', '/manifest.webmanifest',
            '/admin/storefront',
        ] as $path) {
            $this->get($path)->assertNotFound();
        }
    }

    public function test_customer_mutation_and_chat_endpoints_are_unavailable(): void
    {
        foreach ([
            '/login', '/register', '/checkout', '/checkout/quote',
            '/cart/selling-units', '/products/example/reviews', '/admin/storefront',
            '/api/messages/send', '/api/messages/upload-image',
        ] as $path) {
            // /login remains a GET-only redirect for old bookmarks.
            $this->postJson($path)->assertStatus($path === '/login' ? 405 : 404);
        }

        foreach (['/api/chats', '/api/chats/1/messages', '/api/messages/latest'] as $path) {
            $this->getJson($path)->assertNotFound();
        }
    }
}
