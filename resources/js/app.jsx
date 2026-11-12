import './bootstrap';
import '../css/app.css';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import { createUserTheme } from './Theme/UserTheme';
import { SpaApp, router, PageScope } from './spa/router';
import { AdminPersistentShell } from './Layouts/AdminLayout';
import { configurePricing } from './Utils/pricing';
import PageSkeleton, { skeletonRouteInfo } from './Components/Spa/PageSkeleton';
import './styles/input-focus.css';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 15_000,
            gcTime: 30 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
        },
        mutations: {
            retry: 0,
        },
    },
});

const pages = import.meta.glob('./Pages/**/*.jsx');
const el = document.getElementById('app');

const normalizeDuplicatedBasePath = (pathname, base) => {
    if (!pathname || !base || base === '/') {
        return pathname;
    }

    const cleanBase = `/${String(base).replace(/^\/+|\/+$/g, '')}`;
    if (cleanBase === '/') {
        return pathname;
    }

    const doubled = `${cleanBase}${cleanBase}`;
    let nextPath = pathname;

    while (nextPath === doubled || nextPath.startsWith(`${doubled}/`)) {
        nextPath = nextPath.substring(cleanBase.length);
    }

    return nextPath;
};

const stripBasePath = (pathname, base) => {
    if (!pathname || !base || base === '/') {
        return pathname || '/';
    }

    const cleanBase = `/${String(base).replace(/^\/+|\/+$/g, '')}`;
    if (pathname === cleanBase) {
        return '/';
    }

    return pathname.startsWith(`${cleanBase}/`) ? pathname.substring(cleanBase.length) : pathname;
};

const normalizeCurrentBrowserUrl = (base) => {
    const correctedPath = normalizeDuplicatedBasePath(window.location.pathname, base);
    if (correctedPath !== window.location.pathname) {
        window.history.replaceState(null, '', `${correctedPath}${window.location.search}${window.location.hash}`);
    }
};

const resolvePage = async (name) => {
    const loader = pages[`./Pages/${name}.jsx`];

    if (!loader) {
        throw new Error(`SPA page component not found: ${name}`);
    }

    return loader();
};

const usesPersistentAdminShell = (page) => {
    const component = page?.component;


    if (!String(component || '').startsWith('Admin/')) {
        return false;
    }

    return component !== 'Admin/POS/Index';
};

if (el && window.__SPA_PAGE__) {
    const initialPage = window.__SPA_PAGE__;
    const base = initialPage.props.app_base || '';
    const cleanBase = base && base !== '/' ? `/${String(base).replace(/^\/+|\/+$/g, '')}` : '';
    const pathInApp = stripBasePath(window.location.pathname, cleanBase);
    const csrfRefreshPath = pathInApp === '/admin' || pathInApp.startsWith('/admin/')
        ? `${cleanBase}/admin/csrf-token`
        : `${cleanBase}/csrf-token`;

    normalizeCurrentBrowserUrl(base);
    window.setCsrfRefreshUrl?.(csrfRefreshPath);
    window.configureRealtime?.(base);
    router.on('navigate', () => normalizeCurrentBrowserUrl(base));

    createRoot(el).render(
        <QueryClientProvider client={queryClient}>
            <SpaApp
                initialPage={initialPage}
                resolve={resolvePage}
                render={({ Component, page, loading, pendingUrl, background }) => {
                    configurePricing(page.props.app_settings || {});
                    const routeInfo = skeletonRouteInfo(pendingUrl || page.url, page.props.app_base || '');
                    const adminShellActive = pendingUrl
                        ? routeInfo.mode === 'admin' && routeInfo.path !== '/admin/pos'
                        : usesPersistentAdminShell(page);
                    const ContentComponent = background?.Component || Component;
                    const contentPage = background?.page || page;

                    return (
                        <ThemeProvider theme={createUserTheme(page.props.app_settings || {})}>
                            <AdminPersistentShell active={adminShellActive}>
                                <PageScope page={contentPage}>
                                    {ContentComponent
                                        ? <ContentComponent
                                            key={contentPage.component === 'Admin/POS/Index' ? `${contentPage.component}:${contentPage.url}` : contentPage.component}
                                            {...contentPage.props}
                                        />
                                        : <PageSkeleton url={pendingUrl || page.url} appBase={page.props.app_base || ''} />}
                                </PageScope>
                                {background && !loading && <Component key={page.component} {...page.props} />}
                            </AdminPersistentShell>
                        </ThemeProvider>
                    );
                }}
            />
        </QueryClientProvider>,
    );
}
