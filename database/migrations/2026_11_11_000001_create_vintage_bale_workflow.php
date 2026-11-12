<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('vintage_suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('phone', 50)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
        Schema::create('vintage_bales', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->uuid('purchase_key')->unique();
            $table->string('purchase_hash', 64);
            $table->foreignId('supplier_id')->constrained('vintage_suppliers')->restrictOnDelete();
            $table->foreignId('location_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->date('purchased_at');
            $table->decimal('purchase_cost', 14, 2);
            $table->decimal('laundry_cost', 14, 2)->default(0);
            $table->string('purchase_payment_method', 20)->default('cash');
            $table->string('laundry_payment_method', 20)->default('cash');
            $table->unsignedInteger('total_pieces')->nullable();
            $table->string('status', 20)->default('purchased')->index();
            $table->timestamp('laundry_started_at')->nullable();
            $table->timestamp('ready_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
        Schema::create('vintage_price_labels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bale_id')->constrained('vintage_bales')->restrictOnDelete();
            $table->foreignId('product_unit_id')->unique()->constrained()->restrictOnDelete();
            $table->string('barcode', 30)->unique();
            $table->decimal('price', 14, 2);
            $table->timestamps();
            $table->unique(['bale_id', 'price']);
        });
        Schema::table('financial_entries', function (Blueprint $table) {
            $table->foreignId('bale_id')->nullable()->constrained('vintage_bales')->restrictOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained('pos_shifts')->restrictOnDelete();
        });
        Schema::table('order_returns', function (Blueprint $table) {
            $table->uuid('request_key')->nullable()->unique();
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->uuid('bale_checkout_key')->nullable()->unique();
            $table->string('bale_checkout_hash', 64)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('orders', fn (Blueprint $table) => $table->dropColumn(['bale_checkout_key', 'bale_checkout_hash']));
        Schema::table('order_returns', fn (Blueprint $table) => $table->dropColumn('request_key'));
        Schema::table('financial_entries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('bale_id');
            $table->dropConstrainedForeignId('shift_id');
        });
        Schema::dropIfExists('vintage_price_labels');
        Schema::dropIfExists('vintage_bales');
        Schema::dropIfExists('vintage_suppliers');
    }
};
