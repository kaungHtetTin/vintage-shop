const fs=require('fs'),{nodes,edit}=require('./filter-utils.cjs');
const specs=[
['resources/js/Components/Bales/shared.jsx','bale.id','href(`/admin/bales/${bale.id}`)'],
['resources/js/Pages/Admin/Bales/Show.jsx','item.id','can("orders.view") ? href(`/admin/orders/${item.order_id}`) : undefined'],
['resources/js/Pages/Admin/Bales/Finance.jsx','b.id','href(`/admin/bales/${b.id}`)',`permissions={['catalog.view','catalog.manage','inventory.view','inventory.receive']}`],
['resources/js/Pages/Admin/Credit/Index.jsx','customer.id','routeWithBase(`/admin/customers/${customer.id}`,app_base)'],
['resources/js/Pages/Admin/Credit/Collections.jsx','payment.id','payment.customer ? routeWithBase(`/admin/customers/${payment.customer.id}`,app_base) : undefined'],
['resources/js/Pages/Admin/Customers/Index.jsx','customer.id','routeWithBase(`/admin/customers/${customer.id}`,app_base)'],
['resources/js/Pages/Admin/Customers/Show.jsx','order.id','routeWithBase(`/admin/orders/${order.id}`,app_base)'],
['resources/js/Pages/Admin/Customers/Show.jsx','entry.id','entry.order?.id ? routeWithBase(`/admin/orders/${entry.order.id}`,app_base) : undefined',`permission="orders.view"`],
['resources/js/Pages/Admin/Dashboard.jsx','order.id','orderLink ? href(`/admin/orders/${order.id}`) : undefined'],
['resources/js/Pages/Admin/Inventory/Index.jsx','balance.id','can.history ? routeWithBase(`/admin/inventory/products/${balance.product_id}`,app_base) : undefined'],
['resources/js/Pages/Admin/Inventory/ProductShow.jsx','movement.id','movement.document?.href'],
['resources/js/Pages/Admin/Inventory/Receipts/Index.jsx','receipt.id','routeWithBase(`/admin/inventory/receipts/${receipt.id}`,app_base)'],
['resources/js/Pages/Admin/Inventory/Transfers/Index.jsx','transfer.id','routeWithBase(`/admin/inventory/transfers/${transfer.id}`,app_base)'],
['resources/js/Pages/Admin/Orders/Show.jsx','item.id','canReadBales && item.product?.metadata?.vintage_bale_id ? routeWithBase(`/admin/bales/${item.product.metadata.vintage_bale_id}`,app_base) : undefined'],
['resources/js/Pages/Admin/Orders/Index.jsx','order.id','routeWithBase(`/admin/orders/${order.id}`,app_base)'],
];
for(const file of new Set(specs.map(x=>x[0]))){let s=fs.readFileSync(file,'utf8');const changes=[];for(const[,key,href,extra]of specs.filter(x=>x[0]===file)){
 const row=nodes(s).find(({n})=>n.type==='JSXElement'&&n.openingElement.name.name==='tr'&&n.openingElement.attributes.some(a=>a.name?.name==='key'&&s.slice(a.value.start,a.value.end)==='{'+key+'}'))?.n;
 if(!row)throw Error(file+' '+key);
 changes.push({start:row.openingElement.start,end:row.openingElement.end,text:`<DetailTableRow key={${key}} href={${href}} ${extra||''}>`},{start:row.closingElement.start,end:row.closingElement.end,text:'</DetailTableRow>'});
} s=edit(s,changes);s="import DetailTableRow from '@/Components/Admin/DetailTableRow';\n"+s;fs.writeFileSync(file,s);console.log(file)}

