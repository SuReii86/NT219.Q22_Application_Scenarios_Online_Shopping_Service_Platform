import mongoose from 'mongoose';
import {
  createApp,
  connectMongo,
  fetchJson,
  internalHeaders,
  ok,
  requireAuth,
  requireInternal
} from './shared/platform.js';

const { app } = createApp('order-service');

const orderItemSchema = new mongoose.Schema(
  {
    productId: String,
    sku: String,
    name: String,
    price: Number,
    currency: String,
    quantity: Number,
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true },
    checkoutKey: { type: String, index: true },
    items: [orderItemSchema],
    totalAmount: Number,
    currency: String,
    status: {
      type: String,
      enum: ['PENDING_PAYMENT', 'PAID', 'PAYMENT_FAILED', 'CANCELLED'],
      default: 'PENDING_PAYMENT',
    },
    paymentStatus: { type: String, default: 'requires_payment_method' },
    paymentIntentId: String,
    paymentClientSecret: String,
    shippingStatus: { type: String, default: 'NOT_CREATED' },
    trackingNumber: String,
    shippingAddress: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },
  },
  { timestamps: true, collection: 'orders' },
);

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

function serializeOrder(order) {
  return {
    orderId: order._id,
    userId: order.userId,
    items: order.items,
    totalAmount: order.totalAmount,
    currency: order.currency,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentIntentId: order.paymentIntentId,
    clientSecret: order.paymentClientSecret,
    shippingStatus: order.shippingStatus,
    trackingNumber: order.trackingNumber,
    createdAt: order.createdAt,
  };
}

app.get('/api/orders/health', (_req, res) => {
  res.json(ok('order-service'));
});

app.get('/api/orders', requireAuth, async (req, res) => {
  const orders = await Order.find({ userId: req.user.userId }).sort({ createdAt: -1 });
  res.json(orders.map(serializeOrder));
});

app.get('/api/orders/:id', requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || order.userId !== req.user.userId) {
    return res.status(404).json({ message: 'Order not found' });
  }
  res.json(serializeOrder(order));
});

app.post('/api/orders/checkout', requireAuth, async (req, res) => {
  const checkoutKey = req.headers['x-idempotency-key'];
  if (!checkoutKey) {
    return res.status(400).json({ message: 'X-Idempotency-Key is required' });
  }

  const existing = await Order.findOne({
    userId: req.user.userId,
    checkoutKey,
  });

  if (existing) {
    return res.json(serializeOrder(existing));
  }

  const cart = await fetchJson(
    `${process.env.CART_SERVICE_URL}/internal/cart/${req.user.userId}`,
    { headers: internalHeaders() },
  );

  if (!cart.items?.length) {
    return res.status(400).json({ message: 'Cart is empty' });
  }

  const currency = cart.items[0].currency || 'usd';
  const totalAmount = cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  let order;
  try {
    order = await Order.create({
      userId: req.user.userId,
      checkoutKey,
      items: cart.items,
      totalAmount,
      currency,
      shippingAddress: req.body.shippingAddress,
    });


    await fetchJson(`${process.env.INVENTORY_SERVICE_URL}/internal/inventory/reserve`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify({
        orderId: String(order._id),
        items: cart.items.map(({ productId, quantity }) => ({ productId, quantity })),
      }),
    });

    const payment = await fetchJson(`${process.env.PAYMENT_SERVICE_URL}/api/payment/create-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization,
        'X-Idempotency-Key': checkoutKey,
      },
      body: JSON.stringify({
        orderId: String(order._id),
        amount: totalAmount,
        currency,
      }),
    });

    order.paymentIntentId = payment.paymentIntentId;
    order.paymentClientSecret = payment.clientSecret;
    order.paymentStatus = payment.status;
    await order.save();

    res.status(201).json(serializeOrder(order));
  } catch (error) {
    if (order) {
      await Order.findByIdAndUpdate(order._id, {
        status: 'PAYMENT_FAILED',
        paymentStatus: 'failed',
      });

      await fetchJson(`${process.env.INVENTORY_SERVICE_URL}/internal/inventory/release`, {
        method: 'POST',
        headers: internalHeaders(),
        body: JSON.stringify({
          orderId: String(order._id),
          items: order.items.map(({ productId, quantity }) => ({ productId, quantity })),
        }),
      }).catch(() => undefined);
    }

    res.status(500).json({ message: error.message });
  }
});

app.post('/internal/orders/:orderId/paid', requireInternal, async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) {
    return res.status(404).json({ message: 'Order not found' });
  }

  order.status = 'PAID';
  order.paymentStatus = req.body.status || 'succeeded';
  order.paymentIntentId = req.body.paymentIntentId || order.paymentIntentId;

  await fetchJson(`${process.env.INVENTORY_SERVICE_URL}/internal/inventory/commit`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({ orderId: String(order._id) }),
  });

  try {
    const shipment = await fetchJson(`${process.env.SHIPPING_SERVICE_URL}/internal/shipping/create`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify({
        orderId: String(order._id),
        userId: order.userId,
        address: order.shippingAddress,
        items: order.items,
      }),
    });
    order.shippingStatus = shipment.status;
    order.trackingNumber = shipment.trackingNumber;
  } catch {
    order.shippingStatus = 'CREATION_FAILED';
  }

  await order.save();

  await fetchJson(`${process.env.NOTIFICATION_SERVICE_URL}/internal/notifications/send`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      userId: order.userId,
      orderId: String(order._id),
      channel: 'email',
      subject: 'Payment succeeded',
      message: `Order ${order._id} has been paid and is being prepared for shipping.`,
    }),
  }).catch(() => undefined);

  await fetchJson(`${process.env.CART_SERVICE_URL}/internal/cart/${order.userId}`, {
    method: 'DELETE',
    headers: internalHeaders(),
  }).catch(() => undefined);

  res.json(serializeOrder(order));
});

app.post('/internal/orders/:orderId/payment-failed', requireInternal, async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) {
    return res.status(404).json({ message: 'Order not found' });
  }

  order.status = 'PAYMENT_FAILED';
  order.paymentStatus = req.body.status || 'payment_failed';
  await order.save();

  await fetchJson(`${process.env.INVENTORY_SERVICE_URL}/internal/inventory/release`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      orderId: String(order._id),
      items: order.items.map(({ productId, quantity }) => ({ productId, quantity })),
    }),
  }).catch(() => undefined);

  await fetchJson(`${process.env.NOTIFICATION_SERVICE_URL}/internal/notifications/send`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      userId: order.userId,
      orderId: String(order._id),
      channel: 'email',
      subject: 'Payment failed',
      message: `Order ${order._id} could not be completed. Please retry checkout.`,
    }),
  }).catch(() => undefined);

  res.json(serializeOrder(order));
});

await connectMongo();
app.listen(8003, () => {
  console.log('[order-service] listening on port 8003');
});