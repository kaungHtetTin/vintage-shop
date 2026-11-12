import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { formatDate as displayformatDate } from '@/Utils/dateTime';
import AdminFilterDrawer, { filterOptions } from '@/Components/Admin/AdminFilterDrawer';
import CrudModal from '@/Components/Admin/CrudModal';
import { confirmCrud } from '@/Components/Admin/CrudConfirm';
import { useState } from 'react';
import { Head, useForm, usePage, router } from '@/spa/router';
import AdminLayout from '@/Layouts/AdminLayout';
import Icon from '@/Components/Admin/icons';
import AdminPagination from '@/Components/Admin/AdminPagination';
import { PanelHeading } from '@/Components/Admin/shared';
import { AdminFlash } from '@/Components/Admin/AdminFlash';
import { routeWithBase } from '@/Utils/url';
import { formatMoney } from '@/Utils/pricing';
import { usePhraseTranslation } from '@/Utils/i18n';

export default function FinanceBook({ books, funds, locations = [], filters = {} }) {
    const uiText = useUiTranslation();
    const { app_base, flash } = usePage().props;
    const t = usePhraseTranslation();
    const [selected, setSelected] = useState(null);
    const [mode, setMode] = useState('fund');
    const [deletingFundId, setDeletingFundId] = useState(null);
    const [deleteError, setDeleteError] = useState('');
    const [deleteSuccess, setDeleteSuccess] = useState('');

    const form = useForm({ location_id: '', entry_date: '', amount: '', notes: '' });
    const open = (book, nextMode = 'fund') => { setMode(nextMode); form.clearErrors(); form.setData({ location_id: book.id, entry_date: filters.date, amount: nextMode === 'count' ? (book.actual_balance ?? '') : '', notes: nextMode === 'count' ? (book.count_notes || '') : '' }); setSelected(book); };
    const submit = (event) => { event.preventDefault(); form.transform((data) => mode === 'count' ? { location_id: data.location_id, entry_date: data.entry_date, actual_balance: data.amount, notes: data.notes } : data); form.post(routeWithBase(mode === 'count' ? '/admin/finance-book/counts' : '/admin/finance-book', app_base), { preserveScroll: true, onSuccess: () => { setSelected(null); form.reset(); } }); };
    const removeFund = async (fund) => {
        if (!await confirmCrud(t('Delete this funding record for :branch on :date?', { branch: fund.branch_name, date: fund.entry_date }))) return;
        setDeleteError('');
        setDeleteSuccess('');
        setDeletingFundId(fund.id);
        router.delete(routeWithBase(`/admin/finance-book/funds/${fund.id}`, app_base), {
            preserveScroll: true,
            onSuccess: (response) => {
                const message = t(response?.message || 'Funding record deleted.');
                router.reload({ preserveScroll: true, showSkeleton: false, onSuccess: () => setDeleteSuccess(message) });
            },
            onError: (errors) => setDeleteError(errors?.fund || Object.values(errors || {})[0] || t('Unable to delete this funding record.')),
            onFinish: () => setDeletingFundId(null),
        });
    };

    return <AdminLayout title={t('Finance book')} eyebrow={t('Branch expense funds')} contentClassName="finance-book-page" action={<AdminFilterDrawer filters={filters} fields={[{key:'location_id',label:'Store',type:'select',options:filterOptions(locations,'All stores')},{key:'date',label:'Date',type:'date',required:true}]} onApply={values=>router.get(routeWithBase('/admin/finance-book',app_base),values,{preserveState:true,preserveScroll:true,replace:true})} onReset={()=>router.get(routeWithBase('/admin/finance-book',app_base),{},{preserveState:true,preserveScroll:true,replace:true})}/>}>
        <Head title={t('Finance book')} />
        <AdminFlash flash={{ success: deleteSuccess || flash?.success }} errors={{ ...form.errors, ...(deleteError ? { fund: deleteError } : {}) }} />
        <section className="panel glass"></section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
            {(books?.data || []).map((book) => <section key={book.id} className="panel glass">
                <div className="panel-heading"><div><small className="muted">{book.code}</small><h2>{book.name}</h2></div><button className="btn primary" type="button" onClick={() => open(book)}>{t('Add expense fund')}</button></div>
                {[['Funds added', book.capital], ['Approved expenses', book.expenses], ['Available balance', book.balance]].map(([label, amount]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}><span className="muted">{t(label)}</span><strong style={{ color: amount < 0 ? 'var(--color-danger)' : undefined }}>{formatMoney(amount)}</strong></div>)}
                {[['Actual cash balance', book.actual_balance], ['Difference', book.actual_balance === null ? null : Number(book.actual_balance) - Number(book.balance)]].map(([label, amount]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0' }}><span className="muted">{t(label)}</span><strong style={{ color: label === 'Difference' && amount !== null && amount !== 0 ? 'var(--color-danger)' : undefined }}>{uiText(amount === null ? t('Not recorded') : formatMoney(amount))}</strong></div>)}
                <div className="finance-book-card-actions">
                    <button type="button" className="btn secondary" onClick={() => open(book, 'count')}>{t('Record actual cash')}</button>
                </div>
            </section>)}
        </div>
        <AdminPagination paginator={books} label={t('branches')} />
        {!books?.data?.length && <section className="panel glass"><p className="muted">{t('No accessible branches.')}</p></section>}
        <section className="panel glass"><PanelHeading eyebrow={t('Audit ledger')} title={t('Funding history')} /><div className="table-wrap"><table><thead><tr><th>{t('Date')}</th><th>{t('Branch')}</th><th className="finance-book-money numeric-cell">{t('Amount')}</th><th>{t('Notes')}</th><th className="table-actions-column" aria-label={t('Actions')}></th></tr></thead><tbody>{(funds?.data || []).map((fund) => <tr key={fund.id}><td>{displayformatDate(fund.entry_date)}</td><td>{fund.branch_name}</td><td className="finance-book-money numeric-cell">{formatMoney(fund.amount)}</td><td>{fund.notes || '—'}</td><td className="table-actions table-actions-column"><button type="button" className="icon-btn small danger" disabled={deletingFundId === fund.id} onClick={() => removeFund(fund)} aria-label={t('Delete funding record')} title={t('Delete funding record')}><Icon name="trash" size={13} /></button></td></tr>)}{!funds?.data?.length && <tr><td colSpan={5} className="muted">{t('No expense funds added yet.')}</td></tr>}</tbody></table></div>
            <AdminPagination paginator={funds} label={t('funding records')} />
        </section>
        {selected && (
            <CrudModal open title={t(mode === 'count' ? 'Record actual cash' : 'Add expense fund')} onClose={() => !form.processing && setSelected(null)} busy={form.processing} action={<> <button form="admin-financebook-index-jsx-1" type="submit" className="btn primary" disabled={form.processing}>{t(form.processing ? 'Saving...' : mode === 'count' ? 'Save actual cash' : 'Add fund')}</button> </>}>
<form id="admin-financebook-index-jsx-1" className="admin-modal-form" onSubmit={submit}><small>{selected.name} · {selected.code} · {displayformatDate(form.data.entry_date)}</small>

                    <div className="crud-grid admin-form-grid admin-form-grid-single">
                        <label className="form-field"><span>{t('Date')}</span><input type="date" required value={form.data.entry_date} onChange={(event) => form.setData('entry_date', event.target.value)} />{form.errors.entry_date && <small className="field-error">{uiText(form.errors.entry_date)}</small>}</label>
                        <label className="form-field"><span>{t('Amount (MMK)')}</span><input autoFocus required type="number" min={mode === 'count' ? '0' : '0.01'} step="0.01" value={form.data.amount} onChange={(event) => form.setData('amount', event.target.value)} aria-invalid={Boolean((form.errors.amount || form.errors.actual_balance))} aria-describedby={(form.errors.amount || form.errors.actual_balance) ? 'fund-amount-error' : undefined} />{(form.errors.amount || form.errors.actual_balance) && <small id="fund-amount-error" className="field-error">{(form.errors.amount || form.errors.actual_balance)}</small>}</label>
                        <label className="form-field"><span>{t('Notes (optional)')}</span><textarea rows={3} maxLength={1000} value={form.data.notes} onChange={(event) => form.setData('notes', event.target.value)} />{form.errors.notes && <small className="field-error">{uiText(form.errors.notes)}</small>}</label>
                        {form.errors.location_id && <small className="field-error">{uiText(form.errors.location_id)}</small>}
                    </div>

                </form>
</CrudModal>
        )}
    </AdminLayout>;
}
