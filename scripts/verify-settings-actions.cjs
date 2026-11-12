// Exercise the shared footer directly from source; no application build or data.
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { transformSync } = require('esbuild');
const puppeteer = require('puppeteer');

async function main() {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        page.on('pageerror', error => console.error(error.message));
        page.setDefaultTimeout(10000);
        await page.setContent('<main class="app-root vintage-admin" style="--color-primary:#a45138;padding:20px"><div id="root"></div></main>');
        for (const file of ['admin.css', 'vintage-admin.css', 'admin-consistency.css', 'input-focus.css']) {
            await page.addStyleTag({ content: (await fs.readFile('resources/js/styles/' + file, 'utf8')).replace(/@import[^;]+;/g, '') });
        }
        await page.addScriptTag({ path: 'node_modules/react/umd/react.development.js' });
        await page.addScriptTag({ path: 'node_modules/react-dom/umd/react-dom.development.js' });
        const source = await fs.readFile('resources/js/Components/Admin/SettingsSaveBar.jsx', 'utf8');
        const code = transformSync(source, { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code;
        await page.addScriptTag({ content: `
            const module = { exports: {} };
            const require = name => {
                if (name === 'react-dom') return ReactDOM;
                if (name === 'react/jsx-runtime') return { jsx: React.createElement, jsxs: React.createElement };
                if (name.endsWith('/icons')) return () => React.createElement('svg', { width: 14, height: 14 });
                return { usePhraseTranslation: () => text => text };
            };
            ${code}
            const SaveBar = module.exports.default;
            const root = ReactDOM.createRoot(document.getElementById('root'));
            window.submissions = [];
            window.discards = 0;
            window.renderFooter = (formId, external, dirty = true, processing = false) => {
                root.render(React.createElement(function Harness() {
                    const [target, setTarget] = React.useState(null);
                    const bar = React.createElement(SaveBar, { formId, external, target, dirty, processing,
                        onDiscard: () => window.discards++ });
                    return React.createElement(React.Fragment, {},
                        React.createElement('form', { id: formId, onSubmit: e => { e.preventDefault(); window.submissions.push(e.currentTarget.id); } },
                            React.createElement('input', { name: 'value', defaultValue: 'Example' }), external ? bar : null),
                        React.createElement('div', { className: 'settings-actions-slot', ref: setTarget }, external ? null : bar));
                }, { key: formId + dirty + processing }));
            };
        ` });
        for (const width of [1280, 390]) {
            await page.setViewport({ width, height: 844 });
            let reference;
            for (const [formId, external] of [['application-settings-form', false], ['settings-profile-form', true], ['settings-password-form', true]]) {
                await page.evaluate((id, portal) => window.renderFooter(id, portal), formId, external);
                await page.waitForSelector('.settings-save-bar button[type="submit"]:enabled');
                const shape = await page.$eval('.settings-save-bar button[type="submit"]', button => {
                    const css = getComputedStyle(button);
                    return { label: button.textContent.trim(), height: css.height, radius: css.borderRadius, background: css.backgroundColor, form: button.form?.id };
                });
                assert.equal(shape.form, formId, 'Save targets the wrong form');
                delete shape.form;
                if (!reference) reference = shape;
                assert.deepEqual(shape, reference, 'Save button appearance differs');
                await page.click('.settings-save-bar button[type="submit"]');
                assert.equal(await page.evaluate(() => window.submissions.at(-1)), formId, 'Save did not submit its form');
                const discarded = await page.evaluate(() => window.discards);
                await page.click('.settings-save-bar button[type="button"]');
                assert.equal(await page.evaluate(() => window.discards), discarded + 1);
                for (const [dirty, processing] of [[false, false], [true, true]]) {
                    await page.evaluate((id, portal, dirty, processing) => window.renderFooter(id, portal, dirty, processing), formId, external, dirty, processing);
                    await page.waitForFunction(() => [...document.querySelectorAll('.settings-save-bar button')].every(button => button.disabled));
                }
            }
        }
        console.log('Settings footers passed: matching desktop/mobile styling, correct form submission, discard actions, clean and processing states.');
    } finally {
        await browser.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
