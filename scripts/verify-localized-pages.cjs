// Render source modules in memory; this does not create a Vite build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { transformSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const dictionaries = JSON.parse(execFileSync(process.env.PHP_BINARY || 'D:/xampp/php/php.exe', ['-r', "echo json_encode(['en' => require 'lang/en/navigation.php', 'my' => require 'lang/my/navigation.php'], JSON_UNESCAPED_UNICODE);"], { encoding: 'utf8' }));
let page;
const noop = () => {};
const router = {
    usePage: () => page,
    Head: () => null,
    Link: ({ children, href, ...props }) => React.createElement('a', { href, className: props.className }, children),
    useForm: data => ({ data, errors: {}, processing: false, recentlySuccessful: false, setData: noop, clearErrors: noop, reset: noop, post: noop, patch: noop, put: noop, delete: noop, transform: noop }),
    router: { on: () => noop },
};
const cache = new Map();
function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module);
    cache.set(file, mod);
    mod.paths = Module._nodeModulePaths(path.dirname(file));
    mod.require = specifier => {
        if (specifier.endsWith('.css')) return {};
        if (specifier === '@/spa/router') return router;
        if (specifier === '@/Layouts/AdminLayout') return { __esModule: true, default: ({ title, translateTitle = true, headingDetails, action, children }) => {
            const { usePhraseTranslation } = load('resources/js/Utils/i18n.js');
            const t = usePhraseTranslation();
            return React.createElement('main', {}, React.createElement('h1', {}, translateTitle ? t(title) : title), headingDetails, action, children);
        } };
        if (specifier.startsWith('@/') || specifier.startsWith('.')) {
            const base = specifier.startsWith('@/') ? path.resolve('resources/js', specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
            const target = [base, base + '.jsx', base + '.js', path.join(base, 'index.jsx')].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
            if (target) return load(target);
        }
        return require(specifier);
    };
    let code = transformSync(fs.readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic' }).code;
    if (file.endsWith('dateTime.js')) code = 'const document = global.__localeTestDocument;\n' + code;
    mod._compile(code, file);
    return mod.exports;
}

function render(file, props, locale) {
    page = { props: { locale, translations: { navigation: dictionaries[locale] }, auth: { user: { id: 1, permissions: [] } }, is_super_admin: true, app_base: '', pos_enabled: true }, url: '/admin/dashboard' };
    global.__localeTestDocument = { documentElement: { lang: locale } };
    return renderToStaticMarkup(React.createElement(load(file).default, props));
}

const cases = [
    ['resources/js/Pages/Admin/Settings/Edit.jsx', { settings: {}, canManageSettings: true }, ['Application settings', 'Application identity', 'Logo', 'Favicon']],
    ['resources/js/Pages/Admin/FinanceBook/Index.jsx', { books: { data: [], last_page: 1 }, funds: { data: [], last_page: 1 } }, ['Finance book', 'Funding history']],
    ['resources/js/Pages/Admin/Categories/Index.jsx', { categories: { data: [], last_page: 1 }, parentCategories: [] }, ['Categories']],
    ['resources/js/Pages/Admin/Bales/POS.jsx', { locations: [] }, ['Scan a price label', 'Current sale', 'Checkout']],
    ['resources/js/Pages/Admin/Bales/Finance.jsx', { entries: { data: [], last_page: 1 }, bales: { data: [], last_page: 1 } }, ['Finance', 'Cash ledger', 'Money collected']],
    ['resources/js/Pages/Admin/Bales/Suppliers.jsx', { suppliers: [] }, ['Suppliers', 'Add your first supplier to start buying bales.']],
    ['resources/js/Pages/Admin/Bales/Reports.jsx', { filters: { month: 11, year: 2026 }, defaults: {} }, ['Reports', 'Monthly sales', 'Yearly sales']],
    ['resources/js/Pages/Admin/Customers/Index.jsx', { customers: { data: [], last_page: 1 }, filters: {} }, ['Customers', 'Add customer']],
    ['resources/js/Pages/Admin/Credit/Index.jsx', { customers: { data: [], last_page: 1 } }, ['Customer credit', 'Outstanding', 'Current']],
    ['resources/js/Pages/Admin/Credit/Collections.jsx', { payments: { data: [], last_page: 1 } }, ['Collection history', 'No collections match your filters.']],
    ['resources/js/Pages/Admin/Users/Index.jsx', { users: [], filters: {}, roles: [] }, ['Team management', 'Add staff']],
    ['resources/js/Pages/Admin/Locations/Index.jsx', { locations: [], staff: [], canManage: true }, ['Warehouses']],
    ['resources/js/Pages/Admin/AuditLogs/Index.jsx', { logs: { data: [], last_page: 1 }, filters: {} }, ['Audit logs']],
    ['resources/js/Pages/Admin/Orders/Index.jsx', { orders: { data: [], last_page: 1 }, canManageOrders: true }, ['Orders', 'All-time store summary']],
    ['resources/js/Pages/Admin/Bales/Dashboard.jsx', {}, ['Dashboard', 'Buy a bale', 'Recent bales', 'Recent sales']],
    ['resources/js/Pages/Admin/Bales/Index.jsx', { bales: { data: [], last_page: 1 }, counts: {}, suppliers: [], locations: [], filters: {} }, ['Bales & stock', 'Buy a bale']],
    ['resources/js/Pages/Admin/Bales/Show.jsx', { bale: { id: 1, code: 'VB-000001', status: 'ready', supplier: { name: 'Cash' }, location: { name: 'My Branch' }, purchased_at: '2026-11-11', labels: [], purchase_cost: 100, laundry_cost: 0, total_cost: 100, total_pieces: 10, remaining: 10, pieces_sold: 0, sales_revenue: 0, bale_result: -100 }, sales: { data: [], last_page: 1 } }, ['Price groups', 'Finish this bale', 'Purchase + laundry']],
    ['resources/js/Pages/Admin/Customers/Show.jsx', { customer: { id: 1, name: 'Cash', phone: '09987654321', default_address: 'Cash Road', credit_status: 'active' }, stats: {}, recentOrders: [], topCategories: [], creditTransactions: [], creditOrders: [], creditSummary: { balance: 2000, overdue: 0, limit: 5000 } }, ['Outstanding balance', 'Credit transaction history', 'Recent orders']],
    ['resources/js/Pages/Admin/Roles/Index.jsx', { roles: [{ id: 1, name: 'staff', display_name: 'Staff', is_system: true, is_locked: true, users_count: 1, permissions: ['catalog.view'] }], permissionGroups: [{ group: 'Bales and stock', items: [{ value: 'catalog.view', label: 'View bales and suppliers', description: 'View bale stock, costs, results, suppliers and price labels.' }] }] }, ['Find a permission', 'Bales and stock', 'View bales and suppliers']],
];

for (const [file, props, phrases] of cases) {
    const en = render(file, props, 'en');
    const my = render(file, props, 'my');
    for (const phrase of phrases) {
        assert(en.includes(phrase.replaceAll('&', '&amp;')), `${file}: missing English ${phrase}`);
        const translated = dictionaries.my.phrases[phrase];
        assert(translated && translated !== phrase, `${phrase}: no Myanmar translation`);
        assert(my.includes(translated), `${file}: Myanmar render missing ${phrase}`);
    }
    if (file.includes('Customers/Show')) {
        assert(my.includes('<h1>Cash</h1>'), 'Customer name must remain unchanged.');
        assert(my.includes('Cash Road'), 'Customer address must remain unchanged.');
    }
    if (file.includes('Settings/Edit')) {
        assert(!en.includes('type="color"'), 'Settings must not expose color configuration.');
        assert(!en.includes('<strong>Branding</strong>'), 'Branding must be part of General rather than a separate tab.');
    }
    if (file.includes('Bales/Show')) assert(my.includes('Cash'), 'Supplier name must remain unchanged.');
    console.log('English/Myanmar source render passed: ' + file);
}
