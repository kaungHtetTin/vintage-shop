<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VintageBale extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['purchased_at' => 'date', 'purchase_cost' => 'decimal:2', 'laundry_cost' => 'decimal:2', 'total_pieces' => 'integer', 'ready_at' => 'datetime', 'closed_at' => 'datetime', 'laundry_started_at' => 'datetime'];
    public function supplier() { return $this->belongsTo(VintageSupplier::class, 'supplier_id'); }
    public function location() { return $this->belongsTo(Location::class); }
    public function product() { return $this->belongsTo(Product::class); }
    public function labels() { return $this->hasMany(VintagePriceLabel::class, 'bale_id')->orderBy('price'); }
    public function entries() { return $this->hasMany(FinancialEntry::class, 'bale_id'); }
}
