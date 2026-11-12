<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VintageSupplier extends Model
{
    protected $fillable = ['name', 'phone', 'notes'];
    public function bales() { return $this->hasMany(VintageBale::class, 'supplier_id'); }
}
