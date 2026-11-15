// Isolated browser fixtures: requests for records and mutations never reach the database.
const puppeteer = require('puppeteer');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');

async function main() {
    const origin = process.env.VINTAGE_PREVIEW_ORIGIN || 'http://localhost/vintage-shop/public';
    const serverHtml = await (await fetch(`${origin}/admin/login`)).text();
    const match = serverHtml.match(/window\.__SPA_PAGE__ = ([\s\S]*?);\s*<\/script>/);
    assert.ok(match, 'SPA payload exists');
    const shared = JSON.parse(match[1]).props;
    const base = shared.app_base || '';
    const manifest = JSON.parse(await fs.readFile('public/build/manifest.json', 'utf8'));
    assert.ok(!Object.keys(manifest).some(key => key.startsWith('resources/js/Pages/Admin/Products/')), 'Legacy product screens are excluded from the build');
    assert.ok(!Object.keys(manifest).some(key => key.startsWith('resources/js/Pages/Admin/PaymentMethods/')), 'Payment method management is excluded from the build');
    assert.ok(!Object.keys(manifest).some(key => key.startsWith('resources/js/Pages/Admin/Inventory/CycleCounts/')), 'Cycle counting is excluded from the build');
    assert.ok(!Object.keys(manifest).some(key => /resources\/js\/Pages\/Admin\/(Registers\/|POS\/Shifts\/)/.test(key)), 'Shift and register management are excluded from the build');
    const entry = manifest['resources/js/app.jsx'];
    const buildBase = `${origin}/build/`;
    const template = serverHtml.replace(/<script type="module"[\s\S]*?<\/script>/g, '')
        .replace('</head>', `${(entry.css || []).map(file => `<link rel="stylesheet" href="${buildBase}${file}">`).join('')}<script type="module" src="${buildBase}${entry.file}"></script></head>`);
    const common = { ...shared, is_super_admin: true, locale: 'en', translations: {}, flash: {}, errors: {}, auth: { user: { id: 1, name: 'Preview owner', role: 'super_admin', permissions: [] } } };
    const pager = data => ({ data, links: [], current_page: 1, last_page: 1, per_page: 20, total: data.length, from: data.length ? 1 : null, to: data.length });
    const location = { id: 1, name: 'Main branch', code: 'MAIN', type: 'warehouse', is_active: true, staff: [], balances_count: 0, on_hand_total: 0 };
    const bale = { id: 1, code: 'B-001', status: 'ready', supplier: { name: 'Supplier' }, location, purchased_at: '2026-11-12', total_cost: 12000, purchase_cost: 10000, laundry_cost: 2000, pieces_sold: 2, remaining: 8, total_pieces: 10, sales_revenue: 10000, bale_result: -2000, labels: [] };
    const sale = { id: 1, order_id: 1, quantity: 2, returned_quantity: 0, unit_price: 5000, total_price: 10000, order: { receipt_number: 'S-001', total_amount: 10000, final_amount: 10000, status: 'completed', payment_status: 'paid' } };
    const customers = [
        { id: 20, name: 'Avery Customer', email: 'avery@example.invalid', phone: '091234567', credit_status: 'active', credit_limit: 20000, credit_balance: 2000, available_credit: 18000, credit_terms_days: 14 },
        { id: 21, name: 'Disabled Customer', email: 'disabled@example.invalid', credit_status: 'disabled', credit_limit: 0, credit_balance: 0, available_credit: 0, credit_terms_days: 30 },
    ];
    const fixtures = {
        '/admin/users': ['Admin/Users/Index', { users: [{ id: 2, name: 'Recorded staff', email: 'staff@example.invalid', role: 'staff', status: 'active', locations: [] }], filters: {}, roles: [{ value: 'staff', label: 'Staff' }], locations: [location] }],
        '/admin/categories': ['Admin/Categories/Index', { categories: pager([]), parentCategories: [] }],
        '/admin/finance-book': ['Admin/FinanceBook/Index', { books: pager([{ ...location, capital: 10000, expenses: 1000, balance: 9000, actual_balance: null }]), funds: pager([]), locations: [location], filters: { date: '2026-11-12' } }],
        '/admin/suppliers': ['Admin/Bales/Suppliers', { suppliers: [{ id: 1, name: 'Vintage supplier', phone: '091234567', bales_count: 3 }] }],
        '/admin/bales': ['Admin/Bales/Index', { bales: pager([bale]), suppliers: [{ id: 1, name: 'Vintage supplier' }], locations: [location], counts: {} }],
        '/admin/bales/1': ['Admin/Bales/Show', { bale, sales: pager([sale]) }],
        '/admin/finance': ['Admin/Bales/Finance', { summary: {}, entries: pager([{ id: 1, entry_date: '2026-11-12', title: 'Refund', category: 'refund_payable', status: 'pending', amount: 5000, type: 'expense' }]), bales: pager([]), locations: [location], manualCategories: [{ value: 'other_expense', label: 'Other expense' }] }],
        '/admin/inventory/receipts': ['Admin/Inventory/Receipts/Index', { receipts: pager([]), locations: [location], filters: { q: 'shirt' } }],
        '/admin/inventory/receipts/create': ['Admin/Inventory/Receipts/Create', { categories: [], locations: [location] }],
        '/admin/locations': ['Admin/Locations/Index', { locations: [location], staff: [], canManage: true }],
        '/admin/roles': ['Admin/Roles/Index', { roles: [{ id: 1, name: 'custom', display_name: 'Custom role', permissions: [], users_count: 0, is_locked: false, is_system: false }], permissionGroups: [] }],
        '/admin/customers': ['Admin/Customers/Index', { customers: pager([{ id: 1, name: 'Recorded customer', phone: '091234567', default_address: '12 Main Street', credit_status: 'active', credit_limit: 10000, credit_balance: 2000, orders_count: 1, paid_revenue: 0, created_at: '2026-11-12' }]), filters: {}, creditStats: {} }],
        '/admin/customers/1': ['Admin/Customers/Show', { customer: { id: 1, name: 'Customer', email: 'customer@example.invalid' }, stats: {}, recentOrders: [], topCategories: [], canManageCredit: true }],
        '/admin/settings': ['Admin/Settings/Edit', { settings: {}, initialSection: 'general', canManageSettings: true }],
        '/admin/orders/1': ['Admin/Orders/Show', { order: { id: 1, order_number: 'S-001', status: 'pending', payment_status: 'pending_review', total_amount: 10000, final_amount: 10000, items: [] }, canReviewPayments: true, canManageOrders: true, canCancelOrders: true }],
        '/admin/orders/2': ['Admin/Orders/Show', { order: { id: 2, order_number: 'ONLINE-002', status: 'completed', is_online_sale: true, delivered_at: null, payment_status: 'paid', sales_channel: 'pos', receiver_name: 'Online customer', total_amount: 5000, final_amount: 5000, items: [] }, canManageOrders: true, canCancelOrders: true }],
        '/admin/pos': ['Admin/Bales/POS', { locations: [location] }],
    };
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    const mutations = [];
    let saveMode = 'invalid';
    let delayedSave;
    let lastCheckout;
    let customerSaveSucceeds = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setRequestInterception(true);
    page.on('request', async request => {
        const url = new URL(request.url());
        const route = url.pathname.slice(base.length);
        if (!url.pathname.startsWith(`${base}/admin/`)) return request.continue();
        if (request.method() !== 'GET') {
            mutations.push(route);
            if (saveMode === 'location-success' && route === '/admin/locations/1') {
                return request.respond({ status: 303, headers: { location: base + '/admin/locations' } });
            }
            if (route === '/admin/orders/2/delivery') {
                const data = JSON.parse(request.postData());
                const fixture = fixtures['/admin/orders/2'];
                fixture[1].order.delivered_at = data.delivered ? '2026-11-12T10:00:00Z' : null;
                return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ component: fixture[0], url: base + '/admin/orders/2', props: { ...common, ...fixture[1] } }) });
            }
            if (route === '/admin/pos/customers') {
                if (!customerSaveSucceeds) return request.respond({ status: 422, contentType: 'application/json', body: JSON.stringify({ errors: { phone: ['This phone is already recorded.'] } }) });
                const data = JSON.parse(request.postData());
                const limit = Number(data.credit_limit || 0);
                const created = { id: 22, ...data, credit_status: limit > 0 ? 'active' : 'disabled', credit_limit: limit, credit_balance: 0, available_credit: limit, credit_terms_days: Number(data.credit_terms_days || 30) };
                customers.push(created);
                return request.respond({ status: 201, contentType: 'application/json', body: JSON.stringify({ customer: created }) });
            }
            if (route === '/admin/bale-pos/checkout') {
                lastCheckout = JSON.parse(request.postData());
                assert.equal('shift_id' in lastCheckout || 'register_id' in lastCheckout, false, 'POS checkout needs no shift or register');
                if (saveMode === 'credit-network') return request.abort('failed');
                if (saveMode === 'credit-success') {
                    const paid = Number(lastCheckout.amount_tendered);
                    const final = 5000 - Number(lastCheckout.discount_value || 0);
                    return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({
                        order: { id: 901, receipt_number: 'RCT-CREDIT', receiver_name: 'Avery Customer', is_online_sale: lastCheckout.is_online_sale, order_status: lastCheckout.is_online_sale ? 'not_delivered' : 'completed', final_amount: final, paid_amount: paid, credit_amount: final - paid, credit_due_date: '2026-11-26', pos_tender_summary: { change_due: 0 } },
                        receipt_url: `${base}/admin/pos/orders/901/receipt`,
                    }) });
                }
            }
            if (saveMode === 'delay') { delayedSave = request; return; }
            return request.respond({ status: 422, contentType: 'application/json', body: JSON.stringify({ errors: { name: ['Please check this value.'] } }) });
        }
        const json = data => request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        if (route === '/admin/bale-pos/catalog') return json([{ id: 1, bale_id: 1, bale_code: 'B-001', barcode: 'LABEL-1', price: 5000, remaining: 8 }]);
        if (route === '/admin/pos/customers/search') return json(customers.filter(customer => `${customer.name} ${customer.default_address || ''} ${customer.phone || ''}`.toLowerCase().includes((url.searchParams.get('q') || '').toLowerCase())));
        const fixture = fixtures[route];
        if (!fixture) return request.respond({ status: 404, contentType: 'application/json', body: '{}' });
        const payload = { component: fixture[0], url: url.pathname + url.search, props: { ...common, ...fixture[1] } };
        if (request.headers()['x-spa']) return json(payload);
        return request.respond({ status: 200, contentType: 'text/html', body: template.replace(match[0], `window.__SPA_PAGE__ = ${JSON.stringify(payload)};</script>`) });
    });
    const goto = route => page.goto(origin + route, { waitUntil: 'networkidle0' });
    const click = async text => {
        await page.waitForFunction(text => [...document.querySelectorAll('button,a')].some(node => node.textContent.trim() === text), {}, text);
        await page.$$eval('button,a', (nodes, text) => {
            const node = nodes.find(node => node.textContent.trim() === text && node.getClientRects().length);
            if (!node) throw new Error(`Missing visible button ${text}`);
            node.click();
        }, text);
    };
    const dialog = async () => {
        await page.waitForSelector('[role="dialog"]', { visible: true });
        await page.waitForFunction(() => {
            let node = document.querySelector('[role="dialog"]');
            while (node) { if (Number(getComputedStyle(node).opacity) < 1) return false; node = node.parentElement; }
            return true;
        });
    };
    const closed = () => page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"]')].some(n => n.getClientRects().length));
    const escape = async () => { await page.keyboard.press('Escape'); await closed(); };
    const compactCheckout = async () => {
        const layout = await page.evaluate(() => {
            const dialog = document.querySelector('.bale-checkout-dialog [role="dialog"]');
            const content = dialog.querySelector('.MuiDialogContent-root');
            const bounds = content.getBoundingClientRect();
            const clippedFields = [...dialog.querySelectorAll('input, select')].filter(field => {
                if (!field.getClientRects().length) return false;
                const rect = field.getBoundingClientRect();
                return rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1;
            }).map(field => field.getAttribute('aria-label') || field.tagName);
            const controlHeights = [...dialog.querySelectorAll('.form-field input, .form-field select')].map(field => field.getBoundingClientRect().height);
            const bill = dialog.querySelector('.bale-checkout-bill').getBoundingClientRect();
            const payment = dialog.querySelector('.bale-checkout-payment').getBoundingClientRect();
            return { scroll: content.scrollHeight > content.clientHeight + 1, clippedFields, controlHeights, height: dialog.getBoundingClientRect().height, alignment: { top: Math.abs(bill.top - payment.top), bottom: Math.abs(bill.bottom - payment.bottom), width: Math.abs(bill.width - payment.width) } };
        });
        assert.equal(layout.scroll, false, 'Checkout fields fit without scrolling');
        assert.deepEqual(layout.clippedFields, [], 'Every checkout field is visible');
        assert.ok(layout.controlHeights.every(height => Math.abs(height - 34) <= 1), 'Checkout inputs and dropdowns use consistent compact heights');
        assert.ok(Object.values(layout.alignment).every(offset => offset <= 1), 'Bill summary and payment preserve matching side-by-side panels');
        return layout;
    };
    try {
        if (process.env.VINTAGE_MODAL_ERRORS_ONLY === '1') {
            const cases = [
                ['/admin/locations', ['Add warehouse']],
                ['/admin/locations', ['@Edit Main branch']],
                ['/admin/users', ['Add staff']],
                ['/admin/users', ['@Edit staff']],
                ['/admin/categories', ['Add category']],
                ['/admin/customers', ['Add customer']],
                ['/admin/roles', ['Add role']],
                ['/admin/roles', ['Edit permissions']],
                ['/admin/finance-book', ['Add expense fund']],
                ['/admin/finance-book', ['Record actual cash']],
                ['/admin/suppliers', ['+ Add supplier']],
                ['/admin/bales', ['+ Buy a bale']],
                ['/admin/bales/1', ['Finish this bale']],
                ['/admin/bales/1', ['Add price group']],
                ['/admin/bales/1', ['Return garments']],
                ['/admin/finance', ['Add expense']],
                ['/admin/finance', ['Record refund paid']],
                ['/admin/customers/1', ['Credit settings']],
                ['/admin/customers/1', ['Record credit payment']],
                ['/admin/orders/1', ['Edit admin notes']],
                ['/admin/orders/1', ['Review payment', 'Reject payment']],
                ['/admin/orders/1', ['Cancel order']],
                ['/admin/orders/2', ['Cancel order']],
                ['/admin/pos', ['Checkout']],
            ];
            for (const [route, actions] of cases) {
                await goto(route);
                if (route === '/admin/pos') await page.click('.bale-label-grid button');
                for (const action of actions) {
                    if (action.startsWith('@')) await page.click(`button[aria-label="${action.slice(1)}"]`);
                    else await click(action);
                    await dialog();
                }
                await page.$eval('[role="dialog"] form', form => { form.noValidate = true; form.requestSubmit(); });
                await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.textContent.includes('Please check this value.'));
                assert.equal(await page.evaluate(() => [...document.querySelectorAll('.flash.error, .field-error, [role="alert"]')].filter(node => !node.closest('[role="dialog"]') && node.textContent.includes('Please check this value.')).length), 0, `${route} ${actions}: errors stay inside modal`);
                await escape();
                assert.equal(await page.evaluate(() => document.body.textContent.includes('Please check this value.')), false, `${route} ${actions}: dismiss leaves no page errors`);
                console.log(`PASS modal validation: ${route} / ${actions.join(' -> ')}`);
            }
            await goto('/admin/locations');
            await page.click('button[aria-label="Edit Main branch"]'); await dialog();
            saveMode = 'location-success';
            await page.$eval('[role="dialog"] form', form => { form.noValidate = true; form.requestSubmit(); });
            await closed();
            assert.equal(mutations.at(-1), '/admin/locations/1', 'Redirect never repeats PATCH on the listing');
            assert.deepEqual(errors, []);
            console.log(`PASS ${cases.length} modal error cases and branch PATCH -> 303 -> GET success.`);
            return;
        }
        await fs.mkdir('artifacts/admin-consistency', { recursive: true });
        for (const route of ['/admin/customers', '/admin/bales', '/admin/suppliers', '/admin/locations']) {
            await goto(route);
            const table = await page.$eval('.table-wrap', node => {
                const style = getComputedStyle(node.querySelector('thead th'));
                return { font: style.fontSize, padding: style.padding, case: style.textTransform,
                    numbersAligned: [...node.querySelectorAll('.numeric-cell')].every(cell => getComputedStyle(cell).textAlign === 'right') };
            });
            assert.deepEqual(table, { font: '11px', padding: '10px 12px', case: 'none', numbersAligned: true }, `${route}: shared table typography and numeric alignment`);
        }
        console.log('PASS consistent table headers, spacing and numeric alignment across old and new pages');
        for (const [route, action, screenshot] of [
            ['/admin/users', 'Add staff', 'staff'],
            ['/admin/categories', 'Add category', 'category'],
            ['/admin/finance-book', 'Add expense fund', 'expense-fund'],
            ['/admin/suppliers', '+ Add supplier', 'supplier'],
            ['/admin/bales', '+ Buy a bale', 'bale-purchase'],
            ['/admin/roles', 'Add role', 'role'],
        ]) {
            await goto(route); await click(action); await dialog();
            const shell = await page.evaluate(() => {
                const dialog = document.querySelector('[role="dialog"]');
                const footer = dialog.querySelector('.MuiDialogActions-root');
                const submit = footer.querySelector('button[type="submit"]');
                const input = dialog.querySelector('input:not([type="file"]):not([type="checkbox"])');
                return {
                    header: Boolean(dialog.querySelector('.admin-crud-dialog-heading button[aria-label="Close"]')),
                    cancels: [...dialog.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Cancel').length,
                    formConnected: Boolean(submit?.form),
                    inputHeight: input ? input.getBoundingClientRect().height : 34,
                };
            });
            assert.equal(shell.header, true, `${action}: shared close header`);
            assert.equal(shell.cancels, 1, `${action}: single cancel action`);
            assert.equal(shell.formConnected, true, `${action}: footer submits the original form`);
            assert.ok(Math.abs(shell.inputHeight - 34) < 1, `${action}: compact field height (${shell.inputHeight})`);
            await page.screenshot({ path: `artifacts/admin-consistency/${screenshot}-desktop.png` });
            await page.evaluate(() => { document.querySelector('.app-root').dataset.density = 'comfortable'; });
            assert.equal(await page.$eval('[role="dialog"] input:not([type="file"]):not([type="checkbox"])', node => node.getBoundingClientRect().height), 40, `${action}: comfortable field height`);
            await page.evaluate(() => { document.querySelector('.app-root').dataset.density = 'compact'; });
            await page.setViewport({ width: 390, height: 844 });
            await page.evaluate(() => { document.querySelector('.app-root').dataset.theme = 'dark'; });
            const bounds = await page.$eval('[role="dialog"]', node => {
                const rect = node.getBoundingClientRect();
                return { left: rect.left, right: rect.right, bottom: rect.bottom, top: rect.top, overflow: node.scrollWidth > node.clientWidth + 1 };
            });
            assert.ok(bounds.left >= 0 && bounds.right <= 390 && bounds.top >= 0 && bounds.bottom <= 844, `${action}: mobile bounds`);
            assert.equal(bounds.overflow, false, `${action}: no horizontal modal overflow`);
            await page.screenshot({ path: `artifacts/admin-consistency/${screenshot}-mobile-dark.png` });
            await escape(); await page.setViewport({ width: 1440, height: 1000 });
        }
        console.log('PASS shared modal headers, single footers, native form links, compact fields and mobile dark layouts');
        await goto('/admin/suppliers');
        assert.equal(await page.$('form'), null, 'Supplier form starts closed');
        await click('+ Add supplier'); await dialog();
        await page.type('[role="dialog"] input[maxlength="255"]', 'New till');
        await click('Add supplier');
        await page.waitForFunction(() => document.querySelector('[role="dialog"]').textContent.includes('Please check this value.'));
        assert.equal(await page.$eval('[role="dialog"] input[maxlength="255"]', n => n.value), 'New till', 'Validation retains input');
        saveMode = 'delay'; await click('Add supplier');
        await page.waitForFunction(() => document.querySelector('[role="dialog"] button[aria-label="Close"]').disabled);
        await page.keyboard.press('Escape');
        assert.ok(await page.$('[role="dialog"]'), 'Pending submission cannot close');
        await delayedSave.respond({ status: 200, contentType: 'application/json', body: '{}' });
        await closed(); saveMode = 'invalid';
        await click('+ Add supplier'); await dialog(); await escape();
        console.log('PASS supplier validation, pending guard, success and Escape');

        await goto('/admin/bales/1');
        for (const label of ['Finish this bale', 'Add price group', 'Return garments']) {
            await click(label); await dialog(); await escape();
        }
        await page.setViewport({ width: 390, height: 844 });
        await click('Add price group'); await dialog();
        const bounds = await page.$eval('[role="dialog"]', n => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
        assert.ok(bounds.left >= 0 && bounds.right <= 390 && bounds.top >= 0 && bounds.bottom <= 844, 'Mobile modal fits viewport');
        await fs.mkdir('artifacts/crud-modals', { recursive: true });
        await page.screenshot({ path: 'artifacts/crud-modals/price-group-mobile.png' });
        await escape(); await page.setViewport({ width: 1440, height: 1000 });
        await goto('/admin/finance');
        for (const label of ['Add expense', 'Record refund paid']) { await click(label); await dialog(); await escape(); }
        await goto('/admin/roles'); await click('Edit permissions'); await dialog(); await click('Delete');
        await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2);
        await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some(node => node.textContent.includes('Delete role') && node.contains(document.activeElement)));
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 1);
        await escape();
        await goto('/admin/customers'); await click('Add customer'); await dialog();
        assert.equal(await page.$('[role="dialog"] input[type="email"], [role="dialog"] input[type="password"]'), null, 'Customer management has no login fields');
        await escape(); await page.click('button[aria-label="Edit customer"]'); await dialog();
        assert.equal(await page.$eval('[role="dialog"] textarea', node => node.value), '12 Main Street', 'Contact address can be edited');
        await escape();
        await goto('/admin/customers/1');
        for (const label of ['Credit settings', 'Record credit payment']) { await click(label); await dialog(); await escape(); }
        await goto('/admin/orders/1'); await click('Edit admin notes'); await dialog(); await escape();
        await click('Review payment'); await dialog(); await click('Confirm payment');
        await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2);
        await dialog();
        await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some(node => node.textContent.includes('Confirm action') && node.contains(document.activeElement)));
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 1);
        await escape();
        console.log('PASS bale workflow, finance, refund, role modals and mobile sizing');

        await goto('/admin/inventory/receipts?q=shirt');
        await page.click('.admin-filter-trigger'); await dialog();
        await page.type('input[placeholder="Receipt, reference, product or code"]', ' draft');
        await escape();
        await click('New receipt'); await dialog();
        assert.ok(await page.$('table'), 'Source listing stays mounted behind modal');
        await page.screenshot({ path: 'artifacts/crud-modals/receipt-create-desktop.png' });
        await escape();
        assert.ok(page.url().includes('q=shirt'), 'Closing restores filtered source URL');
        await page.click('.admin-filter-trigger'); await dialog();
        assert.equal(await page.$eval('input[placeholder="Receipt, reference, product or code"]', n => n.value), 'shirt', 'Closing filters discards drafts and keeps the applied filter');
        await escape();
        await click('New receipt'); await dialog();
        await page.goBack(); await closed();
        assert.ok(page.url().includes('q=shirt'), 'Browser Back closes form');
        await goto('/admin/inventory/receipts/create'); await dialog(); await escape();
        assert.ok(page.url().endsWith('/admin/inventory/receipts'), 'Direct form URL closes to listing');
        console.log('PASS routed forms, source list, filter preservation, direct URLs');

        await goto('/admin/locations');
        await page.click('button[aria-label="Delete Main branch"]'); await dialog();
        const before = mutations.length; await click('Cancel'); await closed();
        assert.equal(mutations.length, before, 'Cancel never sends deletion');
        await page.click('button[aria-label="Delete Main branch"]'); await dialog(); await click('Confirm');
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
        assert.equal(mutations.at(-1), '/admin/locations/1');
        console.log('PASS deletion confirmation and cancellation');

        await goto('/admin/orders/2');
        assert.ok(await page.$eval('body', node => node.textContent.includes('Online sale') && node.textContent.includes('Not delivered')), 'Online order shows the simple delivery state');
        await click('Mark delivered');
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(node => node.textContent.trim() === 'Mark not delivered'));
        await page.screenshot({ path: 'artifacts/crud-modals/online-order-delivered.png' });
        await click('Mark not delivered');
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(node => node.textContent.trim() === 'Mark delivered'));
        console.log('PASS online sale delivery and correction using one action');

        await goto('/admin/pos');
        assert.equal(await page.$('a[href$="/admin/registers"], a[href$="/admin/pos/shifts"]'), null, 'Removed management pages are absent from navigation');
        assert.equal(await page.$$eval('button', nodes => nodes.some(node => /open shift|close shift/i.test(node.textContent))), false, 'POS starts without shift controls');
        await page.click('.bale-label-grid button');
        await click('Checkout'); await dialog();
        assert.ok(await page.$('[role="dialog"] input[aria-label="Cash received"]'));
        assert.equal(await page.$eval('[aria-label="Online sale"]', node => node.checked), false, 'Ordinary sale is the default');
        await page.click('[aria-label="Online sale"]');
        assert.equal(await page.$eval('[role="dialog"] button.btn.primary.full', node => node.disabled), true, 'Online cash sale requires a customer');
        assert.equal(await page.$eval('input[role="combobox"]', node => node.required), true, 'Online customer field is required');
        const salesBeforeFullPay = mutations.filter(route => route === '/admin/bale-pos/checkout').length;
        await click('Full pay');
        assert.equal(await page.$eval('[aria-label="Cash received"]', node => node.value), '5000', 'Full pay fills the exact sale total');
        await page.type('[aria-label="Discount amount"]', '1000');
        assert.equal(await page.$eval('[aria-label="Cash received"]', node => node.min), '4000', 'Discount updates the cash payment minimum');
        await click('Full pay');
        assert.equal(await page.$eval('[aria-label="Cash received"]', node => node.value), '4000', 'Full pay uses the discounted total');
        assert.ok(await page.$eval('.bale-checkout-change', node => node.textContent.includes('0 MMK')), 'Exact payment gives zero change');
        assert.equal(mutations.filter(route => route === '/admin/bale-pos/checkout').length, salesBeforeFullPay, 'Full pay does not submit the sale');
        await page.click('[aria-label="Cash received"]');
        await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
        await page.type('[aria-label="Cash received"]', '5000');
        await compactCheckout();
        await page.screenshot({ path: 'artifacts/crud-modals/checkout-cash-desktop.png' });
        await click('+ Add new customer');
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Customer name');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 1);
        assert.equal(await page.$eval('[aria-label="Discount amount"]', node => node.value), '1000', 'Cancelling customer creation retains checkout');
        const salesBeforeCustomer = mutations.filter(route => route === '/admin/bale-pos/checkout').length;
        await click('+ Add new customer');
        await page.waitForSelector('[aria-label="Customer name"]', { visible: true });
        await page.type('[aria-label="Customer name"]', 'New POS customer');
        assert.equal(await page.$('[aria-label="Customer email"], [role="dialog"] input[type="password"]'), null, 'Customer record creation has no login fields');
        await page.type('[aria-label="Customer phone"]', '099999999');
        await page.type('[aria-label="Customer address"]', '12 Main Street');
        await page.type('[aria-label="Customer credit limit"]', '10000');
        await click('Save customer');
        await page.waitForFunction(() => document.body.textContent.includes('This phone is already recorded.'));
        assert.equal(await page.$eval('[aria-label="Customer name"]', node => node.value), 'New POS customer', 'Creation validation retains entered values');
        await page.screenshot({ path: 'artifacts/crud-modals/new-customer-checkout.png' });
        customerSaveSucceeds = true; await click('Save customer');
        await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 1 && document.querySelector('input[role="combobox"]')?.value.includes('New POS customer'));
        assert.equal(mutations.filter(route => route === '/admin/bale-pos/checkout').length, salesBeforeCustomer, 'Saving a customer never submits the sale');
        assert.equal(await page.$eval('[aria-label="Discount amount"]', node => node.value), '1000', 'Saving a customer retains discount');
        await page.select('[aria-label="Payment"]', 'credit');
        assert.equal(await page.$eval('[role="dialog"] button.btn.primary.full', node => node.disabled), false, 'New record can be used for credit without an account');
        await page.click('.bale-saved-customer button[title="Clear"]');
        await page.click('[aria-label="Discount amount"]');
        await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
        await escape();
        console.log('PASS direct POS sales, new-customer modal, automatic selection, cancellation and validation');

        await click('Checkout'); await dialog();
        await page.select('[aria-label="Payment"]', 'credit');
        assert.equal(await page.$eval('[role="dialog"] button.btn.primary.full', node => node.disabled), true, 'Credit requires a saved customer');
        await page.type('input[role="combobox"]', 'Disabled');
        await page.waitForFunction(() => {
            const options = document.querySelectorAll('[role="option"]');
            return options.length === 1 && options[0].textContent.includes('Disabled Customer');
        });
        const focusStyle = await page.$eval('input[role="combobox"]', input => {
            const field = input.closest('.MuiOutlinedInput-root');
            const inner = getComputedStyle(input);
            const outer = getComputedStyle(field.querySelector('.MuiOutlinedInput-notchedOutline'));
            return { outline: inner.outlineStyle, border: inner.borderTopWidth, shadow: inner.boxShadow, outerWidth: outer.borderTopWidth };
        });
        assert.deepEqual(focusStyle, { outline: 'none', border: '0px', shadow: 'none', outerWidth: '2px' }, 'Saved customer has one focus border on its wrapper');
        await page.screenshot({ path: 'artifacts/crud-modals/saved-customer-focus.png' });
        await page.click('[role="option"]');
        await page.waitForFunction(() => document.querySelector('.bale-credit-summary')?.textContent.includes('Disabled Customer'));
        assert.equal(await page.$eval('[role="dialog"] button.btn.primary.full', node => node.disabled), true, 'Disabled credit is blocked');
        await page.click('.bale-saved-customer button[title="Clear"]');
        await page.type('input[role="combobox"]', 'Avery');
        await page.waitForFunction(() => [...document.querySelectorAll('[role="option"]')].some(node => node.textContent.includes('Avery Customer')));
        await page.click('[role="option"]');
        await page.waitForFunction(() => document.querySelector('.bale-credit-summary')?.textContent.includes('Avery Customer'));
        assert.equal(await page.$eval('[role="dialog"] button.btn.primary.full', node => node.disabled), false, 'Eligible saved customer can use credit');
        await page.type('[aria-label="Discount amount"]', '500');
        await page.click('[aria-label="Credit deposit"]');
        await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
        await page.type('[aria-label="Credit deposit"]', '2000');
        await page.select('[aria-label="Deposit payment"]', 'mmqr');
        await page.waitForFunction(() => document.querySelector('.bale-credit-outstanding')?.textContent.includes('2,500'));
        await compactCheckout();
        await page.screenshot({ path: 'artifacts/crud-modals/checkout-credit-desktop.png' });
        for (const [width, height] of [[1280, 800], [1280, 720], [1024, 768]]) {
            await page.setViewport({ width, height });
            await compactCheckout();
        }
        await page.setViewport({ width: 390, height: 844 });
        const checkoutLayout = await page.evaluate(() => {
            const form = document.querySelector('.bale-checkout-form');
            const button = document.querySelector('.bale-checkout-submit').getBoundingClientRect();
            return { order: [...form.querySelectorAll('section h3')].map(node => node.id), buttonTop: button.top, buttonBottom: button.bottom, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.deepEqual(checkoutLayout.order, ['checkout-customer-heading', 'checkout-bill-heading', 'checkout-payment-heading'], 'Checkout follows customer, bill, payment order');
        assert.ok(checkoutLayout.buttonTop >= 0 && checkoutLayout.buttonBottom <= 844, 'Complete sale remains visible on mobile');
        assert.equal(checkoutLayout.overflow, false, 'Checkout has no page overflow on mobile');
        await page.screenshot({ path: 'artifacts/crud-modals/credit-checkout-mobile.png' });
        await page.setViewport({ width: 1440, height: 1000 });
        saveMode = 'invalid';
        await page.click('[role="dialog"] button.btn.primary.full');
        await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.textContent.includes('Please check this value.'));
        assert.equal(lastCheckout.customer_id, 20);
        assert.equal(lastCheckout.is_online_sale, true, 'Checkout records the online sale choice');
        assert.equal(lastCheckout.tender_type, 'credit');
        assert.equal(lastCheckout.credit_deposit_method, 'mmqr');
        assert.equal(lastCheckout.amount_tendered, 2000);
        assert.equal(lastCheckout.discount_value, 500);
        assert.equal(await page.$eval('[aria-label="Credit deposit"]', node => node.value), '2000', 'Validation retains deposit');
        saveMode = 'credit-network';
        await page.click('[role="dialog"] button.btn.primary.full');
        await page.waitForFunction(() => document.body.textContent.includes('Connection interrupted.'));
        const interruptedPayload = { ...lastCheckout };
        await goto('/admin/pos'); await click('Retry same sale'); await dialog();
        assert.ok(await page.$eval('.bale-credit-summary', node => node.textContent.includes('Avery Customer')), 'Recovery retains saved customer');
        assert.equal(await page.$eval('[aria-label="Credit deposit"]', node => node.value), '2000', 'Recovery retains deposit');
        assert.equal(await page.$eval('[aria-label="Discount amount"]', node => node.value), '500', 'Recovery retains discount');
        assert.equal(await page.$eval('[aria-label="Discount amount"]', node => node.disabled), true, 'Pending sale discount cannot change');
        assert.equal(await page.$eval('[aria-label="Online sale"]', node => node.checked && node.disabled), true, 'Pending sale keeps the online flag locked');
        saveMode = 'credit-success';
        await page.click('[role="dialog"] button.btn.primary.full');
        await page.waitForFunction(() => document.body.textContent.includes('Sale complete / RCT-CREDIT'));
        await closed();
        assert.deepEqual(lastCheckout, interruptedPayload, 'Retry sends the same customer, amounts, and request key');
        assert.ok(await page.$eval('.bale-sale-success', node => node.textContent.includes('Credit balance 2,500')), 'Success shows discounted outstanding balance');
        fixtures['/admin/pos'][1].is_super_admin = false;
        fixtures['/admin/pos'][1].auth = { user: { id: 1, name: 'Cashier', permissions: ['pos.access'] } };
        await goto('/admin/pos'); await page.click('.bale-label-grid button'); await click('Checkout'); await dialog();
        assert.equal(await page.$('option[value="credit"]'), null, 'Cashier needs credit permission');
        assert.equal(await page.$('[aria-label="Discount amount"]'), null, 'Cashier needs discount permission');
        await escape();
        console.log('PASS saved-customer credit, deposits, validation, retry recovery, permissions and mobile layout');
        assert.deepEqual(errors, [], 'No browser runtime errors');
        console.log('All CRUD modal checks passed.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
