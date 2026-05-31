import mongoose from 'mongoose';
import {
  createApp,
  connectMongo,
  ok,
  requireAuth,
  requireInternal
} from './shared/platform.js';

const { app } = createApp('shipping-service');

const shippingSchema = new mongoose.Schema(
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
    trackingNumber: String,
    status: {
      type: String,
      default: 'CREATED'
    },
    carrier: {
      type: String,
      default: 'DEMO_CARRIER'
    },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    items: [
      {
        productId: String,
        sku: String,
        name: String,
        quantity: Number
      }
    ]
  },
  {
    timestamps: true,
    collection: 'shipments'
  }
);

const Shipment =
  mongoose.models.Shipment ||
  mongoose.model('Shipment', shippingSchema);

function createTrackingNumber() {
  return `TRK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

app.get('/api/shipping/health', (_req, res) => {
  res.json(ok('shipping-service'));
});

app.get('/api/shipping/mine', requireAuth, async (req, res) => {
  const shipments = await Shipment.find({
    userId: req.user.userId
  }).sort({
    createdAt: -1
  });

  res.json(shipments);
});

app.get('/api/shipping/orders/:orderId', requireAuth, async (req, res) => {
  const shipment = await Shipment.findOne({
    orderId: req.params.orderId,
    userId: req.user.userId
  });

  if (!shipment) {
    return res.status(404).json({
      message: 'Shipment not found'
    });
  }

  res.json(shipment);
});

app.post('/internal/shipping/create', requireInternal, async (req, res) => {
  const { orderId, userId, address, items } = req.body;

  if (!orderId || !userId) {
    return res.status(400).json({
      message: 'orderId and userId are required'
    });
  }

  const existing = await Shipment.findOne({
    orderId
  });

  if (existing) {
    return res.json(existing);
  }

  const shipment = await Shipment.create({
    orderId,
    userId,
    address,
    items,
    trackingNumber: createTrackingNumber(),
    status: 'CREATED'
  });

  res.status(201).json(shipment);
});

app.patch('/internal/shipping/:orderId/status', requireInternal, async (req, res) => {
  const shipment = await Shipment.findOneAndUpdate(
    {
      orderId: req.params.orderId
    },
    {
      $set: {
        status: req.body.status
      }
    },
    {
      new: true
    }
  );

  if (!shipment) {
    return res.status(404).json({
      message: 'Shipment not found'
    });
  }

  res.json(shipment);
});

await connectMongo();

app.listen(8007, () => {
  console.log('[shipping-service] listening on port 8007');
});