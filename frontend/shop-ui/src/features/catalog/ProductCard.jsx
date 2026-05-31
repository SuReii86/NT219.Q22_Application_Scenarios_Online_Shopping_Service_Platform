import React from 'react';

export function ProductCard({ product, onAddToCart, busy }) {
  return (
    <article className="product-card">
      <div>
        <p className="product-category">{product.category}</p>
        <h3>{product.name}</h3>
      </div>
      <p className="price">{formatMoney(product.price, product.currency)}</p>
      <button type="button" onClick={() => onAddToCart(product)} disabled={busy}>
        {busy ? 'Adding...' : 'Add to cart'}
      </button>
    </article>
  );
}

function formatMoney(amount, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}