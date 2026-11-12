import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import CrudModal from '@/Components/Admin/CrudModal';
import { useState } from "react";
import { useForm } from "@/spa/router";
import { Page, useBales } from "@/Components/Bales/shared";
export default function Suppliers({ suppliers = [] }) {
    const uiText = useUiTranslation();
    const { href, can } = useBales();
    const [adding, setAdding] = useState(false);
    const form = useForm({ name: "", phone: "", notes: "" });
    const close = () => {
        if (form.processing) return;
        setAdding(false);
        form.reset();
        form.clearErrors();
    };
    return (
        <Page
            title={uiText("Suppliers")}
            action={
                can("inventory.receive") && (
                    <button
                        type="button"
                        className="btn primary"
                        onClick={() => setAdding(true)}
                    > {uiText("+ Add supplier")} </button>
                )
            }
        >
            
            {can("inventory.receive") && (
                <CrudModal open={adding} onClose={close} title={<> {uiText("Add a supplier")} </>} busy={form.processing} action={<> <button form="supplier-form"
                                type="submit"
                                className="btn primary"
                                disabled={form.processing}
                            >
                                {uiText(form.processing ? "Adding..." : "Add supplier")}
                            </button> </>}>
<form id="supplier-form" className="admin-modal-form" onSubmit={(e) => {
                            e.preventDefault();
                            form.post(href("/admin/suppliers"), {
                                preserveScroll: true,
                                onSuccess: () => {
                                    setAdding(false);
                                    form.reset();
                                    form.clearErrors();
                                },
                            });
                        }}><div className="bale-supplier-fields">
                            {Object.entries(form.errors).map(([key, error]) => (
                                <p
                                    key={key}
                                    className="bale-error"
                                    role="alert"
                                >
                                    {uiText(error)}
                                </p>
                            ))}
                            <div className="bale-form-grid">
                                <label className="form-field">
                                    <span>{uiText("Name")}</span>
                                    <input
                                        required
                                        autoFocus
                                        value={form.data.name}
                                        onChange={(e) =>
                                            form.setData("name", e.target.value)
                                        }
                                        maxLength={255}
                                    />
                                </label>
                                <label className="form-field">
                                    <span>{uiText("Phone (optional)")}</span>
                                    <input
                                        value={form.data.phone}
                                        onChange={(e) =>
                                            form.setData(
                                                "phone",
                                                e.target.value,
                                            )
                                        }
                                        maxLength={50}
                                    />
                                </label>
                            </div>
                            <label className="form-field">
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
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>{uiText("Supplier")}</th>
                                <th>{uiText("Phone")}</th>
                                <th>{uiText("Bales at your branches")}</th>
                                <th>{uiText("Note")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {suppliers.map((s) => (
                                <tr key={s.id}>
                                    <td>
                                        <strong>{s.name}</strong>
                                    </td>
                                    <td>{s.phone || "-"}</td>
                                    <td>{s.bales_count}</td>
                                    <td>{s.notes || "-"}</td>
                                </tr>
                            ))}
                            {!suppliers.length && (
                                <tr>
                                    <td colSpan={4} className="bale-empty"> {uiText("Add your first supplier to start buying bales.")} </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </Page>
    );
}
