import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { formatDateTime as displayformatDateTime, formatDate as displayformatDate } from '@/Utils/dateTime';
import DetailTableRow from '@/Components/Admin/DetailTableRow';
import CrudModal, { CrudAction } from "@/Components/Admin/CrudModal";
import { confirmCrud } from '@/Components/Admin/CrudConfirm';
import { useEffect, useState } from 'react';
import { Head, Link, router, useForm, usePage } from '@/spa/router';
import AdminLayout from '@/Layouts/AdminLayout';
import Icon from '@/Components/Admin/icons';
import { AdminFlash } from '@/Components/Admin/AdminFlash';
import { StatusBadge } from '@/Components/Admin/shared';
import { routeWithBase, storageUrl } from '@/Utils/url';
import { getOrderStatus, orderStatusLabels, paymentLabels } from '@/constants/orderLabels';
import { usePhraseTranslation } from '@/Utils/i18n';
import { formatMoney } from '@/Utils/pricing';

const formatOrderDate = displayformatDateTime;

export default function OrdersShow({ order, voucherLinks = {}, canReviewPayments, canManageOrders, canCancelOrders }) {
    const uiText = useUiTranslation();
    const t = usePhraseTranslation();
    const { app_base, app_url, flash, auth, is_super_admin, errors: pageErrors = {} } = usePage().props;
    const [rejectOpen, setRejectOpen] = useState(false);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);

    const rejectForm = useForm({ reason: '' });
    const confirmForm = useForm({
        discount_type: order.admin_discount_type || 'percent',
        discount_value: order.admin_discount_value > 0 ? order.admin_discount_value : '',
    });
    const notesForm = useForm({ admin_notes: order.admin_notes ?? '' });
    const cancelForm = useForm({ reason: '' });
    const deleteForm = useForm({ reason: '' });
    const deliveryForm = useForm({ delivered: !Boolean(order.delivered_at) });
    useEffect(() => { if (confirmForm.recentlySuccessful) setReviewOpen(false); }, [confirmForm.recentlySuccessful]);

    const proofUrl = order.payment_proof_url || storageUrl(order.payment_proof_path, app_url);
    const paymentAccount = order.payment_method_snapshot || order.selected_payment_method || (order.payment_method ? { banking_service: order.payment_method } : null);
    const displayStatus = getOrderStatus(order);
    const awaitingReview = order.payment_status === 'pending_review' && displayStatus !== 'cancelled';
    const isCancelled = displayStatus === 'cancelled';
    const isCreditSale = Number(order.credit_amount || 0) > 0;
    const removalTitle = isCreditSale ? 'Cancel credit sale' : order.is_online_sale ? 'Cancel online sale' : 'Cancel order';
    const canReadBales = is_super_admin || ['catalog.view', 'catalog.manage', 'inventory.view', 'inventory.receive'].some((permission) => (auth?.user?.permissions || []).includes(permission));
    const orderPayableAmount = Number(order.final_amount || 0);
    const approvalDiscountValue = Number(confirmForm.data.discount_value || 0);
    const approvalDiscountAmount = Math.max(0, Math.min(
        orderPayableAmount,
        confirmForm.data.discount_type === 'percent'
            ? orderPayableAmount * (approvalDiscountValue / 100)
            : approvalDiscountValue,
    ));
    const approvalFinalAmount = Math.max(0, orderPayableAmount - approvalDiscountAmount);
    const discountTooHigh = confirmForm.data.discount_type === 'percent'
        ? approvalDiscountValue > 100
        : approvalDiscountValue > orderPayableAmount;

    const handleConfirm = async () => {
        const message = approvalDiscountAmount > 0
            ? t('Confirm payment and apply :amount discount? Stock will be deducted and the order completed.', { amount: formatMoney(approvalDiscountAmount) })
            : t('Confirm payment? Stock will be deducted and the order completed.');
        if (!await confirmCrud(message)) return;
        confirmForm.post(routeWithBase(`/admin/orders/${order.id}/confirm-payment`, app_base), {
            preserveScroll: true,
        });
    };

    const handleReject = (e) => {
        e.preventDefault();
        rejectForm.post(routeWithBase(`/admin/orders/${order.id}/reject-payment`, app_base), {
            preserveScroll: true,
            onSuccess: () => setRejectOpen(false),
        });
    };

    const saveNotes = (e) => {
        e.preventDefault();
        notesForm.patch(routeWithBase(`/admin/orders/${order.id}/notes`, app_base), { preserveScroll: true });
    };

    const handleCancel = (e) => {
        e.preventDefault();
        cancelForm.post(routeWithBase(`/admin/orders/${order.id}/cancel`, app_base), {
            preserveScroll: true,
            onSuccess: () => setCancelOpen(false),
        });
    };

    const handleDelete = (e) => {
        e.preventDefault();
        deleteForm.delete(routeWithBase(`/admin/orders/${order.id}`, app_base), {
            preserveScroll: true,
            onSuccess: (response) => {
                setDeleteOpen(false);
                router.visit(response?.redirect || routeWithBase('/admin/orders', app_base), {
                    replace: true,
                    showSkeleton: false,
                });
            },
        });
    };

    return (
        <AdminLayout title={uiText(order.order_number)} contentClassName="order-detail-page" action={
            <div className="inline-actions order-detail-actions">
                {voucherLinks.print && <a href={voucherLinks.print} target="_blank" rel="noopener noreferrer" className="btn secondary">
                    <Icon name="receipt" size={14} /> {t('Print voucher')}
                </a>}
                {canManageOrders && order.is_online_sale && !isCancelled && <button type="button" className={`btn ${order.delivered_at ? 'secondary' : 'primary'}`} disabled={deliveryForm.processing}
                    onClick={() => deliveryForm.patch(routeWithBase(`/admin/orders/${order.id}/delivery`, app_base), { data: { delivered: !Boolean(order.delivered_at) }, preserveScroll: true })}>
                    {uiText(deliveryForm.processing ? t('Updating...') : t(order.delivered_at ? 'Mark not delivered' : 'Mark delivered'))}
                </button>}
            </div>
        }>
            <Head title={t('Order :value', { value: order.order_number })} />
            <div className="order-detail-meta">
                <Link href={routeWithBase('/admin/orders', app_base)} className="back-link">
                    <Icon name="navigation" size={14} style={{ transform: 'rotate(180deg)' }} /> {t('Orders')}
                </Link>
                <span>{formatOrderDate(order.created_at)}</span>
                {order.receipt_number && <span>{order.receipt_number}</span>}
                <div className="order-detail-badges">
                    {order.is_online_sale && <StatusBadge status="info" label={t('Online sale')} />}
                    <StatusBadge status={displayStatus} label={t(orderStatusLabels[displayStatus] || displayStatus)} />
                    <StatusBadge status={order.payment_status} label={t(paymentLabels[order.payment_status] || order.payment_status)} />
                </div>
            </div>
            <AdminFlash flash={flash} errors={{
                delivery: deliveryForm.errors.delivery || deliveryForm.errors.request || pageErrors.delivery,
            }} />
            {isCancelled && <div className="flash warning">
                {t('This order was cancelled.')}{order.payment_rejection_reason && ` ${order.payment_rejection_reason}`}
            </div>}
            <div className="order-detail-grid">
                <div className="order-detail-main">
                    <section aria-labelledby="order-items-title">
                        <h2 className="order-section-title" id="order-items-title">{t('Items')}</h2>
                        <div className="table-wrap">
                            <table>
                                <thead><tr>
                                    <th>{t('Item')}</th>
                                    <th className="numeric-cell">{t('Qty')}</th>
                                    <th className="numeric-cell">{t('Price')}</th>
                                    <th className="numeric-cell">{t('Total')}</th>
                                </tr></thead>
                                <tbody>
                                    {(order.items || []).map(item => <DetailTableRow key={item.id} href={canReadBales && item.product?.metadata?.vintage_bale_id ? routeWithBase(`/admin/bales/${item.product.metadata.vintage_bale_id}`,app_base) : undefined} >
                                        <td>
                                            <strong>{item.product?.name || item.product_name || t('Item')}</strong>
                                            {canReadBales && item.product?.metadata?.vintage_bale_id && <small><Link href={routeWithBase(`/admin/bales/${item.product.metadata.vintage_bale_id}`, app_base)}>{t('View bale')}</Link></small>}
                                            {Number(item.foc_quantity || 0) > 0 && <small>{t('FOC')}: {item.foc_quantity} {item.foc_unit?.name || ''}</small>}
                                        </td>
                                        <td className="numeric-cell">{item.quantity}<small>{item.unit_name || item.unit?.name}</small></td>
                                        <td className="numeric-cell">{formatMoney(item.unit_price)}</td>
                                        <td className="numeric-cell"><strong>{formatMoney(item.total_price)}</strong></td>
                                    </DetailTableRow>)}
                                    {!order.items?.length && <tr><td colSpan={4} className="muted">{t('No items recorded.')}</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>
                    <section className="order-detail-notes" aria-labelledby="order-notes-title">
                        <div className="order-section-heading">
                            <h2 className="order-section-title" id="order-notes-title">{t('Notes')}</h2>
                            {canManageOrders && <CrudAction title={t('Edit admin notes')} label={t('Edit admin notes')} form={notesForm} className="text-btn">
                                <form onSubmit={saveNotes}>
                                    <label className="form-field"><span>{t('Private staff notes')}</span>
                                        <textarea value={notesForm.data.admin_notes} onChange={event => notesForm.setData('admin_notes', event.target.value)} rows={4} />
                                    </label>
                                    <button type="submit" className="btn primary" disabled={notesForm.processing}>{t('Save notes')}</button>
                                </form>
                            </CrudAction>}
                        </div>
                        {order.order_notes && <p>{order.order_notes}</p>}
                        {order.admin_notes && <p className="muted">{order.admin_notes}</p>}
                        {!order.order_notes && !order.admin_notes && <p className="muted">{t('No notes.')}</p>}
                    </section>
                </div>
                <aside className="order-summary" aria-label={t('Order summary')}>
                    <section className="order-summary-section">
                        <h2 className="order-section-title">{t('Customer')}</h2>
                        <strong>{order.receiver_name || order.user?.name || t('Walk-in customer')}</strong>
                        {(order.receiver_phone || order.user?.phone) && <p className="muted">{order.receiver_phone || order.user?.phone}</p>}
                    </section>
                    <section className="order-summary-section">
                        <h2 className="order-section-title">{t('Payment')}</h2>
                        <div className="detail-row"><span>{t('Subtotal')}</span><strong>{formatMoney(order.total_amount)}</strong></div>
                        {Number(order.discount_amount || 0) > 0 && <div className="detail-row"><span>{t('Discount')}</span><strong>-{formatMoney(order.discount_amount)}</strong></div>}
                        {Number(order.shipping_fee || 0) > 0 && <div className="detail-row"><span>{t('Additional charges')}</span><strong>{formatMoney(order.shipping_fee)}</strong></div>}
                        <div className="detail-row order-summary-total"><span>{t('Total')}</span><strong>{formatMoney(order.final_amount)}</strong></div>
                        {(order.payments || []).map(payment => <div className="detail-row" key={payment.id}>
                            <span>{t(({ cash: 'Cash', mmqr: 'MMQR (Pay)', bank_transfer: 'Bank transfer', card: 'Card', credit: 'Credit' })[payment.tender_type || payment.method] || payment.tender_type || payment.method || 'Payment')}{payment.status === 'reversed' && <small>{t('Reversed')} · {payment.payment_details?.reversal_reason}</small>}</span><strong>{payment.status === 'reversed' ? <s>{formatMoney(payment.amount)}</s> : formatMoney(payment.amount)}</strong>
                        </div>)}
                        {!(order.payments || []).length && order.payment_method && <div className="detail-row"><span>{t('Method')}</span><strong>{t(({ cash: 'Cash', mmqr: 'MMQR (Pay)', bank_transfer: 'Bank transfer', card: 'Card', credit: 'Credit' })[order.payment_method] || order.payment_method)}</strong></div>}
                        {isCreditSale && <div className="order-credit-summary">
                            <div className="detail-row"><span>{t('Paid')}</span><strong>{formatMoney(order.paid_amount || 0)}</strong></div>
                            <div className="detail-row"><span>{t('Credit balance')}</span><strong>{formatMoney(Math.max(0, Number(order.final_amount) - Number(order.paid_amount || 0)))}</strong></div>
                            {order.credit_due_date && <div className="detail-row"><span>{t('Due date')}</span><strong>{displayformatDate(order.credit_due_date)}</strong></div>}
                        </div>}
                    </section>
                    {(proofUrl || (awaitingReview && canReviewPayments)) && <section className="order-summary-section">
                        <h2 className="order-section-title">{t('Payment proof')}</h2>
                        {paymentAccount && <div className="order-payment-account">
                            <strong>{uiText(paymentAccount.banking_service || order.payment_method || t('Manual transfer'))}</strong>
                            {paymentAccount.account_name && <span>{paymentAccount.account_name}</span>}
                            {paymentAccount.account_no && <span>{paymentAccount.account_no}</span>}
                        </div>}
                        {proofUrl && <a href={proofUrl} target="_blank" rel="noopener noreferrer"><img className="order-payment-proof" src={proofUrl} alt={t('Payment proof')} /></a>}
                        {awaitingReview && canReviewPayments && <button type="button" className="btn primary" onClick={() => { confirmForm.clearErrors(); setReviewOpen(true); }}>{t('Review payment')}</button>}
                    </section>}
                    {canCancelOrders && !isCancelled && <div className="order-summary-section order-cancel-action">
                        <button type="button" className="text-btn danger" onClick={() => displayStatus === 'pending' ? setCancelOpen(true) : setDeleteOpen(true)} disabled={deleteForm.processing || cancelForm.processing}>
                            {t('Cancel order')}
                        </button>
                    </div>}
                </aside>
            </div>
                                    <CrudModal open={reviewOpen} onClose={() => { setReviewOpen(false); confirmForm.clearErrors(); }} title={t('Review payment')} busy={confirmForm.processing} errors={confirmForm.errors}>
                                <div
                                    className="stack-sm"
                                    style={{
                                        paddingTop: 12,
                                        borderTop: '1px solid var(--color-border)',
                                    }}
                                >
                                    <div className="approval-discount">
                                        <div className="approval-discount-grid">
                                            <label className="form-field">
                                                <span>{t('Discount mode')}</span>
                                                <select
                                                    value={confirmForm.data.discount_type}
                                                    onChange={(e) => confirmForm.setData('discount_type', e.target.value)}
                                                    disabled={confirmForm.processing}
                                                >
                                                    <option value="percent">{t('Percent')}</option>
                                                    <option value="amount">{t('Amount')}</option>
                                                </select>
                                            </label>
                                            <label className="form-field">
                                                <span>
                                                    {uiText(confirmForm.data.discount_type === 'percent'
                                                        ? t('Discount percent')
                                                        : t('Discount amount'))}
                                                </span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={confirmForm.data.discount_type === 'percent' ? 100 : orderPayableAmount}
                                                    step="0.01"
                                                    value={confirmForm.data.discount_value}
                                                    onChange={(e) => confirmForm.setData('discount_value', e.target.value)}
                                                    placeholder={uiText(confirmForm.data.discount_type === 'percent' ? '0%' : '0.00')}
                                                    disabled={confirmForm.processing}
                                                />
                                            </label>
                                        </div>
                                        {(confirmForm.errors.discount_type || confirmForm.errors.discount_value) && (
                                            <small className="field-error">
                                                {confirmForm.errors.discount_type || confirmForm.errors.discount_value}
                                            </small>
                                        )}
                                        <div className="approval-discount-summary">
                                            <div>
                                                <span>{t('Current total')}</span>
                                                <strong>{formatMoney(orderPayableAmount)}</strong>
                                            </div>
                                            <div>
                                                <span>{t('Approval discount')}</span>
                                                <strong>-{formatMoney(approvalDiscountAmount)}</strong>
                                            </div>
                                            <div>
                                                <span>{t('Customer pays')}</span>
                                                <strong>{formatMoney(approvalFinalAmount)}</strong>
                                            </div>
                                        </div>
                                        {discountTooHigh && (
                                            <small className="field-error">
                                                {t('Discount cannot be greater than the current order total.')}
                                            </small>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            className="btn success grow"
                                            onClick={handleConfirm}
                                            disabled={confirmForm.processing || discountTooHigh}
                                            style={{ minWidth: 150 }}
                                        >
                                            <Icon name="check" size={14} />
                                            {t('Confirm payment')}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn danger grow"
                                            onClick={() => { setReviewOpen(false); setRejectOpen(true); }}
                                            disabled={rejectForm.processing}
                                            style={{ minWidth: 140 }}
                                        >
                                            {t('Reject payment')}
                                        </button>
                                    </div>
                                </div>
                                    </CrudModal>
            {rejectOpen && (
                <CrudModal open title={t('Reject payment')} onClose={() => { setRejectOpen(false); rejectForm.clearErrors(); }} busy={rejectForm.processing} errors={rejectForm.errors} action={<> <button form="admin-orders-show-jsx-1" type="submit" className="btn danger" disabled={rejectForm.processing}>
                                {t('Reject & cancel')}
                            </button> </>}>
<form id="admin-orders-show-jsx-1" className="admin-modal-form" onSubmit={handleReject}>

                        <div className="crud-grid admin-form-grid admin-form-grid-single">
                            <label className="form-field span-2">
                                <span>{t('Message to customer (optional)')}</span>
                                <textarea
                                    value={rejectForm.data.reason}
                                    onChange={(e) => rejectForm.setData('reason', e.target.value)}
                                />
                            </label>
                        </div>

                    </form>
</CrudModal>
            )}

            {cancelOpen && (
                <CrudModal open title={t('Cancel order')} onClose={() => { setCancelOpen(false); cancelForm.clearErrors(); }} busy={cancelForm.processing} errors={cancelForm.errors} action={<> <button form="admin-orders-show-jsx-2" type="submit" className="btn danger" disabled={cancelForm.processing}>
                                {t('Cancel order')}
                            </button> </>}>
<form id="admin-orders-show-jsx-2" className="admin-modal-form" onSubmit={handleCancel}>

                        <div className="crud-grid admin-form-grid admin-form-grid-single">
                            <p className="admin-form-notice">
                                {uiText(order.payment_status === 'paid'
                                    ? t('Stock will be returned to inventory. Any collected payment must be refunded separately.')
                                    : t('This will cancel the order and release reserved stock.'))}
                            </p>
                            <label className="form-field span-2">
                                <span>{t('Reason (optional)')}</span>
                                <textarea
                                    value={cancelForm.data.reason}
                                    onChange={(e) => cancelForm.setData('reason', e.target.value)}
                                />
                            </label>
                        </div>

                    </form>
</CrudModal>
            )}

            {deleteOpen && (
                <CrudModal open title={t(removalTitle)} onClose={() => { setDeleteOpen(false); deleteForm.clearErrors(); }} busy={deleteForm.processing} errors={deleteForm.errors} action={<> <button form="admin-orders-show-jsx-3" type="submit" className="btn danger" disabled={deleteForm.processing} aria-busy={deleteForm.processing}>
                                {uiText(deleteForm.processing ? t('Updating...') : t(removalTitle))}
                            </button> </>}>
<form id="admin-orders-show-jsx-3" className="admin-modal-form" onSubmit={handleDelete}>

                        <div className="crud-grid admin-form-grid admin-form-grid-single">
                            <p className="admin-form-notice">
                                {t(isCreditSale
                                    ? 'Credit sale will be cancelled, stock returned and outstanding debt reversed. Payment history stays for audit; any collected amount must be refunded separately.'
                                    : 'Unpaid orders will be removed and reservations released. Paid sales will be cancelled and stock returned; payment history is retained. Any refund due must still be paid separately.')}
                            </p>
                            <label className="form-field span-2">
                                <span>{t('Reason (optional)')}</span>
                                <textarea
                                    value={deleteForm.data.reason}
                                    onChange={(e) => deleteForm.setData('reason', e.target.value)}
                                />
                            </label>
                        </div>

                    </form>
</CrudModal>
            )}
        </AdminLayout>
    );
}
