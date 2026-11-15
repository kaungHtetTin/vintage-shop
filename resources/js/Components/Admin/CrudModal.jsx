import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { Children, cloneElement, isValidElement, useEffect, useId, useState } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import Icon from '@/Components/Admin/icons';
import { usePhraseTranslation } from '@/Utils/i18n';
import '@/styles/crud-modal.css';
import { formatErrorMessage } from '@/Utils/formatErrorMessage';

const dialogContainer = () => document.querySelector('.app-root');

// Native forms can supply their own action row. Place it in the shared footer
// while retaining the form owner, native validation, and submit handler.
function organizeForm(children, id, cancelLabel) {
    let actions;
    const content = Children.map(children, child => {
        if (!isValidElement(child) || child.type !== 'form') return child;
        const formId = child.props.id || id;
        const fields = Children.map(child.props.children, field => {
            if (!isValidElement(field)) return field;
            const row = field.type === 'button' ? [field] : Children.toArray(field.props.children);
            const buttonsOnly = row.length > 0 && row.every(button => isValidElement(button) && button.type === 'button');
            const hasSubmit = buttonsOnly && row.some(button => !button.props.type || button.props.type === 'submit');
            if (!hasSubmit) return field;
            const buttons = row.filter(button => button.props.children !== cancelLabel).map(button => cloneElement(button, { form: formId }));
            actions = [...(actions || []), ...buttons];
            return null;
        });
        return cloneElement(child, { id: formId }, fields);
    });
    return { content, actions };
}

export default function CrudModal({ open, onClose, title, busy = false, errors = {}, children, action, wide = false, className = '' }) {
    const uiText = useUiTranslation();
    const id = useId();
    const t = usePhraseTranslation();
    const organized = action ? { content: children, actions: action } : organizeForm(children, `${id}-form`, t('Cancel'));
    return (
        <Dialog open={open} onClose={() => !busy && onClose()} disableEscapeKeyDown={busy}
            container={dialogContainer} fullWidth maxWidth={wide ? 'lg' : 'sm'} aria-labelledby={id}
            className={`admin-crud-dialog ${wide ? 'admin-crud-dialog-wide' : ''} ${className}`.trim()}>
            <DialogTitle id={id} className="admin-crud-dialog-heading">
                <span>{uiText(title)}</span>
                <button type="button" className="icon-btn" aria-label={t('Close')} disabled={busy} onClick={onClose}>
                    <Icon name="close" size={18} />
                </button>
            </DialogTitle>
            <DialogContent dividers aria-busy={busy}>
                {Object.values(errors).some(Boolean) && <div className="flash error" role="alert">
                    {[...new Set(Object.values(errors).flat().filter(Boolean))].map((error, index) => <p key={index}>{uiText(formatErrorMessage(error))}</p>)}
                </div>}
                {organized.content}
            </DialogContent>
            <DialogActions>
                <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>{t('Cancel')}</button>
                {organized.actions}
            </DialogActions>
        </Dialog>
    );
}

// Keep the form's state in its owner so failed submissions retain every field.
export function CrudAction({ title, label = title, form, children, wide = false, className = 'btn secondary', onOpen }) {
    const uiText = useUiTranslation();
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (form.recentlySuccessful) setOpen(false);
    }, [form.recentlySuccessful]);
    return <>
        <button type="button" className={className} onClick={() => {
            form.clearErrors();
            onOpen?.();
            setOpen(true);
        }}>{uiText(label)}</button>
        <CrudModal open={open} onClose={() => { form.clearErrors(); setOpen(false); }} title={uiText(title)} busy={form.processing} errors={form.errors} wide={wide}>
            {children}
        </CrudModal>
    </>;
}
