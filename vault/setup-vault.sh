#!/bin/sh
set -e

export VAULT_ADDR="${VAULT_ADDR:-http://vault:8200}"

echo "[vault-init] Starting Vault setup..."

if [ -z "${VAULT_TOKEN:-}" ]; then
  echo "[vault-init] ERROR: VAULT_TOKEN is not set"
  exit 1
fi

if [ -z "${MONGODB_URI:-}" ]; then
  echo "[vault-init] ERROR: MONGODB_URI is not set"
  exit 1
fi

if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  echo "[vault-init] ERROR: STRIPE_SECRET_KEY is not set"
  exit 1
fi

if [ -z "${STRIPE_WEBHOOK_SECRET:-}" ]; then
  echo "[vault-init] WARNING: STRIPE_WEBHOOK_SECRET is empty. This is OK for local testing before running Stripe CLI."
fi

echo "[vault-init] Waiting for Vault..."

until vault status >/dev/null 2>&1; do
  echo "[vault-init] Vault is not ready yet..."
  sleep 2
done

echo "[vault-init] Vault is ready."

echo "[vault-init] Checking KV secret engine..."

if ! vault secrets list | grep -q '^secret/'; then
  echo "[vault-init] Enabling KV v2 at secret/"
  vault secrets enable -path=secret -version=2 kv
else
  echo "[vault-init] secret/ already exists"
fi

echo "[vault-init] Writing MongoDB credentials..."

vault kv put secret/mongodb-credentials \
  MONGODB_URI="$MONGODB_URI"

echo "[vault-init] Writing Stripe credentials..."

vault kv put secret/payment-credentials \
  STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}"

echo "[vault-init] Verifying secrets..."

vault kv get secret/mongodb-credentials >/dev/null
vault kv get secret/payment-credentials >/dev/null

echo "[vault-init] Done."