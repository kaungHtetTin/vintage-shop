// Verify lifecycle with mocked permissions, then decode a real app barcode from
// a simulated video stream. No build, physical camera or sales data is used.
const fs = require('node:fs');
const http = require('node:http');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { transformSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const puppeteer = require('puppeteer');
const compile = file => transformSync(fs.readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic' }).code;
const mod = new Module(__filename, module);
mod.paths = module.paths;
const cameraCode = compile('resources/js/Utils/barcodeCamera.js');
mod._compile(cameraCode, __filename);
const { startBarcodeCamera } = mod.exports;
const deferred = () => { let resolve; const promise = new Promise(done => resolve = done); return { promise, resolve }; };

async function lifecycleChecks() {
    const originals = Object.fromEntries(['window', 'document', 'navigator'].map(name => [name, Object.getOwnPropertyDescriptor(global, name)]));
    const setup = () => {
        const track = Object.assign(new EventTarget(), { stops: 0, stop() { this.stops++; } });
        const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
        const document = Object.assign(new EventTarget(), { hidden: false });
        const window = Object.assign(new EventTarget(), { isSecureContext: true });
        const navigator = { mediaDevices: { getUserMedia: async () => stream } };
        for (const [name, value] of Object.entries({ document, window, navigator })) Object.defineProperty(global, name, { value, configurable: true });
        const video = { srcObject: null }, codes = [], errors = [];
        let decode, controlsStopped = 0;
        const controls = { stop: () => controlsStopped++ };
        const reader = { decodeFromStream: async (_stream, _video, callback) => { decode = callback; return controls; } };
        const factory = async () => reader;
        const handlers = { onDetected: code => codes.push(code), onReady: () => {}, onError: error => errors.push(error) };
        return { track, stream, video, codes, errors, factory, handlers, reader, window, document, navigator, controls, decode: () => decode, stopped: () => controlsStopped };
    };
    try {
        let test = setup();
        let camera = startBarcodeCamera(test.video, test.handlers, test.factory);
        await camera.ready;
        test.decode()({ getText: () => '8312345678' });
        test.decode()({ getText: () => '8312345678' });
        assert.deepEqual(test.codes, ['8312345678'], 'Repeated camera frames added twice');
        assert(test.track.stops > 0 && test.stopped() > 0);
        assert.equal(test.video.srcObject, null);
        for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError']) {
            test = setup();
            test.navigator.mediaDevices.getUserMedia = async () => { throw { name }; };
            await startBarcodeCamera(test.video, test.handlers, test.factory).ready;
            assert.equal(test.errors.length, 1, name + ': no useful error');
        }
        test = setup();
        const permission = deferred();
        test.navigator.mediaDevices.getUserMedia = () => permission.promise;
        camera = startBarcodeCamera(test.video, test.handlers, test.factory);
        await Promise.resolve();
        camera.stop();
        permission.resolve(test.stream);
        await camera.ready;
        assert(test.track.stops > 0, 'Camera leaked after closing during permission prompt');
        test = setup();
        const readerLoading = deferred();
        let requested = false;
        test.navigator.mediaDevices.getUserMedia = async () => { requested = true; return test.stream; };
        camera = startBarcodeCamera(test.video, test.handlers, () => readerLoading.promise);
        camera.stop(); readerLoading.resolve(test.reader);
        await camera.ready;
        assert.equal(requested, false, 'Closed scanner still requested the camera');
        test = setup();
        camera = startBarcodeCamera(test.video, test.handlers, test.factory);
        await camera.ready;
        test.document.hidden = true;
        test.document.dispatchEvent(new Event('visibilitychange'));
        assert(test.track.stops > 0 && test.errors[0].includes('paused'));
        test = setup(); test.window.isSecureContext = false;
        await startBarcodeCamera(test.video, test.handlers, test.factory).ready;
        assert(test.errors[0].includes('HTTPS'));
        test = setup(); test.navigator.mediaDevices = undefined;
        await startBarcodeCamera(test.video, test.handlers, test.factory).ready;
        assert(test.errors[0].includes('not available'));
    } finally {
        for (const [name, descriptor] of Object.entries(originals)) {
            if (descriptor) Object.defineProperty(global, name, descriptor); else delete global[name];
        }
    }
}

async function videoCheck() {
    const barcodeModule = new Module(__filename, module);
    barcodeModule.paths = module.paths;
    barcodeModule.require = name => name.endsWith('/i18n') ? { usePhraseTranslation: () => value => value } : require(name);
    barcodeModule._compile(compile('resources/js/Components/Bales/Barcode.jsx'), __filename);
    const svg = renderToStaticMarkup(React.createElement(barcodeModule.exports.default, { value: '8312345678' }))
        .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="180"');
    const server = http.createServer((_req, res) => res.end('<html><body><video autoplay muted playsinline></video></body></html>'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto('http://127.0.0.1:' + server.address().port);
        await page.addScriptTag({ path: 'node_modules/@zxing/browser/umd/zxing-browser.min.js' });
        await page.addScriptTag({ content: 'const module = { exports: {} };\n' + cameraCode + '\nwindow.cameraApi = module.exports;' });
        const result = await page.evaluate(async svg => {
            const canvas = document.createElement('canvas');
            canvas.width = 1000; canvas.height = 400;
            const context = canvas.getContext('2d');
            const image = new Image();
            image.src = 'data:image/svg+xml;base64,' + btoa(svg);
            await image.decode();
            const draw = () => { context.fillStyle = '#fff'; context.fillRect(0, 0, 1000, 400); context.drawImage(image, 50, 110, 900, 180); };
            draw();
            const stream = canvas.captureStream(15);
            const timer = setInterval(draw, 60);
            Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async constraints => {
                if (constraints.audio !== false || constraints.video.facingMode.ideal !== 'environment') throw Error('Wrong camera constraints');
                return stream;
            } });
            try {
                const codes = [];
                let camera;
                await Promise.race([
                    new Promise((resolve, reject) => {
                        camera = window.cameraApi.startBarcodeCamera(document.querySelector('video'), {
                            onDetected: value => { codes.push(value); resolve(); }, onReady: () => {}, onError: reject,
                        }, async () => new ZXingBrowser.BrowserMultiFormatOneDReader());
                    }),
                    new Promise((_resolve, reject) => setTimeout(() => reject(Error('Video barcode was not decoded')), 10000)),
                ]);
                await camera.ready;
                camera.stop();
                return { codes, stopped: stream.getTracks().every(track => track.readyState === 'ended'), detached: document.querySelector('video').srcObject === null };
            } finally { clearInterval(timer); stream.getTracks().forEach(track => track.stop()); }
        }, svg);
        assert.deepEqual(result.codes, ['8312345678']);
        assert(result.stopped && result.detached, 'Video camera was not released');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}
(async () => {
    await lifecycleChecks();
    await videoCheck();
    console.log('Camera checks passed: real Code 128 video decoding, one-shot detection, permission errors, late cancellation, background pause and stream cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
