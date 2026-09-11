import { writeFileSync } from 'node:fs';
import { mapBlingContactAddress, hasAddress, digits } from './bling-customer-address-sync-core.mjs';

const text = v => String(v ?? '').trim();
const required = name => {
  const value = text(process.env[name]);
  if (!value) throw new Error(`A secret ${name} não foi configurada.`);
  return value;
};

const APPLY = process.argv.includes('--apply');
const API_BASE = 'https://api.bling.com.br/Api/v3';
const SUPABASE_URL = required('SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');
const MIN_INTERVAL_MS = Math.max(420, Number(process.env.BLING_REQUEST_INTERVAL_MS || 460));
const REPORT_FILE = text(process.env.BLING_ADDRESS_REPORT_FILE) || 'bling-customer-address-report.json';
let accessToken = '';
let lastBlingRequestAt = 0;

const summary = {
  mode: APPLY ? 'apply' : 'dry-run',
  local_customers: 0,
  local_addresses_before: 0,
  bling_contacts_listed: 0,
  bling_contacts_with_address: 0,
  matched_by_bling_id: 0,
  matched_by_document: 0,
  matched_by_phone: 0,
  unmatched: 0,
  conflicts: 0,
  addresses_created: 0,
  addresses_updated: 0,
  errors: 0
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();
const report = () => writeFileSync(REPORT_FILE, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

async function pace() {
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastBlingRequestAt));
  if (wait) await sleep(wait);
  lastBlingRequestAt = Date.now();
}

async function bling(path, label = path) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    await pace();
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'enable-jwt': '1' }
      });
    } catch (error) {
      if (attempt === 5) throw new Error(`${label}: falha de rede (${error.message})`);
      await sleep(attempt * 900);
      continue;
    }
    if (response.ok) return response;
    const body = (await response.text()).slice(0, 1000);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 5) throw new Error(`${label}: HTTP ${response.status} ${body}`);
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * attempt * 900);
  }
  throw new Error(`${label}: falha inesperada`);
}

async function oauth() {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: required('BLING_REFRESH_TOKEN') });
  const basic = Buffer.from(`${required('BLING_CLIENT_ID')}:${required('BLING_CLIENT_SECRET')}`).toString('base64');
  const response = await fetch(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'enable-jwt': '1' },
    body
  });
  if (!response.ok) throw new Error(`OAuth Bling HTTP ${response.status}: ${(await response.text()).slice(0, 700)}`);
  const data = await response.json();
  if (!text(data.access_token)) throw new Error('OAuth não retornou access_token.');
  accessToken = text(data.access_token);
  const refreshFile = text(process.env.BLING_REFRESH_TOKEN_FILE);
  if (refreshFile && text(data.refresh_token)) writeFileSync(refreshFile, text(data.refresh_token), { encoding: 'utf8', mode: 0o600 });
}

const supaHeaders = extra => ({
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
  ...(extra || {})
});

