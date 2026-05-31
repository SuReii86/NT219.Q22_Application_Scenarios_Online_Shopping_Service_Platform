import React, { useState } from 'react';
import { LogIn, ShoppingCart, User, Search, ShieldAlert } from 'lucide-react';
import { useAuth } from './auth/AuthProvider.jsx';
import { API_GATEWAY_URL, apiRequest } from './lib/api.js';

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
  const { initialized, authenticated, profile, authError, login, logout } = useAuth();
  const [securityMessage, setSecurityMessage] = useState('');

  async function testInvalidToken() {
  setSecurityMessage('Testing invalid token...');

  try {
    await apiRequest('/api/users/me', {
      headers: {
        Authorization: 'Bearer invalid-token-for-demo',
      },
    });

    setSecurityMessage('Unexpected success: invalid token was accepted.');
    } catch (error) {
      setSecurityMessage(`Invalid token rejected with status ${error.status || 'unknown'}.`);
    }
  }

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

          {authenticated ? (
            <button type="button" className="nav-button" onClick={logout}>
              <LogIn size={18} />
              Logout
            </button>
          ) : (
            <button type="button" className="nav-button" onClick={login} disabled={!initialized}>
              <LogIn size={18} />
              Login
            </button>
          )}

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

      <section className="auth-strip">
        <div>
          <p className="eyebrow">Authentication</p>
          <p className="auth-copy">
            {authenticated
              ? `Signed in as ${profile?.username || profile?.email || 'Keycloak user'}`
              : 'Browsing as guest'}
          </p>
          {authError ? <p className="security-message error">{authError}</p> : null}
          {securityMessage ? <p className="security-message">{securityMessage}</p> : null}
        </div>

        <button type="button" className="secondary-button" onClick={testInvalidToken}>
          <ShieldAlert size={18} />
          Test Invalid Token
        </button>
      </section>

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