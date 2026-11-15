// All bale pages and mutations are isolated browser fixtures; no shop records change.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const puppeteer = require('puppeteer');

async function main() {
    const origin = process.env.VINTAGE_PREVIEW_ORIGIN || 'http://127.0.0.1:8765';
    const html = await (await fetch(`${origin}/admin/login`)).text();
    const match = html.match(/window\.__SPA_PAGE__ = ([\s\S]*?);\s*<\/script>/);
    assert.ok(match, 'SPA template is available');
    const shared = JSON.parse(match[1]).props;
    const base = shared.app_base || '';
    const manifest = JSON.parse(await fs.readFile('public/build/manifest.json', 'utf8'));
    const entry = manifest['resources/js/app.jsx'];
    const template = html.replace(/<script type="module"[\s\S]*?<\/script>/g, '')
        .replace('</head>', `${entry.css.map(file => `<link rel="stylesheet" href="${origin}${base}/build/${file}">`).join('')}<script type="module" src="${origin}${base}/build/${entry.file}"></script></head>`);
    let bale = {
        id: 1, code: 'VB-000001', status: 'ready', supplier_id: 1,
        supplier: { id: 1, name: 'Vintage supplier' }, location: { id: 1, name: 'Main branch' },
        purchased_at: '2026-11-12T00:00:00Z', purchase_cost: '10000.00', purchase_payment_method: 'cash',
        laundry_cost: '2000.00', laundry_payment_method: 'mmqr', total_pieces: 10,
        notes: 'Original notes', total_cost: 12000, sales_revenue: 10000, pieces_sold: 2,
        remaining: 8, bale_result: -2000, labels: [], edit_token: 'a'.repeat(64),
    };
    const pageData = () => ({ component: 'Admin/Bales/Show', url: `${base}/admin/bales/1`, props: {
        ...shared, locale: 'en', translations: {}, flash: {}, errors: {}, is_super_admin: true,
        auth: { user: { id: 1, name: 'Preview owner', permissions: [] } }, bale,
        suppliers: [{ id: 1, name: 'Vintage supplier' }, { id: 2, name: 'Other supplier' }],
        sales: { data: [], links: [], total: 0 },
    } });
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    let mode = 'invalid', delayed, submitted;
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setRequestInterception(true);
    page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname !== `${base}/admin/bales/1`) return request.continue();
        if (request.method() === 'PATCH') {
            submitted = JSON.parse(request.postData());
            if (mode === 'pending') { delayed = request; return; }
            return request.respond({ status: 422, contentType: 'application/json', body: JSON.stringify({ errors: { total_pieces: ['Count must cover sold pieces.'] } }) });
        }
        return request.respond({ status: 200, contentType: 'text/html', body: template.replace(match[0], `window.__SPA_PAGE__ = ${JSON.stringify(pageData())};</script>`) });
    });
    const click = label => page.locator(`button::-p-text(${label})`).click();
    const open = async () => { await click('Edit bale'); await page.waitForSelector('[role="dialog"]', { visible: true }); };
    const closed = () => page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    try {
        for (const status of ['purchased', 'laundry', 'ready', 'closed']) {
            bale.status = status;
            await page.goto(`${origin}${base}/admin/bales/1`, { waitUntil: 'networkidle0' });
            await open();
            assert.equal(await page.$eval('[role="dialog"] input[maxlength="40"]', input => input.value), bale.code);
            assert.equal(await page.$eval('[role="dialog"] input[max="1000000"]', input => input.disabled), status === 'closed');
            await page.keyboard.press('Escape'); await closed();
        }
        bale.status = 'ready';
        await page.goto(`${origin}${base}/admin/bales/1`, { waitUntil: 'networkidle0' });
        await open();
        await page.$eval('[role="dialog"] input[maxlength="40"]', input => input.select());
        await page.type('[role="dialog"] input[maxlength="40"]', 'VB-CORRECTED');
        await click('Save changes');
        await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.textContent.includes('Count must cover sold pieces.'));
        assert.equal(await page.$eval('[role="dialog"] input[maxlength="40"]', input => input.value), 'VB-CORRECTED');
        assert.equal(submitted.edit_token, 'a'.repeat(64));
        mode = 'pending'; await click('Save changes');
        await page.waitForFunction(() => document.querySelector('[role="dialog"] button[aria-label="Close"]').disabled);
        await page.keyboard.press('Escape');
        assert.ok(await page.$('[role="dialog"]'), 'Pending edit stays open');
        bale = { ...bale, ...submitted, edit_token: 'b'.repeat(64) };
        await delayed.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(pageData()) });
        await closed();
        await open();
        assert.equal(await page.$eval('[role="dialog"] input[maxlength="40"]', input => input.value), 'VB-CORRECTED', 'Reopening loads saved data');
        await page.setViewport({ width: 390, height: 844 });
        await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
        const bounds = await page.$eval('[role="dialog"]', node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, top: r.top, overflow: node.scrollWidth > node.clientWidth + 1 }; });
        assert.ok(bounds.left >= 0 && bounds.right <= 390 && bounds.top >= 0 && bounds.bottom <= 844);
        assert.equal(bounds.overflow, false);
        await fs.mkdir('artifacts/bale-edit', { recursive: true });
        await page.screenshot({ path: 'artifacts/bale-edit/mobile.png' });
        await page.setViewport({ width: 1440, height: 1000 });
        await page.screenshot({ path: 'artifacts/bale-edit/desktop.png' });
        await page.keyboard.press('Escape'); await closed();
        assert.deepEqual(errors, []);
        console.log('PASS bale edit at every stage, validation, pending dismissal guard, success, fresh defaults and mobile layout.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
