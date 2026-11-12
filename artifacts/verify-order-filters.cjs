const fs = require('node:fs');
const source = fs.readFileSync('scripts/verify-crud-modals.cjs', 'utf8');
let prefix = source.slice(0, source.search(/    try \{\r?\n        await fs.mkdir\('artifacts\/admin-consistency'/));
prefix = prefix.replace('props: { ...common, ...fixture[1] } };', "props: { ...common, ...fixture[1], ...(route === '/admin/orders' ? {filters: Object.fromEntries(url.searchParams)} : {}) } };");
const checks = `
    fixtures['/admin/orders'] = ['Admin/Orders/Index', {orders:pager([{id:1,order_number:'POS-001',receipt_number:'RCT-001',is_online_sale:true,status:'completed',payment_status:'paid',receiver_name:'Avery Customer',receiver_phone:'091234567',items_count:2,final_amount:12000,created_at:'2026-11-12T10:00:00Z'}]),filters:{},locations:[location]}];
    await fs.mkdir('artifacts/order-filters', {recursive:true});
    try {
        await page.setViewport({width:1440,height:900});
        await goto('/admin/orders');
        assert.equal(await page.$$('.orders-page h1').then(n=>n.length),1);
        assert.equal(await page.$$('.orders-page .table-search-header,.orders-page .tab-bar,.orders-page .metrics-grid').then(n=>n.length),0);
        await page.screenshot({path:'artifacts/order-filters/orders-desktop.png'});
        await page.click('.orders-page-actions > button'); await dialog(); await page.waitForFunction(()=>Math.abs(document.querySelector('[role=dialog]').getBoundingClientRect().right-innerWidth)<1);
        await new Promise(r=>setTimeout(r,350));
        await page.waitForFunction(()=>Math.abs(document.querySelector('[role=dialog]').getBoundingClientRect().right-innerWidth)<1);
        const bounds=await page.$eval('[role="dialog"]', n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height};});
        assert.equal(Math.round(bounds.right),1440); assert.equal(bounds.width,400);
        await page.type('[role="dialog"] input[type="search"]','Avery');
        await page.keyboard.press('Escape'); await closed();
        await page.waitForFunction(()=>document.activeElement?.textContent.trim()==='Filters');
        await page.click('.orders-page-actions > button'); await dialog(); await page.waitForFunction(()=>Math.abs(document.querySelector('[role=dialog]').getBoundingClientRect().right-innerWidth)<1);
        assert.equal(await page.$eval('[role="dialog"] input[type="search"]',n=>n.value),'');
        await page.type('[role="dialog"] input[type="search"]','Avery');
        await page.select('[role="dialog"] select','online');
        await page.screenshot({path:'artifacts/order-filters/drawer-desktop.png'});
        await click('Apply filters'); await closed();
        await page.waitForFunction(()=>location.search.includes('sale_type=online'));
        assert.match(page.url(),/q=Avery/);
        const exported=await page.$eval('.orders-page-actions a',n=>n.href);
        assert.match(exported,/sale_type=online/); assert.match(exported,/q=Avery/);
        await page.click('.orders-page-actions > button'); await dialog(); await page.waitForFunction(()=>Math.abs(document.querySelector('[role=dialog]').getBoundingClientRect().right-innerWidth)<1);
        await page.$eval('[role="dialog"] input[type="search"]',n=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(n,'Draft');n.dispatchEvent(new Event('input',{bubbles:true}));});
        assert.equal(await page.$eval('.orders-page-actions a',n=>n.href),exported);
        await click('Reset'); await closed();
        await page.waitForFunction(()=>!location.search);
        await page.setViewport({width:390,height:844});
        await page.screenshot({path:'artifacts/order-filters/orders-mobile.png'});
        await page.click('.orders-page-actions > button'); await dialog(); await page.waitForFunction(()=>Math.abs(document.querySelector('[role=dialog]').getBoundingClientRect().right-innerWidth)<1);
        assert.equal(await page.$eval('[role="dialog"]',n=>n.scrollWidth>n.clientWidth),false);
        await page.screenshot({path:'artifacts/order-filters/drawer-mobile.png'});
        await page.keyboard.press('Escape'); await closed();
        await page.setViewport({width:1280,height:720});
        await page.evaluate(()=>document.querySelector('.app-root').dataset.theme='dark');
        await page.click('.orders-page-actions > button'); await dialog(); await page.waitForFunction(()=>Math.abs(document.querySelector('[role=dialog]').getBoundingClientRect().right-innerWidth)<1);
        await page.screenshot({path:'artifacts/order-filters/drawer-dark.png'});
        await page.keyboard.press('Escape'); await closed();
        await click('Columns');
        await page.$$eval('.column-visibility-menu label',nodes=>nodes.find(n=>n.textContent.trim()==='Items').querySelector('input').click());
        assert.equal(await page.$$eval('thead th',nodes=>nodes.some(n=>n.textContent==='Items')),false);
        assert.deepEqual(errors,[]);
        console.log('PASS: desktop/mobile drawer, Escape/focus return, draft cancellation, apply/reset, applied export, dark theme and column visibility.');
    } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
`;
eval(prefix+checks);

