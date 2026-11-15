import React, { Children, createContext, forwardRef, isValidElement, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { crudModalDestination } from './crudRoutes';

const PageContext = createContext({ component: null, props: {}, url: '/' });
const listeners = new Map();

let spaState = {
    page: null,
    setPage: null,
    resolve: null,
    beginNavigation: null,
    finishNavigation: null,
};
let visitSequence = 0;
let latestGetVisitId = 0;
let activeGetController = null;

function emit(event, payload) {
    (listeners.get(event) || new Set()).forEach((callback) => callback(payload));
}

function csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
}

function syncCsrfToken(token) {
    if (!token) return;

    let meta = document.querySelector('meta[name="csrf-token"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'csrf-token');
        document.head.appendChild(meta);
    }

    meta.setAttribute('content', token);

    if (window.axios) {
        window.axios.defaults.headers.common['X-CSRF-TOKEN'] = token;
    }
}

async function refreshCsrfToken() {
    const response = await fetch(window.__csrfRefreshUrl || '/csrf-token', {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });

    if (!response.ok) {
        return null;
    }

    const headerToken = response.headers.get('x-csrf-token');
    let payloadToken = null;

    try {
        const payload = await response.json();
        payloadToken = payload?.csrf_token || null;
    } catch {
        // The endpoint should return JSON, but the header is enough if present.
    }

    const token = payloadToken || headerToken;
    syncCsrfToken(token);

    return token;
}

function isModifiedClick(event) {
    return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0;
}

function normalizeUrl(url) {
    if (!url) return window.location.pathname + window.location.search;
    return String(url);
}

function appendQuery(url, data = {}) {
    const parsed = new URL(normalizeUrl(url), window.location.origin);

    Object.entries(data || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
            parsed.searchParams.delete(key);
        } else {
            parsed.searchParams.set(key, String(value));
        }
    });

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function hasFiles(value) {
    if (!value) return false;
    if (value instanceof File || value instanceof Blob || value instanceof FileList) return true;
    if (Array.isArray(value)) return value.some(hasFiles);
    if (typeof value === 'object') return Object.values(value).some(hasFiles);
    return false;
}

function appendFormValue(formData, key, value) {
    if (value === undefined || value === null) {
        formData.append(key, '');
        return;
    }

    if (value instanceof FileList) {
        Array.from(value).forEach((file, index) => formData.append(`${key}[${index}]`, file));
        return;
    }

    if (value instanceof File || value instanceof Blob) {
        formData.append(key, value);
        return;
    }

    if (Array.isArray(value)) {
        value.forEach((item, index) => appendFormValue(formData, `${key}[${index}]`, item));
        return;
    }

    if (typeof value === 'object') {
        Object.entries(value).forEach(([childKey, childValue]) => appendFormValue(formData, `${key}[${childKey}]`, childValue));
        return;
    }

    if (typeof value === 'boolean') {
        formData.append(key, value ? '1' : '0');
        return;
    }

    formData.append(key, value);
}

function objectToFormData(data) {
    const formData = new FormData();
    Object.entries(data || {}).forEach(([key, value]) => appendFormValue(formData, key, value));
    return formData;
}

function flattenErrors(errors = {}) {
    return Object.fromEntries(
        Object.entries(errors).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
    );
}

function valueAtPath(source, path) {
    return path.split('.').reduce((value, key) => value?.[key], source);
}

function interpolate(value, replacements = {}) {
    return Object.entries(replacements).reduce(
        (text, [key, replacement]) => text.replaceAll(`:${key}`, replacement),
        value,
    );
}

function translatePhrase(page, text) {
    if (typeof text !== 'string' || text === '') {
        return text;
    }

    const phrases = valueAtPath(page?.props?.translations || {}, 'navigation.phrases') || {};
    if (typeof phrases[text] === 'string') {
        return phrases[text];
    }

    const dynamicPatterns = [
        ['Order ', 'Order :value'],
        ['Customer ', 'Customer :value'],
        ['Edit ', 'Edit :value'],
        ['Chat • ', 'Chat • :value'],
    ];

    for (const [prefix, key] of dynamicPatterns) {
        if (text.startsWith(prefix) && typeof phrases[key] === 'string') {
            return interpolate(phrases[key], { value: text.slice(prefix.length) });
        }
    }

    if (text.endsWith(' Inventory') && typeof phrases[':value Inventory'] === 'string') {
        return interpolate(phrases[':value Inventory'], { value: text.slice(0, -10) });
    }

    return text;
}

