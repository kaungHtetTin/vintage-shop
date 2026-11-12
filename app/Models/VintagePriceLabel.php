<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VintagePriceLabel extends Model
{
    protected $guarded = ['id'];
    protected $casts = ['price' => 'decimal:2'];
    public function bale() { return $this->belongsTo(VintageBale::class, 'bale_id'); }
    public function unit() { return $this->belongsTo(ProductUnit::class, 'product_unit_id'); }
}
