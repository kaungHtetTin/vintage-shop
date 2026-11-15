<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerCreditTransaction extends Model
{
    protected $fillable = [
        'transaction_number', 'customer_id', 'order_id', 'payment_id', 'register_id',
        'shift_id', 'created_by', 'type', 'amount', 'balance_after', 'tender_type',
        'reference', 'due_date', 'notes', 'metadata',
        'reversal_of_id', 'replacement_for_id', 'correction_key',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'balance_after' => 'decimal:2',
        'due_date' => 'date',
        'metadata' => 'array',
    ];

    public function customer(): BelongsTo { return $this->belongsTo(User::class, 'customer_id'); }
    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function payment(): BelongsTo { return $this->belongsTo(Payment::class); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
    public function reversal() { return $this->hasOne(self::class, 'reversal_of_id'); }
    public function replacement() { return $this->hasOne(self::class, 'replacement_for_id'); }

    public function scopeWithCorrectionDetails($query)
    {
        return $query->with([
            'order' => fn ($orders) => $orders->select(['id', 'order_number', 'receipt_number', 'location_id', 'status', 'final_amount', 'paid_amount'])->withCount('returns'),
            'payment:id,status,payment_details',
            'reversal:id,reversal_of_id,transaction_number,notes,created_at,created_by',
            'replacement:id,replacement_for_id,transaction_number,amount',
        ]);
    }

    public function canBeCorrectedBy(User $actor): bool
    {
        return $actor->hasAdminPermission('credit.manage') && $this->type === 'payment'
            && $this->payment?->status === 'paid' && ($this->payment->payment_details['credit_repayment'] ?? false)
            && ! $this->reversal && $this->order && $this->order->status !== 'cancelled'
            && ! $this->order->returns_count
            && ($actor->isSuperAdmin() || in_array($this->order->location_id, $actor->accessibleLocationIds()));
    }
}
