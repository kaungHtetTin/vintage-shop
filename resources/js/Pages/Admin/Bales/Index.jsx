import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import AdminFilterDrawer, { filterOptions } from '@/Components/Admin/AdminFilterDrawer';
import CrudModal from '@/Components/Admin/CrudModal';
import {  useState } from "react";
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
    const uiText = useUiTranslation();
    const { href, can, url } = useBales();
    const [buying, setBuying] = useState(url.includes("new=1"));


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

    return (
        <Page
            title={uiText("Bales & stock")}
            action={<div className="inline-actions admin-page-actions"><AdminFilterDrawer filters={filters} fields={[{key:'q',label:"Search bales",type:'search',placeholder:"Bale ID or supplier"},{key:'location_id',label:'Store',type:'select',options:filterOptions(locations,'All stores')},{key:'status',label:'Status',type:'select',options:filterOptions([{value:'purchased',label:'Purchased'},{value:'laundry',label:'Laundry'},{value:'ready',label:'Ready to sell'},{value:'closed',label:'Finished'}],'All statuses')}]} onApply={values=>router.get(href('/admin/bales'),values,{preserveState:true,preserveScroll:true,replace:true})}/>{can("inventory.receive") && (
                    <button
                        className="btn primary"
                        type="button"
                        onClick={openPurchase}
                    > {uiText("+ Buy a bale")} </button>
                )}</div>}
        >
            {can("inventory.receive") && (
                <CrudModal open={buying} onClose={closePurchase} title={<> {uiText("Record a bale purchase")} </>} busy={form.processing} action={<> <button form="bale-purchase-form"
                                type="submit"
                                className="btn primary"
                                disabled={
                                    form.processing ||
                                    !locations.length ||
                                    !form.data.supplier_id
                                }
                            >
                                {uiText(form.processing
                                    ? "Recording..."
                                    : "Record purchase")}
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
                                        {uiText(error)}
                                    </p>
                                ))}
                            {!suppliers.length && (
                                <p> {uiText("Add your supplier first.")}{" "}
                                    <Link href={href("/admin/suppliers")}> {uiText("Add a supplier")} </Link>
                                </p>
                            )}
                            <div className="bale-form-grid">
                                <div className="bale-purchase-field">
                                    <label htmlFor="bale-purchase-supplier"> {uiText("Supplier")} </label>
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
                                        noOptionsText={uiText("No matching suppliers")}
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
                                                    placeholder={uiText("Search name or phone...")}
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
                                            {uiText(form.errors.supplier_id)}
                                        </p>
                                    )}
                                </div>
                                <label className="bale-purchase-field">
                                    <span>{uiText("Branch")}</span>
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
                                    <span>{uiText("Purchase date")}</span>
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
                                    <span>{uiText("Purchase cost")}</span>
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
                                    <span>{uiText("Paid using")}</span>
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
                                        <option value="cash">{uiText("Cash")}</option>
                                        <option value="mmqr"> {uiText("MMQR / bank")} </option>
                                    </select>
                                </label>
                                <label className="bale-purchase-field">
                                    <span>{uiText("Garment count (optional)")}</span>
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
                                        placeholder={uiText("Leave blank if not counted")}
                                    />
                                </label>
                            </div>
                            
                            <label className="bale-purchase-field">
                                <span>{uiText("Note (optional)")}</span>
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

            <section className="panel glass bale-table-panel">

                <BaleTable rows={bales?.data} showResults />
                <AdminPagination
                    paginator={bales}
                    label={uiText("bales")}
                    preserveState
                />
            </section>
        </Page>
    );
}
