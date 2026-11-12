import CrudModal from '@/Components/Admin/CrudModal';
import { useEffect, useState } from "react";
import {
    Autocomplete,
    createFilterOptions,
} from "@mui/material";
import { Link, router, useForm } from "@/spa/router";
import {
    Page,
    BaleTable,
    useBales,
    uuid,
    day,
} from "@/Components/Bales/shared";
import AdminPagination from "@/Components/Admin/AdminPagination";
export default function Bales({
    bales,
    suppliers = [],
    locations = [],
    filters = {},
    counts = {},
}) {
    const { href, can, url } = useBales();
    const [buying, setBuying] = useState(url.includes("new=1"));
    const [search, setSearch] = useState(filters.q || "");
    useEffect(() => setSearch(filters.q || ""), [filters.q]);
    const form = useForm({
        purchase_key: uuid(),
        supplier_id: "",
        location_id: locations[0]?.id || "",
        purchased_at: day(),
        purchase_cost: "",
        purchase_payment_method: "cash",
        total_pieces: "",
        notes: "",
    });
    const closePurchase = () => {
        if (form.processing) return;
        setBuying(false);
        form.reset();
        form.clearErrors();
    };
    const openPurchase = () => {
        form.setData("purchase_key", uuid());
        setBuying(true);
    };
    const apply = (next) =>
        router.get(
            href("/admin/bales"),
            { ...filters, q: search, ...next },
            { preserveState: true, replace: true },
        );
    return (
        <Page
            title="Bales & stock"
            action={
                can("inventory.receive") && (
                    <button
                        className="btn primary"
                        type="button"
                        onClick={openPurchase}
                    >
                        + Buy a bale
                    </button>
                )
            }
        >
            <p className="bale-intro">
                One record per bale. Purchase, wash, label, and sell without
                listing individual garments.
            </p>
            {can("inventory.receive") && (
                <CrudModal open={buying} onClose={closePurchase} title={<> Record a bale purchase </>} busy={form.processing} action={<> <button form="bale-purchase-form"
                                type="submit"
                                className="btn primary"
                                disabled={
                                    form.processing ||
                                    !locations.length ||
                                    !form.data.supplier_id
                                }
                            >
                                {form.processing
                                    ? "Recording..."
                                    : "Record purchase"}
                            </button> </>}>
<form id="bale-purchase-form" className="admin-modal-form" onSubmit={(e) => {
                            e.preventDefault();
                            form.post(href("/admin/bales"), {
                                preserveScroll: true,
                                onSuccess: () => setBuying(false),
                            });
                        }}><div className="bale-supplier-fields">
                            {Object.entries(form.errors)
                                .filter(([key]) => key !== "supplier_id")
                                .map(([key, error]) => (
                                    <p
                                        key={key}
                                        className="bale-error"
                                        role="alert"
                                    >
                                        {error}
                                    </p>
                                ))}
                            {!suppliers.length && (
                                <p>
                                    Add your supplier first.{" "}
                                    <Link href={href("/admin/suppliers")}>
                                        Add a supplier
                                    </Link>
                                </p>
                            )}
                            <div className="bale-form-grid">
                                <div className="bale-purchase-field">
                                    <label htmlFor="bale-purchase-supplier">
                                        Supplier
                                    </label>
                                    <Autocomplete
                                    id="bale-purchase-supplier"
                                        className="bale-supplier-picker"
                                        options={suppliers}
                                        value={
                                            suppliers.find(
                                                (supplier) =>
                                                    String(supplier.id) ===
                                                    String(
                                                        form.data.supplier_id,
                                                    ),
                                            ) || null
                                        }
                                        onChange={(_, supplier) =>
                                            form.setData(
                                                "supplier_id",
                                                supplier?.id || "",
                                            )
                                        }
                                        getOptionLabel={(supplier) =>
                                            supplier.name
                                        }
                                        isOptionEqualToValue={(option, value) =>
                                            option.id === value.id
                                        }
                                        filterOptions={createFilterOptions({
                                            stringify: (supplier) =>
                                                `${supplier.name} ${supplier.phone || ""}`,
                                        })}
                                        disabled={
                                            form.processing || !suppliers.length
                                        }
                                        noOptionsText="No matching suppliers"
                                        size="small"
                                        fullWidth
                                        disablePortal
                                        renderOption={(props, supplier) => {
                                            const { key, ...optionProps } =
                                                props;
                                            return (
                                                <li key={key} {...optionProps}>
                                                    <span>
                                                        {supplier.name}
                                                        {supplier.phone && (
                                                            <small
                                                                style={{
                                                                    display:
                                                                        "block",
                                                                }}
                                                            >
                                                                {supplier.phone}
                                                            </small>
                                                        )}
                                                    </span>
                                                </li>
                                            );
                                        }}
                                        renderInput={(params) => (
                                            <div
                                                ref={params.slotProps.input.ref}
                                                className="bale-supplier-control"
                                            >
                                                <input
                                                    {...params.slotProps.htmlInput}
                                                    id="bale-purchase-supplier"
                                                    placeholder="Search name or phone..."
                                                    required
                                                    autoFocus
                                                    aria-invalid={Boolean(
                                                        form.errors.supplier_id,
                                                    )}
                                                    aria-describedby={
                                                        form.errors.supplier_id
                                                            ? "bale-supplier-error"
                                                            : undefined
                                                    }
                                                />
                                                {params.slotProps.input.endAdornment}
                                            </div>
                                        )}
                                    />
                                    {form.errors.supplier_id && (
                                        <p
                                            id="bale-supplier-error"
                                            className="bale-error"
                                            role="alert"
                                        >
                                            {form.errors.supplier_id}
                                        </p>
                                    )}
                                </div>
                                <label className="bale-purchase-field">
                                    <span>Branch</span>
                                    <select
                                        required
                                        value={form.data.location_id}
                                        onChange={(e) =>
                                            form.setData(
                                                "location_id",
                                                e.target.value,
                                            )
                                        }
                                    >
                                        {locations.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="bale-purchase-field">
                                    <span>Purchase date</span>
                                    <input
                                        required
                                        type="date"
                                        max={day()}
                                        value={form.data.purchased_at}
                                        onChange={(e) =>
                                            form.setData(
                                                "purchased_at",
                                                e.target.value,
                                            )
                                        }
                                    />
                                </label>
                                <label className="bale-purchase-field">
                                    <span>Purchase cost</span>
                                    <input
                                        required
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={form.data.purchase_cost}
                                        onChange={(e) =>
                                            form.setData(
                                                "purchase_cost",
                                                e.target.value,
                                            )
                                        }
                                    />
                                </label>
                                <label className="bale-purchase-field">
                                    <span>Paid using</span>
                                    <select
                                        value={
                                            form.data.purchase_payment_method
                                        }
                                        onChange={(e) =>
                                            form.setData(
                                                "purchase_payment_method",
                                                e.target.value,
                                            )
                                        }
                                    >
                                        <option value="cash">Cash</option>
                                        <option value="mmqr">
                                            MMQR / bank
                                        </option>
                                    </select>
                                </label>
                                <label className="bale-purchase-field">
                                    <span>Garment count (optional)</span>
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={form.data.total_pieces}
                                        onChange={(e) =>
                                            form.setData(
                                                "total_pieces",
                                                e.target.value,
                                            )
                                        }
                                        placeholder="Leave blank if not counted"
                                    />
                                </label>
                            </div>
                            <p className="bale-help">
                                This records the purchase as paid in Finance.
                                You can count all garments after laundry, or
                                track sales without a starting count.
                            </p>
                            <label className="bale-purchase-field">
                                <span>Note (optional)</span>
                                <input
                                    value={form.data.notes}
                                    onChange={(e) =>
                                        form.setData("notes", e.target.value)
                                    }
                                    maxLength={2000}
                                />
                            </label>
                        </div></form></CrudModal>
            )}
            <div className="bale-tabs">
                {[
                    ["", "All"],
                    ["purchased", "Purchased"],
                    ["laundry", "Laundry"],
                    ["ready", "Ready to sell"],
                    ["closed", "Finished"],
                ].map(([key, label]) => (
                    <button
                        key={key}
                        className={
                            (filters.status || "") === key ? "active" : ""
                        }
                        onClick={() => apply({ status: key || undefined })}
                    >
                        {label}{" "}
                        <small>
                            {key
                                ? counts[key] || 0
                                : Object.values(counts).reduce(
                                      (a, b) => a + Number(b),
                                      0,
                                  )}
                        </small>
                    </button>
                ))}
            </div>
            <section className="panel glass bale-table-panel">
                <form
                    className="bale-filter-row table-search-header"
                    onSubmit={(e) => {
                        e.preventDefault();
                        apply({});
                    }}
                >
                    <input
                        className="bale-input"
                        type="search"
                        aria-label="Search bales"
                        placeholder="Search bale ID or supplier..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <select
                        className="bale-input"
                        aria-label="Branch"
                        value={filters.location_id || ""}
                        onChange={(e) =>
                            apply({ location_id: e.target.value || undefined })
                        }
                    >
                        <option value="">All allowed branches</option>
                        {locations.map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.name}
                            </option>
                        ))}
                    </select>
                    <button className="btn secondary">Search</button>
                </form>
                <BaleTable rows={bales?.data} />
                <AdminPagination
                    paginator={bales}
                    label="bales"
                    preserveState
                />
            </section>
        </Page>
    );
}
