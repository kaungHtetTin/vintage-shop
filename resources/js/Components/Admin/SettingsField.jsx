import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
/** Native admin field adapter; customer forms continue using MUI TextField. */
export default function SettingsField({ id, label, inputRef, error, helperText, slotProps, fullWidth, ...props }) {
    const uiText = useUiTranslation();
    const helpId = `${id}-help`;
    return <div className="form-field settings-account-field">
        <label htmlFor={id}>{uiText(label)}{props.required && <span aria-hidden="true"> *</span>}</label>
        <div className="settings-input-with-action">
            <input {...props} id={id} ref={inputRef} aria-invalid={error || undefined} aria-describedby={helperText ? helpId : undefined} />
            {slotProps?.input?.endAdornment}
        </div>
        {helperText && <small id={helpId} className={error ? 'field-error' : 'muted'}>{uiText(helperText)}</small>}
    </div>;
}
