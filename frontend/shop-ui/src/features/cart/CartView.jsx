import React from 'react';
import { Minus, Plus, RefreshCw, ShoppingCart, Trash2 } from 'lucide-react';

export function CartView({
  cart,
  status,
  onRefresh,
  refreshing,
  onUpdateQuantity,
  onRemoveItem,
  updatingProductId,
}) {
  const items = cart?.items || [];
  return (
    <aside className="cart-panel">
      <div className="section-heading cart-heading">
        <div>
          <p className="eyebrow">Cart</p>
          <h2>Current cart</h2>
          {status ? <p className="panel-note">{status}</p> : null}
        </div>

        <button
          type="button"
          className="icon-button"
          title="Refresh cart"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <ShoppingCart size={24} />
          <p>Your cart is ready for products.</p>
        </div>
      ) : (
        <div className="cart-items">
          {items.map((item) => (
            
            <div className="cart-item" key={item.productId}>
              <div>
                <strong>{item.name}</strong>
                <p>{item.quantity} x {formatMoney(item.price, item.currency)}</p>

                <div className="cart-controls">
                  <button
                    type="button"
                    className="quantity-button"
                    title="Decrease quantity"
                    onClick={() => onUpdateQuantity(item, item.quantity - 1)}
                    disabled={updatingProductId === item.productId}
                  >
                    <Minus size={14} />
                  </button>

                  <span>{item.quantity}</span>

                  <button
                    type="button"
                    className="quantity-button"
                    title="Increase quantity"
                    onClick={() => onUpdateQuantity(item, item.quantity + 1)}
                    disabled={updatingProductId === item.productId}
                  >
                    <Plus size={14} />
                  </button>

                  <button
                    type="button"
                    className="quantity-button danger"
                    title="Remove item"
                    onClick={() => onRemoveItem(item)}
                    disabled={updatingProductId === item.productId}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <span>{formatMoney(item.price * item.quantity, item.currency)}</span>
            </div>

          ))}

          <div className="cart-total">
            <span>Total</span>
            <strong>{formatMoney(cart.totalAmount || getTotal(items), cart.currency || 'usd')}</strong>
          </div>
        </div>
      )}
    </aside>
  );
}

function getTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function formatMoney(amount, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}