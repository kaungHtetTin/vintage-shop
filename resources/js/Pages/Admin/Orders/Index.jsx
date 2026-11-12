import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { formatDateTime as displayformatDateTime } from '@/Utils/dateTime';
import DetailTableRow from '@/Components/Admin/DetailTableRow';
import AdminFilterDrawer, { filterOptions, dateFilters } from '@/Components/Admin/AdminFilterDrawer';
import { useState } from 'react';

import { Head, router, useForm, usePage } from '@/spa/router';
import AdminLayout from '@/Layouts/AdminLayout';
import Icon from '@/Components/Admin/icons';
import AdminPagination from '@/Components/Admin/AdminPagination';
import { AdminFlash } from '@/Components/Admin/AdminFlash';
import { ColumnVisibilityControl, StatusBadge } from '@/Components/Admin/shared';
import { routeWithBase } from '@/Utils/url';
import { deliveryStatusLabels, getOrderStatus, orderStatusLabels, paymentLabels } from '@/constants/orderLabels';
import { usePhraseTranslation } from '@/Utils/i18n';
import { formatMoney } from '@/Utils/pricing';

const formatOrderDate = displayformatDateTime;

const emptyFilters = { q: '', location_id: '', sale_type: '', status: '', payment_status: '', from: '', to: '' };
const normalizeFilters = (filters) => ({
    ...emptyFilters,
    ...Object.fromEntries(Object.keys(emptyFilters).map(key => [key, filters[key] ?? ''])),
    sale_type: filters.sale_type || (filters.tab === 'online' ? 'online' : ''),
    status: filters.status || (['not_delivered', 'delivered', 'cancelled'].includes(filters.tab) ? filters.tab : ''),
});

