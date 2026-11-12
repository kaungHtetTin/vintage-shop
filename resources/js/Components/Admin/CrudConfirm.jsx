import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { useEffect, useRef, useState } from 'react';
import CrudModal from './CrudModal';
import { usePhraseTranslation } from '@/Utils/i18n';
import { router } from '@/spa/router';

export function confirmCrud(message) {
    return new Promise((resolve) => window.dispatchEvent(new CustomEvent('admin:confirm', { detail: { message, resolve } })));
}

export default function CrudConfirm() {
    const uiText = useUiTranslation();
    const [request, setRequest] = useState(null);
    const active = useRef(null);
    const t = usePhraseTranslation();
    const finish = (confirmed) => {
        active.current?.resolve(confirmed);
        active.current = null;
        setRequest(null);
    };
    useEffect(() => {
        const receive = ({ detail }) => {
            if (active.current) { detail.resolve(false); return; }
            active.current = detail;
            setRequest(detail);
        };
        window.addEventListener('admin:confirm', receive);
        const unsubscribe = router.on('navigate', () => finish(false));
        return () => {
            window.removeEventListener('admin:confirm', receive);
            unsubscribe();
            active.current?.resolve(false);
        };
    }, []);
    return <CrudModal open={Boolean(request)} onClose={() => finish(false)} title={t('Confirm action')}
        action={<button type="button" className="btn danger" onClick={() => finish(true)}>{t('Confirm')}</button>}>
        <p style={{ whiteSpace: 'pre-line' }}>{uiText(request?.message)}</p>
    </CrudModal>;
}
