import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import DetailTableRow from '@/Components/Admin/DetailTableRow';
import Icon from '@/Components/Admin/icons';
import AdminLayout from "@/Layouts/AdminLayout";
import { Link, usePage } from "@/spa/router";
import { AdminFlash } from "@/Components/Admin/AdminFlash";
import { StatusBadge } from "@/Components/Admin/shared";
import { routeWithBase } from "@/Utils/url";
import { formatMoney } from "@/Utils/pricing";
import "@/styles/bales.css";
export const money = formatMoney;
export const uuid = () => crypto.randomUUID();
export const day = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon" }).format(
        new Date(),
    );
export function useBales() {
    const { props, url } = usePage();
    return {
        ...props,
        url,
        href: (path) => routeWithBase(path, props.app_base),
        can: (permission) =>
            props.is_super_admin ||
            (props.auth?.user?.permissions || []).includes(permission),
    };
}
export function Page({
    title,
    children,
    action,
    errors = {},
    eyebrow = "Vintage shop",
    headingDetails,
    contentClassName = "",
}) {
    const uiText = useUiTranslation();
    const { flash } = useBales();
    return (
        <AdminLayout
            title={uiText(title)}
            eyebrow={eyebrow}
            action={action}
            headingDetails={headingDetails}
            contentClassName={`bale-workspace ${contentClassName}`}
        >
            <AdminFlash flash={flash} errors={errors} />
            {children}
        </AdminLayout>
    );
}
export function State({ status }) {
    const uiText = useUiTranslation();
    return (
        <StatusBadge
            status={
                {
                    purchased: "neutral",
                    laundry: "warning",
                    ready: "success",
                    closed: "neutral",
                }[status]
            }
            label={
                uiText({
                    purchased: "Purchased",
                    laundry: "In laundry",
                    ready: "Ready for sale",
                    closed: "Finished",
                }[status] || status)
            }
        />
    );
}
export function Stats({ items }) {
    const uiText = useUiTranslation();
    return (
        <div className="bale-stats">
            {items.map(([label, value, note]) => (
                <article key={label}>
                    <small>{uiText(label)}</small>
                    <strong>{uiText(value)}</strong>
                    {note && <p>{uiText(note)}</p>}
                </article>
            ))}
        </div>
    );
}
export function BaleTable({ rows = [], showResults = false }) {
    const uiText = useUiTranslation();
    const { href } = useBales();
    return (
        <div className="table-wrap">
            <table className={showResults ? 'bale-results-table' : undefined}>
                <thead>
                    <tr>
                        <th>{uiText("Bale / supplier")}</th>
                        <th>{uiText("Status")}</th>
                        <th className="numeric-cell">{uiText("Pieces sold")}</th>
                        <th className="numeric-cell">{uiText("Remaining")}</th>
                        {showResults && <th className="numeric-cell">{uiText("Purchase + laundry")}</th>}
                        <th className="numeric-cell">{uiText("Net sales")}</th>
                        {showResults && <th className="numeric-cell">{uiText("Bale result")}</th>}
                        <th className="table-actions-column" />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((bale) => (
                        <DetailTableRow key={bale.id} href={href(`/admin/bales/${bale.id}`)} >
                            <td>
                                <Link href={href(`/admin/bales/${bale.id}`)}>
                                    <strong>{bale.code}</strong>
                                </Link>
                                <small>
                                    {bale.supplier?.name} /{" "}
                                    {bale.location?.name}
                                </small>
                            </td>
                            <td>
                                <State status={bale.status} />
                            </td>
                            <td className="numeric-cell">{bale.pieces_sold}</td>
                            <td className="numeric-cell">{uiText(bale.remaining ?? "Not counted")}</td>
                            {showResults && <td className="numeric-cell">{money(bale.total_cost)}</td>}
                            <td className="numeric-cell">{money(bale.sales_revenue)}</td>
                            {showResults && <td className={`numeric-cell ${Number(bale.bale_result) < 0 ? 'bale-result-loss' : 'bale-result-gain'}`}>
                                <strong>{money(bale.bale_result)}</strong>
                                <small>{uiText(bale.status === 'closed' ? 'Final' : 'Still selling')}</small>
                            </td>}
                            <td className="table-actions-column">
                                <Link
                                    className="icon-btn small"
                                    href={href(`/admin/bales/${bale.id}`)}
                                    aria-label={uiText("Open bale :value1", { value1: bale.code })}
                                    title={uiText("Open bale")}
                                >
                                    <Icon name="external" size={14} />
                                </Link>
                            </td>
                        </DetailTableRow>
                    ))}
                    {!rows.length && (
                        <tr>
                            <td colSpan={showResults ? 8 : 6} className="bale-empty"> {uiText("No bales to show yet.")} </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
