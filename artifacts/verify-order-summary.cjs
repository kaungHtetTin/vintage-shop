const fs=require('node:fs');
const source=fs.readFileSync('scripts/verify-crud-modals.cjs','utf8');
const prefix=source.slice(0,source.search(/    try \{\r?\n        await fs.mkdir\('artifacts\/admin-consistency'/));
const checks=`
    fixtures['/admin/orders']=['Admin/Orders/Index',{orders:pager([]),stats:{total:124,not_delivered:12,delivered:86,cancelled:4,revenue_paid:12500000},filters:{},canManageOrders:true,locations:[location]}];
    await fs.mkdir('artifacts/order-summary',{recursive:true});
    try {
        await goto('/admin/orders');
        for(const [name,width,height,theme] of [['desktop',1440,900,'light'],['dark',1280,720,'dark'],['tablet',1024,768,'light'],['mobile',390,844,'light']]) {
            await page.setViewport({width,height});
            await page.evaluate(theme=>document.querySelector('.app-root').dataset.theme=theme,theme);
            const layout=await page.evaluate(()=>{
                const cards=[...document.querySelectorAll('.orders-summary-card')];
                return {count:cards.length,values:cards.map(n=>n.querySelector('strong').textContent),overflow:document.documentElement.scrollWidth>innerWidth,clipped:cards.some(n=>n.scrollWidth>n.clientWidth)};
            });
            assert.equal(layout.count,5); assert.equal(layout.overflow,false); assert.equal(layout.clipped,false);
            assert.deepEqual(layout.values.slice(0,4),['124','12','86','4']);
            assert.ok(layout.values[4].includes('12,500,000'));
            await page.screenshot({path:'artifacts/order-summary/'+name+'.png',fullPage:true});
        }
        await page.click('.orders-page-actions > button'); await dialog(); await escape();
        assert.deepEqual(errors,[]);
        console.log('PASS: summary values, desktop/tablet/mobile layout, dark theme, no clipping or page overflow, filter drawer.');
    } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
`;
eval(prefix+checks);
