import fs from 'node:fs';

const syncPath = 'scripts/sincronizar-bling.mjs';
const offersPath = 'scripts/processar-ofertas.mjs';
const filterPath = 'producao-v2/js/product-delete-filter.js';
const workflowPath = '.github/workflows/sincronizar-bling.yml';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, content) { fs.writeFileSync(path, content, 'utf8'); }
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${count}`);
  return content.replace(before, after);
}

let sync = read(syncPath);

sync = replaceOnce(sync,
"const identity = value => text(value).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').toLowerCase();",
"const identity = value => text(value).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').toLowerCase();\nconst productSituation = source => {\n  if (sourceValue(source, 'ativo') === false || sourceValue(source, 'visivel') === false) return 'I';\n  const raw = sourceText(source, 'situacao', 'status').toUpperCase();\n  return ['I', 'INATIVO', 'INACTIVE', '0', 'FALSE', 'EXCLUIDO', 'EXCLUÍDO'].includes(raw) ? 'I' : 'A';\n};\nconst normalizedGtin = value => text(value).replace(/\\D/g, '');",
'helpers de situação e GTIN');

sync = replaceOnce(sync,
"    situacao: source.ativo === false || /^inativ/i.test(text(source.situacao)) ? 'I' : 'A'",
"    situacao: productSituation(source)",
'situação no payload legado');
sync = replaceOnce(sync,
"    situacao: sourceValue(source, 'ativo') === false || /^inativ/i.test(sourceText(source, 'situacao')) ? 'I' : 'A'",
"    situacao: productSituation(source)",
'situação no payload principal');

sync = replaceOnce(sync,
"async function blingProducts(accessToken) {\n  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'enable-jwt': '1' };\n  const byCode = new Map();",
"async function blingProducts(accessToken) {\n  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'enable-jwt': '1' };\n  const byCode = new Map();\n  const byId = new Map();\n  const byGtin = new Map();",
'índices do Bling');

sync = replaceOnce(sync,
"      if (text(row.codigo) && row.id !== undefined) {\n        byCode.set(text(row.codigo), { id: row.id, tipo: text(row.tipo), formato: text(row.formato) });\n      }",
"      if (row.id === undefined || row.id === null) continue;\n      const entry = { id: row.id, codigo: text(row.codigo), gtin: normalizedGtin(row.gtin), tipo: text(row.tipo), formato: text(row.formato), situacao: text(row.situacao) };\n      byId.set(String(row.id), entry);\n      if (entry.codigo) byCode.set(entry.codigo, entry);\n      if (entry.gtin && !byGtin.has(entry.gtin)) byGtin.set(entry.gtin, entry);",
'preenchimento dos índices');

sync = replaceOnce(sync,
"  return byCode;\n}\n\nasync function blingProductDetail",
"  return { byCode, byId, byGtin };\n}\n\nasync function blingProductDetail",
'retorno dos índices');

const helpers = `async function safeBlingProductDetail(accessToken, id) {
  if (!id) return null;
  try { return await blingProductDetail(accessToken, id); }
  catch (error) {
    if (/HTTP 404|RESOURCE_NOT_FOUND/i.test(error.message)) return null;
    throw error;
  }
}

function resolveExistingProduct(product, stateEntry, indexes) {
  const stateId = stateEntry?.blingId;
  if (stateId !== undefined && stateId !== null && indexes.byId.has(String(stateId))) return indexes.byId.get(String(stateId));
  const byCode = indexes.byCode.get(product.payload.codigo);
  if (byCode) return byCode;
  const gtin = normalizedGtin(product.payload.gtin);
  if (gtin && indexes.byGtin.has(gtin)) return indexes.byGtin.get(gtin);
  return stateId ? { id: stateId, codigo: stateEntry.codigo || '', tipo: '', formato: '' } : null;
}

async function setProductSituation(accessToken, id, situation, codigo) {
  if (!id) throw new Error(`Produto ${codigo}: ID do Bling ausente para alterar a situação.`);
  await fetchWithRetry(`${API_BASE}/produtos/${encodeURIComponent(id)}/situacoes`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json', 'enable-jwt': '1' },
    body: JSON.stringify({ situacao: situation })
  }, { label: `PATCH situação do produto ${codigo}` });
}

