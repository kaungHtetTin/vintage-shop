const fs=require('node:fs');
const source=fs.readFileSync('scripts/verify-crud-modals.cjs','utf8');
let prefix=source.slice(0,source.search(/    try \{\r?\n        await fs.mkdir\('artifacts\/admin-consistency'/));
prefix=prefix.replace('props: { ...common, ...fixture[1] } };',"props: { ...common, ...fixture[1], ...(route==='/admin/credit/collections'?{filters:Object.fromEntries(url.searchParams)}:{}) } };");
const checks=`
    fixtures['/admin/credit/collections']=['Admin/Credit/Collections',{payments:pager([{id:1,transaction_number:'CR-001',amount:-5000,created_at:'2026-11-12T10:00:00Z',tender_type:'mmqr',customer:{id:1,name:'Avery Customer',phone:'091234567'},order:{order_number:'POS-001'},creator:{name:'Shop owner'}}]),filters:{}}];
    const openFilters=async()=>{await page.click('.admin-filter-trigger');await dialog();await page.waitForFunction(()=>Math.abs(document.querySelector('[role="dialog"]').getBoundingClientRect().right-innerWidth)<1);};
    const selectPeriod=async value=>{const selects=await page.$$('[role="dialog"] select');await selects[0].select(value);};
    await fs.mkdir('artifacts/collection-filters',{recursive:true});
    try {
        await goto('/admin/credit/collections');
        assert.equal(await page.$$('.credit-collections-panel').then(n=>n.length),0);
        assert.equal(await page.$$eval('h2',nodes=>nodes.some(n=>n.textContent==='Daily collections')),false);
        await openFilters();assert.equal(await page.$$('[role="dialog"] input[type="date"]').then(n=>n.length),0);
        await selectPeriod('last_30');await page.type('[role="dialog"] input[type="search"]','Avery');
        const selects=await page.$$('[role="dialog"] select');await selects[1].select('mmqr');
        await click('Apply filters');await closed();await page.waitForFunction(()=>location.search.includes('period=last_30'));
        assert.ok(page.url().includes('tender_type=mmqr'));assert.ok(page.url().includes('q=Avery'));
        await openFilters();assert.equal(await page.$eval('[role="dialog"] select',n=>n.value),'last_30');
        await selectPeriod('custom');
        await page.waitForSelector('[role="dialog"] input[type="date"]');
        await page.$$eval('[role="dialog"] input[type="date"]',nodes=>nodes.forEach((n,i)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,i?'2026-11-12':'2026-11-01');n.dispatchEvent(new Event('input',{bubbles:true}));}));
        await click('Apply filters');await closed();await page.waitForFunction(()=>location.search.includes('from=2026-11-01'));
        await openFilters();assert.deepEqual(await page.$$eval('[role="dialog"] input[type="date"]',nodes=>nodes.map(n=>n.value)),['2026-11-01','2026-11-12']);
        await selectPeriod('today');await escape();await openFilters();
        assert.equal(await page.$eval('[role="dialog"] select',n=>n.value),'custom');
        await click('Reset');await closed();await page.waitForFunction(()=>![...new URLSearchParams(location.search).values()].some(Boolean));
        await goto('/admin/credit/collections?from=2026-11-01&to=2026-11-12');await openFilters();
        assert.equal(await page.$eval('[role="dialog"] select',n=>n.value),'custom');
        assert.deepEqual(await page.$$eval('[role="dialog"] input[type="date"]',nodes=>nodes.map(n=>n.value)),['2026-11-01','2026-11-12']);
        await escape();
        await page.screenshot({path:'artifacts/collection-filters/page-desktop.png',fullPage:true});
        await page.setViewport({width:390,height:844});await openFilters();
        assert.equal(await page.$eval('[role="dialog"]',n=>n.scrollWidth>n.clientWidth),false);
        await page.screenshot({path:'artifacts/collection-filters/drawer-mobile.png'});
        await escape();assert.equal(mutations.length,0);assert.deepEqual(errors,[]);
        console.log('PASS: chart removed, preset/method requests, custom dates, cancellation, Reset, legacy date URLs and mobile drawer.');
    } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
`;
eval(prefix+checks);
