export function createIdempotencyKey(prefix = 'checkout') {
  const randomPart =
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

  return `${prefix}-${randomPart}`;
}