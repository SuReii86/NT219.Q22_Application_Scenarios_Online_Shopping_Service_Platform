const DEFAULT_API_GATEWAY_URL = 'http://localhost:8080';

export const API_GATEWAY_URL =
  import.meta.env.VITE_API_GATEWAY_URL || DEFAULT_API_GATEWAY_URL;

let accessTokenProvider = null;

export function setAccessTokenProvider(provider) {
  accessTokenProvider = provider;
}

export function clearAccessTokenProvider() {
  accessTokenProvider = null;
}

function normalizePath(path) {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }

  return path;
}

function buildHeaders(headers = {}, options = {}) {
  const nextHeaders = new Headers(headers);

  if (options.json !== false && !nextHeaders.has('Content-Type')) {
    nextHeaders.set('Content-Type', 'application/json');
  }

  const token = accessTokenProvider?.();

  if (token && !nextHeaders.has('Authorization')) {
    nextHeaders.set('Authorization', `Bearer ${token}`);
  }

  return nextHeaders;
}

async function parseResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_GATEWAY_URL}${normalizePath(path)}`, {
    ...options,
    headers: buildHeaders(options.headers, options),
  });

  const body = await parseResponse(response);

  if (!response.ok) {
    const message =
      body?.message ||
      body?.error ||
      `Request failed with status ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

export function getJson(path, options = {}) {
  return apiRequest(path, {
    ...options,
    method: 'GET',
  });
}

export function postJson(path, data, options = {}) {
  return apiRequest(path, {
    ...options,
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function putJson(path, data, options = {}) {
  return apiRequest(path, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function patchJson(path, data, options = {}) {
  return apiRequest(path, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteJson(path, options = {}) {
  return apiRequest(path, {
    ...options,
    method: 'DELETE',
  });
}