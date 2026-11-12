// Shared by settings, preview, browser printing and QZ Tray.
export const receiptPaperSizes = [
    { id: '58mm', label: '58 mm', width: 58, height: 297, thermal: true },
    { id: '76mm', label: '76 mm', width: 76, height: 297, thermal: true },
    { id: '80mm', label: '80 mm', width: 80, height: 297, thermal: true },
    { id: 'A5', label: 'A5', width: 148, height: 210, thermal: false },
    { id: 'A4', label: 'A4', width: 210, height: 297, thermal: false },
];

export const getReceiptPaper = (id) => receiptPaperSizes.find(paper => paper.id === id)
    || receiptPaperSizes.find(paper => paper.id === 'A5');

export const receiptPageSize = (id) => {
    const paper = getReceiptPaper(id);
    return paper.thermal ? `${paper.width}mm ${paper.height}mm` : paper.id;
};
