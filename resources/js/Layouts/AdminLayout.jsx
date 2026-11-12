import { dateLocale } from '@/Utils/dateTime';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Head, Link, router, useForm, usePage } from '@/spa/router';
import '@/styles/admin.css';
import '@/styles/vintage-admin.css';
import '@/styles/admin-consistency.css';
import Icon from '@/Components/Admin/icons';
import { AdminLogo, ThemeControl } from '@/Components/Admin/shared';
import LanguageSwitcher from '@/Components/LanguageSwitcher';
import { usePhraseTranslation, useTranslation } from '@/Utils/i18n';
import { useStoredState } from '@/Utils/useStoredState';
import { routeWithBase, storageUrl } from '@/Utils/url';
import CrudModal from '@/Components/Admin/CrudModal';
import CrudConfirm from '@/Components/Admin/CrudConfirm';
import { crudModalDestination } from '@/spa/crudRoutes';
import useTableScrollClearance from '@/Utils/useTableScrollClearance';

function normalizeAdminPath(url, appBase) {
    let path = (url || '/').split('?')[0];
    const base = (appBase || '').replace(/\/+$/, '');
    if (base && base !== '/' && path.startsWith(base)) {
        path = path.slice(base.length) || '/';
    }
    return path.replace(/\/+$/, '') || '/';
}

function isNavActive(currentPath, item, appBase) {
    const target = normalizeAdminPath(item.href, appBase);
    const isExcluded = (item.excludeActivePaths || [])
        .map((path) => normalizeAdminPath(path, appBase))
        .some((path) => currentPath === path || currentPath.startsWith(`${path}/`));

    if (isExcluded) return false;
    if (currentPath === target) return true;
    if (target !== '/admin/dashboard' && target !== '/admin' && currentPath.startsWith(`${target}/`)) {
        return true;
    }
    if ((target === '/admin/dashboard' || target === '/admin') && (currentPath === '/admin' || currentPath === '/admin/dashboard')) {
        return true;
    }
    return false;
}

function NavLink({ item, currentPath, appBase, onNavigate }) {
    const active = !item.external && isNavActive(currentPath, item, appBase);
    const className = active ? 'active' : '';

    const content = (
        <>
            <Icon name={item.icon} size={17} />
            <span className="nav-item-label">{item.label}</span>
            {item.badge > 0 && <small className="badge">{item.badge > 99 ? '99+' : item.badge}</small>}
        </>
    );

    if (item.external) {
        return (
            <a href={item.href} className={className} target="_blank" rel="noopener noreferrer" onClick={onNavigate}>
                {content}
            </a>
        );
    }

    return (
        <Link href={item.href} className={className} onClick={onNavigate}>
            {content}
        </Link>
    );
}

const AdminShellContext = createContext(null);

