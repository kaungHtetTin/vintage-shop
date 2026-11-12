// Isolated source-CSS preview. No application data or production build is used.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToString } = require('react-dom/server');
const { TextField, Autocomplete, MenuItem, ThemeProvider, createTheme } = require('@mui/material');
const puppeteer = require('puppeteer');

const h = React.createElement;
const theme = createTheme({ palette: { primary: { main: '#a45138' } } });
const field = (id, props = {}) => h(TextField, { id, label: id, size: 'small', ...props });
const mui = renderToString(h(ThemeProvider, { theme }, h('div', { className: 'fixtures' },
    field('mui-text'), field('mui-password', { type: 'password' }),
    field('mui-date', { type: 'date', slotProps: { inputLabel: { shrink: true } } }),
    field('mui-textarea', { multiline: true, rows: 2 }),
    field('mui-error', { error: true }), field('mui-disabled', { disabled: true }),
    field('mui-standard', { variant: 'standard' }), field('mui-filled', { variant: 'filled' }),
    field('mui-select', { select: true, defaultValue: 'cash', children: h(MenuItem, { value: 'cash' }, 'Cash') }),
    h(Autocomplete, { id: 'mui-customer', options: ['Customer'], disablePortal: true, renderInput: params => h(TextField, { ...params, label: 'Saved customer' }) }),
    h('div', { className: 'pos-console__quantity-entry', id: 'quantity-shell' }, field('mui-quantity', { type: 'number' })),
)));

const native = `
<div class="fixtures">
 <label class="form-field">Text<input id="native-text" type="text"></label>
 <label class="form-field">Search<input id="native-search" type="search"></label>
 <label class="form-field">Number<input id="native-number" type="number"></label>
 <label class="form-field">Date<input id="native-date" type="date"></label>
 <label class="form-field">Password<input id="native-password" type="password"></label>
 <label class="form-field">Select<select id="native-select"><option>Cash</option></select></label>
 <label class="form-field">Notes<textarea id="native-textarea"></textarea></label>
 <label class="form-field">Error<input id="native-error" aria-invalid="true"><small class="field-error">Invalid value</small></label>
 <label class="v-login-field">Login password<div class="v-login-password"><input id="login-password" type="password"><button type="button">Show</button></div></label>
 <label class="form-field">Readonly<input id="native-readonly" readonly value="Receipt code"></label>
 <label class="form-field">Disabled<input id="native-disabled" disabled></label>
 <label class="form-field">Search shell<span id="search-shell" class="search-box"><span>⌕</span><input id="shell-search" aria-label="Search"></span></label>
 <div class="admin-crud-dialog"><label class="bale-purchase-field">Supplier<div class="bale-supplier-control" id="supplier-shell"><input id="supplier-search" aria-label="Supplier"></div></label></div>
 <div class="bale-supplier-control" id="supplier-error-shell"><input id="supplier-error" aria-invalid="true" aria-label="Supplier error"></div>
 <label class="admin-language-switcher" id="language-shell"><span>Language</span><select id="language-select"><option>English</option></select></label>
 <div class="v-branch" id="branch-shell"><select id="branch-select"><option>Main Store</option></select></div>
 <div class="transfer-qty-control" id="transfer-shell"><button type="button">−</button><input id="transfer-number" type="number"><button type="button">+</button></div>
 <div class="pos-console"><div class="pos-item"><div class="pos-item__stepper" id="stepper-shell"><button type="button">-</button><input id="stepper-number" type="number"><button type="button">+</button></div></div></div>
 <div data-focus-shell id="common-shell"><input id="common-search" aria-label="Common shell"></div>
 <label>Checkbox <input id="native-checkbox" type="checkbox"></label>
 <label>Radio <input id="native-radio" type="radio"></label>
 <label>Range <input id="native-range" type="range"></label>
</div>`;

