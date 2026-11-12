import AdminLayout from "@/Layouts/AdminLayout";
import Icon from "@/Components/Admin/icons";
import { StatusBadge } from "@/Components/Admin/shared";
import { Link, router, usePage } from "@/spa/router";
import { routeWithBase } from "@/Utils/url";
import { paymentLabels } from "@/constants/orderLabels";
import { usePhraseTranslation } from "@/Utils/i18n";
import { formatCompoundQuantity } from "@/Utils/unitLabel";
import { formatMoney } from "@/Utils/pricing";

const number = (value) => Number(value || 0).toLocaleString();

function SectionTitle({ number: sectionNumber, title, aside }) {
    return (
        <div className="v-section-title">
            <h2>
                <span>{sectionNumber}</span>
                {title}
            </h2>
            {aside}
        </div>
    );
}

function SalesChart({ trend }) {
    const t = usePhraseTranslation();
    const maximum = Math.max(
        ...trend.map((day) => Number(day.revenue || 0)),
        1,
    );
    const total = trend.reduce((sum, day) => sum + Number(day.revenue || 0), 0);
    const width = 760;
    const height = 190;
    const left = 66;
    const bottom = 162;
    const step = (width - left - 12) / Math.max(trend.length, 1);
    const labelStep = Math.max(1, Math.ceil(trend.length / 7));
    const shortMoney = (value) =>
        new Intl.NumberFormat(undefined, {
            notation: "compact",
            maximumFractionDigits: 1,
        }).format(value);
    return (
        <div className="v-sales-chart">
            <svg
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label={t("Daily confirmed revenue for this month")}
            >
                {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                    const y = bottom - fraction * 140;
                    return (
                        <g key={fraction}>
                            <line
                                x1={left}
                                x2={width - 8}
                                y1={y}
                                y2={y}
                                className="v-chart-grid"
                            />
                            <text
                                x={left - 12}
                                y={y + 4}
                                textAnchor="end"
                                className="v-chart-label"
                            >
                                {shortMoney(
                                    maximum === 1 && !total
                                        ? 0
                                        : maximum * fraction,
                                )}
                            </text>
                        </g>
                    );
                })}
                {trend.map((day, index) => {
                    const barHeight =
                        (Number(day.revenue || 0) / maximum) * 140;
                    const x = left + step * index + step / 2;
                    return (
                        <g key={day.day}>
                            <rect
                                x={x - Math.min(13, step * 0.28)}
                                y={bottom - Math.max(3, barHeight)}
                                width={Math.min(26, step * 0.56)}
                                height={Math.max(3, barHeight)}
                                rx="2"
                                className={
                                    index === trend.length - 1
                                        ? "v-chart-bar current"
                                        : "v-chart-bar"
                                }
                            >
                                <title>{`${day.day}: ${formatMoney(day.revenue)} \u00b7 ${number(day.orders)} ${t("orders")}`}</title>
                            </rect>
                            {(index % labelStep === 0 ||
                                index === trend.length - 1) && (
                                <text
                                    x={x}
                                    y={height - 6}
                                    textAnchor="middle"
                                    className="v-chart-label"
                                >
                                    {day.day.slice(8)}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>
            {!total && (
                <p className="v-chart-empty">
                    {t("A fresh page. Confirmed sales will appear here.")}
                </p>
            )}
        </div>
    );
}

function CounterIllustration() {
    return (
        <svg
            className="v-counter-art"
            viewBox="0 0 300 140"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M28 120h246M52 120V28h190v92M43 28h208M74 28v-7m148 7v-7"
                stroke="currentColor"
                strokeWidth="2"
            />
            <path
                d="M103 40c0-8 11-8 11 0v6l-26 16h52l-26-16M186 39c0-8 11-8 11 0v7l-26 16h52l-26-16"
                stroke="currentColor"
                strokeWidth="1.6"
            />
            <path
                d="m88 60-17 13 8 17 13-6v30h39V84l13 6 8-17-14-13-15-5c-3 10-13 10-17 0Z"
                fill="#cfb994"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <path
                d="m172 60-11 17 12 8-4 28h47l-4-28 12-8-11-17-13-5c-2 9-10 9-13 0Z"
                fill="#a4ae91"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <path
                d="M190 71v34m7-33v33M97 86h25"
                stroke="#52634e"
                strokeWidth="1.2"
            />
            <circle
                cx="260"
                cy="42"
                r="13"
                stroke="currentColor"
                strokeDasharray="2 3"
            />
            <path d="M256 42h8m-4-4v8" stroke="currentColor" />
        </svg>
    );
}

export default function Dashboard({
    stats = {},
    recentOrders = [],
    productCount = 0,
    customerCount = 0,
    dashboard = {},
    locations = [],
    filters = {},
}) {
    const { app_base, auth, is_super_admin, pos_enabled } = usePage().props;
    const t = usePhraseTranslation();
    const can = (permission) =>
        is_super_admin || (auth?.user?.permissions || []).includes(permission);
    const href = (path) => routeWithBase(path, app_base);
    const canReport = [
        "view_reports",
        "reports.sales",
        "reports.inventory",
    ].some(can);
    const today = new Date().toLocaleDateString(undefined, {
        timeZone: "Asia/Rangoon",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
    const firstName = auth?.user?.name?.split(" ")[0] || t("there");
    const trend = dashboard.salesTrend || [];
    const stock = dashboard.lowStockItems || [];
    const topProducts = dashboard.topProducts || [];
    const pending = Number(stats.pending_payment || 0);
    const processing = Number(stats.processing || 0);
    const lowStock = Number(dashboard.lowStockCount || 0);
    const orderLink = can("orders.view") ? href("/admin/orders") : null;
    const actions = [
        {
            label: "Buy a bale",
            hint: "Record a bale purchase",
            icon: "plus",
            path: "/admin/bales?new=1",
            show: can("inventory.receive"),
        },
        {
            label: "Receive stock",
            hint: "Bring new pieces in",
            icon: "box",
            path: "/admin/inventory/receipts/create",
            show: can("inventory.receive"),
        },
        {
            label: "Sales reports",
            hint: "See the bigger picture",
            icon: "chart",
            path: "/admin/reports",
            show: canReport,
        },
    ].filter((item) => item.show);
    const alerts = [
        {
            label: "Payment reviews",
            hint: "Waiting for your confirmation",
            count: pending,
            icon: "wallet",
            path: "/admin/orders?tab=payments",
            show: can("orders.view"),
        },
        {
            label: "Orders to prepare",
            hint: "Get the next parcel ready",
            count: processing,
            icon: "receipt",
            path: "/admin/orders?tab=fulfillment",
            show: can("orders.view"),
        },
        {
            label: "Stock alerts",
            hint: "Pieces running low",
            count: lowStock,
            icon: "box",
            path: "/admin/inventory",
            show: can("inventory.view"),
        },
    ].filter((item) => item.show);
    const metrics = [
        {
            label: "Sales today",
            value: formatMoney(dashboard.todayRevenue),
            hint: `${number(dashboard.todayOrders)} ${t("confirmed orders")}`,
            icon: "wallet",
            path: orderLink,
            accent: true,
        },
        {
            label: "Total orders",
            value: number(stats.total),
            hint: "Across your shop, all time",
            icon: "receipt",
            path: orderLink,
        },
        {
            label: "In the collection",
            value: number(dashboard.activeProducts ?? productCount),
            hint: `${number(dashboard.draftProducts)} ${t("draft products")}`,
            icon: "tag",
            path: can("catalog.view") ? href("/admin/bales") : null,
        },
        {
            label: "Our customers",
            value: number(customerCount),
            hint: "People behind the purchases",
            icon: "users",
            path: can("view_customers") ? href("/admin/customers") : null,
        },
    ];
    return (
        <AdminLayout
            title={t("Shop overview")}
            showPageHeading={false}
            contentClassName="vintage-dashboard"
        >
            <div className="v-heading">
                <div>
                    <p className="v-kicker">
                        <span />
                        {t("YOUR SHOP, AT A GLANCE")}
                    </p>
                    <h1>
                        {t("Shop overview")}
                        <span>.</span>
                    </h1>
                    <p>
                        {t(
                            "Hello, :name. Here\u2019s what\u2019s happening in your shop.",
                            { name: firstName },
                        )}
                    </p>
                </div>
                <div className="v-heading-controls">
                    <span className="v-date">
                        <Icon name="history" size={14} />
                        {today}
                    </span>
                    <label className="v-branch">
                        <Icon name="mapPin" size={15} />
                        <select
                            aria-label={t("Branch")}
                            value={filters.location_id || ""}
                            onChange={(event) =>
                                router.get(
                                    href("/admin/dashboard"),
                                    event.target.value
                                        ? { location_id: event.target.value }
                                        : {},
                                    { preserveState: true, replace: true },
                                )
                            }
                        >
                            <option value="">
                                {t("All allowed branches")}
                            </option>
                            {locations.map((location) => (
                                <option key={location.id} value={location.id}>
                                    {location.name} ({location.code})
                                </option>
                            ))}
                        </select>
                        <Icon name="chevronDown" size={12} />
                    </label>
                </div>
            </div>

            <div className="v-metrics">
                {metrics.map((metric, index) => {
                    const Tag = metric.path ? Link : "article";
                    return (
                        <Tag
                            key={metric.label}
                            {...(metric.path ? { href: metric.path } : {})}
                            className={`v-metric ${metric.accent ? "is-featured" : ""}`}
                        >
                            <div className="v-metric-label">
                                <span>{t(metric.label)}</span>
                                <Icon name={metric.icon} size={17} />
                            </div>
                            <strong>{metric.value}</strong>
                            <div className="v-metric-foot">
                                <small>{t(metric.hint)}</small>
                                <span aria-hidden="true">
                                    {metric.path ? "\u2197" : `0${index + 1}`}
                                </span>
                            </div>
                        </Tag>
                    );
                })}
            </div>

            <div className="v-main-grid">
                <section className="v-panel v-sales-panel">
                    <SectionTitle
                        number="01"
                        title={t("The sales ledger")}
                        aside={
                            <span className="v-period">{t("This month")}</span>
                        }
                    />
                    <div className="v-sales-total">
                        <div>
                            <p>{t("Confirmed revenue")}</p>
                            <strong>
                                {formatMoney(dashboard.monthRevenue)}
                            </strong>
                        </div>
                        <span className="v-chart-key">
                            <i />
                            {t("Daily sales")}
                        </span>
                    </div>
                    <SalesChart trend={trend} />
                    <div className="v-sales-footer">
                        <span>
                            {t("All-time confirmed sales")}{" "}
                            <strong>{formatMoney(stats.revenue_paid)}</strong>
                        </span>
                        {canReport && (
                            <Link href={href("/admin/reports")}>
                                {t("Explore reports")}{" "}
                                <span aria-hidden="true">&#8599;</span>
                            </Link>
                        )}
                    </div>
                </section>
                <aside className="v-counter">
                    <div className="v-counter-top">
                        <span className="v-kicker">{t("AT THE COUNTER")}</span>
                        <Icon name="shop" size={20} />
                    </div>
                    <h2>
                        {t("Old favourites.")}
                        <br />
                        <em>{t("New stories.")}</em>
                    </h2>
                    <p>
                        {t(
                            "A little care. A great find. Another good day in the shop.",
                        )}
                    </p>
                    <CounterIllustration />
                    {pos_enabled && can("pos.access") && (
                        <Link
                            className="v-counter-cta"
                            href={href("/admin/pos")}
                        >
                            <Icon name="card" size={17} />
                            {t("Open point of sale")}
                            <span aria-hidden="true">&#8599;</span>
                        </Link>
                    )}
                    {actions.length > 0 && (
                        <div className="v-counter-actions">
                            {actions.map((action) => (
                                <Link
                                    key={action.path}
                                    href={href(action.path)}
                                    title={t(action.hint)}
                                >
                                    <Icon name={action.icon} size={15} />
                                    <span>{t(action.label)}</span>
                                    <span aria-hidden="true">&#8599;</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </aside>

                <section className="v-panel v-orders-panel">
                    <SectionTitle
                        number="02"
                        title={t("Recent orders")}
                        aside={
                            orderLink && (
                                <Link className="v-text-link" href={orderLink}>
                                    {t("All orders")}{" "}
                                    <span aria-hidden="true">&#8599;</span>
                                </Link>
                            )
                        }
                    />
                    <div className="v-orders-table table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>{t("Order / date")}</th>
                                    <th>{t("Customer")}</th>
                                    <th>{t("Total")}</th>
                                    <th>{t("Payment")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentOrders.length ? (
                                    recentOrders.map((order) => (
                                        <tr key={order.id}>
                                            <td>
                                                {orderLink ? (
                                                    <Link
                                                        className="v-order-number"
                                                        href={href(
                                                            `/admin/orders/${order.id}`,
                                                        )}
                                                    >
                                                        {order.receipt_number ||
                                                            order.order_number}
                                                    </Link>
                                                ) : (
                                                    <strong>
                                                        {order.receipt_number ||
                                                            order.order_number}
                                                    </strong>
                                                )}
                                                <small>
                                                    {new Date(
                                                        order.created_at,
                                                    ).toLocaleDateString(
                                                        undefined,
                                                        {
                                                            day: "numeric",
                                                            month: "short",
                                                            timeZone:
                                                                "Asia/Rangoon",
                                                        },
                                                    )}
                                                </small>
                                            </td>
                                            <td>
                                                <div className="v-customer">
                                                    <span className="v-customer-initial">
                                                        {(
                                                            order.user?.name ||
                                                            order.receiver_name ||
                                                            "W"
                                                        )
                                                            .charAt(0)
                                                            .toUpperCase()}
                                                    </span>
                                                    <div>
                                                        <strong>
                                                            {order.user?.name ||
                                                                order.receiver_name ||
                                                                t(
                                                                    "Walk-in customer",
                                                                )}
                                                        </strong>
                                                        <small>
                                                            {number(
                                                                order.items_count ??
                                                                    order.items
                                                                        ?.length,
                                                            )}{" "}
                                                            {t(
                                                                Number(
                                                                    order.items_count ??
                                                                        order
                                                                            .items
                                                                            ?.length,
                                                                ) === 1
                                                                    ? "item"
                                                                    : "items",
                                                            )}
                                                        </small>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="v-money">
                                                {formatMoney(
                                                    order.final_amount,
                                                )}
                                            </td>
                                            <td>
                                                <StatusBadge
                                                    status={
                                                        order.payment_status
                                                    }
                                                    label={
                                                        paymentLabels[
                                                            order.payment_status
                                                        ] ||
                                                        order.payment_status
                                                    }
                                                />
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={4}>
                                            <div className="v-empty">
                                                <Icon
                                                    name="receipt"
                                                    size={25}
                                                />
                                                <strong>
                                                    {t(
                                                        "Your next story starts with a sale.",
                                                    )}
                                                </strong>
                                                <p>
                                                    {t(
                                                        "New orders will appear here as they come in.",
                                                    )}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
                <section className="v-panel v-attention-panel">
                    <SectionTitle number="03" title={t("On your radar")} />
                    {alerts.length ? (
                        <div className="v-radar-list">
                            {alerts.map((alert) => (
                                <Link
                                    key={alert.path}
                                    className={`v-radar-row ${alert.count ? "has-alert" : ""}`}
                                    href={href(alert.path)}
                                >
                                    <span className="v-radar-icon">
                                        <Icon name={alert.icon} size={18} />
                                    </span>
                                    <span>
                                        <strong>{t(alert.label)}</strong>
                                        <small>{t(alert.hint)}</small>
                                    </span>
                                    <b>{number(alert.count)}</b>
                                    <span aria-hidden="true">&#8599;</span>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <p className="v-small-empty">
                            {t("No tasks available for this role.")}
                        </p>
                    )}
                    <div className="v-queue-note">
                        <span
                            className={
                                alerts.some((alert) => alert.count)
                                    ? "v-dot rust"
                                    : "v-dot"
                            }
                        />
                        {t(
                            alerts.some((alert) => alert.count)
                                ? "A few things could use your attention."
                                : "All caught up. Enjoy the quiet moment.",
                        )}
                    </div>
                    <div className="v-fulfillment">
                        <div>
                            <strong>{number(stats.shipped)}</strong>
                            <small>{t("Shipped")}</small>
                        </div>
                        <div>
                            <strong>{number(stats.delivered)}</strong>
                            <small>{t("Delivered")}</small>
                        </div>
                    </div>
                </section>

                <section className="v-panel v-bestsellers">
                    <SectionTitle
                        number="04"
                        title={t("Collection favourites")}
                        aside={
                            <span className="v-period">{t("This month")}</span>
                        }
                    />
                    {topProducts.length ? (
                        <div className="v-best-list">
                            {topProducts.map((product, index) => (
                                <div
                                    className="v-best-row"
                                    key={`${product.name}-${index}`}
                                >
                                    <span className="v-rank">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <div>
                                        <strong>{product.name}</strong>
                                        <small>
                                            {number(product.units)}{" "}
                                            {t("units sold")}
                                        </small>
                                    </div>
                                    <strong>
                                        {formatMoney(product.revenue)}
                                    </strong>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="v-small-empty">
                            {t(
                                "Your most-loved pieces will appear after the first confirmed sale.",
                            )}
                        </p>
                    )}
                </section>
                <section className="v-panel v-stock">
                    <SectionTitle
                        number="05"
                        title={t("A little restocking")}
                        aside={
                            can("inventory.view") && (
                                <Link
                                    className="v-text-link"
                                    href={href("/admin/inventory")}
                                >
                                    {t("Inventory")} &#8599;
                                </Link>
                            )
                        }
                    />
                    {stock.length ? (
                        <div className="v-stock-list">
                            {stock.map((item) => (
                                <div
                                    className="v-stock-row"
                                    key={`${item.product_id}-${item.location}`}
                                >
                                    <span className="v-stock-symbol">
                                        <Icon name="box" size={18} />
                                    </span>
                                    <div>
                                        <strong>{item.name}</strong>
                                        <small>
                                            {item.location || item.product_code}
                                        </small>
                                    </div>
                                    <span
                                        className={`v-stock-quantity ${Number(item.available) <= 0 ? "sold-out" : ""}`}
                                    >
                                        {formatCompoundQuantity(
                                            item.available,
                                            item.units,
                                        )}
                                        <small>{t("available")}</small>
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="v-stock-clear">
                            <span>
                                <Icon name="check" size={21} />
                            </span>
                            <div>
                                <strong>
                                    {t("The shelves are looking good.")}
                                </strong>
                                <p>
                                    {t(
                                        "No low stock alerts across your selected branches.",
                                    )}
                                </p>
                            </div>
                        </div>
                    )}
                </section>
            </div>
            <footer className="v-dashboard-footer">
                <span>
                    {t("VINTAGE SHOP")} <span aria-hidden="true">&#10035;</span>{" "}
                    {t("Thoughtfully collected. Carefully managed.")}
                </span>
                <span>{t("A new chapter for old favourites.")}</span>
            </footer>
        </AdminLayout>
    );
}
