import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { formatDate as displayformatDate } from '@/Utils/dateTime';
import DetailTableRow from '@/Components/Admin/DetailTableRow';
import AdminFilterDrawer from '@/Components/Admin/AdminFilterDrawer';
import { Head, Link, router, usePage } from '@/spa/router';
import AdminLayout from '@/Layouts/AdminLayout';
import Icon from '@/Components/Admin/icons';
import { StatusBadge } from '@/Components/Admin/shared';
import AdminPagination from '@/Components/Admin/AdminPagination';
import { routeWithBase } from '@/Utils/url';
import { usePhraseTranslation } from '@/Utils/i18n';
import { formatMoney } from '@/Utils/pricing';

function CreditMetricCard({ label, value, caption, icon, tone = 'primary', active = false, onClick }) {
    const uiText = useUiTranslation();
    const t = usePhraseTranslation();

    return (
        <button type="button" className={`metric-card glass credit-kpi-card tone-${tone}${active ? ' is-active' : ''}`} onClick={onClick} aria-pressed={active}>
            <span className="icon-well"><Icon name={icon} size={14} /></span>
            <small>{t(label)}</small>
            <strong>{formatMoney(value)}</strong>
            <p>{uiText(caption)}</p>
        </button>
    );
}

export default function CreditReport({ customers, filters = {}, aging = {} }) {
    const uiText = useUiTranslation();
    const { app_base } = usePage().props;
    const t = usePhraseTranslation();
    const navigate = (changes) => router.get(routeWithBase('/admin/credit', app_base), { ...filters, ...changes }, { preserveState: true, preserveScroll: true });
    const cards = [
        { label: 'Current', value: aging.current, bucket: 'current', caption: 'Not yet overdue', icon: 'check', tone: 'success' },
        { label: '1–30 days', value: aging.days_1_30, bucket: '1_30', caption: 'Past due', icon: 'history', tone: 'warning' },
        { label: '31–60 days', value: aging.days_31_60, bucket: '31_60', caption: 'Past due', icon: 'history', tone: 'warning' },
        { label: '61–90 days', value: aging.days_61_90, bucket: '61_90', caption: 'Past due', icon: 'history', tone: 'danger' },
        { label: '90+ days', value: aging.days_90_plus, bucket: '90_plus', caption: 'Past due', icon: 'history', tone: 'danger' },
    ];

    const exportHref = routeWithBase(`/admin/credit/export?bucket=${filters.bucket || 'all'}`, app_base);



    return (
        <AdminLayout title={t('Customer credit')} eyebrow={t('Accounts receivable')} action={<div className="inline-actions admin-page-actions"><AdminFilterDrawer filters={filters} fields={[{key:'q',label:"Search customers",type:'search',placeholder:"Name, phone or address"},{key:'bucket',label:'Aging bucket',type:'select',options:[{value:'all',label:'All aging buckets'},...cards.map(c=>({value:c.bucket,label:c.label}))]}]} onApply={values=>router.get(routeWithBase('/admin/credit',app_base),values,{preserveState:true,preserveScroll:true,replace:true})} defaults={{bucket:'all'}}/><div className="inline-actions credit-page-actions"><Link className="btn secondary" href={routeWithBase('/admin/credit/collections', app_base)}><Icon name="history" size={14} /> {t('Collection history')}</Link><a className="btn secondary" href={exportHref}><Icon name="download" size={14} /> {t('Export XLSX')}</a></div></div>}>
            <Head title={t('Customer credit')} />

            <div className="credit-report-page">
                <div className="metrics-grid six compact-kpi-strip credit-kpi-strip">
                    <CreditMetricCard label={uiText("Total receivable")} value={aging.total} caption={`${customers.total || 0} ${t('customers')}`} icon="wallet" active={!filters.bucket || filters.bucket === 'all'} onClick={() => navigate({ bucket: 'all', page: 1 })} />
                    {cards.map((card) => <CreditMetricCard key={card.bucket} {...card} caption={t(card.caption)} active={filters.bucket === card.bucket} onClick={() => navigate({ bucket: card.bucket, page: 1 })} />)}
                </div>

                <section className="panel glass credit-accounts-panel">



                    <div className="table-wrap credit-table-wrap">
                        <table className="credit-table">
                            <thead><tr><th>{t('Customer')}</th><th>{t('Status')}</th><th className="numeric-cell">{t('Invoices')}</th><th>{t('Oldest due')}</th><th className="numeric-cell">{t('Outstanding')}</th><th className="numeric-cell">{t('Overdue')}</th><th className="table-actions-column">{t('Actions')}</th></tr></thead>
                            <tbody>
                                {!customers.data.length ? (
                                    <tr><td colSpan={7}><div className="credit-empty-state"><Icon name="wallet" size={20} /><strong>{t('No credit balances found')}</strong><span className="muted">{t('Try changing the search or aging bucket.')}</span></div></td></tr>
                                ) : customers.data.map((customer) => (
                                    <DetailTableRow key={customer.id} href={routeWithBase(`/admin/customers/${customer.id}`,app_base)} >
                                        <td><strong>{customer.name}</strong><small>{customer.phone || customer.default_address || '—'}</small></td>
                                        <td><StatusBadge status={customer.credit_status === 'active' ? 'success' : 'warning'} label={t(customer.credit_status)} /></td>
                                        <td className="numeric-cell">{customer.invoice_count}</td>
                                        <td>{displayformatDate(customer.oldest_due_date)}</td>
                                        <td className="money-cell numeric-cell"><strong>{formatMoney(customer.outstanding)}</strong></td>
                                        <td className={`money-cell${Number(customer.overdue) > 0 ? ' text-danger' : ''}`}><strong>{formatMoney(customer.overdue)}</strong></td>
                                        <td className="table-actions-column"><Link className="icon-btn small" href={routeWithBase(`/admin/customers/${customer.id}`, app_base)} aria-label={`${t('Open customer')} ${customer.name}`} title={t('Open customer')}><Icon name="external" size={13} /></Link></td>
                                    </DetailTableRow>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="credit-pagination"><AdminPagination paginator={customers} /></div>
                </section>


            </div>
        </AdminLayout>
    );
}
