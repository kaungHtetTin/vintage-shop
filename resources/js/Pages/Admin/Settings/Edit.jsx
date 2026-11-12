import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { Head, useForm, usePage } from '@/spa/router';
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import Icon from '@/Components/Admin/icons';
import { AdminFlash } from '@/Components/Admin/AdminFlash';
import { PanelHeading } from '@/Components/Admin/shared';
import { routeWithBase } from '@/Utils/url';
import { usePhraseTranslation } from '@/Utils/i18n';
import SettingsProfileForm from '@/Components/Admin/SettingsProfileForm';
import SettingsPasswordForm from '@/Components/Admin/SettingsPasswordForm';



import ReceiptSettings from './ReceiptSettings';
import SettingsSaveBar from '@/Components/Admin/SettingsSaveBar';
import { receiptDefaults } from '@/Components/Admin/ReceiptPaper';







const serializeEditorData = (value) => JSON.stringify(value, (_key, nextValue) => {
    if (typeof File !== 'undefined' && nextValue instanceof File) {
        return {
            name: nextValue.name,
            size: nextValue.size,
            lastModified: nextValue.lastModified,
        };
    }

    return nextValue;
});

function useObjectUrl(file) {
    const [url, setUrl] = useState(null);

    useEffect(() => {
        if (!file) {
            setUrl(null);
            return undefined;
        }

        const nextUrl = URL.createObjectURL(file);
        setUrl(nextUrl);

        return () => URL.revokeObjectURL(nextUrl);
    }, [file]);

    return url;
}

function AssetControl({ id, label, previewUrl, icon, fileName, error, accept, onUpload, onRemove, canRemove, t }) {
    const uiText = useUiTranslation();
    const translatedLabel = t(label);

    return (
        <div className="settings-asset-row">
            <div className="settings-asset-thumb">
                {previewUrl ? <img src={previewUrl} alt="" /> : <Icon name={icon} size={17} />}
            </div>
            <div className="settings-asset-meta">
                <span>{translatedLabel}</span>
                <small>{fileName}</small>
                {error && <small className="field-error">{uiText(error)}</small>}
            </div>
            <div className="settings-asset-actions">
                <input
                    id={id}
                    type="file"
                    className="sr-only-file"
                    accept={accept}
                    onChange={(e) => {
                        onUpload(e.target.files?.[0] || null);
                        e.target.value = '';
                    }}
                />
                <label className="icon-btn small" htmlFor={id} title={`${t('Upload')} ${translatedLabel}`} aria-label={`${t('Upload')} ${translatedLabel}`}>
                    <Icon name="image" size={13} />
                </label>
                {canRemove && (
                    <button type="button" className="icon-btn small danger" title={`${t('Remove')} ${translatedLabel}`} aria-label={`${t('Remove')} ${translatedLabel}`} onClick={onRemove}>
                        <Icon name="trash" size={13} />
                    </button>
                )}
            </div>
        </div>
    );
}



