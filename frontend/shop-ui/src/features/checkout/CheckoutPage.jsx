import React, { useMemo, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { createIdempotencyKey } from '../../lib/idempotency.js';
import { postJson } from '../../lib/api.js';

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise =
  publishableKey && !publishableKey.includes('replace_me')
    ? loadStripe(publishableKey)
    : null;

export function CheckoutPage({ onBack }) {
  const [clientSecret, setClientSecret] = useState('');
  const [checkoutStatus, setCheckoutStatus] = useState('Ready to create a payment intent.');
  const [loading, setLoading] = useState(false);
  const idempotencyKey = useMemo(() => createIdempotencyKey(), []);

  async function createCheckout() {
    setLoading(true);
    setCheckoutStatus('Creating checkout session...');

    try {
      const order = await postJson(
        '/api/orders/checkout',
        {
          shippingAddress: {
            line1: 'Demo Street 1',
            city: 'Ho Chi Minh City',
            country: 'VN',
          },
        },
        {
          headers: {
            'X-Idempotency-Key': idempotencyKey,
          },
        },
      );

      setClientSecret(order.clientSecret);
      setCheckoutStatus(`Order ${order.orderId} is ready for secure payment.`);
    } catch (error) {
      setCheckoutStatus(`Checkout failed: ${error.status || 'gateway not running'}.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="checkout-layout">
      <button type="button" className="secondary-button" onClick={onBack}>
        <ArrowLeft size={18} />
        Back to shop
      </button>

      <section className="checkout-panel">
        <div className="section-heading">
          <p className="eyebrow">Checkout</p>
          <h2>Secure payment</h2>
          <p className="panel-note">Idempotency key: {idempotencyKey}</p>
          <p className="panel-note">{checkoutStatus}</p>
        </div>

        <button type="button" className="checkout-button" onClick={createCheckout} disabled={loading}>
          <CreditCard size={18} />
          {loading ? 'Creating payment...' : 'Create payment intent'}
        </button>

        {!stripePromise ? (
          <p className="security-message">
            Configure VITE_STRIPE_PUBLISHABLE_KEY to render Stripe Elements.
          </p>
        ) : null}

        {stripePromise && clientSecret ? (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <PaymentForm />
          </Elements>
        ) : null}
      </section>
    </main>
  );
}

function PaymentForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [paymentStatus, setPaymentStatus] = useState('');

  async function submitPayment(event) {
    event.preventDefault();

    if (!stripe || !elements) return;

    setPaymentStatus('Confirming payment...');

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required',
    });

    if (result.error) {
      setPaymentStatus(result.error.message);
    } else {
      setPaymentStatus('Payment submitted. Waiting for webhook confirmation.');
    }
  }

  return (
    <form className="payment-form" onSubmit={submitPayment}>
      <PaymentElement />
      <button type="submit" className="checkout-button" disabled={!stripe}>
        Pay securely
      </button>
      {paymentStatus ? <p className="panel-note">{paymentStatus}</p> : null}
    </form>
  );
}