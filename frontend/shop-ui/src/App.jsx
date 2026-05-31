import React, { useCallback, useEffect, useState } from 'react';
import { LogIn, Search, ShieldAlert, ShoppingCart, User } from 'lucide-react';
import { useAuth } from './auth/AuthProvider.jsx';
import { API_GATEWAY_URL, apiRequest, getJson, postJson } from './lib/api.js';
import { CartView } from './features/cart/CartView.jsx';
import { ProductList } from './features/catalog/ProductList.jsx';
import { CheckoutPage } from './features/checkout/CheckoutPage.jsx';


export default function App() {
  const { initialized, authenticated, profile, authError, login, logout } = useAuth();
  const [securityMessage, setSecurityMessage] = useState('');
  const [cart, setCart] = useState(null);
  const [cartStatus, setCartStatus] = useState('Login to load your cart.');
  const [refreshingCart, setRefreshingCart] = useState(false);
  const [addingProductId, setAddingProductId] = useState('');
  const [view, setView] = useState('shop');
  
  const loadCart = useCallback(async () => {
    if (!authenticated) {
      setCart(null);
      setCartStatus('Login to load your cart.');
      return;
    }

    setRefreshingCart(true);
    setCartStatus('Loading cart...');

    try {
      const data = await getJson('/api/cart');
      setCart(data);
      setCartStatus('Cart loaded from API Gateway.');
    } catch (error) {
      setCart(null);
      setCartStatus(`Cart unavailable: ${error.status || 'gateway not running'}.`);
    } finally {
      setRefreshingCart(false);
    }
  }, [authenticated]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  async function addToCart(product) {
    if (!authenticated) {
      setCartStatus('Login before adding products to cart.');
      return;
    }

    setAddingProductId(product.productId);
    setCartStatus(`Adding ${product.name}...`);

    try {
      await postJson('/api/cart/items', {
        productId: product.productId,
        quantity: 1,
      });

      setCartStatus(`${product.name} added to cart.`);
      await loadCart();
    } catch (error) {
      setCartStatus(`Add to cart failed: ${error.status || 'gateway not running'}.`);
    } finally {
      setAddingProductId('');
    }
  }

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

  if (view === 'checkout') {
    return <CheckoutPage onBack={() => setView('shop')} />;
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

          <button type="button" className="nav-button" onClick={() => setView('checkout')}>
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
        <ProductList onAddToCart={addToCart} addingProductId={addingProductId} />
        <CartView
          cart={cart}
          status={cartStatus}
          onRefresh={loadCart}
          refreshing={refreshingCart}
        />
      </main>
    </div>
  );
}