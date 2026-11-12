import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { formatDateTime as displayformatDateTime } from '@/Utils/dateTime';
import AdminFilterDrawer from '@/Components/Admin/AdminFilterDrawer';

import { Head, router, usePage } from '@/spa/router';
import AdminLayout from '@/Layouts/AdminLayout';

import AdminPagination from '@/Components/Admin/AdminPagination';

import { routeWithBase } from '@/Utils/url';
import { usePhraseTranslation } from '@/Utils/i18n';

const formatDateTime = displayformatDateTime;

const detailText = (properties) => {
    if (!properties) return '—';
    if (typeof properties === 'string') return properties;

    return Object.entries(properties)
        .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
        .join(' · ');
};

export default function AuditLogsIndex({ logs, filters }) {
    const uiText = useUiTranslation();
    const { app_base } = usePage().props;
    const t = usePhraseTranslation();

    return (
        <AdminLayout title={t('Audit logs')} eyebrow={t('Security')} action={<AdminFilterDrawer filters={filters} fields={[{key:'q',label:"Search logs",type:'search',placeholder:"Search any log field"},{key:'date',label:'Date',type:'date'}]} onApply={values=>router.get(routeWithBase('/admin/audit-logs',app_base),values,{preserveState:true,preserveScroll:true,replace:true})} />}>
            <Head title={t('Audit Logs')} />
            <section className="panel glass">
                

                <div className="table-wrap">
                    <table className="data-table">
                        <thead>
                            <tr><th>{t('Action')}</th><th>{t('Staff')}</th><th>{t('Subject')}</th><th>{t('Details')}</th><th>{t('When')}</th></tr>
                        </thead>
                        <tbody>
                            {logs.data.length === 0 ? (
                                <tr><td colSpan={5}><span className="muted">{t('No audit logs found.')}</span></td></tr>
                            ) : logs.data.map((log) => (
                                <tr key={log.id}>
                                    <td><strong>{log.action}</strong><small className="table-subline">{uiText("Log #")}{log.id}</small></td>
                                    <td><small>{log.user?.name || t('System')}<br />{log.user?.email}</small></td>
                                    <td><small>{log.subject_type ? `${log.subject_type.split('\\').pop()} #${log.subject_id}` : '-'}</small></td>
                                    <td><small title={detailText(log.properties)} style={{ display: 'block', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detailText(log.properties)}</small></td>
                                    <td><small title={displayformatDateTime(log.created_at)} style={{ whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</small></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <AdminPagination paginator={logs} label={t('logs')} />
            </section>
        </AdminLayout>
    );
}
