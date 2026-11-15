import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import Icon from '@/Components/Admin/icons';
import { formatDate as displayformatDate } from '@/Utils/dateTime';
import DetailTableRow from '@/Components/Admin/DetailTableRow';
import { CrudAction } from "@/Components/Admin/CrudModal";
import { useEffect } from "react";
import { Link, useForm } from "@/spa/router";
import {
    Page,
    State,
    money,
    useBales,
    uuid,
} from "@/Components/Bales/shared";
import AdminPagination from "@/Components/Admin/AdminPagination";
import EditBaleModal from '@/Components/Bales/EditBaleModal';
function ReturnGarments({ item }) {
    const uiText = useUiTranslation();
    const { href } = useBales();
    const form = useForm({
        request_key: uuid(),
        quantity: 1,
        payment_method: "cash",
        reason: "",
    });
    const remaining =
        Number(item.quantity) - Number(item.returned_quantity || 0);
    if (remaining <= 0) return <small>{uiText("Returned")}</small>;
    return (
        <CrudAction title={uiText("Return garments")} form={form}>
            <p> {uiText("This records money already refunded and puts garments back in this bale.")} </p>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    form.post(
                        href(`/admin/bale-sale-items/${item.id}/return`),
                        {
                            preserveScroll: true,
                            onSuccess: () =>
                                form.setData({
                                    request_key: uuid(),
                                    quantity: 1,
                                    payment_method: "cash",
                                    reason: "",
                                }),
                        },
                    );
                }}
            >
                <label className="form-field">
                    <span>{uiText("Pieces (up to")} {remaining})</span>
                    <input
                        required
                        type="number"
                        min="1"
                        max={remaining}
                        step="1"
                        value={form.data.quantity}
                        onChange={(e) =>
                            form.setData("quantity", e.target.value)
                        }
                    />
                </label>
                <label className="form-field">
                    <span>{uiText("Refund paid using")}</span>
                    <select
                        value={form.data.payment_method}
                        onChange={(e) =>
                            form.setData("payment_method", e.target.value)
                        }
                    >
                        <option value="cash">{uiText("Cash drawer")}</option>
                        <option value="mmqr">{uiText("MMQR / bank")}</option>
                    </select>
                </label>
                <label className="form-field">
                    <span>{uiText("Reason")}</span>
                    <input
                        maxLength={500}
                        value={form.data.reason}
                        onChange={(e) => form.setData("reason", e.target.value)}
                    />
                </label>
                <p> {uiText("Refund:")}{" "}
                    {money(
                        (Number(item.unit_price) *
                            Number(form.data.quantity) *
                            Number(item.order.final_amount)) /
                            Number(item.order.total_amount),
                    )}
                </p>
                {Object.values(form.errors).map((error, i) => (
                    <p className="bale-error" key={i}>
                        {uiText(error)}
                    </p>
                ))}
                <button className="btn secondary" disabled={form.processing}> {uiText("Record return & paid refund")} </button>
            </form>
        </CrudAction>
    );
}
export default function BaleShow({ bale, sales, suppliers = [] }) {
    const uiText = useUiTranslation();
    const { href, can } = useBales();
    const next = { purchased: "laundry", laundry: "ready", ready: "closed" }[
        bale.status
    ];
    const move = useForm({
        status: next,
        laundry_cost: "",
        laundry_payment_method: "cash",
        total_pieces: bale.total_pieces ?? "",
    });
    useEffect(() => move.setData("status", next), [next]);
    const price = useForm({ price: "" });
    return (
        <Page
            title={bale.code}
            eyebrow="Bale details" contentClassName="bale-detail-page" headingDetails={<div className="bale-heading-details"><State status={bale.status} /><span><Icon name="users" size={14} />{bale.supplier?.name || "No supplier"}</span><span><Icon name="mapPin" size={14} />{bale.location?.name}</span><span><Icon name="history" size={14} />{displayformatDate(bale.purchased_at)}</span></div>} action={<div className="inline-actions admin-page-actions"><Link
                    className="btn secondary"
                    href={href(`/admin/bales/${bale.id}/labels`)}
                > {uiText("Print price labels")} </Link>{can('inventory.receive') && <EditBaleModal bale={bale} suppliers={suppliers} />}{next && can("inventory.receive") && (
                <CrudAction title={uiText(bale.status === "purchased" ? "Send this bale to laundry" : bale.status === "laundry" ? "Laundry finished" : "Finish this bale")} className="btn primary" form={move} onOpen={() => move.setData({ status: next, laundry_cost: bale.laundry_cost, laundry_payment_method: bale.laundry_payment_method, total_pieces: bale.total_pieces ?? '' })}>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            move.post(href(`/admin/bales/${bale.id}/status`), {
                                preserveScroll: true,
                            });
                        }}
                    >
                        {bale.status === "laundry" ? (
                            <>
                                <div className="bale-form-grid">
                                    <label className="form-field">
                                        <span> {uiText("Laundry cost (enter 0 if none)")} </span>
                                        <input
                                            required
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={move.data.laundry_cost}
                                            onChange={(e) =>
                                                move.setData(
                                                    "laundry_cost",
                                                    e.target.value,
                                                )
                                            }
                                        />
                                    </label>
                                    <label className="form-field">
                                        <span>{uiText("Paid using")}</span>
                                        <select
                                            value={
                                                move.data.laundry_payment_method
                                            }
                                            onChange={(e) =>
                                                move.setData(
                                                    "laundry_payment_method",
                                                    e.target.value,
                                                )
                                            }
                                        >
                                            <option value="cash">{uiText("Cash")}</option>
                                            <option value="mmqr"> {uiText("MMQR / bank")} </option>
                                        </select>
                                    </label>
                                    <label className="form-field">
                                        <span>{uiText("Total garments (optional)")}</span>
                                        <input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={move.data.total_pieces}
                                            onChange={(e) =>
                                                move.setData(
                                                    "total_pieces",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder={uiText("Leave blank if not counted")}
                                        />
                                    </label>
                                </div>
                                
                            </>
                        ) : bale.status === "ready" ? (
                            <p> {uiText("Confirm all garments are sold out. Remaining stock will be cleared and the bale result marked final using recorded sales and costs.")} </p>
                        ) : (
                            <p> {uiText("This bale will stay unavailable in POS until laundry is finished.")} </p>
                        )}
                        <button
                            className="btn primary"
                            disabled={move.processing}
                        >
                            {uiText(bale.status === "purchased"
                                ? "Start laundry"
                                : bale.status === "laundry"
                                  ? "Ready for sale"
                                  : "Mark all sold")}
                        </button>
                    </form>
                </CrudAction>
            )}</div>}
        >
            {bale.notes && <p className="bale-detail-notes">{bale.notes}</p>}
            <div className="bale-detail-summary">
                {[
                    ['Purchase + laundry', money(bale.total_cost), 'wallet', 'blue'],
                    ['Net sales', money(bale.sales_revenue), 'receipt', 'green'],
                    ['Pieces sold', bale.pieces_sold, 'box', 'blue'],
                    ['Remaining', bale.remaining ?? 'Not counted', 'box', 'amber'],
                    [bale.status === 'closed' ? 'Final bale result' : 'Bale result so far', money(bale.bale_result), 'chart', Number(bale.bale_result) >= 0 ? 'green' : 'amber'],
                ].map(([label, value, icon, tone]) => <article className={'metric-card glass credit-kpi-card tone-' + tone} key={label}><span className="icon-well"><Icon name={icon} size={14} /></span><small>{uiText(label)}</small><strong>{uiText(value)}</strong></article>)}
            </div>
            <div className="bale-detail-facts"><span>{uiText("Purchase")} <strong>{money(bale.purchase_cost)}</strong></span><span>{uiText("Laundry")} <strong>{money(bale.laundry_cost)}</strong></span>{bale.total_pieces != null && <span>{uiText("Garments received")} <strong>{bale.total_pieces}</strong></span>}</div>
            
            <section className="bale-detail-section">
                <div className="bale-section-heading"><h2>{uiText("Price groups")}</h2>{bale.status === "ready" && can("catalog.manage") && (
                    <CrudAction title={uiText("Add price group")} form={price}>
                        <form
                            className="bale-filter-row"
                            onSubmit={(e) => {
                                e.preventDefault();
                                price.post(href(`/admin/bales/${bale.id}/labels`), {
                                    preserveScroll: true,
                                    onSuccess: () => price.reset(),
                                });
                            }}
                        >
                            <label className="form-field">
                                <span>{uiText("Selling price")}</span>
                                <input
                                    required
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    placeholder="e.g. 5000"
                                    value={price.data.price}
                                    onChange={(e) =>
                                        price.setData("price", e.target.value)
                                    }
                                />
                            </label>
                            <button
                                className="btn primary"
                                disabled={price.processing}
                            > {uiText("Create barcode")} </button>
                        </form>
                    </CrudAction>
                )}</div>
                
                
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th className="numeric-cell">{uiText("Price")}</th>
                                <th>{uiText("Barcode")}</th>
                                <th className="numeric-cell">{uiText("Net pieces sold")}</th>
                                <th className="numeric-cell">{uiText("Net sales")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bale.labels.map((label) => (
                                <tr key={label.id}>
                                    <td className="numeric-cell">
                                        <strong>{money(label.price)}</strong>
                                    </td>
                                    <td>
                                        <code>{label.barcode}</code>
                                    </td>
                                    <td className="numeric-cell">{label.pieces_sold}</td>
                                    <td className="numeric-cell">{money(label.revenue)}</td>
                                </tr>
                            ))}
                            {!bale.labels.length && (
                                <tr>
                                    <td colSpan={4} className="bale-empty"> {uiText("Finish laundry, then add 5,000 / 7,000 / 10,000 or any prices you use.")} </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
            
            <section className="bale-detail-section">
                <div className="bale-section-heading">
                    <h2>{uiText("Sales & garment returns")}</h2>
                </div>
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>{uiText("Receipt")}</th>
                                <th className="numeric-cell">{uiText("Price")}</th>
                                <th className="numeric-cell">{uiText("Pieces")}</th>
                                <th className="numeric-cell">{uiText("Amount")}</th>
                                <th className="table-actions-column" />
                            </tr>
                        </thead>
                        <tbody>
                            {sales.data.map((item) => (
                                <DetailTableRow key={item.id} href={can("orders.view") ? href(`/admin/orders/${item.order_id}`) : undefined} >
                                    <td>
                                        {can("orders.view") ? (
                                            <Link
                                                href={href(
                                                    `/admin/orders/${item.order_id}`,
                                                )}
                                            >
                                                {item.order.receipt_number ||
                                                    item.order.order_number}
                                            </Link>
                                        ) : (
                                            item.order.receipt_number
                                        )}
                                        <small>
                                            {uiText(item.order.status === "cancelled"
                                                ? "Cancelled"
                                                : item.order.payment_status)}
                                        </small>
                                    </td>
                                    <td className="numeric-cell">{money(item.unit_price)}</td>
                                    <td className="numeric-cell">
                                        {Number(item.quantity)}
                                        {item.returned_quantity > 0 && (
                                            <small>
                                                {item.returned_quantity}{" "} {uiText("returned")} </small>
                                        )}
                                    </td>
                                    <td className="numeric-cell">{money(item.total_price)}</td>
                                    <td className="table-actions-column">
                                        {can("orders.returns") &&
                                            item.order.status !== "cancelled" &&
                                            item.order.payment_status ===
                                                "paid" && (
                                                <ReturnGarments item={item} />
                                            )}
                                    </td>
                                </DetailTableRow>
                            ))}
                            {!sales.data.length && (
                                <tr>
                                    <td colSpan={5} className="bale-empty"> {uiText("Scanned sales will appear here.")} </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <AdminPagination
                    paginator={sales}
                    label={uiText("sale lines")}
                    preserveState
                />
            </section>
        </Page>
    );
}
