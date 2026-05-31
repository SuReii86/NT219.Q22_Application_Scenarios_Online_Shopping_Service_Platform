import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { getJson } from '../../lib/api.js';
import { OrderList } from './OrderList.jsx';

export function ProfilePage({ authenticated, profile, onBack }) {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('Login to load your order history.');
  const [loading, setLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!authenticated) {
      setOrders([]);
      setStatus('Login to load your order history.');
      return;
    }

    setLoading(true);
    setStatus('Loading orders from API Gateway...');

    try {
      const data = await getJson('/api/orders');
      setOrders(Array.isArray(data) ? data : []);
      setStatus('Orders loaded. Refresh after Stripe webhook to see PAID and tracking updates.');
    } catch (error) {
      setOrders([]);
      setStatus(`Orders unavailable: ${error.status || 'gateway not running'}.`);
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  return (
    <main className="profile-layout">
      <button type="button" className="secondary-button" onClick={onBack}>
        <ArrowLeft size={18} />
        Back to shop
      </button>

      <section className="profile-panel">
        <div className="profile-heading">
          <div>
            <p className="eyebrow">Profile</p>
            <h2>{profile?.username || profile?.email || 'Guest profile'}</h2>
            <p className="panel-note">{status}</p>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={loadOrders}
            disabled={loading}
          >
            <RefreshCw size={18} />
            Refresh orders
          </button>
        </div>

        <OrderList orders={orders} />
      </section>
    </main>
  );
}