const fsAudit = require('node:fs');
const sourceAudit = fsAudit.readFileSync('scripts/verify-crud-modals.cjs', 'utf8');
const prefixAudit = sourceAudit.slice(0, sourceAudit.search(/    try \{\r?\n        await fs.mkdir\('artifacts\/admin-consistency'/));
const auditBody = `
    fixtures['/admin/suppliers'] = ['Admin/Bales/Suppliers', {suppliers:[{id:1,name:'Vintage supplier',phone:'091234567',bales_count:3,notes:'Regular supplier'}]}];
    fixtures['/admin/bales'] = ['Admin/Bales/Index', {bales:pager([bale]),suppliers:[{id:1,name:'Vintage supplier'}],locations:[location],counts:{}}];
    const plainOrder = {id:2,order_number:'POS-002',receipt_number:'RCT-002',status:'completed',is_online_sale:true,delivered_at:null,payment_status:'paid',sales_channel:'pos',receiver_name:'Online customer',receiver_phone:'091234567',shipping_fee:0,total_amount:5000,final_amount:5000,paid_amount:5000,items_count:1,items:[{id:2,product:{name:'Vintage shirt'},quantity:1,unit_name:'Piece',unit_price:5000,total_price:5000}],created_at:'2026-11-12T10:00:00Z'};
    fixtures['/admin/orders'] = ['Admin/Orders/Index', {orders:pager([plainOrder]),stats:{total:1,not_delivered:1,delivered:0,cancelled:0,revenue_paid:5000},filters:{},locations:[location],canManageOrders:true}];
    fixtures['/admin/orders/2'] = ['Admin/Orders/Show', {order:plainOrder,canManageOrders:true,canCancelOrders:true}];
    fixtures['/admin/credit'] = ['Admin/Credit/Index', {customers:pager([])}];
    fixtures['/admin/audit-logs'] = ['Admin/AuditLogs/Index', {logs:pager([]),filters:{}}];
    fixtures['/admin/inventory/adjustments'] = ['Admin/Inventory/Adjustments/Index', {adjustments:pager([]),locations:[location]}];
    await fs.mkdir('artifacts/design-audit', {recursive:true});
    const findings=[];
    const inspect = async (name) => {
        findings.push(await page.evaluate(name => {
            const style = node => {if(!node)return null; const s=getComputedStyle(node),r=node.getBoundingClientRect();return {height:Math.round(r.height),width:Math.round(r.width),padding:s.padding,border:s.borderWidth,font:s.fontSize,weight:s.fontWeight,radius:s.borderRadius,background:s.backgroundColor,align:s.textAlign,transform:s.textTransform};};
            const modal=document.querySelector('[role="dialog"],.operation-modal');
            const header=document.querySelector('.table-search-header');
            const headerData=header?{...style(header),gap:Math.round(header.nextElementSibling.getBoundingClientRect().top-header.getBoundingClientRect().bottom),overflow:document.documentElement.scrollWidth>innerWidth}:null;
            return {name,header:headerData,panel:style(document.querySelector('table')?.closest('.panel')),wrapper:style(document.querySelector('.table-wrap')),table:{background:style(document.querySelector('table'))?.background,heading:style(document.querySelector('thead th')),cell:style(document.querySelector('tbody td')),row:style(document.querySelector('tbody tr'))},modal:style(modal),title:style(modal?.querySelector('h2')),field:style(modal?.querySelector('input')),buttons:[...(modal?.querySelectorAll('button')||[])].map(n=>n.textContent.trim()||n.getAttribute('aria-label'))};
        },name));
        await page.screenshot({path:'artifacts/design-audit/'+name+'.png',fullPage:true});
    };
    try {
      for (const [route,name,action] of [
        ['/admin/bales','bales',null],
        ['/admin/suppliers','suppliers',null],
        ['/admin/customers','customers',null],
        ['/admin/finance','finance',null],
        ['/admin/locations','locations',null],
        ['/admin/inventory/receipts','receipts',null],
        ['/admin/users','staff',null],
        ['/admin/orders','orders',null],
        ['/admin/orders/2','order-detail',null],
        ['/admin/credit','credit',null],
        ['/admin/audit-logs','audit',null],
        ['/admin/inventory/adjustments','adjustments',null],
        ['/admin/settings/prices','prices',null],
      ]) {
        await goto(route); await inspect(name+'-table');
        if(!action) continue;
        const labels=await page.$$eval('button',nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.textContent.trim()));
        const chosen=labels.find(n=>n===action)||labels.find(n=>n.endsWith(action));
        if(chosen){await click(chosen);await page.waitForSelector('[role="dialog"],.operation-modal',{visible:true});await new Promise(r=>setTimeout(r,350));await inspect(name+'-modal');}
        else console.log('No matching action',name,labels);
      }
      await goto('/admin/customers');
      await page.setViewport({width:390,height:844});
      await page.evaluate(()=>{document.querySelector('.app-root').dataset.theme='dark';});
      await inspect('customers-mobile-dark');
      await goto('/admin/inventory/receipts'); await inspect('receipts-mobile');
      await goto('/admin/orders'); await inspect('orders-mobile');
      await fs.writeFile('artifacts/design-audit/measurements.json',JSON.stringify(findings,null,2));
      console.log(JSON.stringify(findings));console.log('Page errors',errors);
    } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
`;
eval(prefixAudit+auditBody);
