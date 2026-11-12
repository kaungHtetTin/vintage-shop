import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { formatDateTime as displayformatDateTime } from '@/Utils/dateTime';
import DetailTableRow from '@/Components/Admin/DetailTableRow';
import AdminFilterDrawer, { filterOptions, dateFilters } from '@/Components/Admin/AdminFilterDrawer';
import CrudModal from "@/Components/Admin/CrudModal";
import {  useState } from 'react';
import { Head, router, usePage } from '@/spa/router';
import AdminLayout from '@/Layouts/AdminLayout';
import AdminPagination from '@/Components/Admin/AdminPagination';

import { StatusBadge } from '@/Components/Admin/shared';
import { usePhraseTranslation } from '@/Utils/i18n';
import { routeWithBase } from '@/Utils/url';
import { formatCompoundQuantity, formatSelectedUnitQuantity } from '@/Utils/unitLabel';

export default function AdjustmentsIndex({ adjustments, locations = [], reasons = [], statuses = [], filters = {}, canUndo = false }) {
    const uiText = useUiTranslation();
    const { app_base } = usePage().props;
    const t = usePhraseTranslation();

    const [undoTarget, setUndoTarget] = useState(null);
    const [undoExplanation, setUndoExplanation] = useState('');
    const [undoErrors, setUndoErrors] = useState({});
    const [undoBusy, setUndoBusy] = useState(false);

    const rows = adjustments.data.flatMap((adjustment) =>
        adjustment.items.map((item) => ({
            adjustment,
            item,
        }))
    );
    const originalStock = Number(undoTarget?.item?.system_quantity || 0);

    const openUndo = (adjustment, item) => {
        setUndoTarget({ adjustment, item });
        setUndoExplanation('');
        setUndoErrors({});
    };

    const submitUndo = (event) => {
        event.preventDefault();
        if (!undoTarget || undoBusy) return;
        router.post(routeWithBase(`/admin/inventory/adjustments/${undoTarget.adjustment.id}/undo`, app_base), {
            item_id: undoTarget.item.id, explanation: undoExplanation,
        }, {
            onStart: () => setUndoBusy(true),
            onFinish: () => setUndoBusy(false),
            onSuccess: () => { setUndoTarget(null); setUndoErrors({}); },
            onError: (errors) => setUndoErrors(errors),
        });
    };

    return (
        <AdminLayout title={t('Adjustments')} eyebrow={t('Inventory')} action={<AdminFilterDrawer filters={filters} fields={[{key:'q',label:"Search adjustments",type:'search',placeholder:"Product, reference or notes"},{key:'location_id',label:'Store',type:'select',options:filterOptions(locations,'All stores')},{key:'reason_code',label:'Reason',type:'select',options:filterOptions(reasons,'All reasons')},{key:'status',label:'Status',type:'select',options:filterOptions(statuses,'All statuses')},...dateFilters()]} onApply={values=>router.get(routeWithBase('/admin/inventory/adjustments',app_base),values,{preserveState:true,preserveScroll:true,replace:true})} />}>
            <Head title={t('Stock Adjustments')} />
            <section className="panel glass finance-filter-panel adjustments-filter-panel">
                

                <div className="table-wrap">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{t('Adjustment')}</th>
                                <th>{t('Warehouse')}</th>
                                <th>{t('Product / unit')}</th>
                                <th>{t('Before')}</th>
                                <th>{t('After')}</th>
                                <th>{t('Variance')}</th>
                                <th>{t('Reason')}</th>
                                <th>{t('Status')}</th>
                                {canUndo && <th className="adjustments-correction__table-action">{t('Undo')}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={canUndo ? 9 : 8} className="empty-table-cell">{t('No adjustments yet.')}</td>
                                </tr>
                            ) : rows.map(({ adjustment, item }) => (
                                <DetailTableRow  key={`${adjustment.id}-${item.id}`} href={(item.product_id || item.product?.id) ? routeWithBase(`/admin/inventory/products/${item.product_id || item.product?.id}`,app_base) : undefined} permission="inventory.history">
                                    <td>
                                        <strong>{adjustment.adjustment_number}</strong>
                                        <small className="table-subline">{displayformatDateTime(adjustment.created_at)}</small>
                                        {canUndo && adjustment.status === 'posted' && !adjustment.reversal_of_id && adjustment.items.length === 1 && <button type="button" className="btn secondary adjustments-correction__mobile-trigger" onClick={() => openUndo(adjustment, item)}>{t('Undo')}</button>}
                                    </td>
                                    <td>{adjustment.location.name}</td>
                                    <td>
                                        <strong>{item.product.name}</strong>
                                        <small className="table-subline">{item.product.product_code} · {item.unit?.name} ({item.unit?.code})</small>
                                    </td>
                                    <td>{formatCompoundQuantity(item.system_quantity, item.product.units)}</td>
                                    <td>{formatSelectedUnitQuantity(item.counted_quantity, item.unit, item.product.units)}</td>
                                    <td className={item.quantity_delta < 0 ? 'quantity-negative' : item.quantity_delta > 0 ? 'quantity-positive' : ''}>
                                        {formatCompoundQuantity(item.quantity_delta, item.product.units, { signed: true })}
                                    </td>
                                    <td>
                                        {t(reasons.find((reason) => reason.value === adjustment.reason_code)?.label || adjustment.reason_code.replaceAll('_', ' '))}
                                        <small className="table-subline">{t(adjustment.status === 'reversed'
                                            ? 'Undone · finance effect voided'
                                            : adjustment.reversal_of_id
                                                ? 'Undo movement · no finance entry'
                                                : adjustment.reason_code === 'data_correction'
                                                    ? 'Quantity correction · no finance entry'
                                                    : item.value_delta == null
                                                        ? 'Cost not recorded'
                                                        : Number(item.value_delta) < 0
                                                            ? 'Inventory loss expense · noncash'
                                                            : Number(item.value_delta) > 0
                                                                ? 'Inventory asset increase · noncash'
                                                                : 'No monetary change')}</small>
                                    </td>
                                    <td><StatusBadge status={adjustment.status} label={t(adjustment.status)} /></td>
                                    {canUndo && <td className="adjustments-correction__table-action">{adjustment.status === 'posted' && !adjustment.reversal_of_id && adjustment.items.length === 1 && <button type="button" className="btn secondary" onClick={() => openUndo(adjustment, item)}>{t('Undo')}</button>}</td>}
                                </DetailTableRow>
                            ))}
                        </tbody>
                    </table>
                </div>
                <AdminPagination paginator={adjustments} label={t('adjustments')} queryParams={filters} preserveState />
            </section>

            {undoTarget && (
                <CrudModal open title={t("Undo adjustment")} busy={undoBusy} onClose={() => setUndoTarget(null)}>
                    <form className="adjustments-correction-form" onSubmit={submitUndo} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="adjustment-undo-title">

                        <div className="finance-report-filter__drawer-body adjustments-correction__body">
                            <p className="adjustments-correction__hint">{t('The original record remains in history. Same-day Undo restores stock and voids its finance effect when no later product activity exists.')}</p>
                            <div className="adjustments-correction__summary">
                                <span><small>{t('Stock before original adjustment')}</small><strong>{originalStock.toLocaleString()} {t('base units')}</strong></span>
                                <span><small>{t('Stock after mistaken adjustment')}</small><strong>{Number(undoTarget.item.base_counted_quantity).toLocaleString()} {t('base units')}</strong></span>
                            </div>
                            <p className="adjustments-correction__impact" role="status"><b>{t('Stock after undo')}: {originalStock.toLocaleString()} {t('base units')}</b>{t('The original finance entry is voided. To record the correct damage or count, create a new adjustment from Inventory overview.')}</p>
                            <label className="form-field">
                                <span>{t('Reason for undo')}</span>
                                <textarea minLength={10} maxLength={2000} value={undoExplanation} onChange={(event) => setUndoExplanation(event.target.value)} required />
                            </label>
                            {Object.values(undoErrors).map((message, index) => <p key={index} className="text-danger" role="alert">{uiText(message)}</p>)}
                        </div>
                        <div className="drawer-actions">
                            <button type="button" className="btn secondary" disabled={undoBusy} onClick={() => setUndoTarget(null)}>{t('Cancel')}</button>
                            <button type="submit" className="btn danger" disabled={undoBusy}>{t('Undo adjustment')}</button>
                        </div>
                    </form>
                </CrudModal>
            )}
        </AdminLayout>
    );
}
