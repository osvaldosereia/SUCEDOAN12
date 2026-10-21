import { ADMIN_API } from './config.js';
import { clearSession, ensureSession } from './auth.js';

async function request(url, { method = 'GET', params = {}, body = null, retry = true } = {}) {
  const token = await ensureSession();
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined) target.searchParams.set(key, String(value));
  }
  const response = await fetch(target, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store'
  });
  if (response.status === 401 && retry) {
    clearSession();
    return request(url, { method, params, body, retry: false });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || data.error || 'service_error');
    error.status = response.status;
    throw error;
  }
  return data;
}

export const adminApi = (action, params = {}) => request(ADMIN_API, { params: { action, ...params } });
export const adminWrite = (action, body = {}) => request(ADMIN_API, { method: 'POST', params: { action }, body });
