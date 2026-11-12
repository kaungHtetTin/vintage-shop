const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

const { execFileSync } = require('node:child_process');
const php = process.env.PHP_BINARY || 'D:/xampp/php/php.exe';
const dictionaries = JSON.parse(execFileSync(php, ['-r', "echo json_encode(['en' => require 'lang/en/navigation.php', 'my' => require 'lang/my/navigation.php'], JSON_UNESCAPED_UNICODE);"], { encoding: 'utf8' }));
// A valid JSON file may still contain translations damaged by shell encoding.
for (const locale of ['en', 'my']) {
    const checkText = (value, key) => {
        if (typeof value === 'string') {
            assert(!/\?{2,}|\uFFFD/.test(value), `${locale}: corrupted translation at ${key}`);
        } else if (value && typeof value === 'object') {
            for (const [childKey, child] of Object.entries(value)) checkText(child, `${key}.${childKey}`);
        }
    };
    checkText(dictionaries[locale], 'navigation');
    for (const file of fs.readdirSync(`lang/${locale}`).filter(file => file.endsWith('.json'))) {
        checkText(JSON.parse(fs.readFileSync(`lang/${locale}/${file}`, 'utf8')), file);
    }
}
let page = { props: { locale: 'my', translations: { navigation: dictionaries.my } } };
const document = { documentElement: { lang: 'my' } };
function moduleUnderTest(file) {
    const module = { exports: {} };
    const code = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'js', format: 'cjs' }).code;
    vm.runInNewContext(code, {
        module, exports: module.exports, document, Intl, Date,
        require: name => name === '@/spa/router' ? { usePage: () => page } : {},
    }, { filename: file });
    return module.exports;
}

const { translatePhrase, useTranslation, usePhraseTranslation } = moduleUnderTest('resources/js/Utils/i18n.js');
assert.equal(usePhraseTranslation()('Buy a bale'), 'အထည်ထုပ်ဝယ်ရန်');
assert.equal(useTranslation()('Buy a bale'), 'အထည်ထုပ်ဝယ်ရန်');
assert.equal(useTranslation()('language.label'), 'ဘာသာစကား');
assert.equal(useTranslation()(':count day terms', { count: 30 }), 'အကြွေးကာလ 30 ရက်');
assert.equal(usePhraseTranslation()('Copies for :value1', { value1: '5,000 MMK' }), '5,000 MMK အတွက် စောင်ရေ');
assert.equal(translatePhrase({ phrases: { ':value :value1': ':value1 :value' } }, ':value :value1', { value: 'A', value1: 'B' }), 'B A');
assert.equal(translatePhrase(dictionaries.my, 'Customer-supplied name'), 'Customer-supplied name');
assert.equal(translatePhrase(dictionaries.my, 123), 123);
assert.equal(translatePhrase(dictionaries.my, null), null);
assert.equal(usePhraseTranslation()('Edit :value1', { value1: '$& Jane' }), '$& Jane ကို ပြင်ရန်');

page = { props: { locale: 'en', translations: { navigation: dictionaries.en } } };
assert.equal(usePhraseTranslation()('Buy a bale'), 'Buy a bale');
assert.equal(useTranslation()('language.label'), 'Language');
const dates = moduleUnderTest('resources/js/Utils/dateTime.js');
document.documentElement.lang = 'en';
assert.equal(dates.formatDate('2026-11-11'), '11 Nov 2026');
assert.equal(dates.formatDateTime('2026-11-11T05:11:04.000000Z'), '11 Nov 2026, 11:41 am');
document.documentElement.lang = 'my';
assert.match(dates.formatDate('2026-11-11'), /[\u1000-\u109f]/);
assert.match(dates.formatDateTime('2026-11-11T05:11:04.000000Z'), /[\u1000-\u109f]/);
assert.equal(dates.formatDate(null), '—');

const path = require('node:path');
const parser = require('@babel/parser');
// Brand names, units and exact device/example identifiers intentionally stay unchanged.
const immutableTerms = new Set(['& FOUND', '- MMK', '80 mm', 'EPSON TM-T82 Receipt', 'HEX', 'USD, MMK, CNY', 'VINTAGE', 'VINTAGE SHOP', 'warehouse_clerk']);
function filesUnder(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? filesUnder(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
let checkedModules = 0;
let checkedLookups = 0;
for (const file of filesUnder('resources/js').filter(file => /\.(jsx|js)$/.test(file))) {
    const ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    const walk = node => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'JSXText') assert(!/[A-Za-z]{2}/.test(node.value), `${file}: untranslated JSX text ${node.value}`);
        if (node.type === 'CallExpression' && ['t', 'tp', 'uiText'].includes(node.callee?.name) && node.arguments[0]?.type === 'StringLiteral') {
            const key = node.arguments[0].value;
            const nested = key.split('.').reduce((value, key) => value?.[key], dictionaries.my);
            assert(dictionaries.my.phrases[key] || nested || immutableTerms.has(key), `${file}: missing Myanmar phrase ${key}`);
            checkedLookups++;
        }
        for (const [key, value] of Object.entries(node)) {
            if (key === 'loc') continue;
            if (Array.isArray(value)) value.forEach(walk);
            else if (value && typeof value === 'object') walk(value);
        }
    };
    walk(ast);
    checkedModules++;
}
assert(checkedLookups > 1000, 'The source audit must cover the whole application.');
console.log(`Source audit passed: ${checkedModules} modules, ${checkedLookups} literal locale lookups, no unwrapped English JSX text.`);
console.log('Locale lookup, interpolation, language switching and date checks passed.');