function requestBody(data, method, options = {}) {
    if (method === 'get') return { body: undefined, headers: {} };
    if (data instanceof FormData) return { body: data, headers: {} };
    if (options.forceFormData || hasFiles(data)) return { body: objectToFormData(data), headers: {} };

    return {
        body: JSON.stringify(data || {}),
        headers: { 'Content-Type': 'application/json' },
    };
}

function uploadRequest(url, method, body, headers, signal, onProgress) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        const requestUrl = new URL(url, window.location.href).href;
        request.open(method.toUpperCase(), url, true);
        request.withCredentials = true;

        Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
        request.upload.addEventListener('progress', (event) => {
            if (!event.lengthComputable) return;
            onProgress?.({
                loaded: event.loaded,
                total: event.total,
                percentage: Math.min(100, Math.round((event.loaded / event.total) * 100)),
            });
        });
        request.addEventListener('load', () => {
            const responseHeaders = new Headers();
            request.getAllResponseHeaders().trim().split(/[\r\n]+/).filter(Boolean).forEach((line) => {
                const separator = line.indexOf(':');
                if (separator > 0) responseHeaders.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
            });
            resolve({
                status: request.status,
                ok: request.status >= 200 && request.status < 300,
                redirected: Boolean(request.responseURL) && request.responseURL !== requestUrl,
                url: request.responseURL || url,
                headers: responseHeaders,
                json: async () => JSON.parse(request.responseText),
                text: async () => request.responseText,
            });
        });
        request.addEventListener('error', () => reject(new TypeError('Network request failed.')));
        request.addEventListener('abort', () => reject(new DOMException('The request was aborted.', 'AbortError')));
        signal?.addEventListener('abort', () => request.abort(), { once: true });
        request.send(body);
    });
}

async function applyPage(page, options = {}) {
    if (!page?.component || !spaState.setPage) return;

    document.documentElement.lang = page.props?.locale || 'en';
    spaState.setPage(page);
    emit('navigate', { detail: { page } });

    if (!options.preserveScroll) {
        window.scrollTo({ top: 0, left: 0 });
    }
}

async function parseSpaResponse(response, options = {}) {
    const contentType = response.headers.get('content-type') || '';

    if (response.status === 422 && contentType.includes('application/json')) {
        const payload = await response.json();
        const errors = flattenErrors(payload.errors || {});
        options.onError?.(errors);
        return { errors };
    }

    if (response.status === 409 && contentType.includes('application/json')) {
        const payload = await response.json();
        const errors = flattenErrors(payload.errors || { conflict: payload.message || 'This record changed. Reload and review it before saving.' });
        options.onError?.(errors);
        return { errors };
    }

    if (!response.ok && response.status !== 409) {
        if (contentType.includes('application/json')) {
            const payload = await response.json();
            options.onError?.(flattenErrors(payload.errors || { request: payload.message || 'Unable to save. Please try again.' }));
            return payload;
        }

        if (String(options.method || 'get').toLowerCase() !== 'get' && options.onError) {
            options.onError({ request: 'Unable to save. Please try again.' });
            return null;
        }
        window.location.assign(response.url || window.location.href);
        return null;
    }

    if (!contentType.includes('application/json')) {
        window.location.assign(response.url || window.location.href);
        return null;
    }

    const page = await response.json();
    const pageErrors = flattenErrors(page?.props?.errors || {});
    if (page?.props?.flash?.error && !Object.keys(pageErrors).length) {
        pageErrors.error = page.props.flash.error;
    }
    const hasPageErrors = Object.keys(pageErrors).length > 0;

    if (hasPageErrors && String(options.method || 'get').toLowerCase() !== 'get') {
        // A failed form owns its errors. Keep its page and modal mounted,
        // rather than flashing the same errors in the background page.
        if (!options.onError) await applyPage(page, options);
        options.onError?.(pageErrors);
        return page;
    }

    await applyPage(page, options);
    options.onSuccess?.(page);
    return page;
}