function AdminChrome({ children, mainClassName = '' }) {
    useTableScrollClearance();
    const { url, props } = usePage();
    const { app_base, app_url, app_settings, admin_landing_path, pos_enabled, orders_pending_payment_count, is_super_admin } = props;
    const t = useTranslation();
    const tp = usePhraseTranslation();
    const authUser = props.auth?.user;
    const [mobileOpen, setMobileOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [globalNotice, setGlobalNotice] = useState(null);
    const [theme, setTheme] = useStoredState('larlarpick.admin.theme', 'light');
    const [density, setDensity] = useStoredState('larlarpick.admin.density', 'compact');
    const [sidebarCollapsed, setSidebarCollapsed] = useStoredState('larlarpick.admin.sidebar.collapsed', false);
    const [collapsedNavSections, setCollapsedNavSections] = useStoredState('larlarpick.admin.nav.collapsed', []);
    const vintageBrand = app_settings?.theme_color && app_settings.theme_color !== '#087f74' ? app_settings.theme_color : '#a45138';
    const brand = vintageBrand;
    const logoutForm = useForm({});

    const currentPath = useMemo(() => normalizeAdminPath(url, app_base), [url, app_base]);
    const closeMobile = () => setMobileOpen(false);
    const closeProfile = () => setProfileOpen(false);
    const goBack = () => {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        router.visit(routeWithBase(admin_landing_path || '/admin/settings?section=profile', app_base), { replace: true });
    };
    const rawRoleLabel = authUser?.role_label || (authUser?.role || 'staff').replace(/_/g, ' ');
    const roleLabel = ['super_admin', 'manager', 'staff'].includes(authUser?.role) ? tp(rawRoleLabel) : rawRoleLabel;
    const avatarUrl = authUser?.avatar ? storageUrl(authUser.avatar, app_url) : null;
    const can = (permission) => is_super_admin || (authUser?.permissions || []).includes(permission);
    const initials = (authUser?.name || 'A')
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();



    useEffect(() => {
        const showNotice = (event) => {
            const message = String(event.detail?.message || '').trim();
            if (message) setGlobalNotice({ message, type: event.detail?.type || 'success' });
        };
        window.addEventListener('admin:notice', showNotice);
        return () => window.removeEventListener('admin:notice', showNotice);
    }, []);

    useEffect(() => {
        if (!globalNotice) return undefined;
        const timeout = window.setTimeout(() => setGlobalNotice(null), 4000);
        return () => window.clearTimeout(timeout);
    }, [globalNotice]);

    useEffect(() => {
        if (!profileOpen) return undefined;

        const close = (event) => {
            if (!event.target.closest?.('.admin-profile-menu')) {
                setProfileOpen(false);
            }
        };

        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [profileOpen]);

    useEffect(() => {
        const closeOnEscape = (event) => {
            if (event.key !== 'Escape') return;
            setProfileOpen(false);
            setMobileOpen(false);
        };

        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, []);

    const toggleNavSection = (title) => {
        setCollapsedNavSections((current) => (
            current.includes(title)
                ? current.filter((item) => item !== title)
                : [...current, title]
        ));
    };

    const navSections = useMemo(
        () => [
            {
                title: t('admin.sections.overview', 'Overview'),
                items: can('dashboard.view') ? [
                    {
                        label: t('admin.items.dashboard', 'Dashboard'),
                        href: routeWithBase('/admin/dashboard', app_base),
                        icon: 'grid',
                    },
                ] : [],
            },
            {
                title: t('admin.sections.sales', 'Sales'),
                items: [
                    ...(pos_enabled && can('pos.access')
                        ? [
                              {
                                  label: t('admin.items.pos', 'POS'),
                                  href: routeWithBase('/admin/pos', app_base),
                                  icon: 'card',
                              },
                          ]
                        : []),
                    ...(can('orders.view')
                        ? [
                              {
                                  label: t('admin.items.orders', 'Orders'),
                                  href: routeWithBase('/admin/orders', app_base),
                                  icon: 'receipt',
                                  badge: orders_pending_payment_count,
                              },
                          ]
                        : []),
                    ...(can('credit.manage')
                        ? [
                            { label: t('Customer credit'), href: routeWithBase('/admin/credit', app_base), icon: 'wallet', excludeActivePaths: ['/admin/credit/collections'] },
                            { label: t('Collection history'), href: routeWithBase('/admin/credit/collections', app_base), icon: 'history' },
                        ]
                        : []),
                    ...(can('manage_finance')
                        ? [
                              {
                                  label: t('admin.items.finance', 'Finance'),
                                  href: routeWithBase('/admin/finance', app_base),
                                  icon: 'card',
                              },
                          ]
                        : []),
                    ...(['view_reports', 'reports.sales'].some(can)
                        ? [
                              {
                                  label: t('admin.items.reports', 'Reports'),
                                  href: routeWithBase('/admin/reports', app_base),
                                  icon: 'chart',
                              },
                          ]
                        : []),
                ],
            },
            ...(['catalog.view', 'catalog.manage', 'inventory.view', 'inventory.receive'].some(can) ? [{ title: tp('Bale management'), items: [
                { label: tp('Bales & stock'), href: routeWithBase('/admin/bales', app_base), icon: 'box' },
                { label: tp('Suppliers'), href: routeWithBase('/admin/suppliers', app_base), icon: 'truck' },
                ...(can('locations.view') ? [{ label: tp('Branches'), href: routeWithBase('/admin/locations', app_base), icon: 'mapPin' }] : []),
            ] }] : []),
            {
                title: tp('Customers'),
                items: [
                    ...(can('view_customers')
                        ? [
                              {
                                  label: t('admin.items.customers', 'Customers'),
                                  href: routeWithBase('/admin/customers', app_base),
                                  icon: 'users',
                              },
                          ]
                        : []),
                ],
            },
            ...(can('staff.manage') || can('roles.manage') || can('settings.manage')
                ? [
                      {
                          title: t('admin.sections.team', 'Team'),
                          items: [
                              ...(can('staff.manage')
                                  ? [
                                        {
                                            label: t('admin.items.staff_accounts', 'Staff accounts'),
                                            href: routeWithBase('/admin/users', app_base),
                                            icon: 'users',
                                        },
                                    ]
                                  : []),
                              ...(can('roles.manage')
                                  ? [
                                        {
                                            label: t('admin.items.roles_permissions', 'Roles & permissions'),
                                            href: routeWithBase('/admin/roles', app_base),
                                            icon: 'lock',
                                        },
                                    ]
                                  : []),
                              ...(can('settings.manage')
                                  ? [
                                        {
                                            label: t('admin.items.settings', 'Settings'),
                                            href: routeWithBase('/admin/settings', app_base),
                                            icon: 'settings',
                                        },
                                    ]
                                  : []),
                          ],
                      },
                  ]
                : []),
            ...(can('view_audit_logs')
                ? [
                      {
                          title: t('admin.sections.security', 'Security'),
                          items: [
                              {
                                  label: t('admin.items.audit_logs', 'Audit logs'),
                                  href: routeWithBase('/admin/audit-logs', app_base),
                                  icon: 'lock',
                              },
                          ],
                      },
                  ]
                : []),
            ...(!can('settings.manage') ? [{ title: t('Account'), items: [{ label: t('admin.items.settings', 'Settings'), href: routeWithBase('/admin/settings?section=profile', app_base), icon: 'settings' }] }] : []),
        ].filter((section) => section.items.length > 0),
        [app_base, pos_enabled, orders_pending_payment_count, is_super_admin, authUser?.role, authUser?.permissions, t],
    );

    return (
        <div
            className={`app-root vintage-admin ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
            data-theme={theme}
            data-density={density}
            style={{ '--color-primary': brand }}
        >
            <div className="admin-app">
                {mobileOpen && (
                    <button
                        type="button"
                        className="admin-sidebar-overlay"
                        aria-label={t('admin.close_navigation', 'Close navigation')}
                        onClick={closeMobile}
                    />
                )}

                <aside className={`admin-sidebar glass ${mobileOpen ? 'open' : ''}`}>
                    <AdminLogo settings={app_settings} />
                    <nav aria-label={t('admin.navigation', 'Admin navigation')}>
                        {navSections.map((section) => {
                            const sectionCollapsed = collapsedNavSections.includes(section.title);
                            return (
                            <div key={section.title} className={`nav-section ${sectionCollapsed ? 'collapsed' : ''}`}>
                                <button
                                    type="button"
                                    className="nav-section-label"
                                    onClick={() => toggleNavSection(section.title)}
                                    aria-expanded={!sectionCollapsed}
                                >
                                    <span>{section.title}</span>
                                    <Icon name={sectionCollapsed ? 'chevronDown' : 'chevronUp'} size={11} />
                                </button>
                                {(sidebarCollapsed || !sectionCollapsed) && section.items.map((item) => (
                                    <NavLink
                                        key={item.label}
                                        item={item}
                                        currentPath={currentPath}
                                        appBase={app_base}
                                        onNavigate={closeMobile}
                                    />
                                ))}
                            </div>
                        )})}
                    </nav>
                    <div className="admin-sidebar-language"><LanguageSwitcher className="sidebar-locale-switch" /></div>
                    <div className="v-sidebar-note"><Icon name="tag" size={16} /><span>{tp('Good finds. Better stories.')}<small>{tp('The shopkeeper’s desk')}</small></span></div>
                </aside>

                <main className={`admin-main ${mainClassName}`.trim()}>
                    <header className="admin-topbar glass">
                        <button
                            type="button"
                            className="icon-btn admin-back-button"
                            aria-label={t('admin.go_back', 'Go back')}
                            title={t('admin.go_back', 'Go back')}
                            onClick={goBack}
                        >
                            <Icon name="arrowLeft" size={17} />
                        </button>
                        <button
                            type="button"
                            className="icon-btn admin-sidebar-toggle"
                            aria-label={sidebarCollapsed ? t('Expand sidebar') : t('Collapse sidebar')}
                            title={sidebarCollapsed ? t('Expand sidebar') : t('Collapse sidebar')}
                            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
                        >
                            <Icon name="menu" size={16} />
                        </button>
                        <button
                            type="button"
                            className="icon-btn admin-mobile-toggle"
                            aria-label={mobileOpen ? t('admin.close_navigation', 'Close navigation') : t('admin.open_navigation', 'Open navigation')}
                            onClick={() => setMobileOpen((open) => !open)}
                        >
                            <Icon name={mobileOpen ? 'close' : 'menu'} size={16} />
                        </button>
                        <div className="v-topbar-breadcrumb"><span>{tp('Workspace')}</span><span>/</span><strong>{tp(currentPath === '/admin/dashboard' ? 'Overview' : 'Shop management')}</strong></div>
                        <div className="admin-topbar-actions">
                            <ThemeControl
                                theme={theme}
                                onThemeChange={setTheme}
                                density={density}
                                onDensityChange={setDensity}
                            />
                            <LanguageSwitcher compact className="admin-locale-switch" />
                            {can('orders.view') && <Link
                                href={routeWithBase('/admin/orders?tab=payments', app_base)}
                                className={`icon-btn notification-bell ${orders_pending_payment_count > 0 ? 'has-count' : ''}`}
                                aria-label={t('admin.orders_waiting', `${orders_pending_payment_count || 0} orders awaiting payment review`, { count: orders_pending_payment_count || 0 })}
                                title={
                                    orders_pending_payment_count > 0
                                        ? t('admin.orders_waiting', `${orders_pending_payment_count} orders awaiting payment review`, { count: orders_pending_payment_count })
                                        : t('admin.no_notifications', 'No pending order notifications')
                                }
                            >
                                <Icon name="bell" size={16} />
                                {orders_pending_payment_count > 0 && (
                                    <span className="notification-count">
                                        {orders_pending_payment_count > 99 ? '99+' : orders_pending_payment_count}
                                    </span>
                                )}
                            </Link>}
                            <div className="admin-profile-menu">
                                <button
                                    type="button"
                                    className="profile-menu-trigger"
                                    aria-haspopup="menu"
                                    aria-expanded={profileOpen}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setProfileOpen((open) => !open);
                                    }}
                                >
                                    <span className="profile-menu-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials}</span>
                                    <span className="profile-menu-copy">
                                        <strong>{authUser?.name || t('admin.admin', 'Admin')}</strong>
                                        <small>{roleLabel}</small>
                                    </span>
                                    <Icon name="navigation" size={12} style={{ transform: profileOpen ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
                                </button>
                                {profileOpen && (
                                    <div className="profile-dropdown glass" role="menu">
                                        <div className="profile-dropdown-head">
                                            <span className="profile-menu-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials}</span>
                                            <div>
                                                <strong>{authUser?.name || t('admin.admin', 'Admin')}</strong>
                                                <small>{authUser?.email || roleLabel}</small>
                                            </div>
                                        </div>
                                        <Link href={routeWithBase('/admin/settings?section=profile', app_base)} role="menuitem" onClick={closeProfile}>
                                            <Icon name="user" size={14} />
                                            {t('admin.profile_settings', 'Profile settings')}
                                        </Link>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            disabled={logoutForm.processing}
                                            onClick={() => {
                                                closeProfile();
                                                logoutForm.post(routeWithBase('/admin/logout', app_base));
                                            }}
                                        >
                                            <Icon name="logout" size={14} />
                                            {t('admin.log_out', 'Log out')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </header>

                    {globalNotice && (
                        <div className={`admin-global-notice ${globalNotice.type}`} role="status" aria-live="polite">
                            <span className="admin-global-notice-icon"><Icon name="check" size={14} /></span>
                            <strong>{tp(globalNotice.message)}</strong>
                            <button type="button" aria-label={t('Close')} onClick={() => setGlobalNotice(null)}>
                                <Icon name="close" size={13} />
                            </button>
                        </div>
                    )}

                    {props.flash?.error && <div className="flash error" role="alert">{tp(props.flash.error)}</div>}

                    <CrudConfirm />
                    {children}
                </main>
            </div>
        </div>
    );
}

function AdminPageContent({
    children,
    title = 'Admin Panel',
    translateTitle = true,
    eyebrow,
    headingDetails,
    action,
    contentClassName = '',
    showPageHeading = true,
}) {
    const { props } = usePage();
    const { app_settings } = props;
    const t = useTranslation();
    const tp = usePhraseTranslation();
    const today = new Date().toLocaleDateString(dateLocale(), {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
    });
    const displayTitle = translateTitle ? tp(title) : title;
    const displayEyebrow = eyebrow ? tp(eyebrow) : today;
    const displayAppName = !app_settings?.app_name || app_settings.app_name === 'LaLaPick' ? 'Vintage Shop' : app_settings.app_name;

    return (
        <>
            <Head title={displayTitle ? `${displayTitle} | ${displayAppName}` : undefined}>
                {app_settings?.favicon_url && <link rel="icon" href={app_settings.favicon_url} />}
            </Head>
            <div className={`admin-content ${contentClassName}`.trim()}>
                {showPageHeading && (
                    <div className="admin-page-heading">
                        <div>
                            <p className="eyebrow">{displayEyebrow}</p>
                            <h1>{displayTitle}</h1>
                            {headingDetails}
                        </div>
                        {action}
                    </div>
                )}
                {children}
            </div>
        </>
    );
}

export function AdminPersistentShell({ active = false, children }) {
    const [mainClassName, setMainClassName] = useState('');
    const contextValue = useMemo(() => ({ setMainClassName }), []);

    useEffect(() => {
        if (!active) {
            setMainClassName('');
        }
    }, [active]);

    if (!active) {
        return children;
    }

    return (
        <AdminShellContext.Provider value={contextValue}>
            <AdminChrome mainClassName={mainClassName}>
                {children}
            </AdminChrome>
        </AdminShellContext.Provider>
    );
}

export default function AdminLayout({
    children,
    title = 'Admin Panel',
    translateTitle = true,
    eyebrow,
    headingDetails,
    action,
    mainClassName = '',
    contentClassName = '',
    showPageHeading = true,
}) {
    const shell = useContext(AdminShellContext);
    const currentPage = usePage();
    const modalDestination = crudModalDestination(currentPage);
    const [modalBusy, setModalBusy] = useState(false);

    useEffect(() => {
        if (!modalDestination) return undefined;
        return router.on('form-processing', ({ detail }) => setModalBusy(detail.processing));
    }, [modalDestination]);

    useLayoutEffect(() => {
        if (!shell) return undefined;

        shell.setMainClassName(mainClassName || '');
        return () => shell.setMainClassName('');
    }, [shell, mainClassName]);

    const content = (
        <AdminPageContent
            title={title}
            translateTitle={translateTitle}
            eyebrow={eyebrow}
            headingDetails={headingDetails}
            action={action}
            contentClassName={contentClassName}
            showPageHeading={showPageHeading}
        >
            {children}
        </AdminPageContent>
    );
    const page = modalDestination ? (
        <CrudModal open title={title} wide busy={modalBusy}
            onClose={() => router.get(currentPage.modalReturnUrl || routeWithBase(modalDestination, currentPage.props.app_base), {}, { replace: true, preserveScroll: true, showSkeleton: false })}
            action={action}>
            <AdminPageContent title={title} showPageHeading={false} contentClassName={contentClassName}>{children}</AdminPageContent>
        </CrudModal>
    ) : content;

    if (shell) {
        return page;
    }

    return (
        <AdminChrome mainClassName={mainClassName}>
            {page}
        </AdminChrome>
    );
}
