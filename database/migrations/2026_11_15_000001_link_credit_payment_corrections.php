<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('customer_credit_transactions', function (Blueprint $table) {
            $table->foreignId('reversal_of_id')->nullable()->unique()->constrained('customer_credit_transactions')->restrictOnDelete();
            $table->foreignId('replacement_for_id')->nullable()->unique()->constrained('customer_credit_transactions')->restrictOnDelete();
            $table->uuid('correction_key')->nullable()->unique();
        });
    }

    public function down(): void
    {
        Schema::table('customer_credit_transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reversal_of_id');
            $table->dropConstrainedForeignId('replacement_for_id');
            $table->dropColumn('correction_key');
        });
    }
};
