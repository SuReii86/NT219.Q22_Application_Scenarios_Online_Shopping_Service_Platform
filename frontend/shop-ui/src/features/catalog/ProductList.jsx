import React, { useEffect, useState } from 'react';
import { getJson } from '../../lib/api.js';
import { ProductCard } from './ProductCard.jsx';

const fallbackProducts = [
  {
    productId: 'P1001',
    name: 'Gaming Laptop',
    category: 'electronics',
    price: 129900,
    currency: 'usd',
  },
  {
    productId: 'P1002',
    name: 'Bluetooth Headset',
    category: 'audio',
    price: 7900,
    currency: 'usd',
  },
  {
    productId: 'P1003',
    name: 'Mechanical Mouse',
    category: 'accessories',
    price: 3900,
    currency: 'usd',
  },
];

export function ProductList({ onAddToCart, addingProductId }) {
  const [products, setProducts] = useState(fallbackProducts);
  const [status, setStatus] = useState('Loading catalog from gateway...');

  useEffect(() => {
    let ignore = false;

    getJson('/api/catalog/products')
      .then((data) => {
        if (ignore) return;

        const nextProducts = Array.isArray(data) ? data : [];
        setProducts(nextProducts.length > 0 ? nextProducts : fallbackProducts);
        setStatus('Catalog loaded from API Gateway.');
      })
      .catch((error) => {
        if (ignore) return;
        setProducts(fallbackProducts);
        setStatus(`Using demo catalog. Gateway response: ${error.status || 'unavailable'}.`);
      });

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <section className="catalog-panel">
      <div className="section-heading">
        <p className="eyebrow">Catalog</p>
        <h2>Products</h2>
        <p className="panel-note">{status}</p>
      </div>

      <div className="product-grid">
        {products.map((product) => (
          <ProductCard
            key={product.productId}
            product={product}
            onAddToCart={onAddToCart}
            busy={addingProductId === product.productId}
          />
        ))}
      </div>
    </section>
  );
}