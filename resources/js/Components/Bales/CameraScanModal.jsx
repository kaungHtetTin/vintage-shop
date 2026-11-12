import { useEffect, useRef, useState } from 'react';
import CrudModal from '@/Components/Admin/CrudModal';
import { startBarcodeCamera } from '@/Utils/barcodeCamera';
import { usePhraseTranslation } from '@/Utils/i18n';

function CameraView({ active, onDetected }) {
    const t = usePhraseTranslation();
    const video = useRef(null);
    const detected = useRef(onDetected);
    detected.current = onDetected;
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!active || !video.current) return undefined;
        setError('');
        setReady(false);
        const camera = startBarcodeCamera(video.current, {
            onDetected: barcode => detected.current(barcode),
            onReady: () => setReady(true),
            onError: message => { setReady(false); setError(message); },
        });
        return camera.stop;
    }, [active, attempt]);
    return <div className="bale-camera-scanner">
        <div className="bale-camera-preview">
            <video ref={video} autoPlay muted playsInline aria-label={t('Live camera preview')} />
            {!error && <span className="bale-camera-guide" aria-hidden="true" />}
        </div>
        {error ? <>
            <div className="flash error" role="alert">{t(error)}</div>
            <button type="button" className="btn secondary" onClick={() => setAttempt(value => value + 1)}>{t('Try again')}</button>
        </> : <p role="status" aria-live="polite">{t(ready ? 'Point the camera at a price-label barcode. It will be added automatically.' : 'Starting camera...')}</p>}
    </div>;
}

export default function CameraScanModal({ open, onClose, onDetected }) {
    const t = usePhraseTranslation();
    return <CrudModal open={open} onClose={onClose} title={t('Camera scan')} className="bale-camera-dialog">
        <CameraView active={open} onDetected={onDetected} />
    </CrudModal>;
}
