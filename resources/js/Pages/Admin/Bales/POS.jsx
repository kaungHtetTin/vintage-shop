import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { formatDate as displayformatDate } from '@/Utils/dateTime';
import CrudModal from "@/Components/Admin/CrudModal";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Page, money, useBales, uuid } from "@/Components/Bales/shared";
import SavedCustomerSelect from "@/Components/Bales/SavedCustomerSelect";
import NewCustomerModal from "@/Components/Bales/NewCustomerModal";
import CameraScanModal from "@/Components/Bales/CameraScanModal";
import Icon from "@/Components/Admin/icons";
const message = (error, translate) =>
    Object.values(error.response?.data?.errors || {})
        .flat()
        .map(value => translate(value))
        .join(" ") ||
    error.response?.data?.message ||
    "Connection interrupted. Please try again.";
export default function BalePOS({ locations = [] }) {
    const uiText = useUiTranslation();
    const { href, auth, app_base, can } = useBales();
    const storageKey = `vintage-sale:${app_base}:${auth?.user?.id}`;
    const [saved] = useState(() => {
        try {
            return JSON.parse(sessionStorage.getItem(storageKey));
        } catch {
            return null;
        }
    });
    const [location, setLocation] = useState(
        saved?.payload?.location_id || locations[0]?.id || "",
    );
    const [cart, setCart] = useState(saved?.cart || []);
    const [pending, setPending] = useState(saved);
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [scan, setScan] = useState("");
    const [checkoutModal, setCheckoutModal] = useState(false);
    const [newCustomerOpen, setNewCustomerOpen] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [method, setMethod] = useState(saved?.payload?.tender_type || "cash");
    const [received, setReceived] = useState(
        saved?.payload?.amount_tendered ?? "",
    );
    const [reference, setReference] = useState(saved?.payload?.reference || "");
    const [customer, setCustomer] = useState(saved?.customer || null);
    const [onlineSale, setOnlineSale] = useState(Boolean(saved?.payload?.is_online_sale));
    const [depositMethod, setDepositMethod] = useState(saved?.payload?.credit_deposit_method || "cash");
    const [discount, setDiscount] = useState(saved?.payload?.discount_value ?? "");
    const [receipt, setReceipt] = useState(null);
    const scanRef = useRef(null);
    const scanTimer = useRef(null);
    const scanInFlight = useRef(false);
    const [composingScan, setComposingScan] = useState(false);
    const checkoutFormId = useId();
    const subtotal = cart.reduce(
        (sum, line) => sum + Number(line.price) * line.quantity,
        0,
    );
    const discountValue = Number(discount || 0);
    const discountProblem = !Number.isFinite(discountValue) || discountValue < 0 || discountValue > subtotal
        ? "Discount must be between zero and the subtotal."
        : discountValue > 0 && !can("pos.discount") ? "You do not have permission to apply discounts." : "";
    const total = Math.round(Math.max(0, subtotal - (Number.isFinite(discountValue) && discountValue >= 0 ? discountValue : 0)) * 100) / 100;
    const deposit = Number(received || 0);
    const creditAmount = Math.round(Math.max(0, total - deposit) * 100) / 100;
    const creditProblem = method !== "credit" ? ""
        : !can("credit.manage") ? "You do not have permission to create credit sales."
        : !customer ? "Choose a saved customer for this credit sale."
        : customer.credit_status !== "active" ? "Credit sales are not enabled for this customer."
        : !Number.isFinite(deposit) || deposit < 0 || deposit >= total ? "The deposit must be zero or less than the sale total."
        : creditAmount > Number(customer.available_credit || 0) + 0.009 ? "This sale exceeds the customer's available credit. Increase the deposit or choose another payment method."
        : "";
    const customerProblem = onlineSale && !customer ? "Select or add a customer for an online sale." : "";
    const refresh = useCallback(
        async (signal) => {
            if (!location) {
                setLoading(false);
                return;
            }
            const labels = await window.axios.get(href("/admin/bale-pos/catalog"), { params: { location_id: location }, signal });
            setCatalog(labels.data);
        },
        [location, app_base],
    );
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setCatalog([]);
        setError("");
        refresh(controller.signal)
            .catch((e) => {
                if (e.code !== "ERR_CANCELED") setError(message(e, uiText));
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [refresh]);
    useEffect(() => {
        // Focus after React has re-enabled the field following a lookup or sale.
        if (location && !loading && !busy && !pending && !checkoutModal && !newCustomerOpen && !cameraOpen) {
            scanRef.current?.focus();
        }
    }, [location, loading, busy, pending, checkoutModal, newCustomerOpen, cameraOpen]);
    const changeQuantity = (id, quantity) => {
        if (!location || loading || busy || pending) return;
        setCart((current) =>
            current.map((line) =>
                line.id === id
                    ? {
                          ...line,
                          quantity: Math.max(
                              1,
                              Math.floor(Number(quantity) || 1),
                          ),
                      }
                    : line,
            ),
        );
    };
    const add = (label) => {
        if (!location || loading || busy || pending) return;
        const inBale = cart
            .filter((line) => line.bale_id === label.bale_id)
            .reduce((sum, line) => sum + line.quantity, 0);
        if (label.remaining !== null && inBale + 1 > label.remaining) {
            setError(
                "All available garments from this bale are already in the cart.",
            );
            return;
        }
        setError("");
        setReceipt(null);
        setCart((current) =>
            current.some((line) => line.id === label.id)
                ? current.map((line) =>
                      line.id === label.id
                          ? { ...line, quantity: line.quantity + 1 }
                          : line,
                  )
                : [...current, { ...label, quantity: 1 }],
        );
        setScan("");
        scanRef.current?.focus();
    };
    const scanLabel = async (event, value = scan) => {
        event?.preventDefault();
        window.clearTimeout(scanTimer.current);
        const barcode = value.trim();
        if (!barcode || !location || loading || busy || pending || checkoutModal || composingScan || scanInFlight.current) return;
        setScan("");
        // Most scans can use the loaded catalogue without waiting for a request.
        const known = catalog.find(label => label.barcode === barcode);
        if (known) {
            add(known);
            return;
        }
        scanInFlight.current = true;
        setBusy(true);
        setError("");
        try {
            const response = await window.axios.get(
                href("/admin/bale-pos/catalog"),
                { params: { location_id: location, q: barcode } },
            );
            const label = response.data.find((l) => l.barcode === barcode);
            if (!label)
                throw new Error(
                    "Barcode not found on a ready bale at this branch.",
                );
            setBusy(false);
            add(label);
        } catch (e) {
            setError(e.response ? message(e, uiText) : e.message);
        } finally {
            scanInFlight.current = false;
            setBusy(false);
            scanRef.current?.focus();
        }
    };
    useEffect(() => {
        const barcode = scan.trim();
        // Generated price labels have ten digits. Exact catalogue matches also
        // support saved labels with another format; partial text never adds an item.
        const complete = catalog.some(label => label.barcode === barcode) || /^\d{10}$/.test(barcode);
        if (!barcode || !complete || !location || loading || busy || pending || checkoutModal || cameraOpen || composingScan) return;
        scanTimer.current = window.setTimeout(() => scanLabel(undefined, barcode), 300);
        return () => window.clearTimeout(scanTimer.current);
    }, [scan, catalog, location, loading, busy, pending, checkoutModal, cameraOpen, composingScan, cart]);
    const checkout = async (event) => {
        event.preventDefault();
        if (busy || (!pending && (!location || !cart.length))) return;
        if (!pending && (discountProblem || creditProblem || customerProblem)) { setError(discountProblem || creditProblem || customerProblem); return; }
        setBusy(true);
        setError("");
        const attempt = pending || {
            cart,
            customer,
            payload: {
                request_key: uuid(),
                location_id: location,
                items: cart.map((line) => ({
                    label_id: line.id,
                    quantity: line.quantity,
                    expected_price: line.price,
                })),
                tender_type: method,
                customer_id: customer?.id || null,
                is_online_sale: onlineSale,
                amount_tendered: method === "mmqr" ? total : method === "credit" ? deposit : received,
                credit_deposit_method: depositMethod,
                discount_value: discountValue,
                reference: reference || null,
            },
        };
        sessionStorage.setItem(storageKey, JSON.stringify(attempt));
        setPending(attempt);
        try {
            const response = await window.axios.post(
                href("/admin/bale-pos/checkout"),
                attempt.payload,
            );
            sessionStorage.removeItem(storageKey);
            setPending(null);
            setReceipt(response.data);
            setCheckoutModal(false);
            setCart([]);
            setReceived("");
            setReference("");
            setCustomer(null);
            setOnlineSale(false);
            setMethod("cash");
            setDepositMethod("cash");
            setDiscount("");
            await refresh();
            scanRef.current?.focus();
        } catch (e) {
            if (e.response) {
                sessionStorage.removeItem(storageKey);
                setPending(null);
            }
            setError(message(e, uiText));
        } finally {
            setBusy(false);
        }
    };
    return (
        <Page title={uiText("Bale POS")}>
            <div className="bale-pos-top">
                <label className="form-field">
                    <span>{uiText("Branch")}</span>
                    <select
                        aria-label={uiText("POS branch")}
                        disabled={busy || Boolean(pending)}
                        value={location}
                        onChange={(e) => {
                            setLocation(e.target.value);
                            setCart([]);
                            setDiscount("");
                        }}
                    >
                        {locations.map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.name}
                            </option>
                        ))}
                    </select>
                </label>

            </div>
            {error && !checkoutModal && (
                <div role="alert" className="flash error">
                    {uiText(error)}
                </div>
            )}
            {pending && (
                <div className="flash" role="status"> {uiText("A sale is awaiting confirmation. Retry the same sale to recover its receipt before starting another.")} </div>
            )}

            {receipt && (
                <section
                    className="panel glass bale-sale-success"
                    role="status"
                >
                    <div>
                        <h2>{uiText("Sale complete /")} {receipt.order.receipt_number}</h2>
                        <p> {uiText("Total")} {money(receipt.order.final_amount)} {uiText("/ Change")}{" "}
                            {money(
                                receipt.order.pos_tender_summary?.change_due,
                            )}
                        </p>
                        {Number(receipt.order.credit_amount) > 0 && <p>
                            {receipt.order.receiver_name} {uiText("/ Paid now")} {money(receipt.order.paid_amount)} {uiText("/ Credit balance")} {money(receipt.order.credit_amount)} {uiText("/ Due")} {displayformatDate(receipt.order.credit_due_date)}
                        </p>}
                    </div>
                    <a
                        className="btn primary"
                        target="_blank"
                        rel="noreferrer"
                        href={receipt.receipt_url}
                    > {uiText("Open / print receipt")} </a>
                </section>
            )}
            <div className="bale-pos-grid">
                <section className="panel glass">
                    <h2>{uiText("Scan a price label")}</h2>
                    <form className="bale-scan-row" onSubmit={scanLabel}>
                        <input
                            ref={scanRef}
                            aria-label={uiText("Scan barcode")}
                            className="bale-input"
                            autoFocus
                            autoComplete="off"
                            placeholder={uiText("Scan or type barcode")}
                            value={scan}
                            onChange={(e) => setScan(e.target.value)}
                            onCompositionStart={() => setComposingScan(true)}
                            onCompositionEnd={(e) => { setComposingScan(false); setScan(e.currentTarget.value); }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.nativeEvent.isComposing || composingScan)) e.preventDefault();
                            }}
                            disabled={!location || loading || busy || Boolean(pending)}
                        />
                        <button
                            className="btn primary"
                            disabled={!location || loading || busy || Boolean(pending)}
                        > {uiText("Add")} </button>
                        <button type="button" className="btn secondary bale-camera-trigger"
                            disabled={!location || loading || busy || Boolean(pending)}
                            onClick={() => { window.clearTimeout(scanTimer.current); setScan(""); setCameraOpen(true); }}>
                            <Icon name="camera" size={17} /> {uiText("Camera scan")}
                        </button>
                    </form>
                    <CameraScanModal open={cameraOpen} onClose={() => setCameraOpen(false)} onDetected={barcode => {
                        setCameraOpen(false);
                        scanLabel(undefined, barcode);
                    }} />
                    
                    <h3>{uiText("Ready price groups")}</h3>
                    <div className="bale-label-grid">
                        {catalog.map((label) => (
                            <button
                                key={label.id}
                                disabled={!location || loading || busy || Boolean(pending)}
                                onClick={() => add(label)}
                            >
                                <small>{label.bale_code}</small>
                                <strong>{money(label.price)}</strong>
                                <small>
                                    {uiText(label.remaining === null
                                        ? "Garments not counted"
                                        : `${label.remaining} pieces remaining`)}
                                </small>
                                <code>{label.barcode}</code>
                            </button>
                        ))}
                        {!loading && !catalog.length && (
                            <p> {uiText("No ready price labels at this branch. Finish laundry and create your prices first.")} </p>
                        )}
                        {loading && <p>{uiText("Loading price labels...")}</p>}
                    </div>
                </section>
                <section className="panel glass bale-cart">
                    <div className="bale-section-heading">
                        <h2>{uiText("Current sale")}</h2>
                        <span>
                            {cart.reduce((sum, l) => sum + l.quantity, 0)}{" "} {uiText("pieces")} </span>
                    </div>
                    {!cart.length && (
                        <p className="bale-empty">{uiText("Scan your first garment.")}</p>
                    )}
                    {cart.map((line) => (
                        <article className="bale-cart-line" key={line.id}>
                            <div>
                                <strong>{line.bale_code}</strong>
                                <small>{money(line.price)} {uiText("each")}</small>
                            </div>
                            <input
                                aria-label={uiText("Quantity :value1", { value1: line.barcode })}
                                type="number"
                                min="1"
                                max="9999"
                                step="1"
                                disabled={busy || Boolean(pending)}
                                value={line.quantity}
                                onChange={(e) =>
                                    changeQuantity(line.id, e.target.value)
                                }
                            />
                            <strong>
                                {money(Number(line.price) * line.quantity)}
                            </strong>
                            <button
                                aria-label={uiText("Remove :value1", { value1: line.barcode })}
                                disabled={busy || Boolean(pending)}
                                onClick={() =>
                                    setCart(
                                        cart.filter((l) => l.id !== line.id),
                                    )
                                }
                            > {uiText("Remove")} </button>
                        </article>
                    ))}
                    {discountValue > 0 && <p className="bale-help">{uiText("Subtotal")} {money(subtotal)} {uiText("/ Discount")} {money(discountValue)}</p>}
                    <div className="bale-pos-total"><span>{uiText("Total")}</span><strong>{money(total)}</strong></div>
                    <button type="button" className="btn primary full" disabled={busy || (!pending && (!location || !cart.length))} onClick={() => { setError(""); setCheckoutModal(true); }}>{uiText(pending ? "Retry same sale" : "Checkout")}</button>
                    <CrudModal open={checkoutModal} onClose={() => { setError(''); setCheckoutModal(false); }} title={uiText("Complete sale")} busy={busy}
                        className="bale-checkout-dialog"
                        action={<>
                            <div className="bale-checkout-footer-total"><span>{uiText("Sale total")}</span><strong>{money(total)}</strong></div>
                            <button type="submit" form={checkoutFormId} className="btn primary full bale-checkout-submit"
                                disabled={busy || (!pending && (!location || !cart.length || Boolean(discountProblem) || Boolean(creditProblem) || Boolean(customerProblem)))}>
                                {uiText(busy ? "Confirming..." : pending ? "Retry same sale" : "Complete sale")}
                            </button>
                        </>}>
                        {error && <div className="flash error" role="alert">{uiText(error)}</div>}
                        <form id={checkoutFormId} onSubmit={checkout} className="bale-checkout-form">
                            <section className="bale-checkout-customer" aria-labelledby="checkout-customer-heading">
                                <div className="bale-checkout-customer-heading">
                                    <h3 id="checkout-customer-heading" className="bale-checkout-section-title"><span aria-hidden="true">01</span>{uiText("Customer")}<small>{uiText(onlineSale ? "Required for online sale" : method === "credit" ? "Required for credit" : "Optional")}</small></h3>
                                    <label className="bale-online-sale-toggle"><input type="checkbox" aria-label={uiText("Online sale")} checked={onlineSale} disabled={busy || Boolean(pending)} onChange={(event) => { setOnlineSale(event.target.checked); setError(""); }} />{uiText("Online sale")}</label>
                                </div>
                                <div className="bale-checkout-customer-row">
                                    <SavedCustomerSelect customer={customer} onChange={setCustomer} open={checkoutModal} disabled={busy || Boolean(pending)} required={onlineSale || method === "credit"} />
                                    <button type="button" className="btn secondary bale-add-customer" disabled={busy || Boolean(pending)} onClick={() => setNewCustomerOpen(true)}>{uiText("+ Add new customer")}</button>
                                </div>
                                {customerProblem && <p className="bale-error" role="alert">{uiText(customerProblem)}</p>}
                            </section>

                            <section className="bale-checkout-bill" aria-labelledby="checkout-bill-heading">
                                <h3 id="checkout-bill-heading" className="bale-checkout-section-title"><span aria-hidden="true">02</span>{uiText("Bill summary")}</h3>
                                <div className="bale-checkout-bill-fields">
                                    <div className="bale-checkout-subtotal"><span>{uiText("Subtotal")}</span><strong>{money(subtotal)}</strong></div>
                                    {(can("pos.discount") || discountValue > 0) && <label className="form-field bale-checkout-discount">
                                        <span>{uiText("Discount amount")}</span>
                                        <input aria-label={uiText("Discount amount")} type="number" min="0" max={subtotal} step="0.01" placeholder="0"
                                            value={discount} disabled={busy || Boolean(pending) || !can("pos.discount")} onChange={(event) => { setDiscount(event.target.value); setError(""); }} />
                                    </label>}
                                    {!pending && discountProblem && <p className="bale-error" role="alert">{uiText(discountProblem)}</p>}
                                </div>
                                <div className="bale-checkout-bill-total"><div><span>{uiText("Total")}</span><small>{uiText("Garments:")} {cart.reduce((count, line) => count + Number(line.quantity), 0)}</small></div><strong>{money(total)}</strong></div>
                            </section>

                            <section className="bale-checkout-payment" aria-labelledby="checkout-payment-heading">
                                <h3 id="checkout-payment-heading" className="bale-checkout-section-title"><span aria-hidden="true">03</span>{uiText("Payment")}</h3>
                                <div className="bale-checkout-payment-fields">
                                    <label className={`form-field ${method === "credit" ? "bale-checkout-full" : ""}`}>
                                        <span>{uiText("Payment method")}</span>
                                        <select aria-label={uiText("Payment")} disabled={busy || Boolean(pending)} value={method}
                                            onChange={(event) => { setMethod(event.target.value); setReceived(event.target.value === "credit" ? "0" : ""); setError(""); }}>
                                            <option value="cash">{uiText("Cash")}</option>
                                            <option value="mmqr">{uiText("MMQR / bank")}</option>
                                            {(can("credit.manage") || method === "credit") && <option value="credit" disabled={!can("credit.manage")}>{uiText("Credit")}</option>}
                                        </select>
                                    </label>
                                    {method === "credit" ? <>
                                        {customer && <div className="bale-credit-summary bale-checkout-full">
                                            <strong className="bale-checkout-full">{customer.name}</strong>
                                            <div><span>{uiText("Account balance")}</span><strong>{money(customer.credit_balance || 0)}</strong></div>
                                            <div><span>{uiText("Available credit")}</span><strong>{money(customer.available_credit || 0)}</strong></div>
                                            <small className="bale-checkout-full">{uiText(customer.credit_status === "active" ? uiText(":count day terms", { count: customer.credit_terms_days || 30 }) : "Credit is disabled or suspended for this customer.")}</small>
                                        </div>}

                                        <label className={`form-field ${deposit > 0 ? "" : "bale-checkout-full"}`}>
                                            <span>{uiText("Deposit (optional)")}</span>
                                            <input aria-label={uiText("Credit deposit")} type="number" min="0" max={Math.max(0, total - 0.01)} step="0.01"
                                                value={received} disabled={busy || Boolean(pending)} onChange={(event) => setReceived(event.target.value)} />
                                        </label>
                                        {deposit > 0 && <label className="form-field">
                                            <span>{uiText("Deposit payment")}</span>
                                            <select aria-label={uiText("Deposit payment")} value={depositMethod} disabled={busy || Boolean(pending)} onChange={(event) => setDepositMethod(event.target.value)}>
                                                <option value="cash">{uiText("Cash")}</option><option value="mmqr">{uiText("MMQR / bank")}</option>
                                            </select>
                                        </label>}
                                        {deposit > 0 && depositMethod === "mmqr" && <label className="form-field bale-checkout-full">
                                            <span>{uiText("Reference (optional)")}</span>
                                            <input maxLength={100} value={reference} disabled={busy || Boolean(pending)} onChange={(event) => setReference(event.target.value)} />
                                        </label>}

                                    </> : method === "cash" ? <>
                                        <div className="form-field bale-cash-received">
                                            <label htmlFor={`${checkoutFormId}-cash`}>{uiText("Cash received")}</label>
                                            <div className="bale-cash-received-row">
                                                <input id={`${checkoutFormId}-cash`} aria-label={uiText("Cash received")} required type="number" min={total} step="0.01" disabled={busy || Boolean(pending)}
                                                    value={received} onChange={(event) => setReceived(event.target.value)} />
                                                <button type="button" className="btn secondary" disabled={busy || Boolean(pending) || Boolean(discountProblem)}
                                                    onClick={() => { setReceived(String(total)); setError(""); }}>{uiText("Full pay")}</button>
                                            </div>
                                        </div>
                                    </> : <label className="form-field">
                                        <span>{uiText("Reference (optional)")}</span>
                                        <input maxLength={100} value={reference} disabled={busy || Boolean(pending)} onChange={(event) => setReference(event.target.value)} />
                                    </label>}
                                    {!pending && creditProblem && <p className="bale-error bale-checkout-full" role="alert">{uiText(creditProblem)}</p>}
                                </div>
                                <div className={`bale-checkout-payment-total ${method === "credit" ? "bale-credit-outstanding" : "bale-checkout-change"}`} aria-live="polite">
                                    <span>{uiText(method === "credit" ? "Outstanding balance" : method === "cash" ? "Change to return" : "Amount to collect")}</span>
                                    <strong>{money(method === "credit" ? creditAmount : method === "cash" ? received === "" ? 0 : Math.max(0, Number(received) - total) : total)}</strong>
                                </div>
                            </section>
                        </form>
                    </CrudModal>
                </section>
            </div>
            <NewCustomerModal open={newCustomerOpen} onClose={() => setNewCustomerOpen(false)} onCreated={(created) => { setCustomer(created); setError(""); }} />
        </Page>
    );
}
