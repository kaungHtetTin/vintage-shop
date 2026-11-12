import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { useEffect, useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { useBales } from './shared';

export default function SavedCustomerSelect({ customer, onChange, open, disabled, required = false }) {
    const uiText = useUiTranslation();
    const { href } = useBales();
    const [query, setQuery] = useState('');
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open || disabled) return undefined;
        const controller = new AbortController();
        setLoading(true);
        setError('');
        const timer = window.setTimeout(async () => {
            try {
                const response = await window.axios.get(href('/admin/pos/customers/search'), {
                    params: { q: query }, signal: controller.signal,
                });
                setOptions(response.data);
            } catch (exception) {
                if (!controller.signal.aborted) setError('Could not load saved customers. Try searching again.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 250);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [open, disabled, query]);

    return <div className="bale-saved-customer">
        <Autocomplete disablePortal size="small" options={options} value={customer} disabled={disabled}
            loading={loading} filterOptions={(rows) => rows}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            getOptionLabel={(option) => [option.name, option.phone || option.default_address].filter(Boolean).join(' · ')}
            onInputChange={(_, value, reason) => { if (reason === 'input' || reason === 'clear') setQuery(value); }}
            onChange={(_, value) => onChange(value)}
            noOptionsText={uiText("No saved customers found")}
            renderInput={(params) => <TextField {...params} required={required} label={uiText("Saved customer")} placeholder={uiText("Search name or phone")} />} />
        {error && <p className="bale-error" role="alert">{uiText(error)}</p>}
        
    </div>;
}
