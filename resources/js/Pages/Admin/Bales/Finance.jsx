import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { formatDate as displayformatDate } from '@/Utils/dateTime';
import Icon from '@/Components/Admin/icons';
import { StatusBadge } from '@/Components/Admin/shared';
import { usePhraseTranslation } from '@/Utils/i18n';
import DetailTableRow from '@/Components/Admin/DetailTableRow';
import AdminFilterDrawer, { filterOptions, dateFilters } from '@/Components/Admin/AdminFilterDrawer';
import { CrudAction } from "@/Components/Admin/CrudModal";
import { router, useForm } from "@/spa/router";
import { Page, money, useBales, day } from "@/Components/Bales/shared";
import AdminPagination from "@/Components/Admin/AdminPagination";
function PayRefund({ entry }) {
    const uiText = useUiTranslation();
    const { href } = useBales();
    const form = useForm({ payment_method: "cash" });
    return (
        <CrudAction title={uiText("Record refund paid")} form={form}>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    form.post(href(`/admin/finance/refunds/${entry.id}/paid`), {
                        preserveScroll: true,
                    });
                }}
            >
                <p> {uiText("Use after paying")} {money(entry.amount)} {uiText("back to the customer.")} </p>
                <select
                    className="bale-input"
                    value={form.data.payment_method}
                    onChange={(e) =>
                        form.setData("payment_method", e.target.value)
                    }
                >
                    <option value="cash">{uiText("Cash drawer")}</option>
                    <option value="mmqr">{uiText("MMQR / bank")}</option>
                </select>
                {Object.values(form.errors).map((e, i) => (
                    <p className="bale-error" key={i}>
                        {e}
                    </p>
                ))}
                <button className="btn primary" disabled={form.processing}> {uiText("Record payment")} </button>
            </form>
        </CrudAction>
    );
}
export default function Finance({
    summary = {},
    entries,
    bales,
    locations = [],
    filters = {},
    manualCategories = [],
    isReport,
}) {
    const uiText = useUiTranslation();
    const { href, can, url } = useBales();
    const t = usePhraseTranslation();

    const expense = useForm({
        location_id: locations[0]?.id || "",
        type: "expense",
        title: "",
        amount: "",
        category: manualCategories[0]?.value || "other_expense",
        entry_date: day(),
        status: "approved",
        payment_method: "cash",
    });
    const query = new URLSearchParams(
        Object.entries(filters).filter(([, value]) => value),
    ).toString();
    const selectedLocation = locations.find(location => String(location.id) === String(filters.location_id));
    const period = filters.from || filters.to ? `${filters.from || t('Beginning')} - ${filters.to || t('Present')}` : t('All time');
    const cards = [
        { label: 'Money collected', value: summary.cash_in, caption: 'Approved income', icon: 'wallet', tone: 'success' },
        { label: 'Money paid out', value: summary.cash_out, caption: 'Approved outgoings', icon: 'card', tone: 'danger' },
        { label: 'Net cash movement', value: summary.net_cash, caption: 'Cash in minus cash out', icon: 'chart', tone: Number(summary.net_cash) < 0 ? 'danger' : 'success' },
        { label: 'Refunds due', value: summary.refund_due, caption: 'Awaiting payment', icon: 'history', tone: 'warning' },
        { label: 'Bale purchases', value: summary.bale_purchases, caption: 'Paid in this period', icon: 'box', tone: 'primary' },
        { label: 'Laundry', value: summary.laundry, caption: 'Paid in this period', icon: 'card', tone: 'primary' },
    ];
    const expenseAction = (<CrudAction title={uiText("Add expense")} form={expense} className="btn primary">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            expense.post(href("/admin/finance/entries"), {
                                preserveScroll: true,
                                onSuccess: () => {
                                    expense.reset("title", "amount");
                                    router.get(
                                        url,
                                        {},
                                        { preserveScroll: true, showSkeleton: false },
                                    );
                                },
                            });
                        }}
                    >
                        
                        <div className="bale-form-grid">
                            <label className="form-field">
                                <span>{uiText("Description")}</span>
                                <input
                                    required
                                    maxLength={255}
                                    value={expense.data.title}
                                    onChange={(e) =>
                                        expense.setData("title", e.target.value)
                                    }
                                />
                            </label>
                            <label className="form-field">
                                <span>{uiText("Amount paid")}</span>
                                <input
                                    required
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={expense.data.amount}
                                    onChange={(e) =>
                                        expense.setData(
                                            "amount",
                                            e.target.value,
                                        )
                                    }
                                />
                            </label>
                            <label className="form-field">
                                <span>{uiText("Category")}</span>
                                <select
                                    value={expense.data.category}
                                    onChange={(e) =>
                                        expense.setData(
                                            "category",
                                            e.target.value,
                                        )
                                    }
                                >
                                    {manualCategories.map((c) => (
                                        <option key={c.value} value={c.value}>
                                            {uiText(c.label)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="form-field">
                                <span>{uiText("Branch")}</span>
                                <select
                                    required
                                    value={expense.data.location_id}
                                    onChange={(e) =>
                                        expense.setData(
                                            "location_id",
                                            e.target.value,
                                        )
                                    }
                                >
                                    {locations.map((l) => (
                                        <option key={l.id} value={l.id}>
                                            {l.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="form-field">
                                <span>{uiText("Date paid")}</span>
                                <input
                                    required
                                    type="date"
                                    value={expense.data.entry_date}
                                    onChange={(e) =>
                                        expense.setData(
                                            "entry_date",
                                            e.target.value,
                                        )
                                    }
                                />
                            </label>
                            <label className="form-field">
                                <span>{uiText("Payment method")}</span>
                                <select
                                    value={expense.data.payment_method}
                                    onChange={(e) =>
                                        expense.setData(
                                            "payment_method",
                                            e.target.value,
                                        )
                                    }
                                >
                                    <option value="cash">{uiText("Cash")}</option>
                                    <option value="mmqr">{uiText("MMQR / bank")}</option>
                                </select>
                            </label>
                        </div>
                        <button
                            className="btn primary"
                            disabled={expense.processing}
                        > {uiText("Record expense")} </button>
                    </form>
                </CrudAction>);
    const cashLedger = (<section className="finance-data-section finance-cash-ledger">
                <div className="finance-section-heading">
                    <h2>{t("Cash ledger")}</h2><small>{t("Approved entries affect cash totals")}</small>
                </div>
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>{uiText("Date / reference")}</th>
                                <th>{uiText("Description")}</th>
                                <th>{uiText("Method")}</th>
                                <th className="numeric-cell">{uiText("Amount")}</th>
                                <th>{uiText("Status")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries?.data.map((e) => (
                                <tr key={e.id}>
                                    <td>
                                        {displayformatDate(e.entry_date)}
                                        <small>{e.reference}</small>
                                    </td>
                                    <td>
                                        {e.title}
                                        <small>
                                            {uiText(e.category)}
                                        </small>
                                    </td>
                                    <td>{t(({ cash: "Cash", mmqr: "MMQR (Pay)" })[e.payment_method] || e.payment_method || "-")}</td>
                                    <td className={`numeric-cell ${e.type === "income" ? "text-success" : "text-danger"}`}><strong>{uiText(e.type === "income" ? "+" : "-")}{money(e.amount)}</strong></td>
                                    <td>
                                        <StatusBadge status={e.status} label={t(({ approved: 'Approved', pending: 'Pending', rejected: 'Rejected', void: 'Voided', draft: 'Draft' })[e.status] || e.status)} />
                                        {e.category === "refund_payable" &&
                                            e.status === "pending" &&
                                            can("manage_finance") && (
                                                <PayRefund entry={e} />
                                            )}
                                    </td>
                                </tr>
                            ))}
                            {!entries?.data.length && (
                                <tr>
                                    <td colSpan={5} className="bale-empty"> {uiText("No ledger entries in this period.")} </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <AdminPagination paginator={entries} label={uiText("entries")} />
            </section>);
    const baleResults = (<section className="finance-data-section finance-bale-results">
                <div className="finance-section-heading">
                    <h2>{t("Bale results")}</h2>
                    <small>{t("Lifetime totals, before shop overhead")}</small>
                </div>
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>{uiText("Bale")}</th>
                                <th className="numeric-cell">{uiText("Purchase + laundry")}</th>
                                <th className="numeric-cell">{uiText("Net sales")}</th>
                                <th className="numeric-cell">{uiText("Sales less bale costs")}</th>
                                <th>{uiText("Result")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bales?.data.map((b) => (
                                <DetailTableRow key={b.id} href={href(`/admin/bales/${b.id}`)} permissions={['catalog.view','catalog.manage','inventory.view','inventory.receive']}>
                                    <td>
                                        {b.code}
                                        <small>{b.supplier?.name}</small>
                                    </td>
                                    <td className="numeric-cell">{money(b.total_cost)}</td>
                                    <td className="numeric-cell">{money(b.sales_revenue)}</td>
                                    <td className={`numeric-cell ${Number(b.bale_result) < 0 ? "text-danger" : "text-success"}`}><strong>{money(b.bale_result)}</strong></td>
                                    <td>
                                        {uiText(b.status === "closed"
                                            ? "Final"
                                            : "Still selling")}
                                    </td>
                                </DetailTableRow>
                            ))}
                            {!bales?.data.length && (
                                <tr>
                                    <td colSpan={5} className="bale-empty"> {uiText("Bale results will appear after your first purchase.")} </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <AdminPagination paginator={bales} label={uiText("bales")} />
            </section>);

    return (
        <Page title={t(isReport ? 'Bale results & reports' : 'Finance')} eyebrow={t(isReport ? 'Sales reports' : 'Cash management')}
            action={<div className="inline-actions admin-page-actions">
                <AdminFilterDrawer filters={filters} fields={[
                    { key: 'location_id', label: 'Store', type: 'select', options: filterOptions(locations, 'All stores') },
                    ...dateFilters(),
                ]} onApply={values => router.get(href(isReport ? '/admin/reports' : '/admin/finance'), values, { preserveState: true, preserveScroll: true, replace: true })} />
                <a className="btn secondary" href={href((isReport ? '/admin/reports/export' : '/admin/finance/export') + '?' + query)}><Icon name="download" size={14} />{t('Export')}</a>
                {uiText(can('manage_finance') && !isReport && expenseAction)}
            </div>}>
            <div className="finance-page-content">
                <section className="finance-summary" aria-label={t('Cash summary')}>
                    <p className="finance-summary-scope">{selectedLocation?.name || t('All stores')} - {period}</p>
                    <div className="finance-summary-grid">
                        {cards.map(card => <article key={card.label} className={`metric-card glass credit-kpi-card finance-summary-card tone-${card.tone}`}>
                            <span className="icon-well"><Icon name={card.icon} size={14} /></span>
                            <small>{t(card.label)}</small><strong>{money(card.value)}</strong><p>{t(card.caption)}</p>
                        </article>)}
                    </div>
                </section>
                {isReport && baleResults}
                {cashLedger}
            </div>
        </Page>
    );
}
