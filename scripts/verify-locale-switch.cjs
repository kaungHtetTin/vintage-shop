// Render the actual switch and locale hook; intercept writes and preserve drafts.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { transformSync } = require('esbuild');
const puppeteer = require('puppeteer');
async function main() {
    const source = Object.fromEntries([
        ['switch', 'resources/js/Components/LanguageSwitcher.jsx'],
        ['i18n', 'resources/js/Utils/i18n.js'], ['url', 'resources/js/Utils/url.js'],
        ['icons', 'resources/js/Components/Admin/icons.jsx'],
    ].map(([id, file]) => [id, transformSync(fs.readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic' }).code]));
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(8000);
        await page.setContent('<div id="root"></div><style>body{margin:0}</style>');
        for (const file of ['admin.css', 'vintage-admin.css', 'admin-consistency.css']) {
            await page.addStyleTag({ content: fs.readFileSync('resources/js/styles/' + file, 'utf8').replace(/@import\s+url\([^)]*\)\s*;/g, '') });
        }
        await page.addScriptTag({ path: 'node_modules/react/umd/react.development.js' });
        await page.addScriptTag({ path: 'node_modules/react-dom/umd/react-dom.development.js' });
        await page.evaluate(source => {
            const Page = React.createContext(null), cache = {};
            window.requests = [];
            const router = { post: (url, payload, options) => window.requests.push({ url, payload, options }) };
            const require = name => {
                if (name === 'react') return React;
                if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => React.createElement(type, { ...props, key }), jsxs: (type, props, key) => React.createElement(type, { ...props, key }) };
                if (name === '@/spa/router') return { router, usePage: () => React.useContext(Page) };
                const id = { '@/Utils/i18n': 'i18n', '@/Utils/url': 'url', '@/Components/Admin/icons': 'icons' }[name] || name;
                if (cache[id]) return cache[id].exports;
                if (!source[id]) throw Error('Unknown import ' + name);
                const module = { exports: {} }; cache[id] = module;
                new Function('module', 'exports', 'require', source[id])(module, module.exports, require);
                return module.exports;
            };
            const Switch = require('switch').default;
            function Harness() {
                const [locale, setLocale] = React.useState('en');
                const [draft, setDraft] = React.useState('');
                window.finishLocale = success => {
                    const request = window.requests.at(-1);
                    if (success) setLocale(request.payload.locale);
                    request.options.onFinish();
                };
                return React.createElement(Page.Provider, { value: {
                    url: '/vintage-shop/public/admin/pos?q=label&page=2',
                    props: { locale, app_base: '/vintage-shop/public', supported_locales: { en: 'English', my: '\u1019\u103c\u1014\u103a\u1019\u102c' } },
                } }, React.createElement('div', { className: 'app-root vintage-admin', style: { '--color-primary': '#a45138' } },
                    React.createElement('div', { className: 'admin-app' },
                        React.createElement('aside', { className: 'admin-sidebar open' },
                            React.createElement('nav', {}, React.createElement('a', {}, 'POS')),
                            React.createElement('div', { className: 'admin-sidebar-language' }, React.createElement(Switch, { className: 'sidebar-locale-switch' }))),
                        React.createElement('main', { className: 'admin-main' },
                            React.createElement('header', { className: 'admin-topbar' }, React.createElement(Switch, { compact: true, className: 'admin-locale-switch' })),
                            React.createElement('input', { id: 'sale-draft', value: draft, onChange: e => setDraft(e.target.value) })))));
            }
            ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));
        }, source);
        await page.setViewport({ width: 1280, height: 800 });
        await page.waitForSelector('.admin-locale-switch button');
        await page.type('#sale-draft', 'Unsaved sale');
        await page.click('.admin-locale-switch button[lang="en"]');
        assert.equal(await page.evaluate(() => window.requests.length), 0, 'Active language submitted');
        await page.click('.admin-locale-switch button[lang="my"]');
        assert(await page.$eval('.admin-locale-switch button[lang="my"]', button => button.disabled));
        await page.click('.admin-locale-switch button[lang="my"]');
        assert.equal(await page.evaluate(() => window.requests.length), 1, 'Duplicate locale request');
        const request = await page.evaluate(() => ({ url: window.requests[0].url, ...window.requests[0].options }));
        assert.equal(request.url, '/vintage-shop/public/admin/locale');
        assert.equal(request.preserveState, true);
        assert.equal(request.preserveScroll, true);
        await page.evaluate(() => window.finishLocale(true));
        await page.waitForFunction(() => document.querySelector('.admin-locale-switch button[lang="my"]').getAttribute('aria-pressed') === 'true');
        assert.equal(await page.$eval('#sale-draft', input => input.value), 'Unsaved sale');
        await page.setViewport({ width: 390, height: 844 });
        assert.equal(await page.$eval('.admin-locale-switch', el => getComputedStyle(el).display), 'none');
        assert.notEqual(await page.$eval('.admin-sidebar-language', el => getComputedStyle(el).display), 'none');
        await page.focus('.sidebar-locale-switch button[lang="en"]');
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => window.requests.length), 2);
        await page.evaluate(() => window.finishLocale(false));
        assert.equal(await page.$eval('.sidebar-locale-switch button[lang="my"]', el => el.getAttribute('aria-pressed')), 'true');
        assert.equal(await page.$eval('.sidebar-locale-switch button[lang="en"]', el => el.disabled), false);
        const bounds = await page.$eval('.sidebar-locale-switch', el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
        assert(bounds.scroll <= bounds.width, 'Mobile language row overflows');
        fs.mkdirSync('artifacts/locale-switch', { recursive: true });
        await page.screenshot({ path: 'artifacts/locale-switch/mobile.png' });
        console.log('Locale switch passed: active states, one request, keyboard access, failure recovery, draft/scroll preservation and mobile drawer layout.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
