export const orderStatusColor = {
    pending: 'warning',
    completed: 'success',
    not_delivered: 'warning',
    delivered: 'success',
    cancelled: 'default',
};

export const paymentStatusColor = {
    pending_review: 'warning',
    paid: 'success',
    partially_paid: 'warning',
    unpaid: 'error',
    rejected: 'error',
};

export const paymentLabels = {
    pending_review: 'Awaiting review',
    paid: 'Confirmed',
    partially_paid: 'Partially paid',
    unpaid: 'Credit outstanding',
    rejected: 'Rejected',
};

export const orderStatusLabels = {
    pending: 'Pending',
    completed: 'Completed',
    not_delivered: 'Not delivered',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
};

export const deliveryStatusLabels = {
    not_delivered: 'Not delivered',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
};

export const getOrderStatus = (order) => {
    if (order.order_status) return order.order_status;
    if (order.status === 'cancelled') return 'cancelled';
    if (order.is_online_sale) return order.delivered_at ? 'delivered' : 'not_delivered';
    return order.status;
};
