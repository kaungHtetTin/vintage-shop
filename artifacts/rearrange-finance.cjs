const fs=require('fs'),{nodes}=require('./filter-utils.cjs');const p='resources/js/Pages/Admin/Bales/Finance.jsx';let s=fs.readFileSync(p,'utf8');
const actionNode=nodes(s).find(({n})=>n.type==='JSXElement'&&n.openingElement.name.name==='CrudAction'&&s.slice(n.start,n.openingElement.end).includes('Record another shop expense')).n;
let expenseAction=s.slice(actionNode.start,actionNode.end).replace('title="Record another shop expense"','title="Add expense"');
const sections=nodes(s).filter(({n})=>n.type==='JSXElement'&&n.openingElement.name.name==='section');
let bale=sections.find(({n})=>s.slice(n.start,n.end).includes('<h2>Lifetime bale results</h2>')).n;
let ledger=sections.find(({n})=>s.slice(n.start,n.end).includes('<h2>Cash ledger</h2>')).n;
let baleMarkup=s.slice(bale.start,bale.end).replace('className="panel glass bale-table-panel"','className="finance-data-section finance-bale-results"').replace('className="bale-section-heading"','className="finance-section-heading"').replace('<h2>Lifetime bale results</h2>','<h2>{t("Bale results")}</h2>').replace('<small>Before rent, salaries and other shop overhead</small>','<small>{t("Lifetime totals, before shop overhead")}</small>').replace('<th>Purchase + laundry</th>','<th className="numeric-cell">Purchase + laundry</th>').replace('<th>Sales less bale costs</th>','<th className="numeric-cell">Sales less bale costs</th>').replace('<td>{money(b.total_cost)}</td>','<td className="numeric-cell">{money(b.total_cost)}</td>').replace('<td>{money(b.bale_result)}</td>','<td className={`numeric-cell ${Number(b.bale_result) < 0 ? "text-danger" : "text-success"}`}><strong>{money(b.bale_result)}</strong></td>').replace('Final before overhead','Final').replace('Provisional / still selling','Still selling');
let ledgerMarkup=s.slice(ledger.start,ledger.end).replace('className="panel glass bale-table-panel"','className="finance-data-section finance-cash-ledger"').replace('className="bale-section-heading"','className="finance-section-heading"').replace('<h2>Cash ledger</h2>','<h2>{t("Cash ledger")}</h2><small>{t("Approved entries affect cash totals")}</small>').replace('<td>{e.payment_method || "-"}</td>','<td>{t(({ cash: "Cash", mmqr: "MMQR (Pay)" })[e.payment_method] || e.payment_method || "—")}</td>').replace('<td className="numeric-cell">\n                                        {e.type === "income" ? "+" : "-"}\n                                        {money(e.amount)}\n                                    </td>','<td className={`numeric-cell ${e.type === "income" ? "text-success" : "text-danger"}`}><strong>{e.type === "income" ? "+" : "-"}{money(e.amount)}</strong></td>').replace('{e.status}\n                                        {e.category', '<StatusBadge status={e.status} label={t(e.status)} />\n                                        {e.category');
s=s.replace('Page, Stats, money','Page, money').replace('import {  router, useForm }','import { router, useForm }');
s="import Icon from '@/Components/Admin/icons';\nimport { StatusBadge } from '@/Components/Admin/shared';\nimport { usePhraseTranslation } from '@/Utils/i18n';\n"+s;
s=s.replace('    const { href, can, url } = useBales();','    const { href, can, url } = useBales();\n    const t = usePhraseTranslation();');
const start=s.indexOf('    return (',s.indexOf('export default function Finance'));
s=s.slice(0,start)+`    const selectedLocation = locations.find(location => String(location.id) === String(filters.location_id));
    const period = filters.from || filters.to ? \u0060\u0024{filters.from || t('Beginning')} – \u0024{filters.to || t('Present')}\u0060 : t('All time');
    const cards = [
        { label: 'Money collected', value: summary.cash_in, caption: 'Approved income', icon: 'wallet', tone: 'success' },
        { label: 'Money paid out', value: summary.cash_out, caption: 'Approved outgoings', icon: 'card', tone: 'danger' },
        { label: 'Net cash movement', value: summary.net_cash, caption: 'Cash in minus cash out', icon: 'chart', tone: Number(summary.net_cash) < 0 ? 'danger' : 'success' },
        { label: 'Refunds due', value: summary.refund_due, caption: 'Awaiting payment', icon: 'history', tone: 'warning' },
        { label: 'Bale purchases', value: summary.bale_purchases, caption: 'Paid in this period', icon: 'box', tone: 'primary' },
        { label: 'Laundry', value: summary.laundry, caption: 'Paid in this period', icon: 'card', tone: 'primary' },
    ];
    const expenseAction = (${expenseAction});
    const cashLedger = (${ledgerMarkup});
    const baleResults = (${baleMarkup});

    return (
        <Page title={t(isReport ? 'Bale results & reports' : 'Finance')} eyebrow={t(isReport ? 'Sales reports' : 'Cash management')} errors={expense.errors}
            action={<div className="inline-actions admin-page-actions">
                <AdminFilterDrawer filters={filters} fields={[
                    { key: 'location_id', label: 'Store', type: 'select', options: filterOptions(locations, 'All stores') },
                    ...dateFilters(),
                ]} onApply={values => router.get(href(isReport ? '/admin/reports' : '/admin/finance'), values, { preserveState: true, preserveScroll: true, replace: true })} />
                <a className="btn secondary" href={href((isReport ? '/admin/reports/export' : '/admin/finance/export') + '?' + query)}><Icon name="download" size={14} />{t('Export')}</a>
                {can('manage_finance') && !isReport && expenseAction}
            </div>}>
            <div className="finance-page-content">
                <section className="finance-summary" aria-label={t('Cash summary')}>
                    <p className="finance-summary-scope">{selectedLocation?.name || t('All stores')} · {period}</p>
                    <div className="finance-summary-grid">
                        {cards.map(card => <article key={card.label} className={\u0060metric-card glass credit-kpi-card finance-summary-card tone-\u0024{card.tone}\u0060}>
                            <span className="icon-well"><Icon name={card.icon} size={14} /></span>
                            <small>{t(card.label)}</small><strong>{money(card.value)}</strong><p>{t(card.caption)}</p>
                        </article>)}
                    </div>
                </section>
                {isReport ? <>{baleResults}{cashLedger}</> : <>{cashLedger}{baleResults}</>}
            </div>
        </Page>
    );
}
`;
fs.writeFileSync(p,s);


