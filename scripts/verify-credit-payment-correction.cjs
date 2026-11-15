// Isolated transport fixtures: browser checks never alter actual customer payments.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const puppeteer = require('puppeteer');

async function main() {
    const origin = process.env.VINTAGE_PREVIEW_ORIGIN || 'http://127.0.0.1:8765';
    const html = await (await fetch(`${origin}/admin/login`)).text();
    const match = html.match(/window\.__SPA_PAGE__ = ([\s\S]*?);\s*<\/script>/);
    assert.ok(match);
    const shared = JSON.parse(match[1]).props, base = shared.app_base || '';
    const manifest = JSON.parse(await fs.readFile('public/build/manifest.json', 'utf8'));
    const entry = manifest['resources/js/app.jsx'];
    const template = html.replace(/<script type="module"[\s\S]*?<\/script>/g, '').replace('</head>', `${entry.css.map(file => `<link rel="stylesheet" href="${origin}${base}/build/${file}">`).join('')}<script type="module" src="${origin}${base}/build/${entry.file}"></script></head>`);
    const customer = { id: 1, name: 'Avery Customer', credit_status: 'active', credit_limit: 50000 };
    const order = { id: 1, order_number: 'POS-001', final_amount: 10000, paid_amount: 4000 };
    const original = { id: 2, customer, order, type: 'payment', amount: '-4000.00', balance_after: '6000.00', tender_type: 'cash', transaction_number: 'CR-ORIGINAL', reference: 'RECEIPT-ORIGINAL', notes: 'Original payment note', creator: { name: 'Original clerk' }, created_at: '2026-11-15T08:00:00Z', can_correct: true };
    let rows = [], currentRoute, mode = 'invalid', delayed, submitted;
    const payload = () => ({ component: currentRoute.includes('collections') ? 'Admin/Credit/Collections' : 'Admin/Customers/Show', url: base + currentRoute, props: {
        ...shared, locale: 'en', translations: {}, flash: {}, errors: {}, is_super_admin: true,
        auth: { user: { id: 1, name: 'Correcting manager', permissions: [] } }, customer,
        canManageCredit: true, creditSummary: { balance: 6000, available: 44000 }, stats: {}, recentOrders: [], topCategories: [], creditOrders: [], creditTransactions: rows,
        payments: { data: rows, links: [], total: rows.length, last_page: 1 }, filters: {},
    } });
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
        const url = new URL(request.url());
        const route = url.pathname.slice(base.length);
        if (route === '/admin/customers/1/credit-payments/2/correct') {
            submitted = JSON.parse(request.postData());
            if (mode === 'pending') { delayed = request; return; }
            return request.respond({ status: 422, contentType: 'application/json', body: JSON.stringify({ errors: { amount: ['Replacement exceeds invoice balance.'] } }) });
        }
        if (['/admin/customers/1', '/admin/credit/collections'].includes(route)) {
            currentRoute = route;
            return request.respond({ status: 200, contentType: 'text/html', body: template.replace(match[0], `window.__SPA_PAGE__ = ${JSON.stringify(payload())};</script>`) });
        }
        return request.continue();
    });
    try {
        for (const route of ['/admin/customers/1', '/admin/credit/collections']) {
            rows = [{ ...original }]; mode = 'invalid';
            await page.setViewport({ width: 1440, height: 1000 });
            await page.goto(origin + base + route, { waitUntil: 'networkidle0' });
            await page.locator('button::-p-text(Correct payment)').click();
            await page.waitForSelector('[role="dialog"]', { visible: true });
            assert.equal(new URL(page.url()).pathname, base + route, 'Row action does not navigate to the order');
            assert.equal(await page.$eval('[role="dialog"] input[type="number"]', input => input.value), '4000');
            await page.$eval('[role="dialog"] input[type="number"]', input => input.select());
            await page.type('[role="dialog"] input[type="number"]', '3000');
            await page.type('[role="dialog"] textarea', 'Entered the wrong amount.');
            await page.locator('button::-p-text(Reverse and replace)').click();
            await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.textContent.includes('Replacement exceeds invoice balance.'));
            assert.equal(await page.$eval('[role="dialog"] textarea', field => field.value), 'Entered the wrong amount.');
            assert.equal(await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].filter(node => !node.closest('[role="dialog"]')).length), 0);
            mode = 'pending'; await page.locator('button::-p-text(Reverse and replace)').click();
            await page.waitForFunction(() => document.querySelector('[role="dialog"] button[aria-label="Close"]').disabled);
            await page.keyboard.press('Escape');
            assert.ok(await page.$('[role="dialog"]'));
            assert.equal(submitted.amount, '3000');
            assert.equal(submitted.reason, 'Entered the wrong amount.');
            const replacement = { ...original, id: 4, amount: '-3000.00', transaction_number: 'CR-REPLACEMENT', balance_after: '7000.00', creator: { name: 'Correcting manager' }, notes: submitted.reason, metadata: { original_transaction: 'CR-ORIGINAL' }, can_correct: true };
            const reversal = { ...original, id: 3, type: 'payment_reversal', amount: '4000.00', transaction_number: 'CR-REVERSAL', creator: { name: 'Correcting manager' }, notes: submitted.reason, metadata: { original_transaction: 'CR-ORIGINAL' }, can_correct: false };
            rows = [replacement, reversal, { ...original, can_correct: false, reversal, replacement }];
            await delayed.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(payload()) });
            await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
            assert.ok(await page.$eval('body', node => ['CR-ORIGINAL', 'CR-REVERSAL', 'CR-REPLACEMENT', 'Entered the wrong amount.', 'Correcting manager', 'Corrected'].every(text => node.textContent.includes(text))));
            assert.equal(await page.$$eval('button', nodes => nodes.filter(node => node.textContent.trim() === 'Correct payment').length), 1);
            await fs.mkdir('artifacts/credit-payment-correction', { recursive: true });
            await page.screenshot({ path: `artifacts/credit-payment-correction/${route.includes('collections') ? 'collections' : 'customer'}-history.png` });
            console.log(`PASS ${route}: correction action, retained validation, pending guard, original/reversal/replacement and audit details.`);
        }
        await page.locator('button::-p-text(Correct payment)').click();
        await page.setViewport({ width: 390, height: 844 });
        await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
        const bounds = await page.$eval('[role="dialog"]', node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, overflow: node.scrollWidth > node.clientWidth + 1 }; });
        assert.ok(bounds.left >= 0 && bounds.right <= 390 && !bounds.overflow);
        await page.screenshot({ path: 'artifacts/credit-payment-correction/mobile-form.png' });
        assert.deepEqual(errors, []);
        console.log('PASS mobile correction form and no runtime errors.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
