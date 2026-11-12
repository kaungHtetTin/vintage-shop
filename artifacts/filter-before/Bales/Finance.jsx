import { CrudAction } from "@/Components/Admin/CrudModal";
import { Link, router, useForm } from "@/spa/router";
import { Page, Stats, money, useBales, day } from "@/Components/Bales/shared";
import AdminPagination from "@/Components/Admin/AdminPagination";
function PayRefund({ entry }) {
    const { href } = useBales();
    const form = useForm({ payment_method: "cash" });
    return (
        <CrudAction title="Record refund paid" form={form}>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    form.post(href(`/admin/finance/refunds/${entry.id}/paid`), {
                        preserveScroll: true,
                    });
                }}
            >
                <p>
                    Use after paying {money(entry.amount)} back to the customer.
                </p>
                <select
                    className="bale-input"
                    value={form.data.payment_method}
                    onChange={(e) =>
                        form.setData("payment_method", e.target.value)
                    }
                >
                    <option value="cash">Cash drawer</option>
                    <option value="mmqr">MMQR / bank</option>
                </select>
                {Object.values(form.errors).map((e, i) => (
                    <p className="bale-error" key={i}>
                        {e}
                    </p>
                ))}
                <button className="btn primary" disabled={form.processing}>
                    Record payment
                </button>
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
    const { href, can, url } = useBales();
    const filter = useForm({
        from: filters.from || "",
        to: filters.to || "",
        location_id: filters.location_id || "",
    });
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
    return (
        <Page
            title={
                isReport ? "Bale results & reports" : "Finance / cash ledger"
            }
            errors={expense.errors}
            action={
                <a
                    className="btn secondary"
                    href={href(
                        isReport
                            ? `/admin/reports/export?${query}`
                            : `/admin/finance/export?${query}`,
                    )}
                >
                    Export Excel
                </a>
            }
        >
            <p className="bale-intro">
                Purchases and laundry are recorded automatically. Cash movement
                is separate from the result of selling a bale.
            </p>
            <section className="panel glass">
                <form
                    className="bale-filter-row"
                    onSubmit={(e) => {
                        e.preventDefault();
                        router.get(
                            href(
                                isReport ? "/admin/reports" : "/admin/finance",
                            ),
                            filter.data,
                        );
                    }}
                >
                    <label className="form-field">
                        <span>From</span>
                        <input
                            type="date"
                            value={filter.data.from}
                            onChange={(e) =>
                                filter.setData("from", e.target.value)
                            }
                        />
                    </label>
                    <label className="form-field">
                        <span>To</span>
                        <input
                            type="date"
                            min={filter.data.from || undefined}
                            value={filter.data.to}
                            onChange={(e) =>
                                filter.setData("to", e.target.value)
                            }
                        />
                    </label>
                    <label className="form-field">
                        <span>Branch</span>
                        <select
                            value={filter.data.location_id}
                            onChange={(e) =>
                                filter.setData("location_id", e.target.value)
                            }
                        >
                            <option value="">All allowed branches</option>
                            {locations.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button className="btn primary">Apply</button>
                </form>
                <p className="bale-help">
                    Dates filter the cash ledger. Bale results below always show
                    each bale's complete history.
                </p>
            </section>
            <Stats
                items={[
                    [
                        "Money collected",
                        money(summary.cash_in),
                        "Approved income only",
                    ],
                    [
                        "Money paid out",
                        money(summary.cash_out),
                        "Includes purchases, laundry and paid refunds",
                    ],
                    [
                        "Net cash movement",
                        money(summary.net_cash),
                        "Cash in minus cash out; not inventory profit",
                    ],
                    [
                        "Refunds still due",
                        money(summary.refund_due),
                        "Not yet recorded as paid",
                    ],
                ]}
            />
            <section className="panel glass">
                <h2>Bale costs paid in this period</h2>
                <div className="bale-cost-strip">
                    <span>
                        Purchases{" "}
                        <strong>{money(summary.bale_purchases)}</strong>
                    </span>
                    <span>
                        Laundry <strong>{money(summary.laundry)}</strong>
                    </span>
                </div>
            </section>
            <section className="panel glass bale-table-panel">
                <div className="bale-section-heading">
                    <h2>Lifetime bale results</h2>
                    <small>Before rent, salaries and other shop overhead</small>
                </div>
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Bale</th>
                                <th>Purchase + laundry</th>
                                <th className="numeric-cell">Net sales</th>
                                <th>Sales less bale costs</th>
                                <th>Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bales?.data.map((b) => (
                                <tr key={b.id}>
                                    <td>
                                        {b.code}
                                        <small>{b.supplier?.name}</small>
                                    </td>
                                    <td>{money(b.total_cost)}</td>
                                    <td className="numeric-cell">{money(b.sales_revenue)}</td>
                                    <td>{money(b.bale_result)}</td>
                                    <td>
                                        {b.status === "closed"
                                            ? "Final before overhead"
                                            : "Provisional / still selling"}
                                    </td>
                                </tr>
                            ))}
                            {!bales?.data.length && (
                                <tr>
                                    <td colSpan={5} className="bale-empty">
                                        Bale results will appear after your
                                        first purchase.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <AdminPagination paginator={bales} label="bales" />
            </section>
            {can("manage_finance") && !isReport && (
                <CrudAction title="Record another shop expense" form={expense}>
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
                                        { preserveScroll: true },
                                    );
                                },
                            });
                        }}
                    >
                        <p>
                            For rent, salaries, and other overhead. Bale
                            purchases and laundry are already included
                            automatically.
                        </p>
                        <div className="bale-form-grid">
                            <label className="form-field">
                                <span>Description</span>
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
                                <span>Amount paid</span>
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
                                <span>Category</span>
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
                                            {c.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="form-field">
                                <span>Branch</span>
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
                                <span>Date paid</span>
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
                                <span>Payment method</span>
                                <select
                                    value={expense.data.payment_method}
                                    onChange={(e) =>
                                        expense.setData(
                                            "payment_method",
                                            e.target.value,
                                        )
                                    }
                                >
                                    <option value="cash">Cash</option>
                                    <option value="mmqr">MMQR / bank</option>
                                </select>
                            </label>
                        </div>
                        <button
                            className="btn primary"
                            disabled={expense.processing}
                        >
                            Record expense
                        </button>
                    </form>
                </CrudAction>
            )}
            <section className="panel glass bale-table-panel">
                <div className="bale-section-heading">
                    <h2>Cash ledger</h2>
                </div>
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Date / reference</th>
                                <th>Description</th>
                                <th>Method</th>
                                <th className="numeric-cell">Amount</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries?.data.map((e) => (
                                <tr key={e.id}>
                                    <td>
                                        {e.entry_date?.slice(0, 10)}
                                        <small>{e.reference}</small>
                                    </td>
                                    <td>
                                        {e.title}
                                        <small>
                                            {e.category.replaceAll("_", " ")}
                                        </small>
                                    </td>
                                    <td>{e.payment_method || "-"}</td>
                                    <td className="numeric-cell">
                                        {e.type === "income" ? "+" : "-"}
                                        {money(e.amount)}
                                    </td>
                                    <td>
                                        {e.status}
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
                                    <td colSpan={5} className="bale-empty">
                                        No ledger entries in this period.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <AdminPagination paginator={entries} label="entries" />
            </section>
        </Page>
    );
}
