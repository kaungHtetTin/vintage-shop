<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('held_carts', function (Blueprint $table) {
            $table->unsignedBigInteger('pos_register_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        if (DB::table('held_carts')->whereNull('pos_register_id')->exists()) {
            throw new RuntimeException('Cannot require a register while branch-based held carts exist.');
        }
        Schema::table('held_carts', function (Blueprint $table) {
            $table->unsignedBigInteger('pos_register_id')->nullable(false)->change();
        });
    }
};
