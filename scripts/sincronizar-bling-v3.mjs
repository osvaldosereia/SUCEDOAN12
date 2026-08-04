import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const APPLY = process.argv.includes('--apply');
const stateIndex = process.argv.indexOf('--state');
const STATE_FILE = stateIndex >= 0 ? process.argv[stateIndex + 1] : '.automation/bling-sync-state.json';
const REPORT_FILE = process.env.BLING_REPORT_FILE || 'bling-sync-report.json';
const API_BASE = 'https://api.bling.com.br/Api/v3';
const MAX_PRODUCTS = Math.max(0, Number.parseInt(process.env.MAX_PRODUCTS || '0', 10) || 0);
const SYNC_STOCK = /^(1|true|yes|sim)$/i.test(String(process.env.SYNC_STOCK || '').trim());
const MIN_INTERVAL_MS = Math.max(360, Number(process.env.BLING_REQUEST_INTERVAL_MS || 420));
let accessToken = '';
let lastRequestAt = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = value => String(value ?? '').trim();
const normalized = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase();
const digits = value => text(value).replace(/\D/g, '');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const number = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = text(value).replace(/[^0-9,.-]/g, '');
  if (!raw) return 0;
  const comma = raw.lastIndexOf(','), dot = raw.lastIndexOf('.');
  return Number(comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')) || 0;
};
const timestamp = value => {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`A secret ${name} não foi configurada.`);
  return value;
}
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function readState() {
  if (!existsSync(STATE_FILE)) return { version: 3, products: {} };
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return { version: 3, products: state.products && typeof state.products === 'object' ? state.products : {} };
  } catch {
    return { version: 3, products: {} };
  }
}
async function pace() {
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  lastRequestAt = Date.now();
}
async function api(path, options = {}, { label = path, attempts = 5, allow404 = false } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await pace();
    let response;
    try { response = await fetch(`${API_BASE}${path}`, options); }
    catch (error) {
      if (attempt === attempts) throw new Error(`${label}: falha de rede (${error.message})`);
      await sleep(attempt * 1000);
      continue;
    }
    if (response.ok || (allow404 && response.status === 404)) return response;
    const body = (await response.text()).slice(0, 1000);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === attempts) throw new Error(`${label}: HTTP ${response.status} ${body}`);
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * attempt * 1000);
  }
}
async function oauth() {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: required('BLING_REFRESH_TOKEN') });
  const basic = Buffer.from(`${required('BLING_CLIENT_ID')}:${required('BLING_CLIENT_SECRET')}`).toString('base64');
  const response = await api('/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'enable-jwt': '1' },
    body
  }, { label: 'OAuth do Bling', attempts: 3 });
  const data = await response.json();
  if (!text(data.access_token)) throw new Error('OAuth do Bling não retornou access_token.');
  const file = text(process.env.BLING_REFRESH_TOKEN_FILE);
  if (file && text(data.refresh_token)) writeFileSync(file, text(data.refresh_token), { encoding: 'utf8', mode: 0o600 });
  return text(data.access_token);
}
const headers = extra => ({ Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'enable-jwt': '1', ...(extra || {}) });