export const router = {
    on(event, callback) {
        if (!listeners.has(event)) {
            listeners.set(event, new Set());
        }

        listeners.get(event).add(callback);
        return () => listeners.get(event)?.delete(callback);
    },

    async visit(url, options = {}) {
        const method = String(options.method || 'get').toLowerCase();
        const target = method === 'get' ? appendQuery(url, options.data || {}) : normalizeUrl(url);
        const isGet = method === 'get';
        const visitId = ++visitSequence;
        const previousUrl = window.location.pathname + window.location.search + window.location.hash;
        const isFormUrl = /\/(create|edit|import)(?:[?#]|$)/.test(target);
        if (isFormUrl) options = { ...options, preserveScroll: true };
        const showSkeleton = isGet && !isFormUrl && options.showSkeleton !== false;
        const controller = isGet ? new AbortController() : null;

        options.onStart?.();

        if (isGet) {
            activeGetController?.abort();
            activeGetController = controller;
            latestGetVisitId = visitId;

            if (options.replace) {
                window.history.replaceState({}, '', target);
            } else if (target !== previousUrl) {
                window.history.pushState({}, '', target);
            }

            if (showSkeleton) {
                spaState.beginNavigation?.({
                    id: visitId,
                    method,
                    url: target,
                });
                emit('start', { detail: { method, url: target } });
            }

            if (!options.preserveScroll) {
                window.scrollTo({ top: 0, left: 0 });
            }
        }

        try {
            const send = () => {
                const { body, headers } = requestBody(options.data, method, options);

                const requestHeaders = {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-SPA': 'true',
                    'X-CSRF-TOKEN': csrfToken(),
                    ...headers,
                };

                if (body instanceof FormData && typeof options.onProgress === 'function') {
                    return uploadRequest(target, method, body, requestHeaders, controller?.signal, options.onProgress);
                }

                return fetch(target, {
                    method: method.toUpperCase(),
                    body,
                    credentials: 'same-origin',
                    headers: requestHeaders,
                    signal: controller?.signal,
                });
            };

            let response = await send();
            syncCsrfToken(response.headers.get('x-csrf-token'));

            if (response.status === 419 && !options.__csrfRetry) {
                const token = await refreshCsrfToken();
                if (token) {
                    response = await send();
                    syncCsrfToken(response.headers.get('x-csrf-token'));
                }
            }

            if (isGet && visitId !== latestGetVisitId) {
                return null;
            }

            if (response.redirected && response.url) {
                const redirectedUrl = new URL(response.url);
                window.history.replaceState({}, '', redirectedUrl.pathname + redirectedUrl.search + redirectedUrl.hash);
            }

            // Fetch/XHR already followed the redirect and returned fresh page props.
            // Complete the submission from that response, preserving its flash/errors.
            const page = await parseSpaResponse(response, options);
            if (!response.redirected && isGet && !page?.component && visitId === latestGetVisitId) {
                window.history.replaceState({}, '', previousUrl);
            }

            return page;
        } catch (error) {
            if (error?.name === 'AbortError') {
                return null;
            }

            if (isGet && visitId === latestGetVisitId) {
                window.history.replaceState({}, '', previousUrl);
            }

            if (!isGet && options.onError) {
                options.onError({ network: error?.message || 'Network request failed.' });
                return null;
            }

            throw error;
        } finally {
            if (isGet && activeGetController === controller) {
                activeGetController = null;
            }
            if (showSkeleton) {
                spaState.finishNavigation?.(visitId);
                emit('finish', { detail: { method, url: target } });
            }
            options.onFinish?.();
        }
    },

    get(url, data = {}, options = {}) {
        return this.visit(url, { ...options, method: 'get', data });
    },

    post(url, data = {}, options = {}) {
        return this.visit(url, { ...options, method: 'post', data });
    },

    put(url, data = {}, options = {}) {
        return this.visit(url, { ...options, method: 'put', data });
    },

    patch(url, data = {}, options = {}) {
        return this.visit(url, { ...options, method: 'patch', data });
    },

    delete(url, data = {}, options = {}) {
        const optionKeys = ['preserveScroll', 'preserveState', 'replace', 'refreshRedirected', 'onSuccess', 'onError', 'onFinish', 'onStart', 'only'];
        const dataLooksLikeOptions = options && Object.keys(options).length === 0
            && data
            && typeof data === 'object'
            && !(data instanceof FormData)
            && Object.keys(data).some((key) => optionKeys.includes(key));

        if (dataLooksLikeOptions) {
            return this.visit(url, { ...data, method: 'delete', data: {} });
        }

        return this.visit(url, { ...options, method: 'delete', data });
    },

    reload(options = {}) {
        return this.visit(window.location.pathname + window.location.search, { ...options, replace: true });
    },
};

export function usePage() {
    return useContext(PageContext);
}

export function PageScope({ page, children }) {
    return <PageContext.Provider value={page}>{children}</PageContext.Provider>;
}

export const Link = forwardRef(function Link(
    { as, href = '#', method = 'get', data = {}, replace = false, preserveScroll = false, preserveState = false, onClick, children, ...props },
    ref,
) {
    const tag = as || (String(method).toLowerCase() === 'get' ? 'a' : 'button');
    const Tag = tag;
    const resolvedHref = normalizeUrl(href);

    const handleClick = (event) => {
        onClick?.(event);
        if (event.defaultPrevented || isModifiedClick(event)) return;

        event.preventDefault();
        router.visit(resolvedHref, {
            method,
            data,
            replace,
            preserveScroll,
            preserveState,
        });
    };

    const tagProps = tag === 'a'
        ? { href: resolvedHref }
        : { type: props.type || 'button' };

    return (
        <Tag ref={ref} {...tagProps} {...props} onClick={handleClick}>
            {children}
        </Tag>
    );
});

export function Head({ title, children }) {
    const page = useContext(PageContext);
    const translatedTitle = translatePhrase(page, title);

    useEffect(() => {
        if (translatedTitle) {
            document.title = translatedTitle;
        }
    }, [translatedTitle]);

    useEffect(() => {
        const nodes = [];

        const appendNode = (element) => {
            if (!isValidElement(element)) return;

            if (element.type === React.Fragment) {
                Children.forEach(element.props.children, appendNode);
                return;
            }

            if (!['link', 'meta'].includes(element.type)) return;

            const node = document.createElement(element.type);
            Object.entries(element.props || {}).forEach(([key, value]) => {
                if (key === 'children' || value === false || value == null) return;
                node.setAttribute(key === 'className' ? 'class' : key, String(value));
            });
            node.setAttribute('data-spa-head', 'true');
            document.head.appendChild(node);
            nodes.push(node);
        };

        Children.forEach(children, appendNode);

        return () => {
            nodes.forEach((node) => node.remove());
        };
    }, [children]);

    return null;
}

export function useForm(initialData = {}) {
    const defaults = useRef(initialData);
    const transformRef = useRef((data) => data);
    const submitting = useRef(false);
    const [data, setFormData] = useState(initialData);
    const [errors, setErrors] = useState({});
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(null);
    const [recentlySuccessful, setRecentlySuccessful] = useState(false);

    const setData = (key, value) => {
        if (typeof key === 'object') {
            setFormData(key);
            return;
        }

        setFormData((current) => ({ ...current, [key]: value }));
    };

    const reset = (...fields) => {
        if (fields.length === 0) {
            setFormData(defaults.current);
            return;
        }

        setFormData((current) => {
            const next = { ...current };
            fields.forEach((field) => {
                next[field] = defaults.current[field] ?? '';
            });
            return next;
        });
    };

    const clearErrors = (...fields) => {
        if (fields.length === 0) {
            setErrors({});
            return;
        }

        setErrors((current) => {
            const next = { ...current };
            fields.forEach((field) => delete next[field]);
            return next;
        });
    };

    const setError = (key, value) => {
        if (typeof key === 'object') {
            setErrors(flattenErrors(key));
            return;
        }

        setErrors((current) => ({ ...current, [key]: value }));
    };

    const transform = (callback) => {
        transformRef.current = callback;
        return form;
    };

    const submit = async (method, url, options = {}) => {
        if (submitting.current) return;
        submitting.current = true;
        setProcessing(true);
        emit('form-processing', { detail: { processing: true } });
        setProgress(null);
        setRecentlySuccessful(false);
        setErrors({});

        const { data: explicitData, ...visitOptions } = options;
        const payload = explicitData === undefined ? transformRef.current(data) : explicitData;

        return router.visit(url, {
            ...visitOptions,
            method,
            data: payload,
            onProgress: (nextProgress) => {
                setProgress(nextProgress);
                options.onProgress?.(nextProgress);
            },
            onError: (nextErrors) => {
                setErrors(nextErrors);
                options.onError?.(nextErrors);
            },
            onSuccess: (page) => {
                setErrors({});
                setRecentlySuccessful(true);
                window.setTimeout(() => setRecentlySuccessful(false), 2000);
                options.onSuccess?.(page);
            },
            onFinish: () => {
                submitting.current = false;
                setProcessing(false);
                emit('form-processing', { detail: { processing: false } });
                setProgress(null);
                options.onFinish?.();
            },
        });
    };

    const form = useMemo(() => ({
        data,
        setData,
        errors,
        processing,
        progress,
        recentlySuccessful,
        transform,
        reset,
        clearErrors,
        setError,
        submit,
        get: (url, options) => submit('get', url, options),
        post: (url, options) => submit('post', url, options),
        put: (url, options) => submit('put', url, options),
        patch: (url, options) => submit('patch', url, options),
        delete: (url, options) => submit('delete', url, options),
    }), [data, errors, processing, progress, recentlySuccessful]);

    return form;
}

export function SpaApp({ initialPage, resolve, render }) {
    const [page, setPage] = useState(initialPage);
    const [componentEntry, setComponentEntry] = useState(null);
    const [navigation, setNavigation] = useState(null);
    const [background, setBackground] = useState(null);
    const backgroundRef = useRef(null);

    useEffect(() => {
        spaState = {
            page,
            setPage: (nextPage) => {
                if (crudModalDestination(nextPage)) {
                    if (!crudModalDestination(page) && componentEntry?.name === page.component) {
                        backgroundRef.current = { page, Component: componentEntry.Component };
                    }
                } else {
                    if (backgroundRef.current?.page.component === nextPage.component) {
                        setComponentEntry({ name: nextPage.component, Component: backgroundRef.current.Component });
                    }
                    backgroundRef.current = null;
                }
                setBackground(backgroundRef.current);
                setPage(nextPage);
            },
            resolve,
            beginNavigation: setNavigation,
            finishNavigation: (visitId) => {
                setNavigation((current) => current?.id === visitId ? null : current);
            },
        };
    }, [page, resolve, componentEntry]);

    useEffect(() => {
        let mounted = true;

        resolve(page.component).then((module) => {
            if (mounted) {
                setComponentEntry({
                    name: page.component,
                    Component: module.default || module,
                });
            }
        });

        return () => {
            mounted = false;
        };
    }, [page.component, resolve]);

    useEffect(() => {
        const onPopState = () => {
            router.visit(window.location.pathname + window.location.search, {
                replace: true,
                preserveScroll: true,
            });
        };

        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    const isCurrentComponentReady = componentEntry && componentEntry.name === page.component;
    const Component = isCurrentComponentReady ? componentEntry.Component : null;
    const displayPage = navigation
        ? { ...page, url: navigation.url }
        : { ...page, modalReturnUrl: background?.page.url };
    const loading = Boolean(navigation) || !isCurrentComponentReady;

    return (
        <PageContext.Provider value={displayPage}>
            {render({
                Component: loading ? null : Component,
                page: displayPage,
                loading,
                pendingUrl: navigation?.url || null,
                background,
            })}
        </PageContext.Provider>
    );
}
