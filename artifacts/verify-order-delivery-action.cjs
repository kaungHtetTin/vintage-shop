const fs = require('node:fs');
const source=fs.readFileSync('scripts/verify-crud-modals.cjs','utf8');
let prefix=source.slice(0,source.search(/    try \{\r?\n        await fs.mkdir\('artifacts\/admin-consistency'/));
prefix=prefix.replace("const fixture = fixtures['/admin/orders/2'];", "const fixture = fixtures['/admin/orders']; if(saveMode==='invalid') return request.respond({status:422,contentType:'application/json',body:JSON.stringify({errors:{delivery:['Please try again.']}})}); await new Promise(r=>setTimeout(r,300));");
prefix=prefix.replace("fixture[1].order.delivered_at = data.delivered ? '2026-11-12T10:00:00Z' : null;", "assert.equal(data.delivered,true); fixture[1].orders.data[0].delivered_at='2026-11-12T10:00:00Z';");
prefix=prefix.replace("url: base + '/admin/orders/2', props: { ...common, ...fixture[1] }", "url: base + '/admin/orders?q=Avery&page=2', props: { ...common, ...fixture[1] }");
const checks=`
    const record={id:2,order_number:'POS-002',is_online_sale:true,status:'completed',payment_status:'paid',receiver_name:'Avery',final_amount:5000,items_count:1};
    fixtures['/admin/orders']=['Admin/Orders/Index',{orders:pager([record,{...record,id:3,order_number:'POS-003',delivered_at:'2026-11-12T10:00:00Z'},{...record,id:4,is_online_sale:false},{...record,id:5,status:'cancelled'}]),filters:{q:'Avery'},canManageOrders:true,locations:[location]}];
    await fs.mkdir('artifacts/order-delivery-action',{recursive:true});
    try {
        await goto('/admin/orders?q=Avery&page=2');
        assert.equal(await page.$$('tbody a.icon-btn').then(n=>n.length),0);
        assert.equal(await page.$$('tbody button').then(n=>n.length),1);
        await page.screenshot({path:'artifacts/order-delivery-action/desktop.png'});
        await page.focus('button[aria-label="Mark delivered POS-002"]');
        await page.keyboard.press('Enter');
        await page.waitForFunction(()=>document.body.textContent.includes('Please try again.'));
        assert.ok(page.url().includes('q=Avery&page=2'));
        assert.equal(await page.$$('tbody button').then(n=>n.length),1);
        saveMode='success';
        await page.click('button[aria-label="Mark delivered POS-002"]');
        await page.waitForFunction(()=>document.querySelector('tbody button')?.disabled);
        await page.waitForFunction(()=>!document.querySelector('tbody button'));
        assert.ok(page.url().includes('q=Avery&page=2'));
        assert.ok(await page.$eval('tbody tr:first-child',n=>n.textContent.includes('Delivered')));
        assert.equal(mutations.filter(n=>n==='/admin/orders/2/delivery').length,2);
        await page.focus('tbody tr:first-child'); await page.keyboard.press('Enter');
        await page.waitForFunction(()=>location.pathname.endsWith('/admin/orders/2'));
        fixtures['/admin/orders'][1].canManageOrders=false;
        fixtures['/admin/orders'][1].orders.data[0].delivered_at=null;
        await goto('/admin/orders?q=Avery&page=2');
        assert.equal(await page.$$('tbody button').then(n=>n.length),0);
        fixtures['/admin/orders'][1].canManageOrders=true;
        await page.setViewport({width:390,height:844});
        await goto('/admin/orders');
        await page.screenshot({path:'artifacts/order-delivery-action/mobile.png'});
        assert.ok(await page.$('button[aria-label="Mark delivered POS-002"]'));
        assert.deepEqual(errors,[]);
        console.log('PASS: eligible online action only, permission gating, keyboard activation without opening row, failure/retry, busy state, delivered badge, preserved filters/page and row navigation.');
    } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
`;
eval(prefix+checks);
