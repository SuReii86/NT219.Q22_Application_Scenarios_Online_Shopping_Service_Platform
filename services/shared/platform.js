import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import vault from 'node-vault';
import { createRemoteJWKSet, jwtVerify } from 'jose';

dotenv.config();

let jwks;

export function createApp(serviceName, options = {}) {
  const app = express();

  app.use(helmet());
  app.use(cors());

  if (options.json !== false) {
    app.use(express.json({ limit: '1mb' }));
  }

  app.get('/metrics', (_req, res) => {
    res.type('text/plain').send(`# ${serviceName} metrics placeholder\n`);
  });

  return { app };
}

export function ok(serviceName, extra = {}) {
  return {
    status: 'ok',
    service: serviceName,
    timestamp: new Date().toISOString(),
    ...extra
  };
}

export async function readVaultSecret(path) {
  const client = vault({
    endpoint: process.env.VAULT_ADDR || 'http://vault:8200',
    token: process.env.VAULT_TOKEN
  });

  const result = await client.read(path);
  return result?.data?.data || result?.data || {};
}

export async function connectMongo() {
  let mongoUri = process.env.MONGODB_URI;

  if (!mongoUri && process.env.MONGODB_VAULT_PATH) {
    const secret = await readVaultSecret(process.env.MONGODB_VAULT_PATH);
    mongoUri = secret.MONGODB_URI || secret.mongodbUri || secret.uri;
  }

  if (!mongoUri) {
    throw new Error('MONGODB_URI was not found in env or Vault');
  }

  await mongoose.connect(mongoUri);
  console.log('[platform] connected to MongoDB');
}

function getToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

function getRoles(payload) {
  const realmRoles = payload.realm_access?.roles || [];
  const resourceRoles = Object.values(payload.resource_access || {})
    .flatMap(resource => resource.roles || []);

  return [...new Set([...realmRoles, ...resourceRoles])];
}

export async function requireAuth(req, res, next) {
  try {
    const token = getToken(req);

    if (!token) {
      return res.status(401).json({ message: 'Missing bearer token' });
    }

    const issuer =
      process.env.KEYCLOAK_ISSUER ||
      process.env.JWT_ISSUER ||
      'http://keycloak:8080/realms/nt219';

    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
    }

    const verifyOptions = {
      issuer
    };

    if (process.env.KEYCLOAK_AUDIENCE || process.env.JWT_AUDIENCE) {
      verifyOptions.audience = process.env.KEYCLOAK_AUDIENCE || process.env.JWT_AUDIENCE;
    }

    const { payload } = await jwtVerify(token, jwks, verifyOptions);

    req.user = {
      userId: payload.sub,
      username: payload.preferred_username,
      email: payload.email,
      roles: getRoles(payload),
      claims: payload
    };

    next();
  } catch (error) {
    res.status(401).json({
      message: 'Invalid bearer token',
      error: error.message
    });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user?.roles?.includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    next();
  };
}

export function requireInternal(req, res, next) {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;

  if (!expected) {
    return res.status(500).json({ message: 'INTERNAL_SERVICE_TOKEN is not configured' });
  }

  if (req.headers['x-internal-token'] !== expected) {
    return res.status(401).json({ message: 'Invalid internal token' });
  }

  next();
}

export function internalHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN,
    ...extra
  };
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message =
      body?.message ||
      body?.error ||
      `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return body;
}