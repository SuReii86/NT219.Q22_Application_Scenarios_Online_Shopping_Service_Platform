import mongoose from 'mongoose';
import { createApp, connectMongo, ok, requireAuth, requireRole } from './shared/platform.js';

const { app } = createApp('catalog-service');

const productSchema = new mongoose.Schema(
  {
    productId: { type: String, unique: true, index: true },
    sku: { type: String, unique: true, index: true },
    name: String,
    description: String,
    category: String,
    price: Number,
    currency: { type: String, default: 'usd' },
    active: { type: Boolean, default: true },
    imageUrl: String,
  },
  { timestamps: true, collection: 'catalog_products' },
);

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

const DEFAULT_PRODUCTS = [
  {
    productId: 'P1001',
    sku: 'SKU-LAPTOP-001',
    name: 'Gaming Laptop',
    description: 'Demo product for the NT219 shopping platform.',
    category: 'electronics',
    price: 129900,
    currency: 'usd',
    active: true,
    imageUrl: 'https://example.invalid/laptop.png',
  },
  {
    productId: 'P1002',
    sku: 'SKU-HEADSET-001',
    name: 'Bluetooth Headset',
    description: 'Wireless headset with demo pricing.',
    category: 'audio',
    price: 7900,
    currency: 'usd',
    active: true,
    imageUrl: 'https://example.invalid/headset.png',
  },
  {
    productId: 'P1003',
    sku: 'SKU-MOUSE-001',
    name: 'Mechanical Mouse',
    description: 'Ergonomic mouse used for end-to-end testing.',
    category: 'accessories',
    price: 3900,
    currency: 'usd',
    active: true,
    imageUrl: 'https://example.invalid/mouse.png',
  }
];

async function seedDefaults() {
  if ((await Product.countDocuments()) === 0) {
    await Product.insertMany(DEFAULT_PRODUCTS);
  }
}

app.get('/api/catalog/health', (_req, res) => {
  res.json(ok('catalog-service'));
});

app.get('/api/catalog/products', async (_req, res) => {
  const products = await Product.find({ active: true }).sort({ createdAt: -1 });
  res.json(products);
});

app.get('/api/catalog/products/:productId', async (req, res) => {
  const product = await Product.findOne({ productId: req.params.productId, active: true });
  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }
  res.json(product);
});

app.post('/api/catalog/products', requireAuth, requireRole('admin'), async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json(product);
});

app.put('/api/catalog/products/:productId', requireAuth, requireRole('admin'), async (req, res) => {
  const product = await Product.findOneAndUpdate(
    { productId: req.params.productId },
    { $set: req.body },
    { new: true },
  );

  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  res.json(product);
});

await connectMongo();
await seedDefaults();
app.listen(8001, () => {
  console.log('[catalog-service] listening on port 8001');
});