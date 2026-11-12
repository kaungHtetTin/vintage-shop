import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { formatDate as displayformatDate, formatTime as displayformatTime } from '@/Utils/dateTime';
import DetailTableRow from '@/Components/Admin/DetailTableRow';
import AdminFilterDrawer, { filterOptions, dateFilters } from '@/Components/Admin/AdminFilterDrawer';
import { Head, Link, router, usePage } from '@/spa/router';
import AdminLayout from '@/Layouts/AdminLayout';
import AdminPagination from '@/Components/Admin/AdminPagination';
import Icon from '@/Components/Admin/icons';
import { PanelHeading } from '@/Components/Admin/shared';
import { routeWithBase } from '@/Utils/url';
import useInventoryRealtime from '@/Utils/useInventoryRealtime';
import { usePhraseTranslation } from '@/Utils/i18n';
import { formatCompoundQuantity, formatSelectedUnitQuantity } from '@/Utils/unitLabel';

export default function ProductShow({ product, balances, movements, locations, types, filters, realtime, lastUpdated, returnToInventory, pollIntervalMs = 20000 }) {
    const uiText = useUiTranslation();
    const { app_base } = usePage().props;
    const t = usePhraseTranslation();
    const { state: realtimeState, lastEventAt } = useInventoryRealtime({ locationIds: realtime?.locationIds || balances.map((balance) => balance.location_id), includeAll: realtime?.canAll, productId: product.id, only: ['balances', 'movements', 'types', 'lastUpdated'], pollIntervalMs, listenBalance: true, listenTransfers: false });

    return (
        <AdminLayout title={uiText(product.product_code)} eyebrow={t('Inventory history')} action={<div className="inline-actions admin-page-actions"><AdminFilterDrawer filters={filters} fields={[{key:'location',label:'Warehouse',type:'select',options:filterOptions(locations,'All warehouses')},{key:'type',label:'Movement type',type:'select',options:filterOptions(types.map(value=>({value,label:t(value)})),'All movement types')},...dateFilters()]} onApply={values=>router.get(routeWithBase(`/admin/inventory/products/${product.id}`,app_base),{...values,...(filters.return_to?{return_to:filters.return_to}:{})},{preserveState:true,preserveScroll:true,replace:true})}/><a className="btn secondary" href={routeWithBase(`/admin/inventory/products/${product.id}/export`, app_base)}><Icon name="download" size={14} />{t('Export')}</a></div>}>
            <Head title={t(':value Inventory', { value: product.product_code })} />
            <div className="sticky-toolbar"><Link className="back-link" href={returnToInventory || routeWithBase('/admin/inventory', app_base)}><Icon name="navigation" size={14} style={{ transform: 'rotate(180deg)' }} />{t('Back to inventory')}</Link></div>
            <section className="product-balance-strip">
                <div className="product-identity"><span>{product.name}</span><strong>{product.product_code}</strong><small>{uiText(product.barcode || t('No barcode'))} · {product.base_unit?.name || t('Base unit')}</small></div>
                {balances.map((balance) => <div key={balance.id}><span>{balance.location.name}</span><strong>{formatCompoundQuantity(balance.available_qty, product.units)}</strong><small>{t(':onHand on hand / :reserved reserved', { onHand: formatCompoundQuantity(balance.on_hand_qty, product.units), reserved: formatCompoundQuantity(balance.reserved_qty, product.units) })}</small></div>)}
            </section>
            <section className="panel">
                <PanelHeading eyebrow={t('Ledger')} title={t('Movement history')} action={<small className="muted">{t('Realtime')} {t(realtimeState)} · {t('Updated')} {displayformatTime(lastEventAt || lastUpdated)}</small>} />

                <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('Time')}</th><th>{t('Warehouse')}</th><th>{t('Movement')}</th><th>{t('Entered unit')}</th><th>{t('Base change')}</th><th>{t('Before')}</th><th>{t('After')}</th><th>{t('User / reason')}</th></tr></thead><tbody>
                    {movements.data.length === 0 ? <tr><td colSpan="8" className="empty-table-cell">{t('No movements found.')}</td></tr> : movements.data.map((movement) => <DetailTableRow key={movement.id} href={movement.document?.href} ><td><strong>{displayformatDate(movement.occurred_at)}</strong><small className="table-subline">{displayformatTime(movement.occurred_at)}</small></td><td>{movement.location.code}</td><td>{uiText(movement.type)}</td><td>{movement.unit_quantity != null ? formatSelectedUnitQuantity(movement.unit_quantity, movement.unit, product.units) : '-'}</td><td className={movement.quantity_delta >= 0 ? 'quantity-positive' : 'quantity-negative'}>{formatCompoundQuantity(movement.quantity_delta, product.units, { signed: true })}</td><td>{formatCompoundQuantity(movement.on_hand_before, product.units)}</td><td>{formatCompoundQuantity(movement.on_hand_after, product.units)}</td><td>{movement.creator?.name || t('System')}<small className="table-subline">{movement.reason_code || movement.notes || '-'}</small>{movement.document && <small className="table-subline"><Link href={movement.document.href}>{uiText(movement.document.label)}</Link></small>}</td></DetailTableRow>)}
                </tbody></table></div>
                <AdminPagination paginator={movements} label={t('movements')} />
            </section>
        </AdminLayout>
    );
}
