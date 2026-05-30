import mongoose from 'mongoose';
import {
  createApp,
  connectMongo,
  ok,
  requireInternal,
  requireAuth,
  requireRole
} from './shared/platform.js';

const { app } = createApp('inventory-service');

const reservationSchema = new mongoose.Schema(
  {
    orderId: String,
    quantity: Number
  },
  { _id: false }
);

const inventorySchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      unique: true,
      index: true
    },
    sku: String,
    available: Number,
    reserved: {
      type: Number,
      default: 0
    },
    reservations: [reservationSchema]
  },
  {
    timestamps: true,
    collection: 'inventory_items'
  }
);

const Inventory =
  mongoose.models.Inventory ||
  mongoose.model('Inventory', inventorySchema);

const DEFAULT_STOCK = [
  {
    productId: 'P1001',
    sku: 'SKU-LAPTOP-001',
    available: 12,
    reserved: 0,
    reservations: []
  },
  {
    productId: 'P1002',
    sku: 'SKU-HEADSET-001',
    available: 50,
    reserved: 0,
    reservations: []
  },
  {
    productId: 'P1003',
    sku: 'SKU-MOUSE-001',
    available: 35,
    reserved: 0,
    reservations: []
  }
];

async function seedDefaults() {
  const count = await Inventory.countDocuments();

  if (count === 0) {
    await Inventory.insertMany(DEFAULT_STOCK);
    console.log('[inventory-service] default stock inserted');
  }
}

app.get('/api/inventory/health', (_req, res) => {
  res.json(ok('inventory-service'));
});

app.get('/api/inventory/:productId', async (req, res) => {
  const item = await Inventory.findOne({
    productId: req.params.productId
  });

  if (!item) {
    return res.status(404).json({
      message: 'Inventory item not found'
    });
  }

  res.json(item);
});

app.post('/api/inventory/admin/seed', requireAuth, requireRole('admin'), async (req, res) => {
  const item = await Inventory.findOneAndUpdate(
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

  res.status(201).json(item);
});

app.post('/internal/inventory/reserve', requireInternal, async (req, res) => {
  const { orderId, items } = req.body;

  if (!orderId || !Array.isArray(items)) {
    return res.status(400).json({
      message: 'orderId and items are required'
    });
  }

  const touched = [];

  try {
    for (const item of items) {
      const doc = await Inventory.findOne({
        productId: item.productId
      });

      if (!doc) {
        throw new Error(`Inventory item not found: ${item.productId}`);
      }

      if (doc.available < item.quantity) {
        throw new Error(`Insufficient stock for ${item.productId}`);
      }

      doc.available -= item.quantity;
      doc.reserved += item.quantity;

      const existingReservation = doc.reservations.find(
        reservation => reservation.orderId === orderId
      );

      if (existingReservation) {
        existingReservation.quantity += item.quantity;
      } else {
        doc.reservations.push({
          orderId,
          quantity: item.quantity
        });
      }

      await doc.save();
      touched.push(item);
    }

    res.json({
      orderId,
      status: 'RESERVED'
    });
  } catch (error) {
    for (const item of touched) {
      const doc = await Inventory.findOne({
        productId: item.productId
      });

      if (!doc) continue;

      doc.available += item.quantity;
      doc.reserved = Math.max(0, doc.reserved - item.quantity);

      const existingReservation = doc.reservations.find(
        reservation => reservation.orderId === orderId
      );

      if (existingReservation) {
        existingReservation.quantity -= item.quantity;
      }

      doc.reservations = doc.reservations.filter(
        reservation => reservation.quantity > 0
      );

      await doc.save();
    }

    res.status(409).json({
      message: error.message
    });
  }
});

app.post('/internal/inventory/release', requireInternal, async (req, res) => {
  const { orderId, items = [] } = req.body;

  if (!orderId) {
    return res.status(400).json({
      message: 'orderId is required'
    });
  }

  const targets = items.length
    ? items
    : (
        await Inventory.find({
          'reservations.orderId': orderId
        })
      ).map(doc => {
        const reservation = doc.reservations.find(
          item => item.orderId === orderId
        );

        return {
          productId: doc.productId,
          quantity: reservation?.quantity || 0
        };
      });

  for (const item of targets) {
    const doc = await Inventory.findOne({
      productId: item.productId
    });

    if (!doc) continue;

    doc.available += item.quantity;
    doc.reserved = Math.max(0, doc.reserved - item.quantity);
    doc.reservations = doc.reservations.filter(
      reservation => reservation.orderId !== orderId
    );

    await doc.save();
  }

  res.json({
    orderId,
    status: 'RELEASED'
  });
});

app.post('/internal/inventory/commit', requireInternal, async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({
      message: 'orderId is required'
    });
  }

  const docs = await Inventory.find({
    'reservations.orderId': orderId
  });

  for (const doc of docs) {
    const reservation = doc.reservations.find(
      item => item.orderId === orderId
    );

    if (!reservation) continue;

    doc.reserved = Math.max(0, doc.reserved - reservation.quantity);
    doc.reservations = doc.reservations.filter(
      item => item.orderId !== orderId
    );

    await doc.save();
  }

  res.json({
    orderId,
    status: 'COMMITTED'
  });
});

await connectMongo();
await seedDefaults();

app.listen(8006, () => {
  console.log('[inventory-service] listening on port 8006');
});