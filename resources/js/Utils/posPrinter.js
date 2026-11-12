import qz from 'qz-tray';
import { getReceiptPaper } from './receiptPaper';

const connect = async () => {
    if (!qz.websocket.isActive()) {
        await qz.websocket.connect({ retries: 1, delay: 0 });
    }
};

const printableHtml = () => {
    const receipt = document.querySelector('.pos-receipt-paper');
    if (!receipt) throw new Error('Receipt content is not available.');

    const assets = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
        .map((node) => node.outerHTML)
        .join('');
    return `<!doctype html><html><head><meta charset="UTF-8"><base href="${document.baseURI}">${assets}<style>body{margin:0;background:#fff}.pos-receipt-paper{margin:0!important;box-shadow:none!important;border:0!important}</style></head><body class="pos-receipt-print-mode">${receipt.outerHTML}</body></html>`;
};

export const printReceiptWithDrawer = async (receiptSettings = {}) => {
    const printerName = String(receiptSettings.qz_printer_name || '').trim();
    if (!receiptSettings.qz_printing || !printerName) return false;

    await connect();
    const paper = getReceiptPaper(receiptSettings.paper_size);
    const config = qz.configs.create(printerName, {
        units: 'mm', size: { width: paper.width, height: paper.height }, margins: 0,
        jobName: `POS receipt ${document.title || ''}`.trim(),
    });
    const data = [{
        type: 'pixel', format: 'html', flavor: 'plain', data: printableHtml(),
        options: { pageWidth: paper.width, pageHeight: paper.height },
    }];

    if (receiptSettings.cash_drawer) {
        data.push({
            type: 'raw', format: 'command', flavor: 'hex',
            data: '1B700019FA',
            options: { language: 'ESCPOS' },
        });
    }

    await qz.print(config, data);
    return true;
};