async function supa(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: supaHeaders(options.headers) });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status} ${path}: ${body.slice(0, 900)}`);
  return body ? JSON.parse(body) : null;
}

async function list(path) {
  return await supa(path, { method: 'GET' }) || [];
}

async function patchAddress(id, payload) {
  const rows = await supa(`/rest/v1/customer_addresses?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function insertAddress(payload) {
  const rows = await supa('/rest/v1/customer_addresses', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

function uniqueIndex(rows, keyFn) {
  const buckets = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const bucket = buckets.get(key) || [];
    bucket.push(row);
    buckets.set(key, bucket);
  }
  return new Map([...buckets].filter(([, bucket]) => bucket.length === 1).map(([key, bucket]) => [key, bucket[0]]));
}

const state = {
  customers: [],
  byBling: new Map(),
  byDoc: new Map(),
  byPhone: new Map(),
  addressByCustomer: new Map()
};

async function loadLocal() {
  state.customers = await list('/rest/v1/customers?select=id,bling_contact_id,cpf_cnpj,primary_whatsapp_e164&limit=10000');
  const addresses = await list('/rest/v1/customer_addresses?select=id,customer_id,street,number,complement,neighborhood,city,state,postal_code,reference,google_maps_url,is_default,is_active&is_active=eq.true&limit=10000');
  state.byBling = new Map(state.customers.filter(c => Number(c.bling_contact_id) > 0).map(c => [Number(c.bling_contact_id), c]));
  state.byDoc = uniqueIndex(state.customers, c => digits(c.cpf_cnpj) || null);
  state.byPhone = uniqueIndex(state.customers, c => text(c.primary_whatsapp_e164) || null);
  for (const address of addresses) {
    const current = state.addressByCustomer.get(address.customer_id);
    if (!current || (!current.is_default && address.is_default)) state.addressByCustomer.set(address.customer_id, address);
  }
  summary.local_customers = state.customers.length;
  summary.local_addresses_before = state.addressByCustomer.size;
}

function chooseCustomer(contact) {
  const byBling = contact.bling_contact_id ? state.byBling.get(contact.bling_contact_id) : null;
  if (byBling) return { customer: byBling, match: 'bling' };
  const byDoc = contact.cpf_cnpj ? state.byDoc.get(contact.cpf_cnpj) : null;
  const byPhone = contact.phone_e164 ? state.byPhone.get(contact.phone_e164) : null;
  if (byDoc && byPhone && byDoc.id !== byPhone.id) return { conflict: true };
  if (byDoc) return { customer: byDoc, match: 'document' };
  if (byPhone) return { customer: byPhone, match: 'phone' };
  return { customer: null, match: null };
}

async function saveAddress(customerId, blingId, address) {
  const existing = state.addressByCustomer.get(customerId);
  const fields = {};
  for (const key of ['street', 'number', 'complement', 'neighborhood', 'city', 'state', 'postal_code', 'reference']) {
    if (address[key]) fields[key] = address[key];
  }
  if (!Object.keys(fields).length) return;
  const common = {
    ...fields,
    bling_address_ref: `bling-contact-${blingId}`,
    is_default: true,
    is_active: true,
    updated_at: nowIso()
  };
  if (!APPLY) {
    if (existing) summary.addresses_updated++;
    else summary.addresses_created++;
    return;
  }
  if (existing) {
    const saved = await patchAddress(existing.id, common);
    state.addressByCustomer.set(customerId, saved || { ...existing, ...common });
    summary.addresses_updated++;
  } else {
    const saved = await insertAddress({ customer_id: customerId, label: 'Principal', ...common });
    state.addressByCustomer.set(customerId, saved);
    summary.addresses_created++;
  }
}

async function listContactSummaries() {
  const rows = [];
  for (let page = 1; page <= 1000; page++) {
    const query = new URLSearchParams({ pagina: String(page), limite: '100' });
    const response = await bling(`/contatos?${query}`, `Contatos página ${page}`);
    const pageRows = (await response.json())?.data || [];
    rows.push(...pageRows);
    if (pageRows.length < 100) break;
  }
  return rows;
}

async function contactDetail(id) {
  const response = await bling(`/contatos/${encodeURIComponent(id)}`, `Contato ${id}`);
  return (await response.json())?.data || null;
}

async function syncAddresses() {
  const summaries = await listContactSummaries();
  summary.bling_contacts_listed = summaries.length;
  for (const row of summaries) {
    try {
      const detail = await contactDetail(row.id);
      const contact = mapBlingContactAddress(detail || row);
      if (!hasAddress(contact.address)) continue;
      summary.bling_contacts_with_address++;
      const chosen = chooseCustomer(contact);
      if (chosen.conflict) {
        summary.conflicts++;
        continue;
      }
      if (!chosen.customer) {
        summary.unmatched++;
        continue;
      }
      if (chosen.match === 'bling') summary.matched_by_bling_id++;
      if (chosen.match === 'document') summary.matched_by_document++;
      if (chosen.match === 'phone') summary.matched_by_phone++;
      await saveAddress(chosen.customer.id, contact.bling_contact_id, contact.address);
    } catch (error) {
      summary.errors++;
      console.error(`Contato ${row?.id || '?'}: ${error.message}`);
    }
  }
}

try {
  await oauth();
  await loadLocal();
  await syncAddresses();
  report();
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(error.stack || error.message || error);
  summary.fatal_error = String(error.message || error);
  report();
  process.exitCode = 1;
}
