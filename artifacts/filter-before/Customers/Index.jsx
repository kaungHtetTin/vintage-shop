import CrudModal from "@/Components/Admin/CrudModal";
import { confirmCrud } from '@/Components/Admin/CrudConfirm';
import { useId, useState } from "react";
import { Head, Link, router, useForm, usePage } from "@/spa/router";
import AdminLayout from "@/Layouts/AdminLayout";
import Icon from "@/Components/Admin/icons";
import AdminPagination from "@/Components/Admin/AdminPagination";
import { AdminFlash } from "@/Components/Admin/AdminFlash";
import { PanelHeading, StatusBadge } from "@/Components/Admin/shared";
import { routeWithBase } from "@/Utils/url";
import { usePhraseTranslation } from "@/Utils/i18n";
import { formatMoney } from "@/Utils/pricing";

export default function CustomersIndex({
    customers,
    filters,
    creditStats = {},
}) {
    const { app_base, flash, auth, is_super_admin } = usePage().props;
    const canManageCredit = is_super_admin || (auth?.user?.permissions || []).includes('credit.manage');
    const formId = useId();
    const blank = { name: '', phone: '', default_address: '', ...(canManageCredit ? { credit_limit: '', credit_terms_days: 30 } : {}) };
    const t = usePhraseTranslation();
    const [search, setSearch] = useState(filters.q ?? "");
    const [createOpen, setCreateOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const createForm = useForm(blank);
    const applyFilters = (patch) =>
        router.get(
            routeWithBase("/admin/customers", app_base),
            { ...filters, ...patch },
            { preserveState: true, replace: true },
        );
    const hasActiveFilters = Boolean(
        filters.q || filters.credit_status || filters.credit,
    );
    const dateOnly = (value) => (value ? String(value).split("T")[0] : "");
    const handleSearch = (e) => {
        e.preventDefault();
        applyFilters({ q: search.trim() || undefined });
    };
    const openCreate = () => {
        setEditingCustomer(null);
        createForm.setData(blank);
        createForm.clearErrors();
        setCreateOpen(true);
    };
    const openEdit = (customer) => {
        setEditingCustomer(customer);
        createForm.setData({ name: customer.name, phone: customer.phone || '', default_address: customer.default_address || '' });
        createForm.clearErrors();
        setCreateOpen(true);
    };
    const submitCustomer = (event) => {
        event.preventDefault();
        const options = {
            preserveScroll: true,
            onSuccess: () => {
                setCreateOpen(false);
                setEditingCustomer(null);
                createForm.reset();
            },
        };
        if (editingCustomer)
            createForm.patch(
                routeWithBase(
                    `/admin/customers/${editingCustomer.id}`,
                    app_base,
                ),
                options,
            );
        else
            createForm.post(
                routeWithBase("/admin/customers", app_base),
                options,
            );
    };
    const deleteCustomer = async (customer) => {
        if (
            !await confirmCrud(
                t(
                    "Delete this customer record? Sales history will be retained.",
                ),
            )
        )
            return;
        router.delete(
            routeWithBase(`/admin/customers/${customer.id}`, app_base),
            {},
            { preserveScroll: true },
        );
    };

    return (
        <AdminLayout
            title={t("Customers")}
            eyebrow={t("Customer credit records")}
            action={
                <button
                    type="button"
                    className="btn primary"
                    onClick={openCreate}
                >
                    <Icon name="plus" size={14} /> {t("Add customer")}
                </button>
            }
        >
            <Head title={t("Customers")} />
            <AdminFlash flash={flash} errors={createForm.errors} />
            <div className="metrics-grid four">
                <article className="metric-card glass">
                    <small>{t("Credit outstanding")}</small>
                    <strong>{formatMoney(creditStats.outstanding)}</strong>
                    <p>{t("Total receivables")}</p>
                </article>
                <article className="metric-card glass">
                    <small>{t("Overdue credit")}</small>
                    <strong>{formatMoney(creditStats.overdue)}</strong>
                    <p>{t("Past due balance")}</p>
                </article>
                <article className="metric-card glass">
                    <small>{t("Credit enabled")}</small>
                    <strong>{creditStats.active_accounts || 0}</strong>
                    <p>{t("Approved customers")}</p>
                </article>
                <article className="metric-card glass">
                    <small>{t("Credit suspended")}</small>
                    <strong>{creditStats.suspended_accounts || 0}</strong>
                    <p>{t("Credit blocked")}</p>
                </article>
            </div>
            <section className="panel glass">
                <PanelHeading
                    eyebrow={t("Customer base")}
                    title={t("Registered shoppers")}
                />
                <form
                    className="filter-toolbar customer-filter table-search-header"
                    onSubmit={handleSearch}
                >
                    <div className="search-box">
                        <Icon name="search" size={16} />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t("Search name, phone, or address...")}
                        />
                    </div>
                    <select
                        value={filters.credit || ""}
                        onChange={(e) =>
                            applyFilters({
                                credit: e.target.value || undefined,
                            })
                        }
                    >
                        <option value="">{t("All balances")}</option>
                        <option value="outstanding">
                            {t("Outstanding credit")}
                        </option>
                        <option value="overdue">{t("Overdue credit")}</option>
                    </select>
                    <select
                        value={filters.credit_status || ""}
                        onChange={(e) =>
                            applyFilters({
                                credit_status: e.target.value || undefined,
                            })
                        }
                    >
                        <option value="">{t("All credit statuses")}</option>
                        <option value="active">{t("Active")}</option>
                        <option value="suspended">{t("Suspended")}</option>
                        <option value="disabled">{t("Disabled")}</option>
                    </select>
                    <button type="submit" className="btn primary">
                        {t("Search")}
                    </button>
                    {hasActiveFilters && (
                        <button
                            type="button"
                            className="btn secondary customer-filter-reset"
                            onClick={() => {
                                setSearch("");
                                router.get(
                                    routeWithBase("/admin/customers", app_base),
                                );
                            }}
                        >
                            {t("Reset")}
                        </button>
                    )}
                </form>
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>{t("Customer")}</th>
                                <th className="numeric-cell">{t("Orders")}</th>
                                <th className="numeric-cell">{t("Paid revenue")}</th>
                                <th className="numeric-cell">{t("Credit balance")}</th>
                                <th>{t("Recorded")}</th>
                                <th className="table-actions-column"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.data.length === 0 ? (
                                <tr>
                                    <td colSpan={6}>
                                        <span className="muted">
                                            {t("No customers found.")}
                                        </span>
                                    </td>
                                </tr>
                            ) : (
                                customers.data.map((customer) => (
                                    <tr key={customer.id}>
                                        <td>
                                            <div className="rider-cell">
                                                <span>
                                                    {customer.name
                                                        .slice(0, 2)
                                                        .toUpperCase()}
                                                </span>
                                                <div>
                                                    <strong>
                                                        {customer.name}
                                                    </strong>
                                                    <small>
                                                        {customer.phone || customer.default_address || t('No contact details')}
                                                    </small>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="numeric-cell">{customer.orders_count}</td>
                                        <td className="numeric-cell">
                                            {formatMoney(customer.paid_revenue)}
                                        </td>
                                        <td className="numeric-cell">
                                            <strong>
                                                {formatMoney(
                                                    customer.credit_balance,
                                                )}
                                            </strong>
                                            <small>
                                                {t(
                                                    customer.credit_status ||
                                                        "disabled",
                                                )}{" "}
                                                · {t("Limit")}{" "}
                                                {formatMoney(
                                                    customer.credit_limit,
                                                )}
                                            </small>
                                        </td>
                                        <td>
                                            <small>
                                                {dateOnly(customer.created_at)}
                                            </small>
                                        </td>
                                        <td className="table-actions-column">
                                            <div className="inline-actions customer-row-actions">
                                                <button
                                                    type="button"
                                                    className="icon-btn small"
                                                    onClick={() =>
                                                        openEdit(customer)
                                                    }
                                                    aria-label={t(
                                                        "Edit customer",
                                                    )}
                                                >
                                                    <Icon
                                                        name="edit"
                                                        size={13}
                                                    />
                                                </button>
                                                <Link
                                                    href={routeWithBase(
                                                        `/admin/customers/${customer.id}`,
                                                        app_base,
                                                    )}
                                                    className="icon-btn small"
                                                    aria-label={t(
                                                        "View customer",
                                                    )}
                                                >
                                                    <Icon
                                                        name="external"
                                                        size={13}
                                                    />
                                                </Link>
                                                <button
                                                    type="button"
                                                    className="icon-btn small danger"
                                                    onClick={() =>
                                                        deleteCustomer(customer)
                                                    }
                                                    aria-label={t(
                                                        "Delete customer",
                                                    )}
                                                >
                                                    <Icon
                                                        name="trash"
                                                        size={13}
                                                    />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <AdminPagination paginator={customers} label={t("customers")} />
            </section>

            <CrudModal open={createOpen} onClose={() => setCreateOpen(false)} title={t(editingCustomer ? 'Edit customer record' : 'Add customer')} busy={createForm.processing}
                action={<button type="submit" form={formId} className="btn primary" disabled={createForm.processing || !createForm.data.name.trim()}>{t(createForm.processing ? 'Saving...' : editingCustomer ? 'Save changes' : 'Save customer')}</button>}>
                <form id={formId} onSubmit={submitCustomer}>
                    {Object.entries(createForm.errors).map(([key, value]) => <p className="field-error" role="alert" key={key}>{String(value)}</p>)}
                    <label className="form-field"><span>{t('Customer name')}</span><input autoFocus required maxLength={255} value={createForm.data.name} onChange={(event) => createForm.setData('name', event.target.value)} /></label>
                    <label className="form-field"><span>{t('Phone (optional)')}</span><input type="tel" maxLength={30} value={createForm.data.phone} onChange={(event) => createForm.setData('phone', event.target.value)} /></label>
                    <label className="form-field"><span>{t('Address (optional)')}</span><textarea rows={2} maxLength={1000} value={createForm.data.default_address} onChange={(event) => createForm.setData('default_address', event.target.value)} /></label>
                    {!editingCustomer && canManageCredit && <div className="crud-grid">
                        <label className="form-field"><span>{t('Credit limit')}</span><input type="number" min="0" step="0.01" max="999999999999.99" placeholder="0" value={createForm.data.credit_limit} onChange={(event) => createForm.setData('credit_limit', event.target.value)} /></label>
                        <label className="form-field"><span>{t('Terms (days)')}</span><input type="number" required min="1" max="365" value={createForm.data.credit_terms_days} onChange={(event) => createForm.setData('credit_terms_days', event.target.value)} /></label>
                    </div>}
                    {!editingCustomer && canManageCredit && <p className="muted">{t('Set a credit limit to allow credit sales. Repayments are recorded against this customer.')}</p>}
                </form>
            </CrudModal>
        </AdminLayout>
    );
}
