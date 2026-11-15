import { CrudAction } from '@/Components/Admin/CrudModal';
import { useForm } from '@/spa/router';
import { usePhraseTranslation } from '@/Utils/i18n';
import { day, useBales } from './shared';

export default function EditBaleModal({ bale, suppliers }) {
    const t = usePhraseTranslation();
    const { href } = useBales();
    const values = () => ({
        code: bale.code,
        supplier_id: bale.supplier_id,
        purchased_at: bale.purchased_at?.slice(0, 10) || '',
        purchase_cost: bale.purchase_cost,
        purchase_payment_method: bale.purchase_payment_method,
        laundry_cost: bale.laundry_cost,
        laundry_payment_method: bale.laundry_payment_method,
        total_pieces: bale.total_pieces ?? '',
        notes: bale.notes || '',
        edit_token: bale.edit_token,
    });
    const form = useForm(values());
    return <CrudAction title={t('Edit bale')} form={form} wide onOpen={() => form.setData(values())}>
        <form className="admin-modal-form" onSubmit={event => {
            event.preventDefault();
            form.patch(href(`/admin/bales/${bale.id}`), { preserveScroll: true });
        }}>
            <div className="bale-form-grid">
                <label className="form-field"><span>{t('Bale code')}</span>
                    <input required maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" value={form.data.code} onChange={event => form.setData('code', event.target.value)} />
                </label>
                <label className="form-field"><span>{t('Supplier')}</span>
                    <select required value={form.data.supplier_id} onChange={event => form.setData('supplier_id', event.target.value)}>
                        {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </select>
                </label>
                <label className="form-field"><span>{t('Purchase date')}</span>
                    <input required type="date" max={day()} value={form.data.purchased_at} onChange={event => form.setData('purchased_at', event.target.value)} />
                </label>
                <label className="form-field"><span>{t('Garments received')}</span>
                    <input type="number" min="1" max="1000000" step="1" disabled={bale.status === 'closed'} placeholder={t('Leave blank if not counted')} value={form.data.total_pieces} onChange={event => form.setData('total_pieces', event.target.value)} />
                    {bale.status === 'closed' && <small>{t('The garment count is fixed after a bale is finished.')}</small>}
                </label>
                {['purchase', 'laundry'].map(prefix => <div key={prefix} className="form-field">
                    <label className="form-field"><span>{t(prefix === 'purchase' ? 'Purchase cost' : 'Laundry cost')}</span>
                        <input required type="number" min={prefix === 'purchase' ? '0.01' : '0'} max="999999999.99" step="0.01" value={form.data[`${prefix}_cost`]} onChange={event => form.setData(`${prefix}_cost`, event.target.value)} />
                    </label>
                    <label className="form-field"><span>{t(prefix === 'purchase' ? 'Purchase paid using' : 'Laundry paid using')}</span>
                        <select value={form.data[`${prefix}_payment_method`]} onChange={event => form.setData(`${prefix}_payment_method`, event.target.value)}>
                            <option value="cash">{t('Cash drawer')}</option><option value="mmqr">{t('MMQR / bank')}</option>
                        </select>
                    </label>
                </div>)}
            </div>
            <label className="form-field"><span>{t('Notes')}</span>
                <textarea rows={3} maxLength={2000} value={form.data.notes} onChange={event => form.setData('notes', event.target.value)} />
            </label>
            <p>{t('Cost corrections update the finance records. Recorded sales keep their original prices and costs.')}</p>
            <button className="btn primary" disabled={form.processing}>{t(form.processing ? 'Saving...' : 'Save changes')}</button>
        </form>
    </CrudAction>;
}
