import React from 'react';
import { LogIn, ShoppingCart, User, Search } from 'lucide-react';
import { API_GATEWAY_URL } from './lib/api.js';

const demoProducts = [
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

function formatMoney(amount, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">NT219 Shopping Platform</p>
          <h1>Shop UI</h1>
          <p className="gateway-label">Gateway: {API_GATEWAY_URL}</p>
        </div>

        <nav className="nav-actions" aria-label="Main navigation">
          <button type="button" className="icon-button" title="Search">
            <Search size={18} />
          </button>
          <button type="button" className="nav-button">
            <LogIn size={18} />
            Login
          </button>
          <button type="button" className="nav-button">
            <ShoppingCart size={18} />
            Cart
          </button>
          <button type="button" className="nav-button">
            <User size={18} />
            Profile
          </button>
        </nav>
      </header>

      <main className="shop-layout">
        <section className="catalog-panel">
          <div className="section-heading">
            <p className="eyebrow">Catalog</p>
            <h2>Products</h2>
          </div>

          <div className="product-grid">
            {demoProducts.map((product) => (
              <article className="product-card" key={product.productId}>
                <div>
                  <p className="product-category">{product.category}</p>
                  <h3>{product.name}</h3>
                </div>
                <p className="price">{formatMoney(product.price, product.currency)}</p>
                <button type="button">Add to cart</button>
              </article>
            ))}
          </div>
        </section>

        <aside className="cart-panel">
          <div className="section-heading">
            <p className="eyebrow">Cart</p>
            <h2>Current cart</h2>
          </div>

          <div className="empty-state">
            <ShoppingCart size={24} />
            <p>Your cart is ready for products.</p>
          </div>
        </aside>
      </main>
    </div>
  );
}