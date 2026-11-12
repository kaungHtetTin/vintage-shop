import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { useRef, useState } from 'react';
import { useForm, usePage } from '@/spa/router';
import { IconButton, InputAdornment } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { routeWithBase } from '@/Utils/url';
import { usePhraseTranslation } from '@/Utils/i18n';
import SettingsField from '@/Components/Admin/SettingsField';
import SettingsSaveBar from '@/Components/Admin/SettingsSaveBar';

export default function SettingsPasswordForm({ actionsContainer }) {
    const uiText = useUiTranslation();
    const { props } = usePage();
    const { app_base } = props;
    const t = usePhraseTranslation();
    const passwordEndpoint = routeWithBase('/admin/profile/password', app_base);
    const passwordInput = useRef();
    const currentPasswordInput = useRef();
    const [passwordVisibility, setPasswordVisibility] = useState({
        current_password: false,
        password: false,
        password_confirmation: false,
    });
    const { data, setData, errors, put, reset, clearErrors, processing, recentlySuccessful } = useForm({
        current_password: '',
        password: '',
        password_confirmation: '',
    });

    const updatePassword = (e) => {
        e.preventDefault();

        put(passwordEndpoint, {
            preserveScroll: true,
            onSuccess: (response) => {
                reset();
                setPasswordVisibility({ current_password: false, password: false, password_confirmation: false });
                if (response?.status === 'password-updated') {
                    window.dispatchEvent(new CustomEvent('admin:notice', {
                        detail: { type: 'success', message: t('Password updated successfully.') },
                    }));
                }
            },
            onError: (nextErrors) => {
                if (nextErrors.password) {
                    reset('password', 'password_confirmation');
                    passwordInput.current?.focus();
                }

                if (nextErrors.current_password) {
                    reset('current_password');
                    currentPasswordInput.current?.focus();
                }
            },
        });
    };

    const visibilityControl = (field, label) => ({
        endAdornment: (
            <InputAdornment position="end">
                <IconButton
                    type="button"
                    edge="end"
                    size="small"
                    aria-label={t(passwordVisibility[field] ? t("Hide :label", { label: t(label) }) : t("Show :label", { label: t(label) }))}
                    aria-pressed={passwordVisibility[field]}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setPasswordVisibility((current) => ({ ...current, [field]: !current[field] }))}
                >
                    {passwordVisibility[field] ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                </IconButton>
            </InputAdornment>
        ),
    });

    return <section>
        <form id="settings-password-form" className="settings-account-form" onSubmit={updatePassword}>
            <SettingsField
                        id="current_password"
                        type={passwordVisibility.current_password ? 'text' : 'password'}
                        label={t('Current Password')}
                        fullWidth
                        inputRef={currentPasswordInput}
                        autoComplete="current-password"
                        value={data.current_password}
                        onChange={(e) => setData('current_password', e.target.value)}
                        error={Boolean(errors.current_password)}
                        helperText={uiText(errors.current_password)}
                        slotProps={{ input: visibilityControl('current_password', 'current password') }}
                    />

                    <SettingsField
                        id="password"
                        type={passwordVisibility.password ? 'text' : 'password'}
                        label={t('New Password')}
                        fullWidth
                        inputRef={passwordInput}
                        autoComplete="new-password"
                        value={data.password}
                        onChange={(e) => setData('password', e.target.value)}
                        error={Boolean(errors.password)}
                        helperText={uiText(errors.password)}
                        slotProps={{ input: visibilityControl('password', 'new password') }}
                    />

                    <SettingsField
                        id="password_confirmation"
                        type={passwordVisibility.password_confirmation ? 'text' : 'password'}
                        label={t('Confirm Password')}
                        fullWidth
                        autoComplete="new-password"
                        value={data.password_confirmation}
                        onChange={(e) => setData('password_confirmation', e.target.value)}
                        error={Boolean(errors.password_confirmation)}
                        helperText={uiText(errors.password_confirmation)}
                        slotProps={{ input: visibilityControl('password_confirmation', 'password confirmation') }}
                    />

                    <SettingsSaveBar
                        external target={actionsContainer} formId="settings-password-form"
                        processing={processing} dirty={Object.values(data).some(Boolean)} recentlySuccessful={recentlySuccessful}
                        onDiscard={() => {
                            reset(); clearErrors();
                            setPasswordVisibility({ current_password: false, password: false, password_confirmation: false });
                        }}
                    />
        </form>
    </section>;
}
