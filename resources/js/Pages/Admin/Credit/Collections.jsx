import { formatDateTime as displayformatDateTime } from '@/Utils/dateTime';
import DetailTableRow from '@/Components/Admin/DetailTableRow';
import AdminFilterDrawer, { dateFilters, filterOptions } from '@/Components/Admin/AdminFilterDrawer';

import { Head, Link, router, usePage } from '@/spa/router';
import AdminLayout from '@/Layouts/AdminLayout';
import Icon from '@/Components/Admin/icons';
import AdminPagination from '@/Components/Admin/AdminPagination';
import { AdminFlash } from '@/Components/Admin/AdminFlash';
import { routeWithBase } from '@/Utils/url';
import { usePhraseTranslation } from '@/Utils/i18n';
import { formatMoney } from '@/Utils/pricing';

const paymentLabels = { cash: 'Cash', mmqr: 'MMQR (Pay)', bank_transfer: 'Bank transfer', card: 'Card' };
const formatDate = displayformatDateTime;

export default function CollectionHistory({ payments, filters = {} }) {
    const { app_base, errors = {} } = usePage().props;
    const t = usePhraseTranslation();

    const appliedFilters = { ...filters, period: filters.period || (filters.from || filters.to ? 'custom' : '') };
    const filterFields = draft => [
        { key: 'q', label: 'Search collections', type: 'search', placeholder: 'Customer, phone, order or reference' },
        { key: 'period', label: 'Period', type: 'select', clearOnChange: ['from', 'to'], options: filterOptions([
            { value: 'today', label: 'Today' },
            { value: 'last_7', label: 'Last 7 days' },
            { value: 'last_30', label: 'Last 30 days' },
            { value: 'this_month', label: 'This month' },
            { value: 'custom', label: 'Custom dates' },
        ], 'All time') },
        ...dateFilters().map(field => ({ ...field, hidden: draft.period !== 'custom' })),
        { key: 'tender_type', label: 'Payment method', type: 'select', options: filterOptions([
            { value: 'cash', label: 'Cash' }, { value: 'mmqr', label: 'MMQR (Pay)' },
        ], 'All methods') },
    ];

    return <AdminLayout title={t('Collection history')} eyebrow={t('Accounts receivable')} action={<div className="inline-actions admin-page-actions"><AdminFilterDrawer filters={appliedFilters} fields={filterFields} onApply={values=>router.get(routeWithBase('/admin/credit/collections',app_base),values,{preserveState:true,preserveScroll:true,replace:true})} /><Link className="btn secondary" href={routeWithBase('/admin/credit', app_base)}><Icon name="wallet" size={14} /> {t('Customer credit')}</Link></div>}>
        <Head title={t('Collection history')} />
        <AdminFlash errors={errors} />
        <div className="credit-report-page">
            <section className="collection-history-list" aria-label={t('Recorded repayments')}>

                <div className="table-wrap">
                    <table>
                        <thead><tr><th>{t('Date')}</th><th>{t('Customer')}</th><th>{t('Order')}</th><th>{t('Reference')}</th><th>{t('Method')}</th><th className="numeric-cell">{t('Collected')}</th><th>{t('Recorded by')}</th></tr></thead>
                        <tbody>
                            {!payments.data.length && <tr><td colSpan={7}><span className="muted">{t('No collections match your filters.')}</span></td></tr>}
                            {payments.data.map(payment => <DetailTableRow key={payment.id} href={payment.customer ? routeWithBase(`/admin/customers/${payment.customer.id}`,app_base) : undefined} >
                                <td>{formatDate(payment.created_at)}</td>
                                <td>{payment.customer ? <Link className="collection-customer-link" href={routeWithBase(`/admin/customers/${payment.customer.id}`, app_base)}>{payment.customer.name}</Link> : t('Customer unavailable')}<small>{payment.customer?.phone}</small></td>
                                <td>{payment.order?.order_number || '—'}<small>{payment.order?.receipt_number}</small></td>
                                <td><strong>{payment.transaction_number}</strong>{payment.reference && <small>{payment.reference}</small>}{payment.notes && <small>{payment.notes}</small>}</td>
                                <td>{t(paymentLabels[payment.tender_type] || payment.tender_type || '—')}</td>
                                <td className="numeric-cell money-cell"><strong>{formatMoney(Math.abs(Number(payment.amount || 0)))}</strong></td>
                                <td>{payment.creator?.name || '—'}</td>
                            </DetailTableRow>)}
                        </tbody>
                    </table>
                </div>
                <AdminPagination paginator={payments} label={t('collections')} />
            </section>

        </div>
    </AdminLayout>;
}
