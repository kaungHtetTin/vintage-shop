// Render source receipts and mock QZ output; no build, printer or shop data.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { transformSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const puppeteer = require('puppeteer');
const cache = new Map();
let printerConfig, printerData;
const qz = {
    websocket: { isActive: () => true },
    configs: { create: (_name, options) => { printerConfig = options; return options; } },
    print: async (_config, data) => { printerData = data; },
};
function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = new Module(file, module);
    cache.set(file, mod);
    mod.paths = Module._nodeModulePaths(path.dirname(file));
    mod.require = name => {
        if (name === 'qz-tray') return qz;
        if (name.endsWith('/i18n')) return { usePhraseTranslation: () => value => value };
        if (name.endsWith('/dateTime')) return { formatDateTime: () => '13 Nov 2026, 12:30 PM', formatDate: () => '20 Nov 2026' };
        if (name.startsWith('@/') || name.startsWith('.')) {
            const base = name.startsWith('@/') ? path.resolve('resources/js', name.slice(2)) : path.resolve(path.dirname(file), name);
            const target = [base, base + '.js', base + '.jsx'].find(candidate => fs.existsSync(candidate));
            if (target) return load(target);
        }
        return require(name);
    };
    mod._compile(transformSync(fs.readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic' }).code, file);
    return mod.exports;
}

async function main() {
    const { receiptPaperSizes, getReceiptPaper, receiptPageSize } = load('resources/js/Utils/receiptPaper.js');
    const Receipt = load('resources/js/Components/Admin/ReceiptPaper.jsx').default;
    const { printReceiptWithDrawer } = load('resources/js/Utils/posPrinter.js');
    assert.equal(getReceiptPaper('invalid').id, 'A5');
    assert.equal(await printReceiptWithDrawer({ qz_printing: false }), false);
    const order = {
        receipt_number: 'RCT-2026-000001', created_at: '2026-11-13', receiver_name: 'Customer with a long saved name',
        receiver_phone: '09999999999', payment_method: 'cash', location: { name: 'Main Store' },
        items: [{ id: 1, product: { name: 'Vintage garment with a long description မြန်မာစာ', code: 'VB-000001' }, quantity: 2, unit_price: 1500000, total_price: 3000000 }],
        total_amount: 3000000, discount_amount: 1000, final_amount: 2999000,
        payments: [{ tender_type: 'cash', amount: 2999000, amount_tendered: 3000000, change_due: 1000 }],
    };
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1000, height: 1000 });
        const css = fs.readFileSync('resources/js/styles/receipt.css', 'utf8');
        fs.mkdirSync('artifacts/receipt-sizes', { recursive: true });
        for (const paper of receiptPaperSizes) {
            const markup = renderToStaticMarkup(React.createElement(Receipt, { order, settings: { app_name: 'Vintage Shop', receipt: { paper_size: paper.id, address: 'Yangon, Myanmar', phone: '09123456789' } } }));
            await page.setContent(`<html><head><style>${css}\n@page { size: ${receiptPageSize(paper.id)}; margin:0; } body{margin:0}</style></head><body class="pos-receipt-print-mode">${markup}</body></html>`);
            for (const media of ['screen', 'print']) {
                await page.emulateMediaType(media);
                const bounds = await page.$eval('.pos-receipt-paper', el => ({ width: el.getBoundingClientRect().width, overflow: el.scrollWidth > el.clientWidth + 1 }));
                if (bounds.overflow) console.log(await page.$eval('.pos-receipt-paper', el => {
                    const right = el.getBoundingClientRect().right;
                    return [...el.querySelectorAll('*')].filter(node => node.getBoundingClientRect().right > right + 1).map(node => ({ tag: node.tagName, class: node.className, text: node.textContent.slice(0, 65), width: node.getBoundingClientRect().width }));
                }));
                assert.equal(bounds.overflow, false, paper.id + ' overflows in ' + media);
                if (media === 'print') {
                    // Existing 80 mm layout reserves 4 mm on either side.
                    const expected = paper.id === '80mm' ? 72 : paper.width;
                    assert(Math.abs(bounds.width - expected * 96 / 25.4) < 1, `${paper.id}: incorrect print width ${bounds.width}`);
                }
            }
            await page.screenshot({ path: `artifacts/receipt-sizes/${paper.id}.png`, fullPage: true });
            const pdf = Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
            const mediaBox = pdf.toString('latin1').match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
            assert(mediaBox, 'PDF has no media box');
            assert(Math.abs(Number(mediaBox[1]) - paper.width * 72 / 25.4) < 2, paper.id + ': wrong browser paper width');
            assert(Math.abs(Number(mediaBox[2]) - paper.height * 72 / 25.4) < 2, paper.id + ': wrong browser paper height');
            global.document = { title: 'Test', baseURI: 'http://localhost/', head: { querySelectorAll: () => [] }, querySelector: () => ({ outerHTML: markup }) };
            assert.equal(await printReceiptWithDrawer({ paper_size: paper.id, qz_printing: true, qz_printer_name: 'Mock printer', cash_drawer: true }), true);
            assert.deepEqual(printerConfig.size, { width: paper.width, height: paper.height });
            assert.equal(printerData[0].options.pageWidth, paper.width);
            assert.equal(printerData[0].options.pageHeight, paper.height);
            assert.equal(printerData[1].data, '1B700019FA', 'Cash drawer command changed');
        }
        console.log('All five paper sizes passed: preview/print overflow, browser PDF dimensions and mocked QZ dimensions/drawer output.');
    } finally {
        delete global.document;
        await browser.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
