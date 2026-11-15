const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');

// Execute the real router with isolated transport and browser dependencies.
const compiled = transformSync(fs.readFileSync('resources/js/spa/router.jsx', 'utf8'), {
    loader: 'jsx', format: 'cjs',
}).code;

function harness(send) {
    const events = [];
    const requests = [];
    const appliedPages = [];
    const location = { pathname: '/admin/users', search: '', hash: '', origin: 'http://localhost' };
    const window = {
        location,
        history: {
            replaceState(_state, _title, url) { const next = new URL(url, location.origin); Object.assign(location, { pathname: next.pathname, search: next.search, hash: next.hash }); },
            pushState() {},
        },
        scrollTo() {},
        setTimeout() {},
    };
    const module = { exports: {} };
    vm.runInNewContext(compiled + '\nspaState.setPage = page => appliedPages.push(page);', {
        module, exports: module.exports, appliedPages,
        require: name => name === './crudRoutes' ? { crudModalDestination: () => null } : require(name),
        window, document: { querySelector: () => null, documentElement: {} },
        URL, Headers, FormData, File, Blob, FileList: class FileList {}, AbortController, console,
        fetch: async (url, options) => { requests.push({ url, ...options }); return send(url, options); },
    });
    const router = module.exports.router;
    return {
        router, events, requests, appliedPages, window, useForm: module.exports.useForm,
        submit: () => router.post('/admin/users', { name: 'Staff' }, {
            onSuccess: () => events.push('success'),
            onError: errors => events.push({ errors: { ...errors } }),
            onFinish: () => events.push('finish'),
        }),
    };
}

function response(payload, { status = 200, redirected = false, url = 'http://localhost/admin/users' } = {}) {
    return { status, ok: status >= 200 && status < 300, redirected, url,
        headers: new Headers({ 'content-type': 'application/json' }), json: async () => payload };
}

test('redirect success closes once from the returned page, with no extra GET', async () => {
    const h = harness(() => response({ component: 'Admin/Users/Index', props: { flash: { success: 'Saved' } } }, { redirected: true }));
    await h.submit();
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.events, ['success', 'finish']);
    assert.equal(h.appliedPages.length, 1);
});

test('direct JSON success completes once', async () => {
    const h = harness(() => response({ user: { id: 2 }, message: 'Saved' }));
    await h.submit();
    assert.deepEqual(h.events, ['success', 'finish']);
});

test('pending submissions stay busy until the response is handled', async () => {
    let release;
    const h = harness(() => new Promise(resolve => { release = resolve; }));
    const pending = h.submit();
    assert.deepEqual(h.events, []);
    release(response({ component: 'Admin/Users/Index', props: {} }, { redirected: true }));
    await pending;
    assert.deepEqual(h.events, ['success', 'finish']);
});

test('422 validation retains the form and reports field errors', async () => {
    const h = harness(() => response({ errors: { name: ['Name is required.'] } }, { status: 422 }));
    await h.submit();
    assert.deepEqual(h.events, [{ errors: { name: 'Name is required.' } }, 'finish']);
});

test('redirected validation errors cannot become success or be consumed by another GET', async () => {
    const h = harness(() => response({ component: 'Admin/Users/Index', props: { errors: { name: 'Invalid name.' } } }, { redirected: true }));
    await h.submit();
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.events, [{ errors: { name: 'Invalid name.' } }, 'finish']);
    assert.equal(h.appliedPages.length, 0, 'Failed submission cannot replace the page containing its modal');
});

test('error flash from a refused deletion retains the modal', async () => {
    const h = harness(() => response({ component: 'Admin/Users/Index', props: { flash: { error: 'At least one Super Admin must remain.' } } }, { redirected: true }));
    await h.submit();
    assert.deepEqual(h.events, [{ errors: { error: 'At least one Super Admin must remain.' } }, 'finish']);
    assert.equal(h.requests.length, 1);
    assert.equal(h.appliedPages.length, 0, 'Error flash belongs to the submitting form');
});

test('409 page response reports a conflict instead of silently finishing', async () => {
    const h = harness(() => response({ component: 'Admin/Users/Index', props: {} }, { status: 409 }));
    await h.submit();
    assert.equal(h.events[0].errors.conflict, 'This record changed. Reload and review it before saving.');
    assert.equal(h.events[1], 'finish');
});

test('network failure reports an error and clears busy without success', async () => {
    const h = harness(() => { throw new TypeError('Connection interrupted.'); });
    await h.submit();
    assert.deepEqual(h.events, [{ errors: { network: 'Connection interrupted.' } }, 'finish']);
});

test('HTTP failure reports its message inside the form without leaking exception details', async () => {
    const h = harness(() => response({ message: 'Unable to update branch.', exception: 'MethodNotAllowedHttpException', trace: [{ file: '/server/internal.php' }] }, { status: 405 }));
    await h.submit();
    assert.deepEqual(h.events, [{ errors: { request: 'Unable to update branch.' } }, 'finish']);
    assert.equal(h.appliedPages.length, 0);
});

test('HTML server errors keep the form open instead of navigating away', async () => {
    const h = harness(() => ({ status: 500, ok: false, headers: new Headers({ 'content-type': 'text/html' }) }));
    await h.submit();
    assert.deepEqual(h.events, [{ errors: { request: 'Unable to save. Please try again.' } }, 'finish']);
    assert.equal(h.appliedPages.length, 0);
});

test('redirect URL is committed before success callbacks navigate elsewhere', async () => {
    const h = harness(() => response({ component: 'Admin/Users/Index', props: {} }, { redirected: true }));
    await h.router.post('/admin/users', {}, { onSuccess: () => h.window.history.replaceState({}, '', '/admin/roles') });
    assert.equal(h.window.location.pathname, '/admin/roles');
});

test('useForm blocks duplicate submissions and permits retry after failure', async () => {
    let release;
    const h = harness(() => new Promise(resolve => { release = resolve; }));
    let form;
    const React = require('react');
    require('react-dom/server').renderToString(React.createElement(() => {
        form = h.useForm({ name: 'Staff' });
        return null;
    }));
    const processing = [];
    h.router.on('form-processing', event => processing.push(event.detail.processing));
    const first = form.post('/admin/users');
    await form.post('/admin/users');
    assert.equal(h.requests.length, 1);
    assert.deepEqual(processing, [true]);
    release(response({ errors: { name: ['Invalid name.'] } }, { status: 422 }));
    await first;
    assert.deepEqual(processing, [true, false]);
    const retry = form.post('/admin/users');
    assert.equal(h.requests.length, 2);
    release(response({ message: 'Saved' }));
    await retry;
    assert.deepEqual(processing, [true, false, true, false]);
});
