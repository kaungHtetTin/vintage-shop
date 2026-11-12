const fs = require('node:fs');
const source = fs.readFileSync('scripts/verify-crud-modals.cjs', 'utf8');
let prefix = source.slice(0, source.search(/    try \{\r?\n        await fs.mkdir\('artifacts\/admin-consistency'/));
prefix = prefix.replace('props: { ...common, ...fixture[1] } };', "props: { ...common, ...fixture[1], filters:{...(fixture[1].filterDefaults||{}),...Object.fromEntries(url.searchParams)} } };");
const checks = `
    fixtures['/admin/orders']=['Admin/Orders/Index',{orders:pager([]),stats:{},filters:{},locations:[location],canManageOrders:true}];
    fixtures['/admin/credit']=['Admin/Credit/Index',{customers:pager([]),filters:{},aging:{}}];
    fixtures['/admin/credit/collections']=['Admin/Credit/Collections',{payments:pager([]),collections:[],filters:{}}];
    fixtures['/admin/audit-logs']=['Admin/AuditLogs/Index',{logs:pager([]),filters:{}}];
    fixtures['/admin/inventory']=['Admin/Bales/Index',{bales:pager([]),suppliers:[],locations:[location],counts:{},filters:{}}];
    fixtures['/admin/inventory/products/1']=['Admin/Inventory/ProductShow',{product:{id:1,product_code:'P-001',name:'Shirt',units:[]},balances:[],movements:pager([]),locations:[location],types:['sale','receipt'],filters:{}}];
    fixtures['/admin/inventory/transfers']=['Admin/Inventory/Transfers/Index',{transfers:pager([]),locations:[location],summary:{},filters:{}}];
    fixtures['/admin/inventory/adjustments']=['Admin/Inventory/Adjustments/Index',{adjustments:pager([]),locations:[location],reasons:[{value:'damage',label:'Damage'}],statuses:['posted','draft'],filters:{}}];
    fixtures['/admin/reports']=['Admin/Bales/Reports',{charts:{monthly:[],yearly:[]},filters:{},defaults:{year:2026,month:11},filterDefaults:{year:2026,month:11},locations:[location]}];
    fixtures['/admin/ui-showcase']=['Admin/UiShowcase',{}];
    fixtures['/admin/finance-book'][1].filterDefaults={date:'2026-11-12'};
    await fs.mkdir('artifacts/admin-filters',{recursive:true});
    const cases=[
        ['/admin/orders','orders'],['/admin/customers','customers'],['/admin/credit','credit'],['/admin/credit/collections','collections'],
        ['/admin/users','staff'],['/admin/audit-logs','audit'],['/admin/inventory','inventory'],['/admin/inventory/products/1','movements'],
        ['/admin/inventory/transfers','transfers'],['/admin/inventory/receipts','receipts'],['/admin/inventory/adjustments','adjustments'],
        ['/admin/finance-book','finance-book'],['/admin/bales','bales'],['/admin/finance','bale-finance'],
        ['/admin/reports','sales-charts'],['/admin/ui-showcase','ui-reference']
    ];
    const openDrawer=async()=>{
        await page.click('.admin-filter-trigger'); await dialog();
        await page.waitForFunction(()=>Math.abs(document.querySelector('[role="dialog"]').getBoundingClientRect().right-innerWidth)<1);
        assert.ok(await page.$eval('[role="dialog"]',n=>n.contains(document.activeElement)));
    };
    try {
      for(const [route,name,override] of cases){
        if(override) fixtures[route.split('?')[0]]=override;
        await page.setViewport({width:1440,height:900});
        await goto(route); await page.waitForSelector('.admin-filter-trigger',{visible:true});
        assert.equal(await page.$$('.table-search-header,.finance-report-filter__mobile-trigger,.reports-filter__mobile-trigger').then(n=>n.length),0,name+' has no duplicate filter bar');
        await openDrawer();
        const exported=await page.$$eval('.admin-page-heading a,.admin-filter-actions a',nodes=>nodes.map(n=>n.href));
        const before=page.url();
        const search=await page.$('[role="dialog"] input[type="search"]');
        if(search) await page.type('[role="dialog"] input[type="search"]','draft');
        else {const selector=await page.$('[role="dialog"] select');if(selector){const value=await selector.evaluate(n=>n.options[n.options.length-1].value);await selector.select(value);}}
        assert.equal(page.url(),before,name+' draft does not navigate');
        assert.deepEqual(await page.$$eval('.admin-page-heading a,.admin-filter-actions a',nodes=>nodes.map(n=>n.href)),exported,name+' export uses applied filters');
        await escape();
        await page.waitForFunction(()=>document.activeElement?.classList.contains('admin-filter-trigger'));
        await openDrawer();
        if(search)assert.equal(await page.$eval('[role="dialog"] input[type="search"]',n=>n.value),'',name+' discarded draft');
        if(search)await page.type('[role="dialog"] input[type="search"]','Avery');
        else {const selector=await page.$('[role="dialog"] select');if(selector){const value=await selector.evaluate(n=>n.options[n.options.length-1].value);await selector.select(value);}}
        if(name==='finance'){
            const selects=await page.$$('[role="dialog"] select');await selects[1].select('expense');
            assert.ok(await selects[3].evaluate(n=>[...n.options].some(o=>o.value==='other_expense')));
        }
        await page.screenshot({path:'artifacts/admin-filters/'+name+'-drawer.png'});
        await click('Apply filters'); await closed();
        if(name!=='ui-reference')await page.waitForFunction(()=>!document.querySelector('.spa-progress-bar'));
        await page.waitForFunction(()=>document.querySelector('.admin-filter-trigger'));
        if(search&&name!=='ui-reference')await page.waitForFunction(()=>location.search.includes('q=Avery'));
        await openDrawer();
        if(search)assert.equal(await page.$eval('[role="dialog"] input[type="search"]',n=>n.value),'Avery',name+' applied values reopen');
        await click('Reset'); await closed();
        if(name!=='ui-reference')await page.waitForFunction(()=>!location.search.includes('Avery'));
        await page.setViewport({width:390,height:844});
        await openDrawer();
        assert.equal(await page.$eval('[role="dialog"]',n=>n.scrollWidth>n.clientWidth),false,name+' mobile fit');
        await page.screenshot({path:'artifacts/admin-filters/'+name+'-mobile.png'});
        await escape();
        console.log('PASS '+name);
      }
      await page.setViewport({width:1280,height:720}); await goto('/admin/orders');
      await page.evaluate(()=>document.querySelector('.app-root').dataset.theme='dark'); await openDrawer();
      await page.screenshot({path:'artifacts/admin-filters/orders-dark.png'});await escape();
      assert.equal(mutations.length,0);assert.deepEqual(errors,[]);
      console.log('PASS shared filter behavior across '+cases.length+' pages/views; no mutations or runtime errors.');
    } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
`;
eval(prefix+checks);
