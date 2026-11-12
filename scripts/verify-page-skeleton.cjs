const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transformSync } = require('esbuild');
const moduleUnderTest = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync('resources/js/Components/Spa/PageSkeleton.jsx', 'utf8'), {
    loader: 'jsx', format: 'cjs', jsx: 'automatic',
}).code, {
    module: moduleUnderTest, exports: moduleUnderTest.exports, URL,
    window: { location: { origin: 'http://localhost' } },
    require: name => name === '@/Utils/i18n' ? { usePhraseTranslation: () => text => text } : require(name),
});
const { default: Skeleton, skeletonRouteInfo } = moduleUnderTest.exports;
for (const [path, mode, layout] of [
    ['/admin/login', 'auth', 'listing'], ['/admin/dashboard', 'admin', 'dashboard'],
    ['/admin/settings?section=profile', 'admin', 'form'], ['/admin/orders/1/edit-pos-sale', 'admin', 'form'],
    ['/admin/credit/collections', 'admin', 'listing'], ['/admin/inventory/receipts', 'admin', 'listing'],
    ['/admin/bales/1', 'admin', 'detail'],
]) {
    const url = '/vintage-shop/public' + path;
    const info = skeletonRouteInfo(url, '/vintage-shop/public');
    assert.equal(info.mode, mode, path + ': wrong workspace');
    assert.equal(info.layout, layout, path + ': wrong layout');
    const html = renderToStaticMarkup(React.createElement(Skeleton, { url, appBase: '/vintage-shop/public' }));
    assert(html.includes('spa-page-skeleton-' + mode));
    assert(!html.includes('storefront'));
}
console.log('Loading screens passed: staff login, dashboard, settings, sale editing, collections, receipts and bale detail under a subdirectory.');
