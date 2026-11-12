const loadReader = async () => {
    const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'), import('@zxing/library'),
    ]);
    return new BrowserMultiFormatOneDReader(new Map([
        [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]],
        [DecodeHintType.TRY_HARDER, true],
    ]), { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 500 });
};

export const cameraErrorMessage = error => {
    if (['NotAllowedError', 'PermissionDeniedError'].includes(error?.name)) return 'Camera permission was denied. Allow camera access and try again.';
    if (['NotFoundError', 'DevicesNotFoundError'].includes(error?.name)) return 'No camera was found on this device.';
    if (['NotReadableError', 'TrackStartError'].includes(error?.name)) return 'The camera is in use by another app. Close it and try again.';
    return 'Could not start the camera. Check your camera connection and try again.';
};

// Return cancellation immediately, even while permission or the decoder is loading.
export function startBarcodeCamera(video, { onDetected, onReady, onError }, readerFactory = loadReader) {
    let stopped = false;
    let stream;
    let controls;
    const stop = () => {
        stopped = true;
        document.removeEventListener('visibilitychange', pause);
        window.removeEventListener('pagehide', stop);
        Promise.resolve(controls?.stop()).catch(() => {});
        stream?.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    };
    const pause = () => {
        if (document.hidden && !stopped) {
            stop();
            onError('Camera paused. Tap Try again to continue.');
        }
    };
    document.addEventListener('visibilitychange', pause);
    window.addEventListener('pagehide', stop);
    const ready = (async () => {
        try {
            if (!window.isSecureContext) {
                stop();
                onError('Camera access requires HTTPS or localhost. You can still type or scan a barcode.');
                return;
            }
            if (!navigator.mediaDevices?.getUserMedia) {
                stop();
                onError('Camera scanning is not available in this browser. You can still type or scan a barcode.');
                return;
            }
            const reader = await readerFactory();
            if (stopped) return;
            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            });
            if (stopped) { stream.getTracks().forEach(track => track.stop()); return; }
            stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
                if (!stopped) { stop(); onError('Camera disconnected. Check the camera and try again.'); }
            }));
            controls = await reader.decodeFromStream(stream, video, result => {
                const barcode = result?.getText()?.trim();
                if (!barcode || stopped) return;
                stop();
                onDetected(barcode);
            });
            // Detection/cancellation may happen before decodeFromStream resolves.
            if (stopped) { await controls.stop(); return; }
            onReady();
        } catch (error) {
            if (!stopped) { stop(); onError(cameraErrorMessage(error)); }
        }
    })();
    return { stop, ready };
}
