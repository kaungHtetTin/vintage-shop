import { useId, useState } from 'react';
import Drawer from '@mui/material/Drawer';
import Icon from '@/Components/Admin/icons';
import { usePhraseTranslation } from '@/Utils/i18n';

// The applied filters belong to the page; draft values live only in the drawer.
export default function AdminFilterDrawer({ filters = {}, defaults = {}, fields = [], onApply, onReset, label = 'Filters' }) {
    const t = usePhraseTranslation();
    const id = useId();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState({});
    const definitions = typeof fields === 'function' ? fields(draft) : fields;
    const keys = definitions.map(field => field.key);
    const values = source => Object.fromEntries(definitions.map(field => {
        const value = source[field.key] ?? defaults[field.key] ?? '';
        return [field.key, field.type === 'checkbox' ? [true, 1, '1', 'true', 'on'].includes(value) : value];
    }));
    const applied = values(filters);
    const activeCount = keys.filter(key => String(applied[key]) !== String(defaults[key] ?? '') && applied[key] !== false && applied[key] !== '').length;
    const close = () => setOpen(false);
    const submit = event => {
        event.preventDefault();
        const next = Object.fromEntries(Object.entries(values(draft)).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
        onApply(next);
        close();
    };
    return <>
        <button type="button" className="btn secondary admin-filter-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setDraft(applied); setOpen(true); }}>
            <Icon name="filterList" size={15} /> {t(label)}
            {activeCount > 0 && <span className="orders-filter__count">{activeCount}</span>}
        </button>
        <Drawer anchor="right" open={open} onClose={close} container={() => document.querySelector('.app-root')} className="orders-drawer admin-filter-drawer"
            slotProps={{ paper: { role: 'dialog', 'aria-modal': true, 'aria-labelledby': id } }}>
            <form className="orders-drawer-form" onSubmit={submit}>
                <div className="drawer-header"><h2 id={id}>{t(label)}</h2><button type="button" className="icon-btn" onClick={close} aria-label={t('Close')}><Icon name="close" size={16} /></button></div>
                <div className="orders-drawer-fields">
                    {definitions.filter(field => !field.hidden).map((field, index) => <label key={field.key} className={`form-field ${field.pair ? 'admin-filter-date' : ''} ${field.type === 'checkbox' ? 'admin-filter-checkbox' : ''}`}>
                        {field.type !== 'checkbox' && <span>{t(field.label)}</span>}
                        {field.type === 'select' ? <select autoFocus={index === 0} value={draft[field.key] ?? defaults[field.key] ?? ''} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value, ...(field.clearOnChange || []).reduce((next, key) => ({ ...next, [key]: '' }), {}) }))}>
                            {(field.options || []).map(option => <option key={option.value} value={option.value}>{field.translateOptions === false && option.value !== '' ? option.label : t(option.label)}</option>)}
                        </select> : field.type === 'checkbox' ? <><input type="checkbox" checked={Boolean(draft[field.key]) && draft[field.key] !== '0'} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.checked }))} /><span>{t(field.label)}</span></> : field.type === 'search' ? <span className="search-box"><Icon name="search" size={16} /><input autoFocus={index === 0} type="search" placeholder={t(field.placeholder || field.label)} value={draft[field.key] ?? ''} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} /></span> : <input autoFocus={index === 0} type={field.type || 'text'} required={field.required} max={field.max} min={field.minKey ? draft[field.minKey] || undefined : field.min} value={draft[field.key] ?? defaults[field.key] ?? ''} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} />}
                    </label>)}
                </div>
                <div className="drawer-actions"><button type="button" className="btn secondary" onClick={() => { (onReset || onApply)(values(defaults)); close(); }}>{t('Reset')}</button><button type="submit" className="btn primary">{t('Apply filters')}</button></div>
            </form>
        </Drawer>
    </>;
}

export const filterOptions = (items = [], emptyLabel = 'All') => [
    { value: '', label: emptyLabel },
    ...items.map(item => typeof item === 'object' ? { value: item.value ?? item.id, label: item.label ?? item.name } : { value: item, label: item }),
];

export const dateFilters = (from = 'from', to = 'to') => [
    { key: from, label: 'From', type: 'date', pair: true }, { key: to, label: 'To', type: 'date', minKey: from, pair: true },
];
