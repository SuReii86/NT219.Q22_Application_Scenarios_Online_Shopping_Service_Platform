import mongoose from 'mongoose';
import {
  createApp,
  connectMongo,
  ok,
  requireAuth,
  requireRole
} from './shared/platform.js';

const { app } = createApp('user-service');

const profileSchema = new mongoose.Schema(
  {
    keycloakUserId: {
      type: String,
      unique: true,
      index: true
    },
    username: String,
    email: String,
    firstName: String,
    lastName: String,
    phone: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    roles: [String]
  },
  {
    timestamps: true,
    collection: 'user_profiles'
  }
);

const UserProfile =
  mongoose.models.UserProfile ||
  mongoose.model('UserProfile', profileSchema);

app.get('/api/users/health', (_req, res) => {
  res.json(ok('user-service'));
});

app.get('/api/users/me', requireAuth, async (req, res) => {
  let profile = await UserProfile.findOne({
    keycloakUserId: req.user.userId
  });

  if (!profile) {
    profile = await UserProfile.create({
      keycloakUserId: req.user.userId,
      username: req.user.username,
      email: req.user.email,
      roles: req.user.roles
    });
  } else {
    profile.username = req.user.username;
    profile.email = req.user.email;
    profile.roles = req.user.roles;

    await profile.save();
  }

  res.json(profile);
});

app.put('/api/users/me', requireAuth, async (req, res) => {
  const profile = await UserProfile.findOneAndUpdate(
    {
      keycloakUserId: req.user.userId
    },
    {
      $set: {
        username: req.user.username,
        email: req.user.email,
        roles: req.user.roles,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phone: req.body.phone,
        address: req.body.address
      }
    },
    {
      new: true,
      upsert: true
    }
  );

  res.json(profile);
});

app.get('/api/users/admin/users', requireAuth, requireRole('admin'), async (_req, res) => {
  const users = await UserProfile.find()
    .sort({ createdAt: -1 })
    .limit(100);

  res.json(users);
});

await connectMongo();

app.listen(8005, () => {
  console.log('[user-service] listening on port 8005');
});