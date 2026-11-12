<?php

namespace Tests\Feature;

use App\Models\{Category, Product, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class LegacyProductRemovalTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_catalog_editor_import_export_and_barcode_pages_are_unavailable(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super_admin', 'status' => 'active']));

        foreach ([
            '/admin/products',
            '/admin/products?q=garment&category_id=1&page=2',
            '/admin/products/create',
            '/admin/products/1/edit',
            '/admin/products/import',
            '/admin/products/import/template',
            '/admin/products/import/unit-prices/template',
            '/admin/products/export',
            '/admin/products/barcodes',
            '/admin/products/barcode/generate',
        ] as $path) {
            $this->getJson($path)->assertNotFound();
        }
    }

    public function test_removed_endpoints_cannot_create_change_or_delete_historical_products(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super_admin', 'status' => 'active']));
        $category = Category::create(['name' => 'Historical', 'slug' => 'historical', 'is_active' => true]);
        $product = Product::create([
            'category_id' => $category->id,
            'name' => 'Historical garment',
            'slug' => 'historical-garment',
            'original_price' => 1000,
            'status' => 'active',
            'is_active' => true,
        ]);
        $count = Product::count();

        $this->postJson('/admin/products', ['name' => 'Unwanted product'])->assertNotFound();
        foreach (['post', 'put', 'patch', 'delete'] as $method) {
            $this->json($method, '/admin/products/'.$product->id, ['name' => 'Changed garment'])->assertNotFound();
        }
        $this->patchJson('/admin/products/'.$product->id.'/toggle-status')->assertNotFound();

        $this->assertDatabaseCount('products', $count);
        $this->assertDatabaseHas('products', [
            'id' => $product->id,
            'name' => 'Historical garment',
            'original_price' => 1000,
            'status' => 'active',
            'is_active' => true,
        ]);
    }

    public function test_removed_imports_do_not_accept_uploads_or_create_products(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super_admin', 'status' => 'active']));
        $count = Product::count();

        foreach ([
            ['/admin/products/import', 'file'],
            ['/admin/products/import/unit-prices', 'unit_price_file'],
        ] as [$path, $field]) {
            $this->post($path, [
                $field => UploadedFile::fake()->createWithContent('products.csv', "name,price\nUnwanted product,1000\n"),
            ])->assertNotFound();
        }

        $this->assertDatabaseCount('products', $count);
    }
}
