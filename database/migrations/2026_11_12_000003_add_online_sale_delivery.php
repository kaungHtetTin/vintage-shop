<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->boolean('is_online_sale')->default(false)->index();
            $table->timestamp('delivered_at')->nullable();
            $table->foreignId('delivered_by')->nullable()->constrained('users')->nullOnDelete();
        });
        DB::table('orders')->where('sales_channel', 'online')->update(['is_online_sale' => true]);
        DB::table('orders')->where('is_online_sale', true)->whereIn('status', ['delivered', 'completed'])->update([
            'delivered_at' => DB::raw('COALESCE(status_updated_at, created_at, CURRENT_TIMESTAMP)'),
        ]);
        DB::table('orders')->whereIn('status', ['processing', 'shipped', 'delivered'])->update(['status' => 'completed']);
    }

    public function down(): void
    {
        if (DB::table('orders')->where('is_online_sale', true)->exists()) {
            throw new RuntimeException('Cannot remove delivery details while online sales exist.');
        }
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('delivered_by');
            $table->dropColumn(['is_online_sale', 'delivered_at']);
        });
    }
};
