import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import CrudModal, { CrudAction } from "@/Components/Admin/CrudModal";
import { useEffect, useMemo, useState } from 'react';
import { Head, useForm, usePage } from '@/spa/router';
import AdminLayout from '@/Layouts/AdminLayout';
import Icon from '@/Components/Admin/icons';
import { AdminFlash } from '@/Components/Admin/AdminFlash';
import { StatusBadge } from '@/Components/Admin/shared';
import { routeWithBase } from '@/Utils/url';
import { usePhraseTranslation } from '@/Utils/i18n';

const createDefaults = {
    name: '',
    display_name: '',
    description: '',
    permissions: [],
};

function PermissionGroups({ groups, selected, disabled, onChange }) {
    const uiText = useUiTranslation();
    const [search, setSearch] = useState('');
    const t = usePhraseTranslation();
    const query = search.trim().toLowerCase();
    const permissionItems = groups.flatMap(group => group.items);
    const changeSelection = (next) => {
        const removed = selected.filter(value => !next.includes(value));
        let result = [...next];
        // Removing page access also removes permissions that depend on it.
        let changed;
        do {
            changed = false;
            for (const item of permissionItems) {
                if (result.includes(item.value) && (item.requires || []).some(value => removed.includes(value))) {
                    result = result.filter(value => value !== item.value);
                    removed.push(item.value);
                    changed = true;
                }
            }
        } while (changed);
        for (const value of [...result]) {
            for (const required of permissionItems.find(item => item.value === value)?.requires || []) {
                if (!result.includes(required)) result.push(required);
            }
        }
        onChange(result);
    };
    const visibleGroups = groups.map((group) => ({
        ...group,
        items: group.items.filter((item) => (!disabled || selected.includes(item.value)) &&
            `${group.group} ${item.label} ${item.value} ${item.description || ''}`.toLowerCase().includes(query)),
    })).filter((group) => group.items.length);
    const toggleGroup = (items, checked) => {
        const names = items.filter((item) => !item.inactive).map((item) => item.value);
        const next = checked
            ? [...new Set([...selected, ...names])]
            : selected.filter((name) => !names.includes(name));
        changeSelection(next);
    };

    return (
        <div className="permission-browser">
            <div className="permission-search-area">
            <label className="form-field">
                <span>{t('Find a permission')}</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('Search features or permission keys')} />
            </label>
            <p className="permission-help">{uiText(disabled
                ? t('System roles are read-only. Create a custom role to choose a different access level.')
                : t('Permissions apply to every staff member assigned to this role. Branch restrictions still apply.'))}</p>
            </div>
            <div className="permission-group-grid">
            {visibleGroups.map((group) => {
                const selectedCount = group.items.filter((item) => selected.includes(item.value)).length;
                const activeItems = group.items.filter((item) => !item.inactive);
                const allSelected = activeItems.length > 0 && activeItems.every((item) => selected.includes(item.value));

                if (disabled && selectedCount === 0) return null;

                return (
                    <fieldset key={group.group} className="permission-group" disabled={disabled}>
                        <legend>
                            <span>{t(group.group)}</span>
                            {disabled ? (
                                <small>{selectedCount}</small>
                            ) : (
                                <label className="permission-group-toggle">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        disabled={!activeItems.length}
                                        aria-label={`${t('Select visible active permissions')}: ${group.group}`}
                                        onChange={(event) => toggleGroup(group.items, event.target.checked)}
                                    />
                                    <small>{selectedCount}/{group.items.length}</small>
                                </label>
                            )}
                        </legend>
                        <div className="permission-options">
                            {group.items.map((permission) => {
                                const checked = selected.includes(permission.value);

                                if (disabled && !checked) return null;

                                return disabled ? (
                                    <span key={permission.value} className="permission-option static">
                                        <Icon name="check" size={13} />
                                        <span className="permission-copy">
                                            <strong>{t(permission.label)}</strong>
                                            <small>{t(permission.description || '')}</small>
                                            <code>{permission.value}{uiText(permission.inactive ? ` · ${t('Legacy / inactive')}` : '')}</code>
                                        </span>
                                    </span>
                                ) : (
                                    <label key={permission.value} className="permission-option">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={permission.inactive && !checked}
                                            onChange={(event) => {
                                                changeSelection(
                                                    event.target.checked
                                                        ? [...selected, permission.value]
                                                        : selected.filter((name) => name !== permission.value),
                                                );
                                            }}
                                        />
                                        <span className="permission-copy">
                                            <strong>{t(permission.label)}</strong>
                                            <small>{t(permission.description || '')}</small>
                                            <code>{permission.value}{uiText(permission.inactive ? ` · ${t('Legacy / inactive')}` : '')}</code>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>
                );
            })}
            </div>
            {!visibleGroups.length && <p className="permission-help" role="status">{t('No matching permissions.')}</p>}
        </div>
    );
}

export default function RolesIndex({ roles, permissionGroups }) {
    const uiText = useUiTranslation();
    const { app_base, flash } = usePage().props;
    const t = usePhraseTranslation();
    const [removedRoleIds, setRemovedRoleIds] = useState(() => new Set());
    const [updatedRoles, setUpdatedRoles] = useState({});
    const [selectedName, setSelectedName] = useState(roles[0]?.name || null);
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteErrors, setDeleteErrors] = useState([]);
    const [deleteNotice, setDeleteNotice] = useState('');
    const [updateNotice, setUpdateNotice] = useState('');
    const roleRows = useMemo(() => roles
        .filter((role) => !removedRoleIds.has(role.id))
        .map((role) => ({ ...role, ...(updatedRoles[role.id] || {}) })), [roles, removedRoleIds, updatedRoles]);
    const selectedRole = useMemo(
        () => roleRows.find((role) => role.name === selectedName) || roleRows[0] || null,
        [roleRows, selectedName],
    );
    const form = useForm({ display_name: '', description: '', permissions: [] });
    const createForm = useForm({ ...createDefaults });

    useEffect(() => {
        if (!selectedRole) return;

        form.setData({
            display_name: selectedRole.display_name,
            description: selectedRole.description || '',
            permissions: selectedRole.permissions || [],
        });
        form.clearErrors();
    }, [selectedRole?.id, selectedRole?.display_name, selectedRole?.description, selectedRole?.permissions]);

    const openCreate = () => {
        createForm.setData({ ...createDefaults });
        createForm.clearErrors();
        setCreateOpen(true);
    };

    const saveRole = (event) => {
        event.preventDefault();
        if (!selectedRole || selectedRole.is_locked) return;

        setDeleteNotice('');
        setUpdateNotice('');
        form.patch(routeWithBase(`/admin/roles/${selectedRole.id}`, app_base), {
            preserveScroll: true,
            onSuccess: (response) => {
                if (response?.role?.id === selectedRole.id) {
                    setUpdatedRoles((current) => ({ ...current, [selectedRole.id]: response.role }));
                    setUpdateNotice(response.message || t('Role permissions updated.'));
                }
            },
        });
    };

    const submitCreate = (event) => {
        event.preventDefault();
        createForm.post(routeWithBase('/admin/roles', app_base), {
            preserveScroll: true,
            onSuccess: () => setCreateOpen(false),
        });
    };

    const openDelete = () => {
        if (!selectedRole || selectedRole.is_system) return;
        setDeleteErrors([]);
        setDeleteNotice('');
        setUpdateNotice('');
        setDeleteTarget(selectedRole);
    };

    const deleteRole = async () => {
        if (!deleteTarget || deleting || deleteTarget.users_count > 0) return;
        const { id, name } = deleteTarget;
        setDeleting(true);
        setDeleteErrors([]);
        try {
            const response = await window.axios.delete(routeWithBase(`/admin/roles/${id}`, app_base));
            if (Number(response.data?.deleted_role_id) !== Number(id)) {
                throw new Error('Role deletion was not confirmed.');
            }
            setRemovedRoleIds((current) => new Set(current).add(id));
            setSelectedName((current) => current === name ? null : current);
            setDeleteTarget(null);
            setDeleteNotice(t('Role deleted.'));
        } catch (error) {
            const messages = Object.values(error.response?.data?.errors || {}).flat().filter(Boolean);
            setDeleteErrors(messages.length ? messages : [error.response?.data?.message || t('Unable to delete role. Please try again.')]);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <AdminLayout
            title={t('Roles & permissions')}
            eyebrow={t('Access control')} contentClassName="roles-page"
            action={
                <button type="button" className="btn primary" onClick={openCreate}>
                    <Icon name="plus" size={14} />
                    {t('Add role')}
                </button>
            }
        >
            <Head title={t('Roles & Permissions')} />
            <AdminFlash flash={flash} errors={form.errors} />
            {deleteNotice && <div className="flash success" role="status">{uiText(deleteNotice)}</div>}
            {updateNotice && <div className="flash success" role="status">{uiText(updateNotice)}</div>}

            <section className="panel glass roles-workspace">
                

                <div className="role-permission-layout">
                    <aside className="role-list" aria-label={t('Admin roles')}>
                        {roleRows.map((role) => (
                            <button
                                key={role.name}
                                type="button"
                                className={`role-list-item ${selectedRole?.name === role.name ? 'active' : ''}`}
                                aria-pressed={selectedRole?.name === role.name} onClick={() => setSelectedName(role.name)}
                            >
                                <span>
                                    <strong>{role.is_system ? t(role.display_name) : role.display_name}</strong>
                                    <small>{role.users_count} {t('staff')}</small>
                                </span>
                                <small className="role-permission-count" title={t("Permissions")}>{role.permissions.length}</small>
                            </button>
                        ))}
                    </aside>

                    {selectedRole && (
                        <div className="role-overview" key={selectedRole.id}>
                            <div className="role-overview-heading">
                                <div><h2>{selectedRole.is_system ? t(selectedRole.display_name) : selectedRole.display_name}</h2><StatusBadge status="info" label={uiText(selectedRole.is_system ? 'System role' : 'Custom role')} /></div>
                                <div className="role-overview-metrics"><span><strong>{selectedRole.users_count}</strong> {t('staff')}</span><span><strong>{selectedRole.permissions.length}</strong> {t('permissions')}</span></div>
                            </div>
                            {selectedRole.description && <p className="role-overview-description">{selectedRole.is_system ? t(selectedRole.description) : selectedRole.description}</p>}
                            {!selectedRole.is_locked && <div className="role-overview-actions"><CrudAction title={`${t("Edit")} ${selectedRole.is_system ? t(selectedRole.display_name) : selectedRole.display_name}`} label={t("Edit permissions")} form={form} wide>
                            <form className="role-editor" onSubmit={saveRole}>
                                <div className="role-editor-header">
                                    <div>
                                        <div className="inline-actions">
                                            <h2>{selectedRole.is_system ? t(selectedRole.display_name) : selectedRole.display_name}</h2>
                                            <StatusBadge
                                                status="info"
                                                label={uiText(selectedRole.is_system ? 'System role' : 'Custom role')}
                                            />
                                        </div>
                                        <code>{selectedRole.name}</code>
                                    </div>
                                    <span className="role-staff-count">
                                        <Icon name="users" size={15} />
                                        {selectedRole.users_count}
                                    </span>
                                </div>

                                <div className="crud-grid role-fields">
                                    <label className="form-field">
                                        <span>{t('Display name')}</span>
                                        <input
                                            value={form.data.display_name}
                                            onChange={(event) => form.setData('display_name', event.target.value)}
                                            disabled={selectedRole.is_locked}
                                            required
                                        />
                                    </label>
                                    <label className="form-field">
                                        <span>{t('Description')}</span>
                                        <input
                                            value={form.data.description}
                                            onChange={(event) => form.setData('description', event.target.value)}
                                            disabled={selectedRole.is_locked}
                                        />
                                    </label>
                                </div>

                                <PermissionGroups
                                    groups={permissionGroups}
                                    selected={form.data.permissions || []}
                                    disabled={selectedRole.is_locked}
                                    onChange={(permissions) => form.setData('permissions', permissions)}
                                />

                                <div className="modal-actions role-editor-actions">
                                    {!selectedRole.is_system && (
                                        <button
                                            type="button"
                                            className="btn danger"
                                            onClick={openDelete}
                                        >
                                            <Icon name="trash" size={14} />
                                            {t('Delete')}
                                        </button>
                                    )}
                                    <button type="submit" className="btn primary" disabled={form.processing || selectedRole.is_locked}>
                                        <Icon name="check" size={14} />
                                        {t('Save permissions')}
                                    </button>
                                </div>
                            </form>
                        </CrudAction></div>}
                            <PermissionGroups key={selectedRole.name} groups={permissionGroups} selected={selectedRole.permissions} disabled onChange={() => {}} />
                        </div>
                    )}
                </div>
            </section>

            {createOpen && (
                <CrudModal open title={t('New role')} onClose={() => setCreateOpen(false)} busy={createForm.processing} wide action={<> <button form="admin-roles-index-jsx-1" type="submit" className="btn primary" disabled={createForm.processing}>
                                {t('Create role')}
                            </button> </>}>
<form id="admin-roles-index-jsx-1" className="admin-modal-form" onSubmit={submitCreate}>

                        <div className="admin-form-modal-body">
                            {Object.keys(createForm.errors).length > 0 && (
                                <div className="flash error" role="alert">
                                    {Object.values(createForm.errors).map((message, index) => <div key={index}>{uiText(message)}</div>)}
                                </div>
                            )}
                            <section className="admin-form-section">
                                <div className="admin-form-section-heading">
                                    <span className="payment-section-icon"><Icon name="user" size={14} /></span>
                                    <div>
                                        <strong>{t('Role identity')}</strong>
                                        <small>{t('Use a clear display name and stable system key.')}</small>
                                    </div>
                                </div>
                                <div className="crud-grid admin-form-grid">
                                    <label className="form-field">
                                        <span>{t('Display name')}</span>
                                        <input
                                            value={createForm.data.display_name}
                                            onChange={(event) => createForm.setData('display_name', event.target.value)}
                                            required
                                        />
                                    </label>
                                    <label className="form-field">
                                        <span>{t('System key')}</span>
                                        <input
                                            value={createForm.data.name}
                                            onChange={(event) => createForm.setData('name', event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                                            placeholder={uiText("warehouse_clerk")}
                                            required
                                        />
                                    </label>
                                    <label className="form-field span-2">
                                        <span>{t('Description')}</span>
                                        <input
                                            value={createForm.data.description}
                                            onChange={(event) => createForm.setData('description', event.target.value)}
                                        />
                                    </label>
                                </div>
                            </section>
                            <section className="admin-form-section role-create-permissions">
                                <div className="admin-form-section-heading">
                                    <span className="payment-section-icon"><Icon name="lock" size={14} /></span>
                                    <div>
                                        <strong>{t('Permissions')}</strong>
                                        <small>{t('Select the admin areas this role can access.')}</small>
                                    </div>
                                </div>
                                <PermissionGroups
                                    groups={permissionGroups}
                                    selected={createForm.data.permissions || []}
                                    disabled={false}
                                    onChange={(permissions) => createForm.setData('permissions', permissions)}
                                />
                            </section>
                        </div>

                    </form>
</CrudModal>
            )}

            {deleteTarget && (
                <CrudModal open title={t('Delete role')} busy={deleting} onClose={() => setDeleteTarget(null)}
                    action={<button type="button" className="btn danger" onClick={deleteRole} disabled={deleting || deleteTarget.users_count > 0}>{uiText(deleting ? t('Deleting...') : t('Delete'))}</button>}>
                    <p>{t('Delete')} <strong>{deleteTarget.display_name}</strong>?</p>
                    {deleteTarget.users_count > 0 && <div className="flash error" role="alert">{t('Move assigned staff before deleting this role.')}</div>}
                    {deleteErrors.length > 0 && <div className="flash error" role="alert">{deleteErrors.map((message, index) => <div key={index}>{uiText(message)}</div>)}</div>}
                </CrudModal>
            )}
        </AdminLayout>
    );
}
