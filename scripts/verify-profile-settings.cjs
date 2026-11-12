// Exercise the actual staff forms without a build, account update or upload.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { transformSync } = require('esbuild');
const puppeteer = require('puppeteer');
const files = {
    '@/ProfileForm': 'resources/js/Components/Admin/SettingsProfileForm.jsx',
    '@/PasswordForm': 'resources/js/Components/Admin/SettingsPasswordForm.jsx',
    '@/Components/Admin/ProfileEditorFields': 'resources/js/Components/Admin/ProfileEditorFields.jsx',
    '@/Components/Admin/SettingsField': 'resources/js/Components/Admin/SettingsField.jsx',
    '@/Components/Admin/SettingsSaveBar': 'resources/js/Components/Admin/SettingsSaveBar.jsx',
    '@/Components/Admin/icons': 'resources/js/Components/Admin/icons.jsx',
};
async function main() {
    const modules = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code]));
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(8000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setContent('<main class="app-root vintage-admin"><div id="root"></div></main>');
        await page.addScriptTag({ path: 'node_modules/react/umd/react.development.js' });
        await page.addScriptTag({ path: 'node_modules/react-dom/umd/react-dom.development.js' });
        await page.evaluate(modules => {
            const cache = {};
            window.submissions = [];
            const translate = (text, values = {}) => Object.entries(values).reduce((result, [key, value]) => result?.replace(':' + key, value), text);
            const useForm = defaults => {
                const [data, setState] = React.useState(defaults);
                const setData = (key, value) => setState(current => typeof key === 'object' ? key : { ...current, [key]: value });
                const transform = React.useRef(value => value);
                const submit = (method, url, options) => {
                    const payload = transform.current(data);
                    window.submissions.push({ method, url, payload });
                    options.onSuccess?.({ status: 'password-updated' });
                    options.onFinish?.();
                };
                return { data, setData, errors: {}, processing: false, recentlySuccessful: false,
                    clearErrors: () => {}, transform: value => transform.current = value,
                    reset: (...fields) => setState(current => fields.length ? { ...current, ...Object.fromEntries(fields.map(field => [field, defaults[field]])) } : defaults),
                    post: (url, options) => submit('post', url, options), patch: (url, options) => submit('patch', url, options), put: (url, options) => submit('put', url, options),
                };
            };
            const require = name => {
                if (name === 'react') return React;
                if (name === 'react-dom') return ReactDOM;
                if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => React.createElement(type, { ...props, key }), jsxs: (type, props, key) => React.createElement(type, { ...props, key }) };
                if (name === '@/spa/router') return { useForm, usePage: () => ({ props: { auth: { user: { name: 'Staff member', email: 'staff@example.invalid' } }, app_base: '' } }) };
                if (name === '@/Utils/i18n') return { usePhraseTranslation: () => translate };
                if (name === '@/Utils/url') return { routeWithBase: path => path, storageUrl: path => path };
                if (name === '@mui/material') return {
                    IconButton: ({ children, edge, size, ...props }) => React.createElement('button', props, children),
                    InputAdornment: ({ children }) => React.createElement('span', {}, children),
                };
                if (name === '@mui/icons-material') return { Visibility: () => null, VisibilityOff: () => null };
                if (name === '@/Components/Admin/CropImageModal') return { __esModule: true, default: props => props.open ? React.createElement('div', { role: 'dialog' },
                    React.createElement('button', { id: 'cancel-crop', onClick: props.onCancel }, 'Cancel'),
                    React.createElement('button', { id: 'apply-crop', onClick: () => props.onCropComplete(new Blob(['image'], { type: 'image/png' })) }, 'Apply')) : null };
                if (cache[name]) return cache[name].exports;
                if (!modules[name]) throw Error('Unexpected import: ' + name);
                const module = { exports: {} };
                cache[name] = module;
                new Function('module', 'exports', 'require', modules[name])(module, module.exports, require);
                return module.exports;
            };
            const root = ReactDOM.createRoot(document.getElementById('root'));
            window.showForm = kind => {
                const Form = require(kind === 'profile' ? '@/ProfileForm' : '@/PasswordForm').default;
                function Harness() {
                    const [target, setTarget] = React.useState(null);
                    return React.createElement(React.Fragment, {}, React.createElement(Form, { actionsContainer: target }), React.createElement('div', { ref: setTarget, className: 'settings-actions-slot' }));
                }
                root.render(React.createElement(Harness, { key: kind }));
            };
            window.choosePhoto = () => {
                const input = document.querySelector('#profile-photo-upload');
                const transfer = new DataTransfer();
                transfer.items.add(new File(['test image'], 'photo.png', { type: 'image/png' }));
                input.files = transfer.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            };
            window.showForm('profile');
        }, modules);
        const save = '.settings-save-bar button[type="submit"]';
        await page.waitForSelector(save + ':disabled');
        assert.equal(await page.$('#phone,#default_address'), null, 'Removed customer profile fields are still rendered');
        await page.type('#name', ' updated');
        await page.click(save);
        await page.waitForSelector(save + ':disabled');
        const submitted = await page.evaluate(() => window.submissions.at(-1));
        assert.equal(submitted.url, '/admin/profile');
        assert.equal(submitted.payload.name, 'Staff member updated');
        assert.equal(Object.hasOwn(submitted.payload, 'default_address'), false);
        await page.evaluate(() => window.choosePhoto());
        await page.waitForSelector('#cancel-crop');
        await page.click('#cancel-crop');
        assert.equal(await page.$eval(save, button => button.disabled), true, 'Cancelled crop dirtied the profile');
        await page.evaluate(() => window.choosePhoto());
        await page.waitForSelector('#apply-crop');
        await page.click('#apply-crop');
        await page.waitForSelector(save + ':enabled');
        await page.click(save);
        assert.equal(await page.evaluate(() => window.submissions.at(-1).method), 'post');
        assert.equal(await page.evaluate(() => window.submissions.at(-1).payload.avatar.type), 'image/png');
        await page.evaluate(() => window.showForm('security'));
        await page.waitForSelector('#current_password');
        await page.type('#current_password', 'old-password');
        await page.type('#password', 'new-password');
        await page.type('#password_confirmation', 'new-password');
        await page.click(save);
        assert.equal(await page.evaluate(() => window.submissions.at(-1).url), '/admin/profile/password');
        assert.equal(await page.$eval('#password', field => field.value), '');
        assert.deepEqual(errors, []);
        console.log('Staff forms passed: shared saves, correct endpoints, profile updates, cancelled/confirmed cropping and password reset.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
