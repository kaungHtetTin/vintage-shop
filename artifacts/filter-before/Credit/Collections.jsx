import { useEffect, useState } from 'react';
import { Head, Link, router, usePage } from '@/spa/router';
import AdminLayout from '@/Layouts/AdminLayout';
import Icon from '@/Components/Admin/icons';
import AdminPagination from '@/Components/Admin/AdminPagination';
import { AdminFlash } from '@/Components/Admin/AdminFlash';
import { PanelHeading } from '@/Components/Admin/shared';
import { routeWithBase } from '@/Utils/url';
import { usePhraseTranslation } from '@/Utils/i18n';
import { formatMoney } from '@/Utils/pricing';

const paymentLabels = { cash: 'Cash', mmqr: 'MMQR (Pay)', bank_transfer: 'Bank transfer', card: 'Card' };
const formatDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function CollectionHistory({ payments, filters = {}, collections = [] }) {
    const { app_base, errors = {} } = usePage().props;
    const t = usePhraseTranslation();
    const [fields, setFields] = useState({ q: filters.q || '', from: filters.from || '', to: filters.to || '' });
    useEffect(() => setFields({ q: filters.q || '', from: filters.from || '', to: filters.to || '' }), [filters.q, filters.from, filters.to]);
    const update = key => event => setFields(current => ({ ...current, [key]: event.target.value }));
    const navigate = values => router.get(routeWithBase('/admin/credit/collections', app_base), values, { preserveState: true, preserveScroll: true });
    const maxCollection = Math.max(1, ...collections.map(row => Number(row.amount || 0)));

    return <AdminLayout title={t('Collection history')} eyebrow={t('Accounts receivable')} action={
        <Link className="btn secondary" href={routeWithBase('/admin/credit', app_base)}><Icon name="wallet" size={14} /> {t('Customer credit')}</Link>
    }>
        <Head title={t('Collection history')} />
        <AdminFlash errors={errors} />
        <div className="credit-report-page">
            <section className="collection-history-list" aria-label={t('Recorded repayments')}>
                <form className="table-search-header collection-history-filters" aria-label={t('Filter collections')} onSubmit={event => { event.preventDefault(); navigate({ ...fields, q: fields.q.trim() }); }}>
                    <label className="form-field collection-history-search"><span>{t('Search')}</span>
                        <span className="search-box"><Icon name="search" size={15} /><input type="search" value={fields.q} onChange={update('q')} placeholder={t('Customer, phone, order or reference')} /></span>
                    </label>
                    <label className="form-field"><span>{t('From')}</span><input type="date" value={fields.from} onChange={update('from')} /></label>
                    <label className="form-field"><span>{t('To')}</span><input type="date" min={fields.from || undefined} value={fields.to} onChange={update('to')} /></label>
                    <div className="inline-actions">
                        <button type="submit" className="btn primary"><Icon name="search" size={14} /> {t('Search')}</button>
                        {(fields.q || fields.from || fields.to) && <button type="button" className="btn secondary" onClick={() => { setFields({ q: '', from: '', to: '' }); navigate({}); }}>{t('Clear')}</button>}
                    </div>
                </form>
                <div className="table-wrap">
                    <table>
                        <thead><tr><th>{t('Date')}</th><th>{t('Customer')}</th><th>{t('Order')}</th><th>{t('Reference')}</th><th>{t('Method')}</th><th className="numeric-cell">{t('Collected')}</th><th>{t('Recorded by')}</th></tr></thead>
                        <tbody>
                            {!payments.data.length && <tr><td colSpan={7}><span className="muted">{t('No collections match your filters.')}</span></td></tr>}
                            {payments.data.map(payment => <tr key={payment.id}>
                                <td>{formatDate(payment.created_at)}</td>
                                <td>{payment.customer ? <Link className="collection-customer-link" href={routeWithBase(`/admin/customers/${payment.customer.id}`, app_base)}>{payment.customer.name}</Link> : t('Customer unavailable')}<small>{payment.customer?.phone}</small></td>
                                <td>{payment.order?.order_number || '—'}<small>{payment.order?.receipt_number}</small></td>
                                <td><strong>{payment.transaction_number}</strong>{payment.reference && <small>{payment.reference}</small>}{payment.notes && <small>{payment.notes}</small>}</td>
                                <td>{t(paymentLabels[payment.tender_type] || payment.tender_type || '—')}</td>
                                <td className="numeric-cell money-cell"><strong>{formatMoney(Math.abs(Number(payment.amount || 0)))}</strong></td>
                                <td>{payment.creator?.name || '—'}</td>
                            </tr>)}
                        </tbody>
                    </table>
                </div>
                <AdminPagination paginator={payments} label={t('collections')} />
            </section>
            <section className="panel glass credit-collections-panel">
                <PanelHeading eyebrow={t('Last 30 days')} title={t('Daily collections')} />
                {!collections.length ? <div className="credit-empty-state credit-empty-state--compact"><Icon name="chart" size={20} /><strong>{t('No collections yet')}</strong><span className="muted">{t('No credit payments in this period.')}</span></div> : <div className="credit-collection-list">
                    {collections.map(row => <div className="credit-collection-row" key={row.day}><small>{row.day}</small><div className="credit-collection-track" role="progressbar" aria-label={`${row.day}: ${formatMoney(row.amount)}`} aria-valuemin="0" aria-valuemax={maxCollection} aria-valuenow={Number(row.amount || 0)}><span style={{ width: `${Math.max(2, Number(row.amount) / maxCollection * 100)}%` }} /></div><strong>{formatMoney(row.amount)}</strong></div>)}
                </div>}
            </section>
        </div>
    </AdminLayout>;
}
