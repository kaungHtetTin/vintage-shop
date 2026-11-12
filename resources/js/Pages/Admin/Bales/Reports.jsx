import { dateLocale } from '@/Utils/dateTime';
import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { Head, router, usePage } from '@/spa/router';
import AdminLayout from '@/Layouts/AdminLayout';
import AdminFilterDrawer, { filterOptions } from '@/Components/Admin/AdminFilterDrawer';
import SalesCashChart from '@/Components/Admin/SalesCashChart';
import { AdminFlash } from '@/Components/Admin/AdminFlash';
import { routeWithBase } from '@/Utils/url';
import { usePhraseTranslation } from '@/Utils/i18n';

export default function SalesReports({ charts = {}, filters, defaults, locations = [] }) {
    const uiText = useUiTranslation();
    const { app_base, errors = {} } = usePage().props;
    const t = usePhraseTranslation();
    const months = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: new Date(2000, index, 1).toLocaleDateString(dateLocale(), { month: 'long' }) }));
    const monthName = months[Number(filters.month) - 1]?.label || '';
    const store = locations.find(location => String(location.id) === String(filters.location_id));
    const apply = values => router.get(routeWithBase('/admin/reports', app_base), values, { preserveState: true, preserveScroll: true, replace: true });

    return <AdminLayout title={t('Reports')} eyebrow={t('Sales performance')} contentClassName="sales-reports-page" action={
        <AdminFilterDrawer filters={filters} defaults={defaults} fields={[
            { key: 'location_id', label: 'Store', type: 'select', options: filterOptions(locations, 'All stores') },
            { key: 'month', label: 'Month', type: 'select', options: months },
            { key: 'year', label: 'Year', type: 'number', min: 2000, max: 2100, required: true },
        ]} onApply={apply} onReset={() => apply({})} />
    }>
        <Head title={t('Reports')} />
        <AdminFlash errors={errors} />
        <p className="sales-reports-scope">{store?.name || t('All stores')} {uiText("- MMK")}</p>
        <div className="sales-reports-grid">
            <SalesCashChart title={uiText("Monthly sales")} scope={`${monthName} ${filters.year}`} rows={charts.monthly || []} />
            <SalesCashChart title={uiText("Yearly sales")} scope={String(filters.year)} rows={charts.yearly || []} monthly />
        </div>
        
    </AdminLayout>;
}
