import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import nodeVault from 'node-vault';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import promClient from 'prom-client';

dotenv.config();

const vault = nodeVault({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR || 'http://vault:8200',
  token: process.env.VAULT_TOKEN,
});

const jwks = createRemoteJWKSet(new URL(process.env.KEYCLOAK_JWKS_URI));

export function createApp(serviceName, { json = true } = {}) {
  const app = express();
  app.disable('x-powered-by');

  const register = new promClient.Registry();
  promClient.collectDefaultMetrics({
    register,
    prefix: `${serviceName.replace(/-/g, '_')}_`,
  });

  const httpRequestsTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['service', 'method', 'route', 'status_code'],
    registers: [register],
  });

  const httpRequestDurationSeconds = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['service', 'method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [register],
  });

  if (json) {
    app.use(express.json({ limit: '1mb' }));
  }

  app.use((req, res, next) => {
    const stop = httpRequestDurationSeconds.startTimer({
      service: serviceName,
      method: req.method,
    });

    res.on('finish', () => {
      const route = req.route?.path || req.path;
      const labels = {
        service: serviceName,
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };
      httpRequestsTotal.inc(labels);
      stop({ route, status_code: String(res.statusCode) });
    });

    next();
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  return { app };
}

export async function readVaultSecret(path) {
  const secret = await vault.read(path);
  return secret.data?.data || secret.data || {};
}

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) return;

  const mongoSecrets = await readVaultSecret(
    process.env.MONGODB_VAULT_PATH || 'secret/data/mongodb-credentials',
  );

  if (!mongoSecrets.MONGODB_URI) {
    throw new Error('MONGODB_URI was not found in Vault');
  }

  await mongoose.connect(mongoSecrets.MONGODB_URI, {
    dbName: process.env.MONGO_DB_NAME || 'shopping_platform',
  });
}

function tokenIsForAcceptedClient(payload) {
  const acceptedClient = process.env.KEYCLOAK_CLIENT_ID;
  if (!acceptedClient) return true;

  const audiences = Array.isArray(payload.aud)
    ? payload.aud
    : payload.aud
      ? [payload.aud]
      : [];

  return payload.azp === acceptedClient || audiences.includes(acceptedClient);
}

export async function requireAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing Bearer token' });
    }

    const token = authorization.slice('Bearer '.length);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: process.env.KEYCLOAK_ISSUER,
    });

    if (!tokenIsForAcceptedClient(payload)) {
      return res.status(401).json({
        message: 'Token was not issued for the accepted client',
      });
    }

    req.auth = payload;
    req.user = {
      userId: payload.sub,
      username: payload.preferred_username,
      email: payload.email,
      roles: payload.realm_access?.roles || [],
    };

    next();
  } catch (error) {
    return res.status(401).json({
      message: 'Invalid or expired JWT',
      error: error.message,
    });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    const roles = req.user?.roles || [];
    if (!roles.includes(role)) {
      return res.status(403).json({ message: `Role ${role} is required` });
    }
    next();
  };
}

export function requireInternal(req, res, next) {
  const header = req.headers['x-internal-token'];
  if (!process.env.INTERNAL_SERVICE_TOKEN || header !== process.env.INTERNAL_SERVICE_TOKEN) {
    return res.status(401).json({ message: 'Invalid internal service token' });
  }
  next();
}

export function internalHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN,
    ...extra,
  };
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(body?.message || body?.error || `${response.status} ${response.statusText}`);
  }

  return body;
}

export function ok(service, extra = {}) {
  return {
    service,
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED',
    time: new Date().toISOString(),
    ...extra,
  };
}