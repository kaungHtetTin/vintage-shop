import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { formatDate as displayformatDate, formatDateTime as displayformatDateTime } from '@/Utils/dateTime';
import DetailTableRow from '@/Components/Admin/DetailTableRow';
import { CrudAction } from "@/Components/Admin/CrudModal";
import CorrectCreditPayment, { CreditCorrectionNotes } from '@/Components/Admin/CorrectCreditPayment';
import { getOrderStatus, orderStatusLabels } from '@/constants/orderLabels';
import { Head, Link, useForm, usePage } from "@/spa/router";
import AdminLayout from "@/Layouts/AdminLayout";
import Icon from "@/Components/Admin/icons";
import { StatusBadge } from "@/Components/Admin/shared";
import { routeWithBase } from "@/Utils/url";
import { usePhraseTranslation } from "@/Utils/i18n";
import { formatMoney } from "@/Utils/pricing";

const money = formatMoney;

function StatCard({ label, value, hint }) {
    const uiText = useUiTranslation();
    return (
        <article className="metric-card glass">
            <small>{uiText(label)}</small>
            <strong>{uiText(value)}</strong>
            {hint && <p>{uiText(hint)}</p>}
        </article>
    );
}

export default function CustomerShow({
    customer,
    stats,
    recentOrders,
    topCategories,
    canManageCredit = false,
    creditSummary = {},
    creditTransactions = [],
    creditOrders = [],
}) {
    const uiText = useUiTranslation();
    const { app_base } = usePage().props;
    const t = usePhraseTranslation();
    const creditSettingsForm = useForm({
        credit_status: customer.credit_status || "disabled",
        credit_limit: customer.credit_limit || 0,
        credit_terms_days: customer.credit_terms_days || 30,
    });
    const creditPaymentForm = useForm({
        order_id: "",
        amount: "",
        tender_type: "cash",
        reference: "",
        notes: "",
    });

    const submitCreditSettings = (event) => {
        event.preventDefault();
        creditSettingsForm.patch(
            routeWithBase(
                `/admin/customers/${customer.id}/credit-settings`,
                app_base,
            ),
            { preserveScroll: true },
        );
    };
    const submitCreditPayment = (event) => {
        event.preventDefault();
        creditPaymentForm.post(
            routeWithBase(
                `/admin/customers/${customer.id}/credit-payments`,
                app_base,
            ),
            {
                preserveScroll: true,
                onSuccess: () =>
                    creditPaymentForm.reset("amount", "reference", "notes"),
            },
        );
    };

    return (
        <AdminLayout title={customer.name} translateTitle={false} eyebrow={t("Customer credit record")} contentClassName="customer-detail-page" headingDetails={
                <div className="customer-heading-details">
                    <span><Icon name="mobile" size={14} />{customer.phone || t("No phone recorded")}</span>
                    <span><Icon name="mapPin" size={14} />{customer.default_address || t("No address recorded")}</span>
                    <span className="customer-heading-status"><Icon name={customer.credit_status === "active" ? "check" : "lock"} size={14} /><StatusBadge status={customer.credit_status || "disabled"} label={t(customer.credit_status || "disabled")} /></span>
                </div>
            } action={<div className="inline-actions admin-page-actions customer-header-actions">{canManageCredit && <><a
                            className="btn secondary"
                            href={routeWithBase(
                                `/admin/customers/${customer.id}/credit-statement`,
                                app_base,
                            )}
                        >
                            <Icon name="download" size={14} />
                            {t("Statement PDF")}
                        </a><CrudAction title={t("Credit settings")} form={creditSettingsForm}>
                            <form
                                className="crud-grid"
                                onSubmit={submitCreditSettings}
                            >
                                <label className="form-field">
                                    <span>{t("Credit status")}</span>
                                    <select
                                        value={
                                            creditSettingsForm.data.credit_status
                                        }
                                        onChange={(e) =>
                                            creditSettingsForm.setData(
                                                "credit_status",
                                                e.target.value,
                                            )
                                        }
                                    >
                                        <option value="disabled">
                                            {t("Disabled")}
                                        </option>
                                        <option value="active">
                                            {t("Active")}
                                        </option>
                                        <option value="suspended">
                                            {t("Suspended")}
                                        </option>
                                    </select>
                                    {creditSettingsForm.errors.credit_status && (
                                        <small className="field-error">
                                            {
                                                creditSettingsForm.errors
                                                    .credit_status
                                            }
                                        </small>
                                    )}
                                </label>
                                <label className="form-field">
                                    <span>{t("Credit limit")}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="100"
                                        value={creditSettingsForm.data.credit_limit}
                                        onChange={(e) =>
                                            creditSettingsForm.setData(
                                                "credit_limit",
                                                e.target.value,
                                            )
                                        }
                                    />
                                    {creditSettingsForm.errors.credit_limit && (
                                        <small className="field-error">
                                            {uiText(creditSettingsForm.errors.credit_limit)}
                                        </small>
                                    )}
                                </label>
                                <label className="form-field">
                                    <span>{t("Payment terms (days)")}</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="365"
                                        value={
                                            creditSettingsForm.data
                                                .credit_terms_days
                                        }
                                        onChange={(e) =>
                                            creditSettingsForm.setData(
                                                "credit_terms_days",
                                                e.target.value,
                                            )
                                        }
                                    />
                                    {creditSettingsForm.errors
                                        .credit_terms_days && (
                                        <small className="field-error">
                                            {
                                                creditSettingsForm.errors
                                                    .credit_terms_days
                                            }
                                        </small>
                                    )}
                                </label>
                                <div
                                    className="span-2"
                                    style={{
                                        display: "flex",
                                        justifyContent: "flex-start",
                                        alignItems: "flex-end",
                                    }}
                                >
                                    <button
                                        type="submit"
                                        className="btn primary"
                                        style={{ width: 200, maxWidth: "100%" }}
                                        disabled={creditSettingsForm.processing}
                                    >
                                        {t("Save credit settings")}
                                    </button>
                                </div>
                            </form>
                        </CrudAction><CrudAction title={t("Record credit payment")} className="btn primary" form={creditPaymentForm}>
                            <form
                                className="crud-grid"
                                onSubmit={submitCreditPayment}
                            >
                                <label className="form-field span-2">
                                    <span>{t("Credit order")}</span>
                                    <select
                                        value={creditPaymentForm.data.order_id}
                                        onChange={(e) =>
                                            creditPaymentForm.setData(
                                                "order_id",
                                                e.target.value,
                                            )
                                        }
                                        disabled={!creditOrders.length}
                                    >
                                        {!creditOrders.length && (
                                            <option value="">
                                                {t("No outstanding credit orders")}
                                            </option>
                                        )}
                                        {!!creditOrders.length && (
                                            <option value="">
                                                {t(
                                                    "Automatic allocation (oldest due first)",
                                                )}
                                            </option>
                                        )}
                                        {creditOrders.map((order) => (
                                            <option key={order.id} value={order.id}>
                                                {order.receipt_number ||
                                                    order.order_number}{" "}
                                                ·{" "}
                                                {money(
                                                    Number(order.final_amount) -
                                                        Number(
                                                            order.paid_amount || 0,
                                                        ),
                                                )}{" "}
                                                · {displayformatDate(order.credit_due_date)}
                                            </option>
                                        ))}
                                    </select>
                                    {creditPaymentForm.errors.order_id && (
                                        <small className="field-error">
                                            {uiText(creditPaymentForm.errors.order_id)}
                                        </small>
                                    )}
                                </label>
                                <label className="form-field">
                                    <span>{t("Payment amount")}</span>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={creditPaymentForm.data.amount}
                                        onChange={(e) =>
                                            creditPaymentForm.setData(
                                                "amount",
                                                e.target.value,
                                            )
                                        }
                                    />
                                    {creditPaymentForm.errors.amount && (
                                        <small className="field-error">
                                            {uiText(creditPaymentForm.errors.amount)}
                                        </small>
                                    )}
                                </label>
                                <label className="form-field">
                                    <span>{t("Payment method")}</span>
                                    <select
                                        value={creditPaymentForm.data.tender_type}
                                        onChange={(e) =>
                                            creditPaymentForm.setData(
                                                "tender_type",
                                                e.target.value,
                                            )
                                        }
                                    >
                                        <option value="cash">{t("Cash")}</option>
                                        <option value="mmqr">{uiText("MMQR (Pay)")}</option>
                                        <option value="mobile">
                                            {t("Mobile")}
                                        </option>
                                        <option value="bank_transfer">
                                            {t("Bank transfer")}
                                        </option>
                                    </select>
                                </label>
                                <label className="form-field">
                                    <span>{t("Reference")}</span>
                                    <input
                                        value={creditPaymentForm.data.reference}
                                        onChange={(e) =>
                                            creditPaymentForm.setData(
                                                "reference",
                                                e.target.value,
                                            )
                                        }
                                    />
                                </label>
                                <label className="form-field">
                                    <span>{t("Notes")}</span>
                                    <input
                                        value={creditPaymentForm.data.notes}
                                        onChange={(e) =>
                                            creditPaymentForm.setData(
                                                "notes",
                                                e.target.value,
                                            )
                                        }
                                    />
                                </label>
                                <div
                                    className="span-2"
                                    style={{
                                        display: "flex",
                                        justifyContent: "flex-end",
                                    }}
                                >
                                    <button
                                        type="submit"
                                        className="btn primary"
                                        disabled={
                                            creditPaymentForm.processing ||
                                            !creditOrders.length
                                        }
                                    >
                                        {t("Record credit payment")}
                                    </button>
                                </div>
                            </form>
                        </CrudAction></>}</div>}>
            <Head title={t("Customer :value", { value: customer.name })} />

            

            

            <section className="customer-credit-overview">
                
                
                <div className="customer-credit-terms"><span>{t("Credit limit")}: <strong>{money(creditSummary.limit)}</strong></span><span>{t(":count day terms", { count: creditSummary.terms_days || 30 })}</span></div>
                <div className="customer-credit-summary">
                    <StatCard
                        label={t("Outstanding balance")}
                        value={money(creditSummary.balance)}
                        hint={t(creditSummary.status || "disabled")}
                    />
                    
                    
                    <StatCard
                        label={t("Overdue")}
                        value={money(creditSummary.overdue)}
                        hint={t("Past due balance")}
                    />
                </div>

                
            </section>

            <section className="panel glass" style={{ marginBottom: 14 }}>
                <h2 className="customer-section-title">{t("Credit transaction history")}</h2>
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>{t("Date")}</th>
                                <th>{t("Transaction")}</th>
                                <th>{t("Order")}</th>
                                <th>{t("Type")}</th>
                                <th className="numeric-cell">{t("Amount")}</th>
                                <th className="numeric-cell">{t("Balance")}</th>
                                <th>{t("Due date")}</th>
                                <th>{t("Staff")}</th>
                                {canManageCredit && <th>{t('Actions')}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {!creditTransactions.length ? (
                                <tr>
                                    <td colSpan={canManageCredit ? 9 : 8}>
                                        <span className="muted">
                                            {t("No credit transactions yet.")}
                                        </span>
                                    </td>
                                </tr>
                            ) : (
                                creditTransactions.map((entry) => (
                                    <DetailTableRow key={entry.id} href={entry.order?.id ? routeWithBase(`/admin/orders/${entry.order.id}`,app_base) : undefined} permission="orders.view">
                                        <td>
                                            <small>{displayformatDateTime(entry.created_at)}</small>
                                        </td>
                                        <td>
                                            <strong>
                                                {entry.transaction_number}
                                            </strong>
                                            <small>
                                                {entry.reference || "-"}
                                            </small>
                                            <CreditCorrectionNotes entry={entry} />
                                        </td>
                                        <td>
                                            {entry.order?.order_number || "-"}
                                        </td>
                                        <td>
                                            <StatusBadge
                                                status={
                                                    Number(entry.amount) > 0
                                                        ? "warning"
                                                        : "success"
                                                }
                                                label={t(entry.type === 'payment_reversal' ? 'Payment reversal' : entry.type)}
                                            />
                                        </td>
                                        <td className="numeric-cell">
                                            <strong>
                                                {Number(entry.amount) > 0
                                                    ? "+"
                                                    : ""}
                                                {money(entry.amount)}
                                            </strong>
                                        </td>
                                        <td className="numeric-cell">{money(entry.balance_after)}</td>
                                        <td>{displayformatDate(entry.due_date)}</td>
                                        <td>{entry.creator?.name || "-"}</td>
                                        {canManageCredit && <td><CorrectCreditPayment entry={entry} customerId={customer.id} /></td>}
                                    </DetailTableRow>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <div className="customer-credit-actions">
                <section className="panel glass">
                    <h2 className="customer-section-title">{t("Recent orders")}</h2>
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>{t("Order")}</th>
                                    <th>{t("Items")}</th>
                                    <th>{t("Status")}</th>
                                    <th className="numeric-cell">{t("Total")}</th>
                                    <th className="table-actions-column"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentOrders.length === 0 ? (
                                    <tr>
                                        <td colSpan={5}>
                                            <span className="muted">
                                                {t("No orders yet.")}
                                            </span>
                                        </td>
                                    </tr>
                                ) : (
                                    recentOrders.map((order) => (
                                        <DetailTableRow key={order.id} href={routeWithBase(`/admin/orders/${order.id}`,app_base)} >
                                            <td>
                                                <strong>
                                                    {order.order_number}
                                                </strong>
                                                <small>
                                                    {displayformatDateTime(order.created_at)}
                                                </small>
                                            </td>
                                            <td>{order.items_count}</td>
                                            <td>
                                                <StatusBadge
                                                    status={getOrderStatus(order)}
                                                    label={t(orderStatusLabels[getOrderStatus(order)] || order.status)}
                                                />
                                                <small>
                                                    {t(order.payment_status)}
                                                </small>
                                            </td>
                                            <td className="numeric-cell">
                                                <strong>
                                                    {money(order.final_amount)}
                                                </strong>
                                            </td>
                                            <td className="table-actions-column">
                                                <Link
                                                    href={routeWithBase(
                                                        `/admin/orders/${order.id}`,
                                                        app_base,
                                                    )}
                                                    className="icon-btn small"
                                                >
                                                    <Icon
                                                        name="external"
                                                        size={13}
                                                    />
                                                </Link>
                                            </td>
                                        </DetailTableRow>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                
            </div>
        </AdminLayout>
    );
}
