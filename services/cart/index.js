import mongoose from 'mongoose';
import {
  createApp,
  connectMongo,
  fetchJson,
  ok,
  requireAuth,
  requireInternal
} from './shared/platform.js';

const { app } = createApp('cart-service');

const cartItemSchema = new mongoose.Schema(
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

const cartSchema = new mongoose.Schema(
  {
    userId: { type: String, unique: true, index: true },
    items: [cartItemSchema],
  },
  { timestamps: true, collection: 'shopping_carts' },
);

const Cart = mongoose.models.Cart || mongoose.model('Cart', cartSchema);

function getUserId(req) {
  return req.user?.userId || req.auth?.sub;
}

app.get('/api/cart/health', (_req, res) => {
  res.json(ok('cart-service'));
});

app.get('/api/cart', requireAuth, async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({
      message: 'JWT does not contain user id'
    });
  }

  const cart = await Cart.findOne({ userId });

  res.json(cart || { userId, items: [] });
});

app.post('/api/cart/items', requireAuth, async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({
      message: 'JWT does not contain user id'
    });
  }

  const { productId, quantity = 1 } = req.body;
  if (!productId || quantity <= 0) {
    return res.status(400).json({ message: 'productId and positive quantity are required' });
  }

  const product = await fetchJson(
    `${process.env.CATALOG_SERVICE_URL}/api/catalog/products/${productId}`,
  );

  const cart = (await Cart.findOne({ userId })) ||
    (await Cart.create({ userId, items: [] }));

  const existing = cart.items.find((item) => item.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.push({
      productId: product.productId,
      sku: product.sku,
      name: product.name,
      price: product.price,
      currency: product.currency,
      quantity,
    });
  }

  await cart.save();
  res.status(201).json(cart);
});

app.patch('/api/cart/items/:productId', requireAuth, async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({
      message: 'JWT does not contain user id'
    });
  }

  const { quantity } = req.body;
  const cart = await Cart.findOne({ userId });

  if (!cart) {
    return res.status(404).json({ message: 'Cart not found' });
  }

  const item = cart.items.find((entry) => entry.productId === req.params.productId);
  if (!item) {
    return res.status(404).json({ message: 'Cart item not found' });
  }

  if (quantity <= 0) {
    cart.items = cart.items.filter((entry) => entry.productId !== req.params.productId);
  } else {
    item.quantity = quantity;
  }

  await cart.save();
  res.json(cart);
});

app.delete('/api/cart/items/:productId', requireAuth, async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({
      message: 'JWT does not contain user id'
    });
  }
  const cart = await Cart.findOne({ userId });

  if (!cart) return res.status(404).json({ message: 'Cart not found' });

  cart.items = cart.items.filter((entry) => entry.productId !== req.params.productId);
  await cart.save();
  res.json(cart);
});

app.delete('/api/cart', requireAuth, async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({
      message: 'JWT does not contain user id'
    });
  }

  await Cart.findOneAndDelete({ userId });
  res.json({ userId, items: [] });
});

app.get('/internal/cart/:userId', requireInternal, async (req, res) => {
  const cart = await Cart.findOne({ userId: req.params.userId });
  res.json(cart || { userId: req.params.userId, items: [] });
});

app.delete('/internal/cart/:userId', requireInternal, async (req, res) => {
  await Cart.findOneAndDelete({ userId: req.params.userId });
  res.json({ userId: req.params.userId, cleared: true });
});

await connectMongo();
app.listen(8002, () => {
  console.log('[cart-service] listening on port 8002');
});