export default function OrdersIndex({ orders, stats = {}, filters = {}, locations = [], canManageOrders }) {
    const uiText = useUiTranslation();
    const { app_base, flash } = usePage().props;
    const t = usePhraseTranslation();
    const appliedFilters = normalizeFilters(filters);


    const [visibleColumns, setVisibleColumns] = useState({ items: true, payment: true, status: true });
    const deliveryForm = useForm({ delivered: true });
    const summaryCards = [
        { key: 'total', label: 'Total orders', icon: 'receipt', tone: 'primary' },
        { key: 'not_delivered', label: 'Not delivered', icon: 'truck', tone: 'warning' },
        { key: 'delivered', label: 'Delivered', icon: 'check', tone: 'success' },
        { key: 'cancelled', label: 'Cancelled', icon: 'close', tone: 'danger' },
        { key: 'revenue_paid', label: 'Paid revenue', icon: 'card', tone: 'primary', money: true },
    ];

    const toggleColumn = key => setVisibleColumns(current => ({ ...current, [key]: current[key] === false }));

    const exportQuery = new URLSearchParams(Object.entries(appliedFilters).filter(([, value]) => value !== ''));

    const applyFilters = values => {
        router.get(routeWithBase('/admin/orders', app_base),
            Object.fromEntries(Object.entries({ ...values, q: values.q.trim() }).filter(([, value]) => value !== '')),
            { preserveState: true, preserveScroll: true, replace: true });
    };

    return (
        <AdminLayout title={t('Orders')} eyebrow={t('Sales management')} contentClassName="orders-page" action={
            <div className="inline-actions orders-page-actions">
                <AdminFilterDrawer filters={appliedFilters} fields={[{key:'q',label:"Search",type:'search',placeholder:"Order, receipt, customer or phone"},{key:'sale_type',label:'Sale type',type:'select',options:filterOptions([{value:'online',label:'Online'},{value:'in_store',label:'In-store'}],'All sales')},{key:'status',label:'Status',type:'select',options:filterOptions(Object.entries(deliveryStatusLabels).map(([value,label])=>({value,label})),'All statuses')},{key:'payment_status',label:'Payment',type:'select',options:filterOptions(Object.entries(paymentLabels).map(([value,label])=>({value,label})),'All payments')},{key:'location_id',label:'Store',type:'select',options:filterOptions(locations,'All stores')},...dateFilters()]} onApply={applyFilters}/>
                <ColumnVisibilityControl columns={[
                    { key: 'order', label: 'Order', locked: true },
                    { key: 'customer', label: 'Customer', locked: true },
                    { key: 'items', label: 'Items' },
                    { key: 'total', label: 'Total', locked: true },
                    { key: 'payment', label: 'Payment' },
                    { key: 'status', label: 'Status' },
                ]} visible={visibleColumns} onToggle={toggleColumn} />
                <a className="btn secondary" href={`${routeWithBase('/admin/orders-export.xlsx', app_base)}?${exportQuery.toString()}`}>
                    <Icon name="download" size={14} /> {t('Export')}
                </a>
            </div>
        }>
            <Head title={t('Orders')} />
            <AdminFlash flash={flash} errors={deliveryForm.errors} />
            <section className="orders-summary" aria-label={t('Order summary')}>
                <p className="orders-summary-caption">{t('All-time store summary')}</p>
                <div className="orders-summary-grid">
                    {summaryCards.map(card => <article className={`metric-card glass credit-kpi-card orders-summary-card tone-${card.tone} ${card.money ? 'orders-summary-revenue' : ''}`} key={card.key}>
                        <span className="icon-well"><Icon name={card.icon} size={14} /></span>
                        <small>{t(card.label)}</small>
                        <strong>{card.money ? formatMoney(stats[card.key] || 0) : Number(stats[card.key] || 0).toLocaleString()}</strong>
                    </article>)}
                </div>
            </section>
            <section className="orders-list" aria-label={t('Orders')}>
                <div className="table-wrap">
                    <table className="orders-table">
                        <thead>
                            <tr>
                                <th>{t('Order')}</th>
                                <th>{t('Customer')}</th>
                                {visibleColumns.items !== false && <th className="numeric-cell">{t('Items')}</th>}
                                <th className="numeric-cell">{t('Total')}</th>
                                {visibleColumns.payment !== false && <th>{t('Payment')}</th>}
                                {visibleColumns.status !== false && <th>{t('Status')}</th>}
                                <th className="table-actions-column" />
                            </tr>
                        </thead>
                        <tbody>
                            {orders.data.length === 0 ? (
                                <tr>
                                    <td colSpan={4 + Object.values(visibleColumns).filter(Boolean).length}>
                                        <span className="muted">{t('No orders match your filters.')}</span>
                                    </td>
                                </tr>
                            ) : (
                                orders.data.map((order) => (
                                    <DetailTableRow key={order.id} href={routeWithBase(`/admin/orders/${order.id}`,app_base)} >
                                        <td>
                                            <div className="order-identity"><strong>{order.order_number}</strong>{order.is_online_sale && <StatusBadge status="info" label={t('Online')} />}</div>
                                            {order.receipt_number && <small>{order.receipt_number}</small>}
                                            <small title={displayformatDateTime(order.created_at)}>{formatOrderDate(order.created_at)}</small>
                                        </td>
                                        <td>
                                            <strong>{order.receiver_name || order.user?.name || t('Walk-in customer')}</strong>
                                            <small>{order.receiver_phone || order.user?.phone}</small>
                                        </td>
                                        {visibleColumns.items !== false && <td className="numeric-cell">{order.items_count ?? order.items?.length ?? 0}</td>}
                                        <td className="money-cell numeric-cell">
                                            <strong>{formatMoney(order.final_amount)}</strong>
                                        </td>
                                        {visibleColumns.payment !== false && <td>
                                            <StatusBadge
                                                status={order.payment_status}
                                                label={t(paymentLabels[order.payment_status] || order.payment_status)}
                                            />
                                        </td>}
                                        {visibleColumns.status !== false && <td>
                                            <StatusBadge
                                                status={getOrderStatus(order)}
                                                label={t(orderStatusLabels[getOrderStatus(order)] || order.status)}
                                            />
                                        </td>}
                                        <td className="table-actions-column">
                                            {canManageOrders && order.is_online_sale && getOrderStatus(order) === 'not_delivered' && <button
                                                type="button"
                                                className="icon-btn small"
                                                aria-label={`${t('Mark delivered')} ${order.order_number}`}
                                                title={t('Mark delivered')}
                                                disabled={deliveryForm.processing}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    if (deliveryForm.processing) return;
                                                    deliveryForm.clearErrors();
                                                    deliveryForm.patch(routeWithBase(`/admin/orders/${order.id}/delivery`, app_base), { preserveScroll: true, preserveState: true });
                                                }}
                                            >
                                                <Icon name="check" size={16} />
                                            </button>}
                                        </td>
                                    </DetailTableRow>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <AdminPagination paginator={orders} label={t('orders')} />
            </section>


        </AdminLayout>
    );
}
