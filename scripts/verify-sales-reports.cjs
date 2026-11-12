const fs=require('node:fs');
const source=fs.readFileSync('scripts/verify-crud-modals.cjs','utf8');
let prefix=source.slice(0,source.search(/    try \{\r?\n        await fs.mkdir\('artifacts\/admin-consistency'/));
prefix=prefix.replace('const payload = { component:', "if(route==='/admin/reports')fixture[1]=reportProps(url);\n        const payload = { component:");
const checks=`
    let empty=false;
    const reportProps=url=>{
        const year=Number(url.searchParams.get('year')||2026),month=Number(url.searchParams.get('month')||11);
        const monthly=Array.from({length:new Date(year,month,0).getDate()},(_,i)=>{
            const sales=empty?0:i===0?50000:i===1?30000:i%5===0?10000:5000;
            const income=empty?0:i===0?40000:i===1?30000:i%5===0?12000:4000;
            const expenses=empty?0:i===0?20000:i===1?50000:i%4===0?8000:2000;
            return {period:year+'-'+String(month).padStart(2,'0')+'-'+String(i+1).padStart(2,'0'),sales,income,expenses,profit:income-expenses};
        });
        const yearly=Array.from({length:12},(_,i)=>{
            const values=i===month-1?Object.fromEntries(['sales','income','expenses','profit'].map(key=>[key,monthly.reduce((sum,row)=>sum+row[key],0)])):{sales:empty?0:50000*(i+1),income:empty?0:40000*(i+1),expenses:empty?0:30000*(i+1),profit:empty?0:10000*(i+1)};
            return {period:year+'-'+String(i+1).padStart(2,'0'),...values};
        });
        return {charts:{monthly,yearly},filters:{year,month,location_id:url.searchParams.get('location_id')||''},defaults:{year:2026,month:11},locations:[location]};
    };
    fixtures['/admin/reports']=['Admin/Bales/Reports',{}];
    await fs.mkdir('artifacts/sales-reports',{recursive:true});
    try {
        await page.setViewport({width:1440,height:900});await goto('/admin/reports');
        assert.equal(await page.$$('table').then(n=>n.length),0);
        assert.equal(await page.$$('.sales-chart-panel').then(n=>n.length),2);
        assert.equal(await page.$$('.sales-chart-line').then(n=>n.length),8);
        const top=await page.$$eval('.sales-chart-panel',nodes=>nodes.map(n=>n.getBoundingClientRect().top));assert.equal(top[0],top[1]);
        await page.$eval('.sales-chart-plot svg',n=>n.focus());await page.keyboard.press('ArrowRight');
        assert.ok(await page.$eval('.sales-chart-readout',n=>n.textContent.includes('-20,000 MMK')));
        const first=await page.$('.sales-chart-legend button');await first.click();
        assert.equal(await first.evaluate(n=>n.getAttribute('aria-pressed')),'false');
        assert.equal(await page.$$('.sales-chart-panel:first-child .sales-chart-line').then(n=>n.length),3);
        await first.click();
        await page.screenshot({path:'artifacts/sales-reports/desktop.png',fullPage:true});
        await page.hover('.sales-chart-panel:last-child .sales-chart-plot svg');
        assert.ok(await page.$eval('.sales-chart-panel:last-child .sales-chart-readout',n=>Boolean(n.querySelector('b'))));
        await page.click('.admin-filter-trigger');await dialog();await page.waitForFunction(()=>Math.abs(document.querySelector('[role="dialog"]').getBoundingClientRect().right-innerWidth)<1);
        const selects=await page.$$('[role="dialog"] select');await selects[0].select('1');await selects[1].select('2');
        await page.$eval('[role="dialog"] input[type="number"]',n=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'2024');n.dispatchEvent(new Event('input',{bubbles:true}));});
        await click('Apply filters');await closed();await page.waitForFunction(()=>location.search.includes('year=2024'));
        await page.waitForFunction(()=>document.querySelector('.sales-chart-heading').textContent.includes('2024'));
        assert.ok(page.url().includes('month=2'));assert.ok(await page.$eval('.sales-reports-scope',n=>n.textContent.includes('Main branch')));
        await page.$eval('.sales-chart-plot svg',n=>n.focus());await page.keyboard.press('End');
        assert.ok(await page.$eval('.sales-chart-readout',n=>n.textContent.includes('29')));
        await page.setViewport({width:1280,height:720});await page.evaluate(()=>document.querySelector('.app-root').dataset.theme='dark');
        await page.screenshot({path:'artifacts/sales-reports/dark.png',fullPage:true});
        await page.setViewport({width:390,height:844});await page.evaluate(()=>document.querySelector('.app-root').dataset.theme='light');
        await page.waitForFunction(()=>document.querySelector('.sales-chart-plot svg').viewBox.baseVal.width<400);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        assert.equal(await page.$$eval('.sales-chart-panel',nodes=>nodes.some(n=>n.getBoundingClientRect().left<0||n.getBoundingClientRect().right>innerWidth)),false);
        await page.screenshot({path:'artifacts/sales-reports/mobile.png',fullPage:true});
        await page.click('.admin-filter-trigger');await dialog();await click('Reset');await closed();
        await page.waitForFunction(()=>!location.search.includes('2024'));
        empty=true;await goto('/admin/reports');
        assert.equal(await page.$$('.sales-chart-empty').then(n=>n.length),2);
        assert.ok(await page.$$eval('.sales-chart-legend strong',nodes=>nodes.every(n=>n.textContent==='0 MMK')));
        await page.screenshot({path:'artifacts/sales-reports/empty.png',fullPage:true});
        assert.equal(mutations.length,0);assert.deepEqual(errors,[]);
        console.log('PASS: chart-only Reports, daily/yearly series, negative profit readout, legend toggles, pointer/keyboard values, store/month/year filters, leap day, Reset, desktop/mobile/dark and zero data.');
    } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
`;
eval(prefix+checks);
