import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
﻿import { Link } from '@/spa/router';
import AdminLayout from '@/Layouts/AdminLayout';
import { AdminFlash } from '@/Components/Admin/AdminFlash';
import DetailTableRow from '@/Components/Admin/DetailTableRow';
import Icon from '@/Components/Admin/icons';
import { BaleTable, money, useBales } from '@/Components/Bales/shared';

export default function Dashboard({ bales = [], counts = {}, pieces_sold = 0, revenue = 0, today_revenue = 0, recentOrders = [] }) {
    const uiText = useUiTranslation();
    const { href, can, pos_enabled, flash } = useBales();
    const cards = [
        { label: 'Sales today', value: money(today_revenue), icon: 'receipt', tone: 'green' },
        { label: 'Net bale sales', value: money(revenue), icon: 'wallet', tone: 'blue' },
        { label: 'Pieces sold', value: Number(pieces_sold).toLocaleString(), icon: 'box', tone: 'amber' },
        { label: 'Ready to sell', value: counts.ready || 0, icon: 'check', tone: 'green' },
        { label: 'In laundry', value: counts.laundry || 0, icon: 'history', tone: 'amber' },
    ];
    return <AdminLayout title={uiText("Dashboard")} eyebrow="Shop overview" contentClassName="bale-workspace dashboard-page" action={
        <div className="inline-actions admin-page-actions">
            {can('inventory.receive') && <Link className="btn secondary" href={href('/admin/bales?new=1')}><Icon name="plus" size={14} />{uiText("Buy a bale")}</Link>}
            {pos_enabled && can('pos.access') && <Link className="btn primary" href={href('/admin/pos')}>{uiText("Open POS")}</Link>}
        </div>
    }>
        <AdminFlash flash={flash} />
        <section className="dashboard-summary" aria-label={uiText("Shop summary")}>
            {cards.map(card => <article className={'metric-card glass credit-kpi-card tone-' + card.tone} key={card.label}>
                <span className="icon-well"><Icon name={card.icon} size={14} /></span>
                <small>{uiText(card.label)}</small><strong>{card.value}</strong>
            </article>)}
        </section>
        <section className="dashboard-section" aria-labelledby="dashboard-bales-title">
            <div className="dashboard-section-header">
                <h2 id="dashboard-bales-title">{uiText("Recent bales")}</h2>
                <div className="inline-actions">
                    <Link className="btn secondary small" href={href('/admin/bales?status=laundry')}>{uiText("Finish laundry")}</Link>
                    <Link className="btn secondary small" href={href('/admin/bales?status=ready')}>{uiText("Label & sell")}</Link>
                    <Link className="text-btn" href={href('/admin/bales')}>{uiText("All bales")}</Link>
                </div>
            </div>
            <BaleTable rows={bales} />
        </section>
        {can('orders.view') && <section className="dashboard-section" aria-labelledby="dashboard-sales-title">
            <div className="dashboard-section-header"><h2 id="dashboard-sales-title">{uiText("Recent sales")}</h2><Link className="text-btn" href={href('/admin/orders')}>{uiText("All orders")}</Link></div>
            <div className="table-wrap"><table><thead><tr><th>{uiText("Order")}</th><th className="numeric-cell">{uiText("Total")}</th></tr></thead><tbody>
                {recentOrders.map(order => <DetailTableRow key={order.id} href={href('/admin/orders/' + order.id)}><td><strong>{order.receipt_number || order.order_number}</strong></td><td className="numeric-cell">{money(order.final_amount)}</td></DetailTableRow>)}
                {!recentOrders.length && <tr><td colSpan={2} className="empty-table-cell">{uiText("No sales yet.")}</td></tr>}
            </tbody></table></div>
        </section>}
    </AdminLayout>;
}
