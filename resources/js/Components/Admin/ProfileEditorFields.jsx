import Icon from '@/Components/Admin/icons';
import { usePhraseTranslation } from '@/Utils/i18n';

export default function ProfileEditorFields({ data, avatarPreview, errors, processing, onChange, onPhotoChange }) {
    const t = usePhraseTranslation();
    return (
        <div className="profile-social-editor">
            <div className="profile-social-identity">
                <div className="profile-social-photo">
                    <span className="profile-social-avatar" aria-hidden="true">
                        {avatarPreview ? <img src={avatarPreview} alt="" /> : data.name?.trim().charAt(0).toUpperCase() || <Icon name="user" size={30} />}
                    </span>
                    <label className="profile-social-camera" htmlFor="profile-photo-upload" title={t('Change profile photo')}>
                        <Icon name="image" size={15} />
                    </label>
                </div>
                <div className="profile-social-summary">
                    <strong>{data.name || t('Name')}</strong>
                    <span>{data.email || t('Email')}</span>
                    <label className="profile-social-photo-link" htmlFor="profile-photo-upload">{t('Change profile photo')}</label>
                </div>
                <input id="profile-photo-upload" type="file" name="avatar" className="sr-only-file"
                    accept="image/jpeg,image/png,image/webp,image/gif" disabled={processing}
                    aria-label={t('Change profile photo')} aria-invalid={Boolean(errors.avatar) || undefined}
                    aria-describedby={errors.avatar ? 'profile-photo-error' : undefined}
                    onChange={event => { onPhotoChange(event.target.files?.[0] || null); event.target.value = ''; }} />
            </div>
            {errors.avatar && <small className="field-error" id="profile-photo-error">{t(errors.avatar)}</small>}
            <div className="profile-social-fields">
                {[
                    { id: 'name', label: 'Name', type: 'text', autoComplete: 'name', icon: 'user' },
                    { id: 'email', label: 'Email', type: 'email', autoComplete: 'username', icon: 'navigation' },
                ].map(field => (
                    <div className="profile-social-field-row" key={field.id}>
                        <div className="profile-social-field" data-focus-shell>
                            <span className="profile-social-field-icon"><Icon name={field.icon} size={18} /></span>
                            <div className="profile-social-field-content">
                                <label htmlFor={field.id}>{t(field.label)}<span aria-hidden="true"> *</span></label>
                                <input id={field.id} name={field.id} type={field.type} autoComplete={field.autoComplete}
                                    value={data[field.id]} required disabled={processing}
                                    aria-invalid={Boolean(errors[field.id]) || undefined}
                                    aria-describedby={errors[field.id] ? `${field.id}-error` : undefined}
                                    onChange={event => onChange(field.id, event.target.value)} />
                            </div>
                        </div>
                        {errors[field.id] && <small className="field-error" id={`${field.id}-error`}>{t(errors[field.id])}</small>}
                    </div>
                ))}
            </div>
        </div>
    );
}