async function main() {
    const styles = ['admin.css', 'vintage-admin.css', 'admin-consistency.css', 'bales.css', 'crud-modal.css', 'pos-cart.css', 'input-focus.css'];
    const loaded = Object.fromEntries(await Promise.all(styles.map(async file => [file, (await fs.readFile('resources/js/styles/' + file, 'utf8')).replace(/@import[^;]+;/g, '')])));
    const html = `<!doctype html><html><head><meta charset="utf-8">${styles.map(file => `<link rel="stylesheet" href="/${file}">`).join('')}<style>
body{margin:0;background:#f5f3ed}.preview{padding:24px}.fixtures{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-bottom:24px;align-items:start}.form-field{min-width:0}input,select,textarea{max-width:100%}[data-focus-shell]{border:1px solid #dfdfd3;padding:8px}.transfer-qty-control{display:flex;align-items:center}.transfer-qty-control input{min-width:0;width:80px}.MuiDialog-root.fixture-portal{position:static;padding:24px}.capture-title{font-size:20px}.fixtures>.pos-console{min-height:0;height:auto;background:none}.v-login-password input{width:100%}
</style></head><body><main class="app-root vintage-admin preview" data-theme="light" style="--color-primary:#a45138"><h1 class="capture-title">Shared input focus</h1>${native}${mui}</main><div class="MuiDialog-root fixture-portal">${renderToString(h(ThemeProvider, { theme }, field('portal-input')))}</div></body></html>`;
    const server = http.createServer((req, res) => {
        const key = req.url.slice(1);
        res.setHeader('Content-Type', loaded[key] ? 'text/css' : 'text/html');
        res.end(loaded[key] || html);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({ headless: true });
    const results = [];
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'domcontentloaded' });
        const metrics = selector => page.$eval(selector, el => {
            const style = getComputedStyle(el), rect = el.getBoundingClientRect();
            return { outlined: el.classList.contains('MuiOutlinedInput-root'), border: style.borderTopColor, width: style.borderTopWidth, shadow: style.boxShadow, outline: style.outlineStyle, radius: style.borderRadius, size: [rect.width, rect.height] };
        });
        const cases = [
            ...['text', 'search', 'number', 'date', 'password', 'select', 'textarea', 'readonly'].map(type => ['#native-' + type, '#native-' + type]),
            ['#login-password', '#login-password'], ['#shell-search', '#search-shell'], ['#supplier-search', '#supplier-shell'],
            ['#language-select', '#language-shell'], ['#branch-select', '#branch-shell'],
            ['#transfer-number', '#transfer-shell'], ['#stepper-number', '#stepper-shell'], ['#common-search', '#common-shell'],
            ...['text', 'password', 'date', 'textarea', 'standard', 'filled', 'select', 'customer'].map(type => ['#mui-' + type, '#mui-' + type + '-owner']),
            ['#mui-quantity', '#quantity-shell'], ['#portal-input', '#portal-input-owner'],
        ];
        // Identify the actual border owner from the rendered MUI DOM.
        await page.evaluate(() => {
            for (const input of document.querySelectorAll('[id^="mui-"],#portal-input')) {
                if (!input.matches('input,textarea,[role="combobox"]')) continue;
                const owner = input.closest('.MuiInputBase-root');
                if (owner) owner.id = input.id + '-owner';
            }
        });
        for (const mode of ['light', 'dark']) {
            await page.$eval('main', (el, mode) => el.dataset.theme = mode, mode);
            let reference;
            for (const [input, owner] of cases) {
                await page.$eval(input, el => el.blur());
                const before = await metrics(owner);
                await page.focus(input);
                const focused = await metrics(owner);
                assert.deepEqual(focused.size, before.size, `${mode} ${input}: focus changed dimensions`);
                assert(focused.shadow.includes('2px'), `${mode} ${input}: missing two-pixel ring (${focused.shadow})`);
                assert.equal(focused.outline, 'none', `${mode} ${input}: duplicate outline`);
                if (!reference) reference = focused.shadow;
                assert.equal(focused.shadow, reference, `${mode} ${input}: inconsistent focus ring`);
                const borderOwner = focused.outlined ? owner + ' .MuiOutlinedInput-notchedOutline' : owner;
                const border = await metrics(borderOwner);
                assert.equal(border.width, '1px', `${mode} ${input}: border width`);
                assert.equal(border.border, 'rgb(164, 81, 56)', `${mode} ${input}: border color`);
                if (input !== owner) {
                    const inner = await metrics(input);
                    assert.equal(inner.shadow, 'none', `${mode} ${input}: inner focus ring`);
                    assert.equal(inner.width, '0px', `${mode} ${input}: inner border`);
                }
                results.push({ mode, input, ...focused });
            }
            let errorReference;
            for (const [input, owner] of [['#native-error', '#native-error'], ['#supplier-error', '#supplier-error-shell'], ['#mui-error', '#mui-error-owner']]) {
                await page.focus(input);
                const focus = await metrics(owner);
                if (!errorReference) errorReference = focus.shadow;
                assert.equal(focus.shadow, errorReference, `${mode} ${input}: inconsistent error ring`);
                const target = focus.outlined ? owner + ' .MuiOutlinedInput-notchedOutline' : owner;
                assert.equal((await metrics(target)).border, 'rgb(206, 68, 68)', `${mode} ${input}: error border lost`);
            }
        }
        for (const input of ['#native-disabled', '#mui-disabled']) {
            await page.focus(input);
            assert.equal((await metrics(input)).shadow, 'none', 'Disabled input must not show focus.');
        }
        for (const input of ['#native-checkbox', '#native-radio', '#native-range']) {
            await page.focus(input);
            const control = await metrics(input);
            assert.equal(control.outline, 'solid', input + ': missing keyboard focus');
        }
        // Page styles may load after the global entry point on route changes.
        await page.evaluate(() => {
            const shared = document.querySelector('link[href="/input-focus.css"]');
            document.head.prepend(shared);
        });
        for (const viewport of [{ width: 1280, height: 1000 }, { width: 390, height: 844 }]) {
            await page.setViewport(viewport);
            for (const [input, owner] of cases) {
                await page.focus(input);
                const style = await metrics(owner);
                assert(style.shadow.includes('2px'), input + ': lazy CSS or responsive focus regression');
                if (input !== owner) assert.equal((await metrics(input)).shadow, 'none', input + ': duplicate responsive ring');
            }
        }
        const emulation = await page.createCDPSession();
        await emulation.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
        assert(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), 'High contrast emulation failed');
        for (const [input, owner] of [['#native-text', '#native-text'], ['#supplier-search', '#supplier-shell'], ['#mui-customer', '#mui-customer-owner']]) {
            await page.focus(input);
            assert.equal((await metrics(owner)).outline, 'solid', input + ': high contrast focus missing');
            if (input !== owner) assert.equal((await metrics(input)).outline, 'none', input + ': high contrast duplicate');
        }
        await emulation.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await emulation.detach();
        await page.setViewport({ width: 1280, height: 1000 });
        await page.$eval('main', el => el.dataset.theme = 'light');
        await page.focus('#supplier-search');
        await fs.mkdir('artifacts/input-focus', { recursive: true });
        await page.screenshot({ path: 'artifacts/input-focus/light.png', fullPage: true });
        await page.$eval('main', el => el.dataset.theme = 'dark');
        await page.focus('#mui-customer');
        await page.screenshot({ path: 'artifacts/input-focus/dark.png', fullPage: true });
        await fs.writeFile('artifacts/input-focus/results.json', JSON.stringify(results, null, 2));
        console.log(`Verified ${results.length} normal focus states, six error states, disabled fields, keyboard selection controls, mobile widths, high contrast and lazy stylesheet order.`);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
