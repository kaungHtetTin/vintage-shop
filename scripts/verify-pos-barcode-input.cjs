// Mount the real POS source with an isolated catalogue; no build or live sales.
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { transformSync } = require('esbuild');
const puppeteer = require('puppeteer');

async function main() {
    const source = await fs.readFile('resources/js/Pages/Admin/Bales/POS.jsx', 'utf8');
    const code = transformSync(source, { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code;
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(8000);
        await page.setContent('<div id="root"></div>');
        await page.addScriptTag({ path: 'node_modules/react/umd/react.development.js' });
        await page.addScriptTag({ path: 'node_modules/react-dom/umd/react-dom.development.js' });
        await page.addScriptTag({ content: `
            const module = { exports: {} };
            const translate = (text, values = {}) => Object.entries(values).reduce((result, [key, value]) => result.replace(':' + key, value), text);
            const require = name => {
                if (name === 'react') return React;
                if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => React.createElement(type, { ...props, key }), jsxs: (type, props, key) => React.createElement(type, { ...props, key }) };
                if (name.endsWith('/i18n')) return { usePhraseTranslation: () => translate };
                if (name.endsWith('/dateTime')) return { formatDate: value => value };
                if (name.endsWith('/CameraScanModal')) return props => props.open ? React.createElement('div', { role: 'dialog' },
                    React.createElement('button', { type: 'button', id: 'camera-detected', onClick: () => props.onDetected('8399999999') }, 'Detect test barcode')) : null;
                if (name.endsWith('/shared')) return {
                    Page: ({ children }) => React.createElement('main', {}, children), money: value => value + ' MMK', uuid: () => 'test',
                    useBales: () => ({ href: value => value, auth: { user: { id: 1 } }, app_base: '', can: () => true })
                };
                return () => null;
            };
            const known = { id: 1, barcode: '8312345678', bale_id: 1, bale_code: 'VB-000001', price: 5000, remaining: 3 };
            const remote = { id: 2, barcode: '8399999999', bale_id: 2, bale_code: 'VB-000002', price: 7000, remaining: null };
            window.queries = [];
            window.axios = { get: async (_url, options) => {
                const query = options.params.q;
                if (!query) return { data: [known] };
                window.queries.push(query);
                await new Promise(resolve => setTimeout(resolve, 100));
                return { data: query === remote.barcode ? [remote] : [] };
            } };
            ${code}
            ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(module.exports.default, { locations: [{ id: 1, name: 'Main Store' }] }));
        ` });
        const input = '.bale-scan-row input';
        const pause = () => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
        const quantity = async code => page.$eval(`input[aria-label="Quantity ${code}"]`, el => Number(el.value));
        await page.waitForSelector(input + ':enabled');
        await page.type(input, '831234567', { delay: 10 });
        await pause();
        assert.equal(await page.$$('.bale-cart-line').then(rows => rows.length), 0, 'Partial typing added an item');
        assert.deepEqual(await page.evaluate(() => window.queries), []);
        await page.type(input, '8');
        await page.waitForSelector('.bale-cart-line');
        assert.equal(await quantity('8312345678'), 1, 'Typing did not auto-add');
        assert.equal(await page.$eval(input, el => el.value), '');
        await page.type(input, '8312345678');
        await page.keyboard.press('Enter');
        await pause();
        assert.equal(await quantity('8312345678'), 2, 'Enter and automatic input added twice');
        await page.keyboard.press('Enter');
        assert.equal(await quantity('8312345678'), 2, 'Empty Enter repeated the previous item');
        await page.type(input, '8312345678');
        await pause();
        assert.equal(await quantity('8312345678'), 3, 'Repeated barcode did not increment quantity');
        await page.type(input, '8312345678');
        await pause();
        assert.equal(await quantity('8312345678'), 3, 'Automatic input exceeded bale stock');
        await page.type(input, '8399999999');
        await page.waitForSelector('input[aria-label="Quantity 8399999999"]');
        assert.equal(await quantity('8399999999'), 1, 'Barcode outside loaded catalogue failed');
        await page.type(input, '8300000000');
        await pause();
        await pause();
        assert.equal(await page.evaluate(() => window.queries.filter(code => code === '8300000000').length), 1, 'Invalid barcode retried automatically');
        assert.equal(await page.$eval(input, el => el.disabled), false);
        assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.bale-scan-row input')), true, 'Scan focus was lost');
        await page.click('.bale-camera-trigger');
        await page.waitForSelector('#camera-detected');
        await page.click('#camera-detected');
        await page.waitForSelector('#camera-detected', { hidden: true });
        await page.waitForFunction(() => document.querySelector('input[aria-label="Quantity 8399999999"]')?.value === '2');
        assert.equal(await quantity('8399999999'), 2, 'Camera detection did not use the POS cart flow');
        console.log('POS barcode checks passed: partial typing, auto-add, Enter deduplication, repeated scans, stock limits, remote lookup, invalid input, retained focus and camera-to-cart integration.');
    } finally {
        await browser.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
