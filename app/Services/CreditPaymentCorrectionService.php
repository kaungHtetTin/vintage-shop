<?php

namespace App\Services;

use App\Models\{CustomerCreditTransaction, FinancialEntry, Order, Payment, User};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CreditPaymentCorrectionService
{
    public function __construct(private CustomerCreditService $credit, private AuditLogService $audit) {}

    public function correct(User $customer, CustomerCreditTransaction $transaction, array $data, User $actor): CustomerCreditTransaction
    {
        return DB::transaction(function () use ($customer, $transaction, $data, $actor) {
            $customer = User::whereKey($customer->id)->lockForUpdate()->firstOrFail();
            $order = Order::whereKey($transaction->order_id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->hasAdminPermission('credit.manage') && ($actor->isSuperAdmin() || in_array($order->location_id, $actor->accessibleLocationIds())), 403);
            $original = CustomerCreditTransaction::whereKey($transaction->id)->where('customer_id', $customer->id)->lockForUpdate()->firstOrFail();
            abort_unless((int) $order->user_id === (int) $customer->id, 404);
            $amount = round((float) $data['amount'], 2);
            $reason = trim($data['reason']);
            $hash = hash('sha256', json_encode([$original->id, number_format($amount, 2, '.', ''), $data['tender_type'], $data['reference'] ?? null, $reason]));
            $existing = $original->reversal()->first();
            if ($existing) {
                if ($existing->created_by === $actor->id && $existing->correction_key === $data['request_key'] && ($existing->metadata['request_hash'] ?? null) === $hash) return $original->replacement()->firstOrFail();
                throw ValidationException::withMessages(['payment' => \App\Support\UiText::get('This payment was already corrected. Reload the history before continuing.')]);
            }
            if (CustomerCreditTransaction::where('correction_key', $data['request_key'])->exists()) {
                throw ValidationException::withMessages(['request_key' => \App\Support\UiText::get('This correction request was already used. Reopen the form before continuing.')]);
            }
            $payment = Payment::whereKey($original->payment_id)->lockForUpdate()->first();
            if ($original->type !== 'payment' || ! $payment || $payment->status !== 'paid'
                || ! ($payment->payment_details['credit_repayment'] ?? false)
                || (int) $payment->order_id !== (int) $order->id
                || abs((float) $payment->amount + (float) $original->amount) > .009) {
                throw ValidationException::withMessages(['payment' => \App\Support\UiText::get('Only recorded credit repayments can be corrected here.')]);
            }
            if ($order->status === 'cancelled' || $order->returns()->exists()) {
                throw ValidationException::withMessages(['payment' => \App\Support\UiText::get('Payments on cancelled or returned orders cannot be corrected.')]);
            }
            $paid = round((float) $order->paid_amount - (float) $payment->amount + $amount, 2);
            if ($paid < 0 || $paid > (float) $order->final_amount + .009 || $amount > $this->credit->balance($customer) + (float) $payment->amount + .009) {
                throw ValidationException::withMessages(['amount' => \App\Support\UiText::get('The replacement exceeds the outstanding balance for this invoice.')]);
            }
            $metadata = ['original_transaction' => $original->transaction_number, 'reason' => $reason, 'request_hash' => $hash];
            $reversal = $this->credit->reversePayment($customer, $original, $actor, $reason, ['correction_key' => $data['request_key'], 'metadata' => $metadata]);
            $payment->update(['status' => 'reversed', 'payment_details' => array_merge($payment->payment_details ?? [], ['reversal_transaction_id' => $reversal->id, 'reversed_by' => $actor->id, 'reversed_at' => now()->toIso8601String(), 'reversal_reason' => $reason])]);
            $reference = 'CRFIX-'.now()->format('ymd').'-'.Str::upper(Str::random(8));
            $replacementPayment = Payment::create([
                'order_id' => $order->id, 'received_by' => $actor->id, 'transaction_id' => $reference,
                'amount' => $amount, 'amount_tendered' => $amount, 'change_due' => 0,
                'method' => $data['tender_type'], 'tender_type' => $data['tender_type'], 'status' => 'paid',
                'payment_details' => ['credit_repayment' => true, 'batch_reference' => $reference, 'replaces_payment_id' => $payment->id, 'reference' => $data['reference'] ?? null, 'notes' => $reason],
            ]);
            $replacement = $this->credit->recordPayment($customer, $order, $replacementPayment, $actor, $reason);
            $replacement->update(['replacement_for_id' => $original->id, 'metadata' => $metadata + ['reversal_transaction' => $reversal->transaction_number, 'reference' => $data['reference'] ?? null]]);
            $order->update(['paid_amount' => $paid, 'payment_status' => $paid + .009 >= (float) $order->final_amount ? 'paid' : ($paid > 0 ? 'partially_paid' : 'unpaid')]);

            // Keep the original receipt/batch intact. Signed income adjustments
            // reverse its allocation without inventing an operating expense.
            foreach ([[$reference.'-REV', -(float) $payment->amount, $payment->tender_type, 'Credit payment reversal'], [$reference, $amount, $data['tender_type'], 'Credit payment replacement']] as [$ref, $value, $method, $title]) {
                FinancialEntry::create(['recorded_by' => $actor->id, 'location_id' => $order->location_id, 'type' => 'income', 'category' => FinancialEntry::CATEGORY_POS_SALE, 'title' => $title.' '.$original->transaction_number, 'amount' => $value, 'entry_date' => now()->toDateString(), 'payment_method' => $method, 'reference' => $ref, 'status' => 'approved', 'notes' => $reason]);
            }
            $this->audit->record('customer.credit.payment_corrected', $original, ['customer_id' => $customer->id, 'order_id' => $order->id, 'original_amount' => (float) $payment->amount, 'replacement_amount' => $amount, 'reason' => $reason, 'reversal_id' => $reversal->id, 'replacement_id' => $replacement->id, 'balance' => $this->credit->balance($customer)]);
            return $replacement->fresh();
        }, 3);
    }
}
