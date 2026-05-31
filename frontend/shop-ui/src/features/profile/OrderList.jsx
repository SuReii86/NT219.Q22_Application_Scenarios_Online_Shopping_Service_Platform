import React from 'react';

export function OrderList({ orders }) {
  if (!orders.length) {
    return (
      <div className="empty-state">
        <p>No orders found yet.</p>
      </div>
    );
  }

  return (
    <div className="order-list">
      {orders.map((order) => (
        <article className="order-card" key={order.orderId || order._id}>
          <div>
            <p className="eyebrow">Order</p>
            <h3>{order.orderId || order._id}</h3>
          </div>

          <div className="order-meta">
            <span className={getStatusClass(order.status)}>{order.status || 'UNKNOWN'}</span>
            <strong>{formatMoney(order.totalAmount || 0, order.currency || 'usd')}</strong>
          </div>

          <div className="order-detail-grid">
            <div>
              <p className="detail-label">Payment</p>
              <p>{order.paymentStatus || 'not available'}</p>
            </div>
            <div>
              <p className="detail-label">Shipping</p>
              <p>{order.shippingStatus || 'not created'}</p>
            </div>
            <div>
              <p className="detail-label">Tracking</p>
              <p>{order.trackingNumber || 'waiting for webhook'}</p>
            </div>
          </div>

          <div className="order-items">
            {(order.items || []).map((item) => (
              <span key={`${order.orderId || order._id}-${item.productId}`}>
                {item.quantity} x {item.name}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function getStatusClass(status) {
  if (status === 'PAID') return 'status-pill paid';
  if (status === 'PAYMENT_FAILED') return 'status-pill failed';
  return 'status-pill pending';
}

function formatMoney(amount, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}