function productStatus(source) {
  const raw = text(source.situacao ?? source.status).toUpperCase();
  if (source.ativo === false || source.visivel === false) return 'I';
  return ['I', 'INATIVO', 'INACTIVE', '0', 'FALSE', 'E', 'EXCLUIDO', 'EXCLUÍDO'].includes(raw) ? 'I' : 'A';
}
function productFromFirebase(firebaseKey, source) {
  const codigo = text(source.codigo || source.sku || source.id);
  const nome = text(source.nome || source.name || source.descricao);
  if (!codigo || !nome) throw new Error('Produto sem código ou nome.');
  const gtin = digits(source.gtin || source.ean);
  const ncm = digits(source.ncm);
  if (ncm && ncm.length !== 8) throw new Error(`NCM inválido: ${source.ncm}`);
  const payload = {
    codigo, nome, preco: number(source.preco), unidade: text(source.unidade) || 'UN'
  };
  const copyText = (key, ...sources) => {
    const value = sources.map(name => source[name]).find(value => text(value));
    if (text(value)) payload[key] = text(value);
  };
  copyText('descricaoCurta', 'descricaoCurta', 'descricao_curta');
  copyText('descricaoComplementar', 'descricaoComplementar', 'descricao_complementar', 'descricao');
  copyText('dataValidade', 'dataValidade', 'data_validade');
  copyText('marca', 'marca');
  copyText('observacoes', 'observacoes');
  copyText('linkExterno', 'linkExterno', 'link_externo');
  if (gtin) payload.gtin = gtin;
  const gtinEmbalagem = digits(source.gtinEmbalagem || source.gtin_embalagem || source.ean_embalagem);
  if (gtinEmbalagem) payload.gtinEmbalagem = gtinEmbalagem;
  if (ncm) payload.tributacao = { ...(payload.tributacao || {}), ncm };
  if (text(source.cest)) payload.tributacao = { ...(payload.tributacao || {}), cest: text(source.cest) };
  if (source.origem !== undefined || source.origem_tributaria !== undefined) payload.tributacao = { ...(payload.tributacao || {}), origem: number(source.origem ?? source.origem_tributaria) };
  const estoqueConfig = {};
  if (source.estoque_minimo !== undefined) estoqueConfig.minimo = number(source.estoque_minimo);
  if (source.estoque_maximo !== undefined) estoqueConfig.maximo = number(source.estoque_maximo);
  if (text(source.localizacao)) estoqueConfig.localizacao = text(source.localizacao);
  if (source.crossDocking !== undefined || source.crossdocking !== undefined) estoqueConfig.crossDocking = number(source.crossDocking ?? source.crossdocking);
  if (Object.keys(estoqueConfig).length) payload.estoque = estoqueConfig;
  const dimensoes = {};
  for (const key of ['largura', 'altura']) if (source[key] !== undefined) dimensoes[key] = number(source[key]);
  if (source.profundidade !== undefined || source.comprimento !== undefined) dimensoes.profundidade = number(source.profundidade ?? source.comprimento);
  if (text(source.unidadeMedida || source.unidade_medida)) dimensoes.unidadeMedida = text(source.unidadeMedida || source.unidade_medida);
  if (Object.keys(dimensoes).length) payload.dimensoes = dimensoes;
  const image = text(source.url_imagem || source.imagem_url);
  if (/^https?:\/\//i.test(image)) payload.midia = { imagens: { externas: [{ link: image }] } };
  const categoryPath = [source.categoria, source.subcategoria, source.subsubcategoria].map(text).filter(Boolean);
  const supplier = text(source.fornecedor) ? {
    nome: text(source.fornecedor), codigo: text(source.codigo_fornecedor),
    precoCusto: source.preco_custo === undefined ? undefined : number(source.preco_custo)
  } : null;
  const stockPresent = source.estoque !== undefined && source.estoque !== null && text(source.estoque) !== '';
  const stock = stockPresent ? number(source.estoque) : 0;
  if (stock < 0) throw new Error('Estoque negativo não é permitido.');
  const changedAt = Math.max(timestamp(source.updated_at), timestamp(source.last_update), timestamp(source.stock_updated_at));
  return {
    firebaseKey, codigo, nome, gtin, payload, status: productStatus(source), categoryPath, supplier,
    stockPresent, stock, changedAt,
    fingerprint: hash({ payload, status: productStatus(source), categoryPath, supplier })
  };
}
async function firebaseProducts() {
  const response = await fetch(`${required('FIREBASE_DATABASE_URL').replace(/\/$/, '')}/produtos.json`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firebase: HTTP ${response.status} ${(await response.text()).slice(0, 500)}`);
  const data = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Firebase retornou /produtos em formato inválido.');
  return data;
}
async function listProducts() {
  const rows = [];
  for (let page = 1; page <= 1000; page++) {
    const query = new URLSearchParams({ pagina: String(page), limite: '100', criterio: '5', tipo: 'T' });
    const response = await api(`/produtos?${query}`, { headers: headers() }, { label: `Produtos Bling página ${page}` });
    const pageRows = (await response.json())?.data || [];
    rows.push(...pageRows);
    if (pageRows.length < 100) break;
  }
  return rows;
}
function indexes(rows) {
  const byId = new Map(), codeBuckets = new Map(), gtinBuckets = new Map();
  for (const row of rows) {
    if (row?.id === undefined) continue;
    byId.set(String(row.id), row);
    if (text(row.codigo)) (codeBuckets.get(text(row.codigo)) || codeBuckets.set(text(row.codigo), []).get(text(row.codigo))).push(row);
    const gtin = digits(row.gtin || row.ean);
    if (gtin) (gtinBuckets.get(gtin) || gtinBuckets.set(gtin, []).get(gtin)).push(row);
  }
  const unique = buckets => new Map([...buckets].filter(([, values]) => values.length === 1).map(([key, values]) => [key, values[0]]));
  return { byId, byCode: unique(codeBuckets), byGtin: unique(gtinBuckets), duplicateCodes: new Map([...codeBuckets].filter(([, values]) => values.length > 1)) };
}
function resolve(product, previous, maps) {
  const stateRow = previous?.blingId ? maps.byId.get(String(previous.blingId)) : null;
  const codeRow = maps.byCode.get(product.codigo) || null;
  if (stateRow) {
    if (codeRow && String(codeRow.id) !== String(stateRow.id)) return { conflict: 'codigo_ocupado', stateRow, codeRow };
    return { row: stateRow, matchedBy: 'state-id' };
  }
  if (maps.duplicateCodes.has(product.codigo)) {
    const rows = maps.duplicateCodes.get(product.codigo);
    const gtinMatches = product.gtin ? rows.filter(row => digits(row.gtin || row.ean) === product.gtin) : [];
    if (gtinMatches.length === 1) return { row: gtinMatches[0], matchedBy: 'gtin-entre-duplicados' };
    return { conflict: 'codigo_duplicado', rows };
  }
  if (codeRow) return { row: codeRow, matchedBy: 'codigo' };
  if (product.gtin && maps.byGtin.has(product.gtin)) return { row: maps.byGtin.get(product.gtin), matchedBy: 'gtin' };
  return { row: null, matchedBy: '' };
}
async function detail(id) {
  const response = await api(`/produtos/${encodeURIComponent(id)}`, { headers: headers() }, { label: `Detalhe produto ${id}` });
  return (await response.json())?.data || {};
}
function completePayload(current, desired, summary) {
  const allowed = ['nome','codigo','preco','tipo','formato','descricaoCurta','descricaoComplementar','dataValidade','unidade','pesoLiquido','pesoBruto','volumes','itensPorCaixa','gtin','gtinEmbalagem','tipoProducao','condicao','freteGratis','marca','observacoes','linkExterno','estoque','dimensoes','tributacao','midia','categoria'];
  const payload = {};
  for (const key of allowed) if (current[key] !== undefined && current[key] !== null) payload[key] = current[key];
  Object.assign(payload, desired);
  payload.tipo = text(payload.tipo || summary.tipo || 'P');
  payload.formato = text(payload.formato || summary.formato || 'S');
  delete payload.situacao;
  return payload;
}
async function updateProduct(id, desired, summary) {
  const payload = completePayload(await detail(id), desired, summary);
  await api(`/produtos/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload)
  }, { label: `PUT produto ${desired.codigo}` });
}
async function createProduct(product) {
  const payload = { ...product.payload, tipo: 'P', formato: 'S', situacao: product.status };
  const response = await api('/produtos', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload) }, { label: `POST produto ${product.codigo}` });
  const id = (await response.json().catch(() => ({})))?.data?.id;
  if (!id) throw new Error(`Produto ${product.codigo}: Bling não retornou ID.`);
  return id;
}
async function setStatus(id, status, codigo) {
  await api(`/produtos/${encodeURIComponent(id)}/situacoes`, {
    method: 'PATCH', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ situacao: status })
  }, { label: `Situação ${status} do produto ${codigo}` });
}
async function defaultDeposit() {
  const response = await api('/depositos?pagina=1&limite=100&situacao=1', { headers: headers() }, { label: 'Depósitos' });
  const rows = (await response.json())?.data || [];
  const found = rows.find(row => row.padrao === true || normalized(row.descricao) === 'geral');
  if (!found?.id) throw new Error('Depósito padrão/Geral não encontrado.');
  return found;
}
async function balances(ids, depositId) {
  const map = new Map();
  for (let start = 0; start < ids.length; start += 100) {
    const query = new URLSearchParams();
    ids.slice(start, start + 100).forEach(id => query.append('idsProdutos[]', id));
    const rows = (await (await api(`/estoques/saldos?${query}`, { headers: headers() }, { label: 'Saldos' })).json())?.data || [];
    for (const row of rows) {
      const deposit = (row.depositos || []).find(item => String(item.id) === String(depositId));
      map.set(String(row.produto?.id), deposit ? number(deposit.saldoFisico) : 0);
    }
  }
  return map;
}
async function moveStock(id, depositId, desired, current, codigo) {
  const difference = Math.round((desired - current) * 1e6) / 1e6;
  if (Math.abs(difference) < 1e-6) return false;
  await api('/estoques', {
    method: 'POST', headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ deposito: { id: depositId }, produto: { id }, operacao: difference > 0 ? 'E' : 'S', quantidade: Math.abs(difference), observacoes: `Sincronização Firebase (${codigo})` })
  }, { label: `Estoque ${codigo}` });
  return true;
}

