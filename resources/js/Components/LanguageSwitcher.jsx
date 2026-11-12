import { useState } from 'react';
import { useLocale, useTranslation } from '@/Utils/i18n';
import Icon from '@/Components/Admin/icons';

export default function LanguageSwitcher({ className = '', compact = false }) {
    const { locale, supportedLocales, setLocale } = useLocale();
    const [pending, setPending] = useState(false);
    const t = useTranslation();
    const label = t('language.label', 'Language');

    return (
        <div className={`locale-switch ${compact ? 'locale-switch--compact' : ''} ${className}`.trim()}>
            <span className="locale-switch-heading">
                <Icon name="globe" size={19} />
                {!compact && <span>{label}</span>}
            </span>
            <div className="locale-switch-options" role="group" aria-label={label} aria-busy={pending}>
                {Object.entries(supportedLocales).map(([code, name]) => (
                    <button key={code} type="button" lang={code} title={name} aria-label={name}
                        aria-pressed={locale === code} disabled={pending}
                        onClick={() => {
                            if (pending || locale === code) return;
                            setPending(true);
                            setLocale(code, { onFinish: () => setPending(false) });
                        }}>
                        {code === 'en' ? 'EN' : code === 'my' ? 'မြန်မာ' : name}
                    </button>
                ))}
            </div>
        </div>
    );
}