export default function SettingsEdit({ settings, initialSection = 'general', status = null, canManageSettings = false }) {
    const uiText = useUiTranslation();
    const { app_base, flash } = usePage().props;
    const t = usePhraseTranslation();
    const [activeSection, setActiveSection] = useState(status === 'password-updated' ? 'security' : status === 'profile-updated' ? 'profile' : initialSection);
    const [actionsContainer, setActionsContainer] = useState(null);
    const applicationSections = ['general', 'receipts'];
    useEffect(() => { setActiveSection(initialSection); }, [initialSection]);
    const initialData = useMemo(() => ({
        app_name: settings.app_name || '',
        currency_label: settings.currency_label || 'MMK',
        logo: null,
        favicon: null,
        remove_logo: false,
        remove_favicon: false,
        receipt: {
            ...receiptDefaults,
            ...settings.receipt,
            paper_size: settings.receipt?.paper_size || receiptDefaults.paper_size,
        },
    }), [settings]);
    const form = useForm(initialData);
    const hasChanges = serializeEditorData(form.data) !== serializeEditorData(initialData);

    useEffect(() => {
        const errorKeys = Object.keys(form.errors || {});
        if (errorKeys.some((key) => key === 'receipt' || key.startsWith('receipt.'))) {
            setActiveSection('receipts');
        
        
        } else if (errorKeys.length) {
            setActiveSection('general');
        }
    }, [form.errors]);

    const submit = (e) => {
        e.preventDefault();
        form.post(routeWithBase('/admin/settings', app_base), {
            preserveScroll: true,
            forceFormData: true,
        });
    };

    

    

    

    

    const logoName = form.data.logo?.name || (form.data.remove_logo ? t('Logo will be removed') : t('No new file selected'));
    const faviconName = form.data.favicon?.name || (form.data.remove_favicon ? t('Favicon will be removed') : t('No new file selected'));
    
    const logoObjectUrl = useObjectUrl(form.data.logo);
    const faviconObjectUrl = useObjectUrl(form.data.favicon);
    const logoPreviewUrl = form.data.remove_logo ? null : logoObjectUrl || settings.logo_url;
    const faviconPreviewUrl = form.data.remove_favicon ? null : faviconObjectUrl || settings.favicon_url;

    return (
        <AdminLayout title={t('Application settings')} eyebrow={t('Office configuration')}>
            <Head title={t('Application Settings')}>
                {settings.favicon_url && <link rel="icon" href={settings.favicon_url} />}
            </Head>

            <AdminFlash flash={flash} errors={form.errors} />

            <div className="settings-workspace-form">
                <div className="settings-workspace">
                    <aside className="settings-section-nav" aria-label={t('Settings sections')}>
                        {[
                            { id: 'general', label: 'General', icon: 'settings' },
                            
                            
                            { id: 'receipts', label: 'Receipts', icon: 'receipt' },
                            
                            { id: 'profile', label: 'Edit profile', icon: 'user' },
                            { id: 'security', label: 'Security', icon: 'lock' },
                            
                        ].filter((section) => canManageSettings || ['profile', 'security'].includes(section.id)).map((section) => (
                            <button
                                key={section.id}
                                type="button"
                                className={activeSection === section.id ? 'active' : ''}
                                onClick={() => setActiveSection(section.id)}
                                aria-current={activeSection === section.id ? 'page' : undefined}
                            >
                                <span className="settings-nav-icon"><Icon name={section.icon} size={15} /></span>
                                <span className="settings-nav-label">{t(section.label)}</span>
                            </button>
                        ))}
                    </aside>

                    <section className="settings-work-surface">
                        
                        {applicationSections.includes(activeSection) && <form id="application-settings-form" onSubmit={submit}>
                        {activeSection === 'receipts' && <ReceiptSettings form={form} settings={settings} logoUrl={logoPreviewUrl} />}
                        {activeSection === 'general' && (
                            <div className="settings-section-content">
                                <PanelHeading eyebrow={t('General')} title={t('Application identity')} />
                                
                                <div className="settings-compact-grid">
                                    <label className="form-field">
                                        <span>{t('Application name')}</span>
                                        <input value={form.data.app_name} onChange={(e) => form.setData('app_name', e.target.value)} required maxLength={80} />
                                        {form.errors.app_name && <small className="field-error">{uiText(form.errors.app_name)}</small>}
                                    </label>
                                    <label className="form-field">
                                        <span>{t('Currency label')}</span>
                                        <input value={form.data.currency_label} onChange={(e) => form.setData('currency_label', e.target.value)} placeholder={uiText("USD, MMK, CNY")} required maxLength={12} />
                                        {form.errors.currency_label && <small className="field-error">{uiText(form.errors.currency_label)}</small>}
                                    </label>
                                </div>
                            <div className="settings-general-assets"><AssetControl id="settings-logo-upload" label={uiText("Logo")} previewUrl={logoPreviewUrl} icon="image" fileName={logoName} error={form.errors.logo} accept="image/jpeg,image/png,image/webp,image/svg+xml" canRemove={!!settings.logo_url && !form.data.remove_logo} onUpload={(file) => form.setData({ ...form.data, logo: file, remove_logo: false })} onRemove={() => form.setData({ ...form.data, logo: null, remove_logo: true })} t={t} />
<AssetControl id="settings-favicon-upload" label={uiText("Favicon")} previewUrl={faviconPreviewUrl} icon="settings" fileName={faviconName} error={form.errors.favicon} accept="image/x-icon,image/jpeg,image/png,image/webp,image/svg+xml" canRemove={!!settings.favicon_url && !form.data.remove_favicon} onUpload={(file) => form.setData({ ...form.data, favicon: file, remove_favicon: false })} onRemove={() => form.setData({ ...form.data, favicon: null, remove_favicon: true })} t={t} /></div></div>
                        )}

                        

                        
                        </form>}

                        {activeSection === 'profile' && <div className="settings-section-content profile-settings-content">
                            <PanelHeading eyebrow={t('Account')} title={t('Edit profile')} />
                            
                            <SettingsProfileForm actionsContainer={actionsContainer} />
                        </div>}
                        {activeSection === 'security' && <div className="settings-section-content profile-settings-content">
                            <PanelHeading eyebrow={t('Security')} title={t('Update password')} />
                            
                            <SettingsPasswordForm actionsContainer={actionsContainer} />
                        </div>}
                        
                    </section>
                </div>

                <div className="settings-actions-slot" ref={setActionsContainer}>
                    {applicationSections.includes(activeSection) && <SettingsSaveBar
                        formId="application-settings-form"
                        processing={form.processing}
                        dirty={hasChanges}
                        recentlySuccessful={form.recentlySuccessful}
                        onDiscard={() => { form.reset(); form.clearErrors(); }}
                    />}
                </div>
            </div>
        </AdminLayout>
    );
}
