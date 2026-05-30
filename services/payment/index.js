import express from 'express';
import mongoose from 'mongoose';
import Stripe from 'stripe';

import {
  createApp,
  connectMongo,
  fetchJson,
  internalHeaders,
  ok,
  readVaultSecret,
  requireAuth
} from './shared/platform.js';

const { app } = createApp('payment-service', { json: false });

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      unique: true,
      index: true
    },
    userId: {
      type: String,
      index: true
    },
    amount: Number,
    currency: String,
    status: String,
    idempotencyKey: String,
    stripePaymentIntentId: String,
    clientSecret: String,
    lastEventType: String
  },
  {
    timestamps: true,
    collection: 'payments'
  }
);

const Payment =
  mongoose.models.Payment ||
  mongoose.model('Payment', paymentSchema);

let stripe;
let webhookSecret;

async function notifyOrderPaid(intent) {
  if (!intent.metadata?.orderId) return;

  await fetchJson(
    `${process.env.ORDER_SERVICE_URL}/internal/orders/${intent.metadata.orderId}/paid`,
    {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify({
        paymentIntentId: intent.id,
        status: intent.status
      })
    }
  );
}

async function notifyOrderFailed(intent) {
  if (!intent.metadata?.orderId) return;

  await fetchJson(
    `${process.env.ORDER_SERVICE_URL}/internal/orders/${intent.metadata.orderId}/payment-failed`,
    {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify({
        paymentIntentId: intent.id,
        status: intent.status
      })
    }
  );
}

/**
 * Stripe webhook phải dùng express.raw().
 * Vì vậy route này đặt trước express.json().
 */
app.post(
  '/api/payment/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    let event;

    try {
      if (webhookSecret && req.headers['stripe-signature']) {
        event = stripe.webhooks.constructEvent(
          req.body,
          req.headers['stripe-signature'],
          webhookSecret
        );
      } else {
        event = JSON.parse(req.body.toString('utf8'));
      }
    } catch (error) {
      console.error('[payment-service] webhook verify failed:', error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    const intent = event.data?.object;

    try {
      if (event.type === 'payment_intent.succeeded') {
        await Payment.findOneAndUpdate(
          {
            stripePaymentIntentId: intent.id
          },
          {
            $set: {
              status: intent.status,
              lastEventType: event.type
            }
          },
          {
            new: true
          }
        );

        await notifyOrderPaid(intent).catch(error => {
          console.error('[payment-service] notify order paid failed:', error.message);
        });
      }

      if (
        event.type === 'payment_intent.payment_failed' ||
        event.type === 'payment_intent.canceled'
      ) {
        await Payment.findOneAndUpdate(
          {
            stripePaymentIntentId: intent.id
          },
          {
            $set: {
              status: intent.status,
              lastEventType: event.type
            }
          },
          {
            new: true
          }
        );

        await notifyOrderFailed(intent).catch(error => {
          console.error('[payment-service] notify order failed:', error.message);
        });
      }

      res.json({
        received: true
      });
    } catch (error) {
      console.error('[payment-service] webhook handling failed:', error.message);

      res.status(500).json({
        message: 'Webhook handling failed',
        error: error.message
      });
    }
  }
);

app.use(express.json({ limit: '1mb' }));

app.get('/api/payment/health', (_req, res) => {
  res.json(
    ok('payment-service', {
      protectedBy: 'Vault, Keycloak JWT, Stripe webhook verification'
    })
  );
});

app.get('/api/payment/orders/:orderId', requireAuth, async (req, res) => {
  const payment = await Payment.findOne({
    orderId: req.params.orderId,
    userId: req.user.userId
  });

  if (!payment) {
    return res.status(404).json({
      message: 'Payment record not found'
    });
  }

  res.json({
    orderId: payment.orderId,
    paymentIntentId: payment.stripePaymentIntentId,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency
  });
});

app.post('/api/payment/create-intent', requireAuth, async (req, res) => {
  try {
    const { orderId, amount, currency = 'usd' } = req.body;
    const idempotencyKey = req.headers['x-idempotency-key'];

    if (!orderId) {
      return res.status(400).json({
        message: 'orderId is required'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        message: 'positive amount is required'
      });
    }

    if (!idempotencyKey) {
      return res.status(400).json({
        message: 'X-Idempotency-Key is required'
      });
    }

    const existing = await Payment.findOne({
      orderId,
      userId: req.user.userId
    });

    if (existing) {
      return res.json({
        orderId: existing.orderId,
        paymentIntentId: existing.stripePaymentIntentId,
        clientSecret: existing.clientSecret,
        status: existing.status
      });
    }

    const intent = await stripe.paymentIntents.create(
      {
        amount,
        currency,
        automatic_payment_methods: {
          enabled: true
        },
        metadata: {
          orderId: String(orderId),
          userId: String(req.user.userId)
        }
      },
      {
        idempotencyKey
      }
    );

    const payment = await Payment.create({
      orderId,
      userId: req.user.userId,
      amount,
      currency,
      status: intent.status,
      idempotencyKey,
      stripePaymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      lastEventType: 'payment_intent.created'
    });

    res.status(201).json({
      orderId: payment.orderId,
      paymentIntentId: payment.stripePaymentIntentId,
      clientSecret: payment.clientSecret,
      status: payment.status
    });
  } catch (error) {
    console.error('[payment-service] create intent failed:', error.message);

    res.status(500).json({
      message: 'Create payment intent failed',
      error: error.message
    });
  }
});

app.post('/api/payment/test-confirm/:paymentIntentId', requireAuth, async (req, res) => {
  try {
    const intent = await stripe.paymentIntents.confirm(
      req.params.paymentIntentId,
      {
        payment_method: req.body.paymentMethod || 'pm_card_visa'
      }
    );

    await Payment.findOneAndUpdate(
      {
        stripePaymentIntentId: intent.id,
        userId: req.user.userId
      },
      {
        $set: {
          status: intent.status,
          lastEventType: 'manual_test_confirm'
        }
      },
      {
        new: true
      }
    );

    res.json({
      paymentIntentId: intent.id,
      status: intent.status,
      clientSecret: intent.client_secret
    });
  } catch (error) {
    console.error('[payment-service] test confirm failed:', error.message);

    res.status(500).json({
      message: 'Test confirm failed',
      error: error.message
    });
  }
});

await connectMongo();

const paymentSecrets = await readVaultSecret(
  process.env.PAYMENT_VAULT_PATH || 'secret/data/payment-credentials'
);

if (!paymentSecrets.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY was not found in Vault');
}

stripe = new Stripe(paymentSecrets.STRIPE_SECRET_KEY);
webhookSecret =
  paymentSecrets.STRIPE_WEBHOOK_SECRET ||
  process.env.STRIPE_WEBHOOK_SECRET ||
  '';

app.listen(8004, () => {
  console.log('[payment-service] listening on port 8004');
});