import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { formatTime as displayformatTime } from '@/Utils/dateTime';
import { formatDate as displayformatDate } from '@/Utils/dateTime';
import DetailTableRow from '@/Components/Admin/DetailTableRow';
import AdminFilterDrawer, { filterOptions, dateFilters } from '@/Components/Admin/AdminFilterDrawer';
import { confirmCrud } from '@/Components/Admin/CrudConfirm';
import { useState } from 'react';
import { Head, Link, router, usePage } from '@/spa/router';
import AdminLayout from '@/Layouts/AdminLayout';
import AdminPagination from '@/Components/Admin/AdminPagination';
import Icon from '@/Components/Admin/icons';
import { AdminFlash } from '@/Components/Admin/AdminFlash';

import { routeWithBase } from '@/Utils/url';
import useInventoryRealtime from '@/Utils/useInventoryRealtime';
import { usePhraseTranslation } from '@/Utils/i18n';
import { formatMoney } from '@/Utils/pricing';

function TransferMetric({ label, value, hint, icon, tone = '' }) {
    const uiText = useUiTranslation();
    const t = usePhraseTranslation();
    return <article className={`metric-card glass${tone ? ` tone-${tone}` : ''}`}><span className="icon-well"><Icon name={icon} size={15} /></span><small>{t(label)}</small><strong>{uiText(value)}</strong><p>{t(hint)}</p></article>;
}

export default function TransfersIndex({ transfers, filters = {}, locations = [], summary = {}, canCreate, realtime, lastUpdated, pollIntervalMs = 20000 }) {
    const uiText = useUiTranslation();
    const { app_base, flash, errors } = usePage().props;
    const t = usePhraseTranslation();
    const [deletingId, setDeletingId] = useState(null);

    const exportQuery = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null)).toString();
    const exportHref = `${routeWithBase('/admin/inventory/transfers/export', app_base)}${exportQuery ? `?${exportQuery}` : ''}`;
    const { state: realtimeState, lastEventAt } = useInventoryRealtime({
        locationIds: realtime?.locationIds || [],
        includeAll: realtime?.canAll,
        only: ['transfers', 'lastUpdated'],
        pollIntervalMs,
        listenBalance: false,
        listenTransfers: true,
    });
    const destroy = async (transfer) => {
        if (!await confirmCrud(t('Delete :number? This will reverse stock at both shops and remove every related financial entry. This cannot be undone.', { number: transfer.transfer_number }))) return;

        setDeletingId(transfer.id);
        router.delete(
            routeWithBase(`/admin/inventory/transfers/${transfer.id}`, app_base),
            {},
            { preserveScroll: true, onFinish: () => setDeletingId(null) },
        );
    };

    return (
        <AdminLayout
            title={t('Transfers')}
            eyebrow={t('Inventory')}
            action={<div className="inline-actions admin-page-actions"><AdminFilterDrawer filters={filters} fields={[{key:'source',label:'From shop',type:'select',options:filterOptions(locations,'All source shops')},{key:'destination',label:'To shop',type:'select',options:filterOptions(locations,'All destination shops')},...dateFilters('date_from','date_to')]} onApply={values=>router.get(routeWithBase('/admin/inventory/transfers',app_base),values,{preserveState:true,preserveScroll:true,replace:true})} /><div className="inline-actions"><a className="btn secondary" href={exportHref}><Icon name="download" size={14} /> {t('XLSX')}</a>{canCreate && <Link className="btn primary" href={routeWithBase('/admin/inventory/transfers/create', app_base)}><Icon name="plus" size={14} /> {t('New transfer')}</Link>}</div></div>}
        >
            <Head title={t('Stock Transfers')} />
            <AdminFlash flash={flash} errors={errors} />
            <section className="panel glass">
                <div className="inline-actions admin-table-toolbar"><small className="muted">{t('Realtime')} {t(realtimeState)} - {t('Updated')} {displayformatTime(lastEventAt || lastUpdated)}</small></div>
                <div className="metrics-grid transfer-summary-grid"><TransferMetric label={uiText("Transfers")} value={Number(summary.count || 0).toLocaleString()} hint="Filtered transfer records" icon="truck" /><TransferMetric label={uiText("Transfer value")} value={formatMoney(summary.transfer_value)} hint="Total stock value moved" icon="box" /></div>

                <div className="table-wrap">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{t('Transfer')}</th>
                                <th>{t('From')}</th>
                                <th>{t('To')}</th>
                                <th>{t('Lines')}</th>
                                <th className="numeric-cell">{t('Amount')}</th>
                                <th>{t('Date')}</th>
                                <th className="actions-col table-actions-column">{t('Actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transfers.data.length === 0 ? (
                                <tr><td colSpan="7" className="empty-table-cell">{t('No transfers yet.')}</td></tr>
                        ) : transfers.data.map((transfer) => (
                                <DetailTableRow key={transfer.id} href={routeWithBase(`/admin/inventory/transfers/${transfer.id}`,app_base)} >
                                    <td><strong>{transfer.transfer_number}</strong></td>
                                    <td>{transfer.source_location.name}<small className="table-subline">{transfer.source_location.code}</small></td>
                                    <td>{transfer.destination_location.name}<small className="table-subline">{transfer.destination_location.code}</small></td>
                                    <td>{transfer.items.length}</td>
                                    <td className="numeric-cell"><strong>{formatMoney(transfer.total_amount)}</strong></td>
                                    <td>{displayformatDate(transfer.created_at)}</td>
                                    <td className="actions-col">
                                        <div className="inline-actions table-row-actions">
                                            <Link className="icon-btn small" href={routeWithBase(`/admin/inventory/transfers/${transfer.id}`, app_base)} aria-label={t('Open transfer')} title={t('Open transfer')}>
                                                <Icon name="external" size={13} />
                                            </Link>
                                            {transfer.can_delete && (
                                                <button type="button" className="icon-btn small danger" onClick={() => destroy(transfer)} aria-label={t('Delete transfer')} title={t('Delete transfer')} disabled={deletingId !== null}>
                                                    <Icon name="trash" size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </DetailTableRow>
                            ))}
                        </tbody>
                    </table>
                </div>
                <AdminPagination paginator={transfers} label={t('transfers')} />
            </section>
        </AdminLayout>
    );
}
