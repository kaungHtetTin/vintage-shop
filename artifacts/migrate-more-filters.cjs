const fs=require('fs');const u=require('./filter-utils.cjs');const {nodes,edit,removeClass,action,imp,save,search,select,opts,loc,drawer}=u;
function removeVars(s,names){return edit(s,nodes(s).filter(({n})=>n.type==='VariableDeclaration'&&n.declarations.every(d=>names.includes(d.id.name||d.id.elements?.[0]?.name))).map(({n})=>({start:n.start,end:n.end,text:''})))}
function oldEffects(s){return edit(s,nodes(s).filter(({n})=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.name==='useEffect'&&s.slice(n.start,n.end).includes('filterDrawerOpen')).map(({n})=>({start:n.start,end:n.end,text:''})))}
const oldNames=['filterDrawerOpen','filterState','visibleFilters','activeFilterCount','submitFilters','resetFilters','renderFilterFields','categoryOptions'];
for(const [file,fields,route]of [
['Inventory/Receipts/Index.jsx',`[${search('Search receipts','Receipt, reference, product or code')},${loc},${select('status','Status',opts('statuses','All statuses'))},...dateFilters()]`,'/admin/inventory/receipts'],
['Inventory/Adjustments/Index.jsx',`[${search('Search adjustments','Product, reference or notes')},${loc},${select('reason_code','Reason',opts('reasons','All reasons'))},${select('status','Status',opts('statuses','All statuses'))},...dateFilters()]`,'/admin/inventory/adjustments']])save(file,s=>{
 s=removeClass(s,'finance-report-filter');s=removeClass(s,'finance-report-filter__backdrop');s=removeClass(s,'filter-heading-actions');s=oldEffects(s);s=removeVars(s,oldNames);s=s.replace(/queryParams=\{filterState\}/g,'queryParams={filters}').replace('FilterVisibilityControl, ','');return imp(action(s,drawer(fields,route)));
});
save('Finance/Index.jsx',s=>{
 s=removeClass(s,'finance-filter-panel');s=removeClass(s,'finance-report-filter__backdrop');s=oldEffects(s);
 s=s.replace('Object.entries(filterState).forEach','Object.entries(filters).forEach');s=removeVars(s,oldNames);s=s.replace('FilterVisibilityControl, ','');
 const fields=`draft=>[${search('Search entries','Title, reference or notes')},${select('location_id','Store',opts('options.locations','All stores'))},...dateFilters(),{key:'type',label:'Type',type:'select',clearOnChange:['category'],options:filterOptions([{value:'income',label:'Income'},{value:'expense',label:'Expense'},{value:'asset',label:'Asset acquisition'}],'All types')},${select('status','Status',opts('options.statuses','All statuses'))},{key:'category',label:'Category',type:'select',options:filterOptions(draft.type ? options.categories?.[draft.type] || [] : Object.values(options.categories || {}).flat(),'All categories')}]`;
 const control=drawer(fields,'/admin/finance')+`<a className="btn secondary" href={routeWithBase('/admin/finance/export',app_base)+'?'+exportQuery.toString()}><Icon name="download" size={14}/>{t('Export')}</a>`;
 return imp(action(s,control));
});
save('Bales/Index.jsx',s=>{
 s=removeClass(removeClass(s,'bale-filter-row'),'bale-tabs');
 const control=`<AdminFilterDrawer filters={filters} fields={[${search('Search bales','Bale ID or supplier')},${loc},${select('status','Status',opts("[{value:'purchased',label:'Purchased'},{value:'laundry',label:'Laundry'},{value:'ready',label:'Ready to sell'},{value:'closed',label:'Finished'}]",'All statuses'))}]} onApply={values=>router.get(href('/admin/bales'),values,{preserveState:true,preserveScroll:true,replace:true})}/>`;
 s=removeVars(s,['search','apply']);s=s.replace(/    useEffect\(\(\) => setSearch\(filters.q \|\| ""\), \[filters.q\]\);/,'');return imp(action(s,control,'Page'));
});
save('Bales/Finance.jsx',s=>{
 s=removeClass(s,'bale-filter-row');s=removeVars(s,['filter']);
 const control=`<AdminFilterDrawer filters={filters} fields={[${loc},...dateFilters()]} onApply={values=>router.get(href(isReport?'/admin/reports':'/admin/finance'),values,{preserveState:true,preserveScroll:true,replace:true})}/>`;
 return imp(action(s,control,'Page'));
});
save('Inventory/ProductShow.jsx',s=>{
 s=removeClass(s,'inventory-filterbar');s=removeVars(s,['changeFilter']);
 const control=`<AdminFilterDrawer filters={filters} fields={[${select('location','Warehouse',opts('locations','All warehouses'))},${select('type','Movement type',"filterOptions(types.map(value=>({value,label:value.replaceAll('_',' ')})),'All movement types')")},...dateFilters()]} onApply={values=>router.get(routeWithBase(\u0060/admin/inventory/products/\u0024{product.id}\u0060,app_base),{...values,...(filters.return_to?{return_to:filters.return_to}:{})},{preserveState:true,preserveScroll:true,replace:true})}/>`;
 return imp(action(s,control));
});
save('Dashboard.jsx',s=>{
 const match=nodes(s).find(({n})=>n.type==='JSXElement'&&n.openingElement.attributes.some(a=>a.name?.name==='className'&&a.value?.value==='v-branch')).n;
 const control=`<AdminFilterDrawer filters={filters} fields={[${loc}]} onApply={values=>router.get(href('/admin/dashboard'),values,{preserveState:true,preserveScroll:true,replace:true})}/>`;
 return imp(edit(s,[{start:match.start,end:match.end,text:control}]));
});
module.exports={removeVars,oldEffects};

