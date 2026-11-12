const destinations = {
    'Admin/Inventory/Receipts/Create': '/admin/inventory/receipts',
    'Admin/Inventory/Receipts/Edit': '/admin/inventory/receipts',
    'Admin/Inventory/Transfers/Create': '/admin/inventory/transfers',
    'Admin/Inventory/Adjustments/Create': '/admin/inventory/adjustments',
};

export const crudModalDestination = (page) => destinations[page?.component] || null;