const report = {
  startedAt: new Date().toISOString(), mode: APPLY ? 'production' : 'dry-run', stockSync: SYNC_STOCK,
  firebaseProducts: 0, blingProducts: 0, selected: 0, created: 0, updated: 0, unchanged: 0,
  statusUpdated: 0, inactivatedRemoved: 0, restored: 0, codeChanges: 0,
  matchedByStateId: 0, matchedByCode: 0, matchedByGtin: 0,
  stockChecked: 0, stockUpdated: 0, stockUnchanged: 0,
  deferred: 0, invalid: [], conflicts: [], errors: []
};

try {
  const state = readState();
  const raw = await firebaseProducts();
  const products = [];
  for (const [key, source] of Object.entries(raw)) {
    try { if (source && typeof source === 'object' && !Array.isArray(source)) products.push(productFromFirebase(key, source)); }
    catch (error) { report.invalid.push({ firebaseKey: key, reason: error.message }); }
  }
  report.firebaseProducts = products.length;
  accessToken = await oauth();
  const blingRows = await listProducts();
  report.blingProducts = blingRows.length;
  const maps = indexes(blingRows);

  const removed = Object.entries(state.products).filter(([key, entry]) => !raw[key] && entry?.blingId && entry?.localStatus !== 'removed').map(([key, entry]) => ({ kind: 'removed', key, entry }));
  const work = [...products.map(product => ({ kind: 'product', product })), ...removed];
  const selected = MAX_PRODUCTS > 0 ? work.slice(0, MAX_PRODUCTS) : work;
  report.selected = selected.length;
  report.deferred = work.length - selected.length;
  const stockWork = [];

  for (const item of selected) {
    if (item.kind === 'removed') {
      const row = maps.byId.get(String(item.entry.blingId));
      if (!row) { report.conflicts.push({ firebaseKey: item.key, reason: 'blingId histórico removido não existe mais no Bling.' }); continue; }
      if (APPLY && text(row.situacao).toUpperCase() !== 'I') await setStatus(row.id, 'I', item.entry.codigo || item.key);
      if (APPLY) state.products[item.key] = { ...item.entry, localStatus: 'removed', blingStatus: 'I', deletedAt: new Date().toISOString(), syncedAt: new Date().toISOString() };
      report.inactivatedRemoved++;
      continue;
    }
    const product = item.product;
    const previous = state.products[product.firebaseKey] || {};
    try {
      const resolved = resolve(product, previous, maps);
      if (resolved.conflict) {
        report.conflicts.push({ firebaseKey: product.firebaseKey, codigo: product.codigo, gtin: product.gtin, reason: resolved.conflict, blingIdHistorico: resolved.stateRow?.id, blingIdDoCodigo: resolved.codeRow?.id, idsDuplicados: resolved.rows?.map(row => row.id) });
        continue;
      }
      const existing = resolved.row;
      if (resolved.matchedBy === 'state-id') report.matchedByStateId++;
      else if (resolved.matchedBy === 'codigo') report.matchedByCode++;
      else if (resolved.matchedBy?.includes('gtin')) report.matchedByGtin++;
      const desiredStatus = product.status;
      const currentStatus = text(existing?.situacao).toUpperCase();
      const codeChanged = Boolean(existing && text(existing.codigo) !== product.codigo);
      const dataChanged = !existing || previous.fingerprint !== product.fingerprint || codeChanged;
      const statusChanged = Boolean(existing && currentStatus !== desiredStatus);
      let id = existing?.id || null;
      if (!id) {
        if (APPLY) id = await createProduct(product); else id = `novo:${product.firebaseKey}`;
        report.created++;
      } else if (dataChanged) {
        if (codeChanged) report.codeChanges++;
        if (APPLY) await updateProduct(id, product.payload, existing);
        report.updated++;
      } else report.unchanged++;
      if (statusChanged) {
        if (APPLY) await setStatus(id, desiredStatus, product.codigo);
        report.statusUpdated++;
      }
      if (previous.localStatus === 'removed' && desiredStatus === 'A') report.restored++;
      if (APPLY && !String(id).startsWith('novo:')) state.products[product.firebaseKey] = {
        ...previous, version: 3, fingerprint: product.fingerprint, blingId: id, codigo: product.codigo,
        localStatus: 'present', blingStatus: desiredStatus, syncedAt: new Date().toISOString(), deletedAt: null
      };
      if (product.stockPresent && SYNC_STOCK && desiredStatus !== 'I' && !String(id).startsWith('novo:')) stockWork.push({ product, id });
    } catch (error) {
      report.errors.push({ firebaseKey: product.firebaseKey, codigo: product.codigo, reason: error.message });
    }
  }

  if (SYNC_STOCK && stockWork.length) {
    const deposit = await defaultDeposit();
    const current = await balances([...new Set(stockWork.map(item => String(item.id)))], deposit.id);
    for (const { product, id } of stockWork) {
      report.stockChecked++;
      try {
        const value = current.get(String(id)) ?? 0;
        if (APPLY ? await moveStock(id, deposit.id, product.stock, value, product.codigo) : Math.abs(product.stock - value) > 1e-6) report.stockUpdated++;
        else report.stockUnchanged++;
      } catch (error) { report.errors.push({ firebaseKey: product.firebaseKey, codigo: product.codigo, reason: error.message }); }
    }
  }

  report.finishedAt = new Date().toISOString();
  if (APPLY) writeJson(STATE_FILE, state);
  writeJson(REPORT_FILE, report);
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length || report.conflicts.length) process.exitCode = 1;
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.errors.push({ reason: error.message });
  writeJson(REPORT_FILE, report);
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
