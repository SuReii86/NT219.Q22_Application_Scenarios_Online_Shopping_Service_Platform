import mongoose from 'mongoose';
import {
  createApp,
  connectMongo,
  ok,
  requireAuth,
  requireRole
} from './shared/platform.js';

const { app } = createApp('catalog-service');

const productSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      unique: true,
      index: true
    },
    sku: {
      type: String,
      unique: true,
      index: true
    },
    name: String,
    description: String,
    category: String,
    brand: String,
    price: Number,
    currency: {
      type: String,
      default: 'usd'
    },
    imageUrl: String,
    specs: mongoose.Schema.Types.Mixed,
    active: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    collection: 'catalog_products'
  }
);

const Product =
  mongoose.models.Product ||
  mongoose.model('Product', productSchema);

const DEFAULT_PRODUCTS = [
  {
    productId: 'P1001',
    sku: 'SKU-LAPTOP-001',
    name: 'Gaming Laptop',
    description: 'High performance gaming laptop for school projects, work, and play.',
    category: 'computers',
    brand: 'NT219 Gear',
    price: 129900,
    currency: 'usd',
    imageUrl: 'https://placehold.co/800x600?text=Gaming+Laptop',
    specs: {
      cpu: 'Intel Core i7',
      ram: '16GB',
      storage: '1TB SSD',
      gpu: 'RTX series'
    },
    active: true
  },
  {
    productId: 'P1002',
    sku: 'SKU-HEADSET-001',
    name: 'Bluetooth Headset',
    description: 'Wireless headset with noise reduction and long battery life.',
    category: 'audio',
    brand: 'NT219 Sound',
    price: 9900,
    currency: 'usd',
    imageUrl: 'https://placehold.co/800x600?text=Bluetooth+Headset',
    specs: {
      connection: 'Bluetooth',
      battery: '30 hours',
      microphone: true
    },
    active: true
  },
  {
    productId: 'P1003',
    sku: 'SKU-MOUSE-001',
    name: 'Wireless Mouse',
    description: 'Compact wireless mouse with adjustable DPI.',
    category: 'accessories',
    brand: 'NT219 Gear',
    price: 2490,
    currency: 'usd',
    imageUrl: 'https://placehold.co/800x600?text=Wireless+Mouse',
    specs: {
      dpi: '800-3200',
      connection: '2.4GHz wireless'
    },
    active: true
  }
];

async function seedDefaults() {
  const count = await Product.countDocuments();

  if (count > 0) return;

  await Product.insertMany(DEFAULT_PRODUCTS);
  console.log('[catalog-service] default products inserted');
}

function serializeProduct(product) {
  return {
    productId: product.productId,
    sku: product.sku,
    name: product.name,
    description: product.description,
    category: product.category,
    brand: product.brand,
    price: product.price,
    currency: product.currency,
    imageUrl: product.imageUrl,
    specs: product.specs,
    active: product.active,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

app.get('/api/catalog/health', (_req, res) => {
  res.json(ok('catalog-service'));
});

app.get('/api/catalog/products', async (req, res) => {
  const {
    q,
    category,
    limit = 50
  } = req.query;

  const filter = {
    active: true
  };

  if (category) {
    filter.category = category;
  }

  if (q) {
    filter.$or = [
      { name: new RegExp(q, 'i') },
      { description: new RegExp(q, 'i') },
      { brand: new RegExp(q, 'i') }
    ];
  }

  const products = await Product.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 100));

  res.json(products.map(serializeProduct));
});

app.get('/api/catalog/products/:productId', async (req, res) => {
  const product = await Product.findOne({
    productId: req.params.productId,
    active: true
  });

  if (!product) {
    return res.status(404).json({
      message: 'Product not found'
    });
  }

  res.json(serializeProduct(product));
});

app.post('/api/catalog/admin/products', requireAuth, requireRole('admin'), async (req, res) => {
  const product = await Product.findOneAndUpdate(
    {
      productId: req.body.productId
    },
    {
      $set: req.body
    },
    {
      new: true,
      upsert: true
    }
  );

  res.status(201).json(serializeProduct(product));
});

await connectMongo();
await seedDefaults();

app.listen(8001, () => {
  console.log('[catalog-service] listening on port 8001');
});