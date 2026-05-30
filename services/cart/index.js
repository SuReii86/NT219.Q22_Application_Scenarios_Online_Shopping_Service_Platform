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

const { app } = createApp('cart-service');

const cartItemSchema = new mongoose.Schema(
  {
    productId: String,
    sku: String,
    name: String,
    price: Number,
    currency: String,
    quantity: Number,
    imageUrl: String
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      unique: true,
      index: true
    },
    items: [cartItemSchema]
  },
  {
    timestamps: true,
    collection: 'carts'
  }
);

const Cart =
  mongoose.models.Cart ||
  mongoose.model('Cart', cartSchema);

function serializeCart(cart) {
  const items = cart?.items || [];
  const totalAmount = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return {
    userId: cart?.userId,
    items,
    totalAmount,
    currency: items[0]?.currency || 'usd',
    updatedAt: cart?.updatedAt
  };
}

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ userId });

  if (!cart) {
    cart = await Cart.create({
      userId,
      items: []
    });
  }

  return cart;
}

async function getProduct(productId) {
  return fetchJson(`${process.env.CATALOG_SERVICE_URL}/api/catalog/products/${productId}`, {
    headers: internalHeaders()
  });
}

app.get('/api/cart/health', (_req, res) => {
  res.json(ok('cart-service'));
});

app.get('/api/cart', requireAuth, async (req, res) => {
  const cart = await getOrCreateCart(req.user.userId);
  res.json(serializeCart(cart));
});

app.post('/api/cart/items', requireAuth, async (req, res) => {
  const { productId, quantity = 1 } = req.body;

  if (!productId) {
    return res.status(400).json({
      message: 'productId is required'
    });
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({
      message: 'quantity must be a positive integer'
    });
  }

  const product = await getProduct(productId);
  const cart = await getOrCreateCart(req.user.userId);

  const existing = cart.items.find(item => item.productId === productId);

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
      imageUrl: product.imageUrl
    });
  }

  await cart.save();
  res.status(201).json(serializeCart(cart));
});

app.put('/api/cart/items/:productId', requireAuth, async (req, res) => {
  const { quantity } = req.body;

  if (!Number.isInteger(quantity) || quantity < 0) {
    return res.status(400).json({
      message: 'quantity must be a non-negative integer'
    });
  }

  const cart = await getOrCreateCart(req.user.userId);

  if (quantity === 0) {
    cart.items = cart.items.filter(
      item => item.productId !== req.params.productId
    );
  } else {
    const existing = cart.items.find(
      item => item.productId === req.params.productId
    );

    if (!existing) {
      return res.status(404).json({
        message: 'Cart item not found'
      });
    }

    existing.quantity = quantity;
  }

  await cart.save();
  res.json(serializeCart(cart));
});

app.delete('/api/cart/items/:productId', requireAuth, async (req, res) => {
  const cart = await getOrCreateCart(req.user.userId);

  cart.items = cart.items.filter(
    item => item.productId !== req.params.productId
  );

  await cart.save();
  res.json(serializeCart(cart));
});

app.delete('/api/cart', requireAuth, async (req, res) => {
  const cart = await getOrCreateCart(req.user.userId);

  cart.items = [];
  await cart.save();

  res.json(serializeCart(cart));
});

app.get('/internal/cart/:userId', requireInternal, async (req, res) => {
  const cart = await getOrCreateCart(req.params.userId);
  res.json(serializeCart(cart));
});

app.delete('/internal/cart/:userId', requireInternal, async (req, res) => {
  const cart = await getOrCreateCart(req.params.userId);

  cart.items = [];
  await cart.save();

  res.json(serializeCart(cart));
});

await connectMongo();

app.listen(8002, () => {
  console.log('[cart-service] listening on port 8002');
});