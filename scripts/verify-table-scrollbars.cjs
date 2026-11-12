const fs=require('node:fs');
const source=fs.readFileSync('scripts/verify-crud-modals.cjs','utf8');
let prefix=source.slice(0,source.search(/    try \{\r?\n        await fs.mkdir\('artifacts\/admin-consistency'/));
prefix=prefix.replace("puppeteer.launch({ headless: true })", "puppeteer.launch({headless:true,args:['--enable-features=OverlayScrollbar']})");
prefix=prefix.replace("const fixture = fixtures[route];", "if(route === '/admin/inventory/products/search') return json(pager([])); const fixture = fixtures[route];");
const checks=`
    const browserName='chromium';
    const order={id:2,order_number:'POS-002',receipt_number:'RCT-002',status:'completed',is_online_sale:true,payment_status:'paid',final_amount:66000,receiver_name:'Saved customer',items_count:10};
    const product={id:1,name:'Vintage shirt',product_code:'P-001',units:[]};
    fixtures['/admin/orders']=['Admin/Orders/Index',{orders:pager([order]),filters:{},locations:[location],canManageOrders:true}];
    fixtures['/admin/credit']=['Admin/Credit/Index',{customers:pager([{id:1,name:'Recorded customer',phone:'091234567',credit_status:'active',outstanding:3000,overdue:0,invoice_count:1}]),filters:{},aging:{}}];
    fixtures['/admin/credit/collections']=['Admin/Credit/Collections',{payments:pager([{id:1,customer:{id:1,name:'Recorded customer'},transaction_number:'CR-001',amount:-1000,tender_type:'cash'}]),filters:{}}];
    fixtures['/admin/audit-logs']=['Admin/AuditLogs/Index',{logs:pager([]),filters:{}}];
    fixtures['/admin/inventory']=fixtures['/admin/bales'];
    fixtures['/admin/inventory/products/1']=['Admin/Inventory/ProductShow',{product,balances:[],movements:pager([]),locations:[location],types:[],filters:{}}];
    fixtures['/admin/inventory/transfers']=['Admin/Inventory/Transfers/Index',{transfers:pager([]),locations:[location],filters:{}}];
    fixtures['/admin/inventory/adjustments']=['Admin/Inventory/Adjustments/Index',{adjustments:pager([]),locations:[location],filters:{}}];
    fixtures['/admin/bales'][1].bales=pager([{...bale,total_cost:1000000,sales_revenue:66000,bale_result:-934000,remaining:60}]);
    fixtures['/admin/inventory/receipts/1/edit']=['Admin/Inventory/Receipts/Edit',{locations:[location],categories:[],receipt:{id:1,receipt_number:'RCV-001',location_id:1,items:[{product_id:1,product_unit_id:1,received_quantity:1,free_quantity:0,unit_cost:1000,unit:{id:1,product_id:1,name:'Piece',code:'PC',conversion_factor:1,product_name:'Vintage shirt',product_code:'P-001',cost:1000}}]}}];
    const output='artifacts/table-scrollbars/'+browserName;
    await fs.mkdir(output,{recursive:true});
    const check=async(name)=>{
        await page.waitForFunction(()=>[...document.querySelectorAll('.table-wrap,.receipt-sheet-wrap')].every(w=>!w.querySelector('table')||w.clientWidth===0||(w.scrollWidth>w.clientWidth)===w.hasAttribute('data-horizontal-scroll')));
        const metrics=await page.$$eval('.table-wrap,.receipt-sheet-wrap',nodes=>nodes.filter(w=>w.clientWidth>0&&w.querySelector('table')).map(w=>{
            const table=w.querySelector('table'),r=w.getBoundingClientRect(),tr=table.getBoundingClientRect(),s=getComputedStyle(w);
            const border=Number.parseFloat(s.borderBottomWidth)||0;
            const nativeHeight=w.offsetHeight-w.clientHeight-w.clientTop-border;
            const gap=r.bottom-border-nativeHeight-tr.bottom;
            return {overflow:w.scrollWidth>w.clientWidth,gap,padding:Number.parseFloat(s.paddingBottom),nativeHeight,width:w.clientWidth,scrollWidth:w.scrollWidth};
        }));
        assert.ok(metrics.length,name+' has a table');
        for(const m of metrics){if(m.overflow){assert.ok(m.gap>=15,name+' last row stays above the scrollbar: '+JSON.stringify(m));assert.ok(m.padding>=16);}else assert.equal(m.padding,0,name+' compact table has no artificial gap');}
        return metrics;
    };
    try {
        await page.setViewport({width:1100,height:800});await goto('/admin/bales');await check('bales');
        await page.$eval('.table-wrap',w=>w.scrollLeft=w.scrollWidth);
        await page.screenshot({path:output+'/bales-right.png',fullPage:true});
        await page.setViewport({width:1440,height:900});await check('wide bales');
        assert.equal(await page.$eval('.table-wrap',w=>w.hasAttribute('data-horizontal-scroll')),false);
        for(const route of ['/admin/bales','/admin/customers','/admin/credit','/admin/credit/collections','/admin/users','/admin/audit-logs','/admin/inventory','/admin/inventory/products/1','/admin/inventory/transfers','/admin/inventory/receipts','/admin/inventory/adjustments','/admin/finance','/admin/finance-book','/admin/suppliers']){
            await page.setViewport({width:390,height:844});await goto(route);await check(route);
        }
        await goto('/admin/bales');await check('mobile bales');
        await page.screenshot({path:output+'/bales-mobile.png',fullPage:true});
        await page.setViewport({width:1280,height:720});await goto('/admin/inventory/receipts/1/edit');await dialog();await click('Next');await click('Next');
        await page.waitForSelector('.receipt-sheet-wrap',{visible:true});await check('receiving worksheet modal');
        await page.screenshot({path:output+'/receipt-modal.png',fullPage:true});
        await escape();
        await goto('/admin/customers');
        const dynamic=await page.$eval('.table-wrap',w=>{const table=w.querySelector('table');table.style.minWidth='1800px';return table.style.minWidth;});
        assert.equal(dynamic,'1800px');await check('dynamic columns');
        await page.$eval('.table-wrap table',table=>table.style.minWidth='0');await page.setViewport({width:1440,height:900});await check('dynamic columns restored');
        await page.evaluate(()=>document.querySelector('.app-root').dataset.theme='dark');
        await page.setViewport({width:390,height:844});await check('dark customers');
        await page.screenshot({path:output+'/dark.png',fullPage:true});
        assert.equal(mutations.length,0);assert.deepEqual(errors,[]);
        console.log('PASS '+browserName+': scrollbar clearance across 15 pages, resize/content updates, non-overflow tables, worksheet modal, mobile and dark mode; no mutations.');
    } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
`;
eval(prefix+checks);
