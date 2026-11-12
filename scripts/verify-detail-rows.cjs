const fs=require('node:fs');
const source=fs.readFileSync('scripts/verify-crud-modals.cjs','utf8');
const prefix=source.slice(0,source.search(/    try \{\r?\n        await fs.mkdir\('artifacts\/admin-consistency'/));
const checks=`
    const product={id:1,name:'Vintage shirt',product_code:'P-001',units:[],base_unit:{id:1,name:'Piece',code:'pc'}};
    const unit={id:1,name:'Piece',code:'pc',conversion_factor:1};
    const line={id:1,product_id:1,product,unit,received_quantity:2,free_quantity:0,unit_cost:1000,requested_quantity:2,received_base_quantity:2,sent_base_quantity:2,total_cost:2000};
    const receipt={id:1,receipt_number:'RCV-001',status:'draft',location,items:[line],received_at:'2026-11-12T10:00:00Z'};
    const transfer={id:1,transfer_number:'TRF-001',source_location:location,destination_location:{...location,id:2,name:'Second branch'},items:[line],total_amount:2000,created_at:'2026-11-12T10:00:00Z'};
    fixtures['/admin/orders']=['Admin/Orders/Index',{orders:pager([{...fixtures['/admin/orders/2'][1].order,order_number:'ONLINE-002'}]),filters:{q:'online'},locations:[location],canManageOrders:true}];
    fixtures['/admin/credit']=['Admin/Credit/Index',{customers:pager([{id:1,name:'Customer',outstanding:2000,credit_status:'active',invoice_count:1}]),aging:{},filters:{}}];
    fixtures['/admin/credit/collections']=['Admin/Credit/Collections',{payments:pager([{id:1,transaction_number:'CR-001',amount:-1000,customer:{id:1,name:'Customer'}}]),filters:{}}];
    fixtures['/admin/inventory']=fixtures['/admin/bales'];
    fixtures['/admin/inventory/products/1']=['Admin/Inventory/ProductShow',{product,balances:[],movements:pager([{id:1,location,type:'receipt',quantity_delta:2,occurred_at:'2026-11-12T10:00:00Z',document:{href:base+'/admin/inventory/receipts/1',label:'RCV-001'}}]),locations:[location],types:['receipt'],filters:{}}];
    fixtures['/admin/inventory/receipts'][1].receipts=pager([receipt]);
    fixtures['/admin/inventory/receipts/1']=['Admin/Inventory/Receipts/Show',{receipt}];
    fixtures['/admin/inventory/transfers']=['Admin/Inventory/Transfers/Index',{transfers:pager([transfer]),locations:[location],filters:{}}];
    fixtures['/admin/inventory/transfers/1']=['Admin/Inventory/Transfers/Show',{transfer}];
    fixtures['/admin/customers/1'][1].recentOrders=[{id:1,order_number:'S-001',status:'pending',payment_status:'pending_review',final_amount:10000,items_count:1}];
    fixtures['/admin/orders/2'][1].order.items=[{...line,unit_price:5000,total_price:5000,quantity:1,product:{...product,metadata:{vintage_bale:true,vintage_bale_id:1}}}];
    fixtures['/admin/finance'][1].bales=pager([bale]);
    fixtures['/admin/dashboard']=['Admin/Bales/Dashboard',{bales:[bale],recentOrders:[{id:1,order_number:'S-001',final_amount:10000,created_at:'2026-11-12T10:00:00Z',payment_status:'paid'}]}];
    fixtures['/admin/inventory/adjustments']=['Admin/Inventory/Adjustments/Index',{adjustments:pager([{id:1,adjustment_number:'ADJ-001',location,created_at:'2026-11-12T10:00:00Z',status:'posted',reason_code:'damage',items:[{...line,system_quantity:2,counted_quantity:1,quantity_delta:-1}]}]),locations:[location],filters:{}}];
    await page.evaluateOnNewDocument(()=>{window.open=(...args)=>{window.__rowOpened=args;return null;};});
    await fs.mkdir('artifacts/detail-rows',{recursive:true});
    const navigateRow=async(route,destination)=>{
        await goto(route);
        const selector='tr[data-detail-href="'+base+destination+'"]';
        await page.waitForSelector(selector,{visible:true});
        await page.focus(selector); await page.keyboard.press('Enter');
        await page.waitForFunction(path=>location.pathname.endsWith(path),{},destination);
        console.log('PASS '+route+' -> '+destination);
    };
    try {
        for(const [route,dest]of [
            ['/admin/bales','/admin/bales/1'],['/admin/bales/1','/admin/orders/1'],
            ['/admin/customers?q=recorded&page=2','/admin/customers/1'],['/admin/credit','/admin/customers/1'],
            ['/admin/credit/collections','/admin/customers/1'],['/admin/customers/1','/admin/orders/1'],
            ['/admin/orders?q=online','/admin/orders/2'],['/admin/orders/2','/admin/bales/1'],
            ['/admin/inventory','/admin/bales/1'],['/admin/inventory/products/1','/admin/inventory/receipts/1'],
            ['/admin/inventory/receipts','/admin/inventory/receipts/1'],['/admin/inventory/transfers','/admin/inventory/transfers/1'],
            ['/admin/inventory/receipts/1','/admin/inventory/products/1'],['/admin/inventory/transfers/1','/admin/inventory/products/1'],
            ['/admin/dashboard','/admin/orders/1'],['/admin/inventory/adjustments','/admin/inventory/products/1']
        ])await navigateRow(route,dest);
        await goto('/admin/customers?q=recorded&page=2');
        await page.click('tr[data-detail-href] td:nth-child(2)');
        await page.waitForFunction(()=>location.pathname.endsWith('/admin/customers/1'));
        await page.goBack();await page.waitForSelector('tr[data-detail-href]');
        assert.ok(page.url().includes('q=recorded&page=2'));
        const current=page.url();
        await page.click('button[aria-label="Edit customer"]');await dialog();
        assert.equal(page.url(),current);await escape();
        await page.focus('button[aria-label="Edit customer"]');await page.keyboard.press('Enter');await dialog();
        assert.equal(page.url(),current);await escape();
        await page.evaluate(()=>{const td=document.querySelector('tr[data-detail-href] td');td.insertAdjacentHTML('beforeend','<label class="row-test"><input type="checkbox">Select</label>');});
        await page.click('.row-test');assert.equal(page.url(),current);assert.equal(await page.$eval('.row-test input',n=>n.checked),true);
        await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('tr[data-detail-href] td strong'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.querySelector('tr[data-detail-href] td').click();});
        assert.equal(page.url(),current);await page.evaluate(()=>getSelection().removeAllRanges());
        await page.keyboard.down('Control');await page.click('tr[data-detail-href] td:nth-child(2)');await page.keyboard.up('Control');
        assert.equal(page.url(),current);assert.ok(await page.evaluate(()=>window.__rowOpened[0].endsWith('/admin/customers/1')));
        await page.click('tr[data-detail-href] td:nth-child(2)',{button:'middle'});
        assert.equal(page.url(),current);
        fixtures['/admin/inventory/receipts/1'][1].is_super_admin=false;
        fixtures['/admin/inventory/receipts/1'][1].auth={user:{name:'Receiver',permissions:['inventory.receive']}};
        await goto('/admin/inventory/receipts/1');assert.equal(await page.$$('tr[data-detail-href]').then(n=>n.length),0);
        await page.setViewport({width:390,height:844});await goto('/admin/customers');
        await page.focus('tr[data-detail-href]');await page.screenshot({path:'artifacts/detail-rows/mobile-focus.png'});
        assert.equal(mutations.length,0);assert.deepEqual(errors,[]);
        console.log('PASS mouse/Enter navigation, Back filter preservation, edit buttons, checkbox/label handling, text selection, modified/middle clicks, permissions and mobile focus; no mutations.');
    } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
`;
eval(prefix+checks);
