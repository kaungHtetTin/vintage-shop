import { CrudAction } from './CrudModal';
import { useForm, usePage } from '@/spa/router';
import { routeWithBase } from '@/Utils/url';
import { usePhraseTranslation } from '@/Utils/i18n';
import { formatMoney } from '@/Utils/pricing';

export default function CorrectCreditPayment({ entry, customerId }) {
    const t = usePhraseTranslation();
    const { app_base } = usePage().props;
    const defaults = () => ({ request_key: crypto.randomUUID(), amount: Math.abs(Number(entry.amount)), tender_type: entry.tender_type || 'cash', reference: '', reason: '' });
    const form = useForm(defaults());
    if (!entry.can_correct) return null;
    const maximum = Math.max(0, Number(entry.order.final_amount) - Number(entry.order.paid_amount) + Math.abs(Number(entry.amount)));
    const methods = { cash: 'Cash', mmqr: 'MMQR (Pay)', card: 'Card', mobile: 'Mobile payment', bank_transfer: 'Bank transfer' };
    return <CrudAction title={t('Correct payment')} form={form} className="btn secondary small" onOpen={() => form.setData(defaults())}>
        <form onSubmit={event => {
            event.preventDefault();
            form.post(routeWithBase(`/admin/customers/${customerId}/credit-payments/${entry.id}/correct`, app_base), { preserveScroll: true });
        }}>
            <p><strong>{entry.transaction_number}</strong> · {entry.order.order_number}</p>
            <p>{t('Original payment')}: <strong>{formatMoney(Math.abs(Number(entry.amount)))}</strong></p>
            <p>{t('This reverses the selected payment allocation and records its replacement. Other invoice allocations stay unchanged.')}</p>
            <div className="crud-grid">
                <label className="form-field"><span>{t('Correct amount')}</span>
                    <input autoFocus required type="number" min="0.01" max={maximum} step="0.01" value={form.data.amount} onChange={event => form.setData('amount', event.target.value)} />
                </label>
                <label className="form-field"><span>{t('Payment method')}</span>
                    <select value={form.data.tender_type} onChange={event => form.setData('tender_type', event.target.value)}>
                        {['cash', 'mmqr', ...(!['cash', 'mmqr'].includes(entry.tender_type) ? [entry.tender_type] : [])].filter(Boolean).map(method => <option key={method} value={method}>{t(methods[method] || method)}</option>)}
                    </select>
                </label>
            </div>
            <label className="form-field"><span>{t('Reference (optional)')}</span><input maxLength={100} value={form.data.reference} onChange={event => form.setData('reference', event.target.value)} /></label>
            <label className="form-field"><span>{t('Correction reason')}</span><textarea required maxLength={500} rows={3} value={form.data.reason} onChange={event => form.setData('reason', event.target.value)} /></label>
            <button className="btn primary" disabled={form.processing}>{t(form.processing ? 'Saving...' : 'Reverse and replace')}</button>
        </form>
    </CrudAction>;
}

export function CreditCorrectionNotes({ entry }) {
    const t = usePhraseTranslation();
    return <>
        {entry.reversal && <small>{t('Corrected')} · {entry.replacement?.transaction_number}</small>}
        {entry.metadata?.original_transaction && <small>{t(entry.type === 'payment_reversal' ? 'Reverses payment' : 'Replaces payment')} · {entry.metadata.original_transaction}</small>}
        {entry.notes && <small>{entry.notes}</small>}
        {entry.metadata?.reference && <small>{entry.metadata.reference}</small>}
    </>;
}
