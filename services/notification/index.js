import mongoose from 'mongoose';
import {
  createApp,
  connectMongo,
  ok,
  requireAuth,
  requireInternal
} from './shared/platform.js';

const { app } = createApp('notification-service');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true },
    orderId: String,
    channel: {
      type: String,
      default: 'email'
    },
    subject: String,
    message: String,
    status: {
      type: String,
      default: 'SENT'
    }
  },
  {
    timestamps: true,
    collection: 'notifications'
  }
);

const Notification =
  mongoose.models.Notification ||
  mongoose.model('Notification', notificationSchema);

app.get('/api/notifications/health', (_req, res) => {
  res.json(ok('notification-service'));
});

app.get('/api/notifications/mine', requireAuth, async (req, res) => {
  const notifications = await Notification.find({
    userId: req.user.userId
  }).sort({ createdAt: -1 });

  res.json(notifications);
});

app.post('/internal/notifications/send', requireInternal, async (req, res) => {
  const notification = await Notification.create({
    userId: req.body.userId,
    orderId: req.body.orderId,
    channel: req.body.channel || 'email',
    subject: req.body.subject,
    message: req.body.message,
    status: 'SENT'
  });

  console.log('[notification-service] simulated notification:', {
    userId: notification.userId,
    orderId: notification.orderId,
    subject: notification.subject
  });

  res.status(201).json(notification);
});

await connectMongo();

app.listen(8008, () => {
  console.log('[notification-service] listening on port 8008');
});