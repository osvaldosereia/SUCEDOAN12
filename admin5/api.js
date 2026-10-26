import {
  attendanceJsonApi,
  attendanceAuthorizedFetch,
  ensureAttendanceToken
} from '/vitrine/admin/atendimento/attendance-auth.js?v=auth-refresh-v2';

const FUNCTIONS = 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/';

async function requestJson(url, options = {}) {
  const response = await attendanceAuthorizedFetch(url, {
    ...options,
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.message || data?.error || `admin5_http_${response.status}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function functionUrl(name, action, params = {}) {
  const url = new URL(`${FUNCTIONS}${name}`);
  if (action) url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

export async function prepareAdminSession() {
  return await ensureAttendanceToken();
}

export async function attendanceApi(action, params = {}, method = 'GET') {
  return await attendanceJsonApi(action, params, method);
}

export async function adminProductsApi(action, params = {}, method = 'GET') {
  const verb = String(method || 'GET').toUpperCase();
  const url = functionUrl('admin-products-live-v1', action, verb === 'GET' ? params : {});
  const options = { method: verb, headers: {} };
  if (verb !== 'GET') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(params || {});
  }
  return await requestJson(url, options);
}

export async function basketsApi(action, payload = {}) {
  const url = functionUrl('admin-basket-configuration-v1');
  return await requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
}
