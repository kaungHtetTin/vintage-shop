import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { router, usePage } from '@/spa/router';
import { usePhraseTranslation } from '@/Utils/i18n';

const interactive = 'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [contenteditable="true"]';

export default function DetailTableRow({ href, permission, permissions, label, className = '', children, onClick, onKeyDown, ...props }) {
    const uiText = useUiTranslation();
    const { auth, is_super_admin } = usePage().props;
    const t = usePhraseTranslation();
    const required = permissions || (permission ? [permission] : []);
    const allowed = !required.length || is_super_admin || required.some(name => (auth?.user?.permissions || []).includes(name));
    const destination = allowed ? href : undefined;
    const isControl = event => event.target !== event.currentTarget && Boolean(event.target.closest(interactive));
    const open = event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey) window.open(destination, '_blank', 'noopener,noreferrer');
        else router.visit(destination);
    };

    return <tr {...props}
        className={`${className} ${destination ? 'detail-table-row' : ''}`.trim()}
        tabIndex={destination ? 0 : undefined}
        aria-label={uiText(destination ? label || t('View details') : undefined)}
        data-detail-href={destination || undefined}
        onClick={event => {
            onClick?.(event);
            if (!destination || event.defaultPrevented || event.button !== 0 || isControl(event) || window.getSelection()?.toString()) return;
            open(event);
        }}
        onKeyDown={event => {
            onKeyDown?.(event);
            if (!destination || event.defaultPrevented || event.target !== event.currentTarget || event.key !== 'Enter') return;
            event.preventDefault();
            open(event);
        }}
        onAuxClick={event => {
            if (!destination || event.button !== 1 || isControl(event)) return;
            event.preventDefault();
            window.open(destination, '_blank', 'noopener,noreferrer');
        }}
    >{children}</tr>;
}
