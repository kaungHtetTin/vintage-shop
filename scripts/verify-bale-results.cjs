const fs=require('node:fs');
const source=fs.readFileSync('scripts/verify-crud-modals.cjs','utf8');
const prefix=source.slice(0,source.search(/    try \{\r?\n        await fs.mkdir\('artifacts\/admin-consistency'/));
const checks=`
    const finished={...bale,id:2,code:'B-002',status:'closed',total_cost:15000,sales_revenue:20000,bale_result:5000,pieces_sold:10,remaining:0};
    fixtures['/admin/bales'][1].bales=pager([bale,finished]);
    fixtures['/admin/dashboard']=['Admin/Bales/Dashboard',{bales:[bale],counts:{},recentOrders:[]}];
    fixtures['/admin/finance'][1].bales=null;
    fixtures['/admin/reports']=['Admin/Bales/Reports',{charts:{monthly:[],yearly:[]},filters:{year:2026,month:11},defaults:{year:2026,month:11},locations:[location]}];
    await fs.mkdir('artifacts/bale-results',{recursive:true});
    try {
        await page.setViewport({width:1440,height:900});await goto('/admin/bales?q=B');
        assert.equal(await page.$eval('.admin-page-heading',n=>n.textContent.includes('can(')),false);
        const headings=await page.$$eval('thead th',nodes=>nodes.map(n=>n.textContent.trim()));
        assert.equal(headings.length,8);assert.equal(headings.filter(n=>n==='Net sales').length,1);
        assert.ok(headings.includes('Purchase + laundry'));assert.ok(headings.includes('Bale result'));
        const rows=await page.$$eval('.bale-results-table tbody tr',nodes=>nodes.map(n=>n.textContent));
        assert.ok(rows[0].includes('12,000 MMK')&&rows[0].includes('-2,000 MMK')&&rows[0].includes('Still selling'));
        assert.ok(rows[1].includes('5,000 MMK')&&rows[1].includes('Final'));
        const colors=await page.$$eval('.bale-results-table .bale-result-loss strong,.bale-results-table .bale-result-gain strong',nodes=>nodes.map(n=>getComputedStyle(n).color));
        assert.notEqual(colors[0],colors[1]);
        await page.screenshot({path:'artifacts/bale-results/desktop.png',fullPage:true});
        await page.focus('tr[data-detail-href]');await page.keyboard.press('Enter');
        await page.waitForFunction(()=>location.pathname.endsWith('/admin/bales/1'));
        await page.goBack();await page.waitForSelector('.bale-results-table');assert.ok(page.url().includes('q=B'));
        await page.setViewport({width:390,height:844});
        assert.equal(await page.evaluate(()=>document.querySelector('.table-wrap').getBoundingClientRect().right>innerWidth+1),false);
        assert.ok(await page.$eval('.table-wrap',n=>n.scrollWidth>n.clientWidth));
        await page.$eval('.table-wrap',n=>n.scrollLeft=n.scrollWidth);
        await page.screenshot({path:'artifacts/bale-results/mobile-results.png',fullPage:true});
        await page.setViewport({width:1280,height:720});await page.evaluate(()=>document.querySelector('.app-root').dataset.theme='dark');
        await page.screenshot({path:'artifacts/bale-results/dark.png',fullPage:true});
        await goto('/admin/finance');assert.equal(await page.$$('.finance-bale-results').then(n=>n.length),0);assert.equal(await page.$$('table').then(n=>n.length),1);
        await goto('/admin/reports');assert.equal(await page.$$('.sales-chart-panel').then(n=>n.length),2);assert.equal(await page.$$('table').then(n=>n.length),0);
        await goto('/admin/dashboard');assert.equal(await page.$$('.bale-results-table').then(n=>n.length),0);assert.equal(await page.$$('thead th').then(n=>n.length),6);
        fixtures['/admin/bales'][1].is_super_admin=false;fixtures['/admin/bales'][1].auth={user:{name:'Viewer',permissions:['catalog.view']}};await goto('/admin/bales');
        assert.equal(await page.$$eval('.admin-page-heading button',nodes=>nodes.some(n=>n.textContent.includes('Buy a bale'))),false);
        fixtures['/admin/bales'][1].bales=pager([]);await goto('/admin/bales');
        assert.equal(await page.$eval('tbody td',n=>n.colSpan),8);
        assert.equal(mutations.length,0);assert.deepEqual(errors,[]);
        console.log('PASS: merged stock/cost/results, no duplicate sales column, final/provisional labels, colors, detail navigation/Back, mobile scrolling, Finance removal, Reports/dashboard preservation and empty table.');
    } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
`;
eval(prefix+checks);
