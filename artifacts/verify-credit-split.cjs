const fs=require('node:fs');
const source=fs.readFileSync('scripts/verify-crud-modals.cjs','utf8');
let prefix=source.slice(0,source.search(/    try \{\r?\n        await fs.mkdir\('artifacts\/admin-consistency'/));
prefix=prefix.replace('props: { ...common, ...fixture[1] } };', "props: { ...common, ...fixture[1], ...(['/admin/credit','/admin/credit/collections'].includes(route) ? {filters:Object.fromEntries(url.searchParams)} : {}) } };");
const checks=`
    fixtures['/admin/credit']=['Admin/Credit/Index',{customers:pager([{id:1,name:'Avery Customer',phone:'091234567',credit_status:'active',invoice_count:2,oldest_due_date:'2026-11-01',outstanding:12000,overdue:5000}]),aging:{total:12000,current:7000,days_1_30:5000},filters:{}}];
    fixtures['/admin/credit/collections']=['Admin/Credit/Collections',{payments:pager([{id:1,transaction_number:'CR-261112-ABCDEF',created_at:'2026-11-12T10:00:00Z',amount:-3000,tender_type:'cash',reference:'RCT-001',customer:{id:1,name:'Avery Customer',phone:'091234567'},order:{order_number:'POS-001',receipt_number:'RCT-001'},creator:{name:'Shop owner'}}]),collections:[{day:'2026-11-11',amount:5000},{day:'2026-11-12',amount:3000}],filters:{}}];
    await fs.mkdir('artifacts/credit-split',{recursive:true});
    try {
        await page.setViewport({width:1440,height:900});
        await goto('/admin/credit?bucket=current&q=Avery');
        assert.equal(await page.$$('.credit-collections-panel').then(n=>n.length),0);
        await page.screenshot({path:'artifacts/credit-split/customer-credit.png',fullPage:true});
        await page.click('.admin-page-heading a[href$="/admin/credit/collections"]');
        await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='Collection history');
        const active=await page.$$eval('a.active',nodes=>nodes.filter(n=>n.href.includes('/admin/credit')).map(n=>n.href));
        assert.equal(active.length,1); assert.ok(active[0].endsWith('/collections'));
        assert.equal(await page.$$('.credit-kpi-card').then(n=>n.length),0);
        assert.ok(await page.$eval('tbody',n=>n.textContent.includes('3,000 MMK')&&!n.textContent.includes('-3,000')));
        await page.screenshot({path:'artifacts/credit-split/collections-desktop.png',fullPage:true});
        await page.goBack();
        await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='Customer credit');
        assert.ok(page.url().includes('bucket=current')); assert.ok(page.url().includes('q=Avery'));
        await goto('/admin/credit/collections');
        await page.type('input[type="search"]','Avery'); await click('Search');
        await page.waitForFunction(()=>location.search.includes('q=Avery'));
        await click('Clear'); await page.waitForFunction(()=>!location.search.includes('q='));
        assert.equal(await page.$eval('input[type="search"]',n=>n.value),'');
        await page.setViewport({width:1280,height:720});
        await page.evaluate(()=>document.querySelector('.app-root').dataset.theme='dark');
        await page.screenshot({path:'artifacts/credit-split/collections-dark.png',fullPage:true});
        await page.setViewport({width:390,height:844});
        await page.evaluate(()=>document.querySelector('.app-root').dataset.theme='light');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.screenshot({path:'artifacts/credit-split/collections-mobile.png',fullPage:true});
        fixtures['/admin/credit/collections'][1].payments=pager([]);
        fixtures['/admin/credit/collections'][1].collections=[];
        await goto('/admin/credit/collections');
        assert.ok(await page.$eval('tbody',n=>n.textContent.includes('No collections match')));
        assert.equal(mutations.length,0); assert.deepEqual(errors,[]);
        console.log('PASS: separate pages, sidebar active state, preserved source filters on Back, history search/clear, repayment display, empty state, desktop/mobile/dark and no mutations.');
    } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
`;
eval(prefix+checks);
