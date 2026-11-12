import { useForm, usePage } from '@/spa/router';
import { routeWithBase, storageUrl } from '@/Utils/url';
import { useEffect, useState } from 'react';
import CropImageModal from '@/Components/Admin/CropImageModal';
import { usePhraseTranslation } from '@/Utils/i18n';
import ProfileEditorFields from '@/Components/Admin/ProfileEditorFields';
import SettingsSaveBar from '@/Components/Admin/SettingsSaveBar';

export default function SettingsProfileForm({ actionsContainer }) {
    const { props } = usePage();
    const t = usePhraseTranslation();
    const { auth, app_base, app_url } = props;
    const user = auth?.user;
    const profileEndpoint = routeWithBase('/admin/profile', app_base);
    const avatarSrc = user?.avatar ? storageUrl(user.avatar, app_url) : undefined;

    const { data, setData, patch, post, transform, errors, clearErrors, processing, recentlySuccessful } = useForm({
        name: user?.name ?? '',
        email: user?.email ?? '',
        avatar: null,
    });
    const [savedProfile, setSavedProfile] = useState(() => ({ ...data }));
    const hasChanges = Object.keys(savedProfile).some(key => data[key] !== savedProfile[key]);
    const profileSaved = () => {
        const saved = { ...data, avatar: null };
        setSavedProfile(saved);
        setData(saved);
    };
    const [croppingImage, setCroppingImage] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(avatarSrc);

    const submit = (e) => {
        e.preventDefault();
        if (data.avatar instanceof File) {
            // Multipart + PATCH can drop fields in some PHP setups; use POST method spoof.
            transform((form) => ({
                ...form,
                _method: 'patch',
            }));
            post(profileEndpoint, {
                preserveScroll: true,
                refreshRedirected: false,
                forceFormData: true,
                onSuccess: () => {
                    window.dispatchEvent(new CustomEvent('admin:notice', { detail: { type: 'success', message: t('Profile updated successfully.') } }));
                    profileSaved();
                },
                onFinish: () => transform((form) => form),
            });
            return;
        }

        patch(profileEndpoint, {
            preserveScroll: true,
            refreshRedirected: false,
            onSuccess: () => {
                window.dispatchEvent(new CustomEvent('admin:notice', { detail: { type: 'success', message: t('Profile updated successfully.') } }));
                profileSaved();
            },
        });
    };

    useEffect(() => {
        if (!(data.avatar instanceof File)) {
            setAvatarPreview(avatarSrc);
            return undefined;
        }
        const url = URL.createObjectURL(data.avatar);
        setAvatarPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [data.avatar, avatarSrc]);

    const openCropper = (file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setCroppingImage(reader.result);
        reader.readAsDataURL(file);
    };

    const handleCropComplete = (croppedBlob) => {
        const ext = (croppedBlob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
        const cropped = new File([croppedBlob], `avatar-crop.${Date.now()}.${ext}`, {
            type: croppedBlob.type || 'image/jpeg',
        });
        setData('avatar', cropped);
        setCroppingImage(null);
    };

    if (!user) return <div className="flash error" role="alert">{t('Please sign in again to manage your profile.')}</div>;

    return <section>
        <form id="settings-profile-form" className="settings-account-form" onSubmit={submit}>
            <ProfileEditorFields data={data} avatarPreview={avatarPreview} errors={errors} processing={processing}
                onChange={setData} onPhotoChange={file => { if (file) openCropper(file); }} />
            <SettingsSaveBar external target={actionsContainer} formId="settings-profile-form"
                processing={processing} dirty={hasChanges} recentlySuccessful={recentlySuccessful}
                onDiscard={() => { setData({ ...savedProfile }); clearErrors(); }} />
        </form>
        <CropImageModal open={!!croppingImage} image={croppingImage}
            onCropComplete={handleCropComplete} onCancel={() => setCroppingImage(null)} aspect={1} />
    </section>;
}
