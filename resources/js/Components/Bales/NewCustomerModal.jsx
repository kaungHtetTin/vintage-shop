import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { useId, useState } from 'react';
import CrudModal from '@/Components/Admin/CrudModal';
import { useBales } from './shared';

export default function NewCustomerModal({ open, onClose, onCreated }) {
    const uiText = useUiTranslation();
    const { href, can } = useBales();
    const canManageCredit = can("credit.manage");
    const formId = useId();
    const [data, setData] = useState({ name: '', phone: '', default_address: '', credit_limit: '', credit_terms_days: 30 });
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const submit = async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setErrors({});
        try {
            const response = await window.axios.post(href('/admin/pos/customers'), {
                name: data.name.trim(), phone: data.phone.trim() || null, default_address: data.default_address.trim() || null,
                ...(canManageCredit ? { credit_limit: data.credit_limit || 0, credit_terms_days: data.credit_terms_days } : {}),
            });
            onCreated(response.data.customer);
            setData({ name: '', phone: '', default_address: '', credit_limit: '', credit_terms_days: 30 });
            onClose();
        } catch (exception) {
            setErrors(exception.response?.data?.errors || { form: [exception.response?.data?.message || 'Could not save the customer. Please try again.'] });
        } finally { setBusy(false); }
    };
    return <CrudModal open={open} onClose={() => { setErrors({}); onClose(); }} title={uiText("Add new customer")} busy={busy}
        action={<button type="submit" form={formId} className="btn primary" disabled={busy}>{uiText(busy ? 'Saving...' : 'Save customer')}</button>}>
        <form id={formId} onSubmit={submit}>
            {Object.entries(errors).map(([key, messages]) => <p className="bale-error" role="alert" key={key}>{[].concat(messages).join(' ')}</p>)}
            <label className="form-field"><span>{uiText("Customer name")}</span><input aria-label={uiText("Customer name")} autoFocus required maxLength={255} value={data.name} disabled={busy} onChange={(event) => setData({ ...data, name: event.target.value })} /></label>

            <label className="form-field"><span>{uiText("Phone (optional)")}</span><input aria-label={uiText("Customer phone")} type="tel" maxLength={30} value={data.phone} disabled={busy} onChange={(event) => setData({ ...data, phone: event.target.value })} /></label>
            <label className="form-field"><span>{uiText("Address (optional)")}</span><textarea aria-label={uiText("Customer address")} rows={2} maxLength={1000} value={data.default_address} disabled={busy} onChange={(event) => setData({ ...data, default_address: event.target.value })} /></label>
            {canManageCredit && <div className="crud-grid">
                <label className="form-field"><span>{uiText("Credit limit")}</span><input aria-label={uiText("Customer credit limit")} type="number" min="0" step="0.01" max="999999999999.99" placeholder="0" value={data.credit_limit} disabled={busy} onChange={(event) => setData({ ...data, credit_limit: event.target.value })} /></label>
                <label className="form-field"><span>{uiText("Terms (days)")}</span><input aria-label={uiText("Customer credit terms")} type="number" required min="1" max="365" value={data.credit_terms_days} disabled={busy} onChange={(event) => setData({ ...data, credit_terms_days: event.target.value })} /></label>
            </div>}
            
        </form>
    </CrudModal>;
}