async function inactivateRemovedProducts(accessToken, firebaseKeys, state, indexes) {
  const removed = Object.entries(state.products).filter(([key, entry]) => !firebaseKeys.has(key) && entry?.blingId && entry?.deletedAt === undefined);
  for (const [key, entry] of removed) {
    try {
      const existing = indexes.byId.get(String(entry.blingId)) || await safeBlingProductDetail(accessToken, entry.blingId);
      if (existing && text(existing.situacao).toUpperCase() !== 'I') {
        await setProductSituation(accessToken, entry.blingId, 'I', entry.codigo || key);
        report.inactivatedRemoved++;
        await sleep(450);
      }
      state.products[key] = { ...entry, deletedAt: new Date().toISOString(), deletedReason: 'ausente_no_firebase', lastKnownSituation: 'I' };
    } catch (error) {
      report.errors.push({ firebaseKey: key, codigo: entry.codigo, reason: `Inativação de removido: ${error.message}` });
    }
  }
}

`;
sync = replaceOnce(sync, 'async function sendProduct(accessToken, existing, payload) {', helpers + 'async function sendProduct(accessToken, existing, payload) {', 'helpers de identidade e situação');

sync = replaceOnce(sync,
"  const requestPayload = { ...payload };",
"  const desiredSituation = payload.situacao === 'I' ? 'I' : 'A';\n  const requestPayload = { ...payload };\n  delete requestPayload.situacao;",
'remoção da situação do PUT');

sync = replaceOnce(sync,
"  const body = await response.json().catch(() => ({}));\n  return existingId || body?.data?.id || null;",
"  const body = await response.json().catch(() => ({}));\n  const id = existingId || body?.data?.id || null;\n  if (id) await setProductSituation(accessToken, id, desiredSituation, payload.codigo);\n  return id;",
'PATCH de situação após produto');

sync = replaceOnce(sync,
"  stockChecked: 0, stockUpdated: 0, stockUnchanged: 0, stockSkipped: 0,\n  invalid: [], errors: [], batches: 0",
"  stockChecked: 0, stockUpdated: 0, stockUnchanged: 0, stockSkipped: 0,\n  inactivatedRemoved: 0, restored: 0, identityConflicts: [],\n  invalid: [], errors: [], batches: 0",
'métricas do relatório');

sync = replaceOnce(sync,
"    const existingByCode = await blingProducts(accessToken);",
"    const indexes = await blingProducts(accessToken);\n    const firebaseKeys = new Set(products.map(product => product.firebaseKey));\n    await inactivateRemovedProducts(accessToken, firebaseKeys, state, indexes);",
'carregamento de índices e removidos');

sync = replaceOnce(sync,
"      .map(product => existingByCode.get(product.payload.codigo)?.id || state.products[product.firebaseKey]?.blingId)",
"      .map(product => resolveExistingProduct(product, state.products[product.firebaseKey], indexes)?.id || state.products[product.firebaseKey]?.blingId)",
'identidade para estoque');

sync = replaceOnce(sync,
"          const existing = existingByCode.get(product.payload.codigo);\n          let id = existing?.id || state.products[product.firebaseKey]?.blingId || null;",
"          const previousState = state.products[product.firebaseKey] || {};\n          const existing = resolveExistingProduct(product, previousState, indexes);\n          let id = existing?.id || previousState.blingId || null;\n          if (existing && previousState.blingId && String(existing.id) !== String(previousState.blingId)) {\n            report.identityConflicts.push({ firebaseKey: product.firebaseKey, codigo: product.payload.codigo, stateBlingId: previousState.blingId, resolvedBlingId: existing.id });\n            throw new Error(`Conflito de identidade: estado aponta para ${previousState.blingId}, mas código/GTIN encontrou ${existing.id}.`);\n          }\n          if (previousState.deletedAt && id) report.restored++;",
'identidade no processamento');

sync = replaceOnce(sync,
"            state.products[product.firebaseKey] = { ...state.products[product.firebaseKey], hash: hash(product.fingerprint), blingId: id, codigo: product.payload.codigo, syncedAt: new Date().toISOString() };\n            if (existing) report.updated++; else {\n              report.created++;\n              if (id) existingByCode.set(product.payload.codigo, { id, tipo: 'P', formato: 'S' });\n            }",
"            state.products[product.firebaseKey] = { ...state.products[product.firebaseKey], hash: hash(product.fingerprint), blingId: id, codigo: product.payload.codigo, syncedAt: new Date().toISOString(), deletedAt: undefined, deletedReason: undefined, lastKnownSituation: product.payload.situacao };\n            if (existing) report.updated++; else {\n              report.created++;\n              if (id) {\n                const created = { id, codigo: product.payload.codigo, gtin: normalizedGtin(product.payload.gtin), tipo: 'P', formato: 'S', situacao: product.payload.situacao };\n                indexes.byId.set(String(id), created);\n                indexes.byCode.set(product.payload.codigo, created);\n                if (created.gtin) indexes.byGtin.set(created.gtin, created);\n              }\n            }",
'atualização do estado e índices');

write(syncPath, sync);

let offers = read(offersPath);
offers = replaceOnce(offers,
"    writeJson(PRODUCTS_HOME_PATH, Object.fromEntries(Object.entries(result.products).map(([key, product]) => [key, homeProduct(key, product)]))),",
"    writeJson(PRODUCTS_HOME_PATH, Object.fromEntries(Object.entries(result.products)\n      .filter(([, product]) => productEligible(product, new Date()))\n      .map(([key, product]) => [key, homeProduct(key, product)]))),",
'filtro público na rotina de ofertas');
write(offersPath, offers);

let filter = read(filterPath);
filter = replaceOnce(filter,
"  function remember(key) {\n    const normalized = text(decodeURIComponent(text(key)));\n    if (!normalized) return;\n    const map = readMap();\n    map[normalized] = Date.now();\n    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));\n  }",
"  function remember(key) {\n    const normalized = text(decodeURIComponent(text(key)));\n    if (!normalized) return;\n    const map = readMap();\n    map[normalized] = Date.now();\n    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));\n  }\n\n  function forget(key) {\n    const normalized = text(decodeURIComponent(text(key)));\n    if (!normalized) return;\n    const map = readMap();\n    if (!Object.prototype.hasOwnProperty.call(map, normalized)) return;\n    delete map[normalized];\n    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));\n  }",
'função para restaurados');
filter = replaceOnce(filter,
"    const response = await originalFetch(input, init);\n    const deletedKey = deletedKeyFromRequest(input, init);\n    if (response.ok && deletedKey) remember(deletedKey);",
"    const response = await originalFetch(input, init);\n    const deletedKey = deletedKeyFromRequest(input, init);\n    if (response.ok && deletedKey) remember(deletedKey);\n    if (response.ok && !deletedKey) {\n      const method = text(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();\n      const requestUrl = text(input instanceof Request ? input.url : input);\n      if (['PUT', 'PATCH'].includes(method) && requestUrl.includes(`/${productsNode()}/`) && requestUrl.endsWith('.json')) {\n        try {\n          const parsed = new URL(requestUrl, location.href);\n          const marker = `/${productsNode()}/`;\n          const key = decodeURIComponent(parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length, -5));\n          forget(key);\n        } catch {}\n      }\n    }",
'liberação de produto restaurado');
filter = filter.replace('window.AdminV2DeletedProducts = { remember, filterData, keys: () => [...deletedSet()] };', 'window.AdminV2DeletedProducts = { remember, forget, filterData, keys: () => [...deletedSet()] };');
write(filterPath, filter);

let workflow = read(workflowPath);
workflow = replaceOnce(workflow,
"  repository_dispatch:\n    types: [bling-sync]",
"  repository_dispatch:\n    types: [bling-sync]\n  schedule:\n    - cron: '23 * * * *'",
'agendamento do Bling');
workflow = replaceOnce(workflow,
"      SYNC_MODE: ${{ github.event_name == 'workflow_dispatch' && inputs.mode || github.event.client_payload.mode || 'dry-run' }}\n      MAX_PRODUCTS: ${{ github.event_name == 'workflow_dispatch' && inputs.max_products || github.event.client_payload.max_products || '0' }}\n      SYNC_STOCK: ${{ github.event_name == 'workflow_dispatch' && inputs.sync_stock || github.event.client_payload.sync_stock || 'no' }}",
"      SYNC_MODE: ${{ github.event_name == 'schedule' && 'production' || github.event_name == 'workflow_dispatch' && inputs.mode || github.event.client_payload.mode || 'dry-run' }}\n      MAX_PRODUCTS: ${{ github.event_name == 'workflow_dispatch' && inputs.max_products || github.event.client_payload.max_products || '0' }}\n      SYNC_STOCK: ${{ github.event_name == 'workflow_dispatch' && inputs.sync_stock || github.event.client_payload.sync_stock || 'no' }}",
'modo do agendamento');
write(workflowPath, workflow);

for (const path of [syncPath, offersPath, filterPath]) {
  const source = read(path);
  if (!source.trim()) throw new Error(`Arquivo vazio: ${path}`);
}
console.log('Correções Bling V2 aplicadas.');
