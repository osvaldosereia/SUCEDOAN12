import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const APPLY = process.argv.includes('--apply');
const stateArg = process.argv.indexOf('--state');
const STATE_FILE = stateArg >= 0 ? process.argv[stateArg + 1] : '.automation/bling-sync-state.json';
const BATCH_SIZE = 999; // mesmo teto da importação de produtos do Bling
const MAX_PRODUCTS = Math.max(0, Number.parseInt(process.env.MAX_PRODUCTS || '0', 10) || 0); // 0 = todos
const API_BASE = 'https://api.bling.com.br/Api/v3';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const text = value => String(value ?? '').trim();
const number = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = text(value).replace(/[^0-9,.-]/g, '');
  if (!raw) return 0;
  const comma = raw.lastIndexOf(','), dot = raw.lastIndexOf('.');
  const normalized = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  return Number(normalized) || 0;
};
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const SYNC_STOCK = /^(1|true|yes|sim)$/i.test(text(process.env.SYNC_STOCK));

for (const key of ['FIREBASE_DATABASE_URL', 'BLING_CLIENT_ID', 'BLING_CLIENT_SECRET', 'BLING_REFRESH_TOKEN']) {
  if (!text(process.env[key])) throw new Error(`A secret ${key} não foi configurada.`);
}

function readState() {
  if (!existsSync(STATE_FILE)) return { version: 1, products: {} };
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return { version: 1, products: state.products && typeof state.products === 'object' ? state.products : {} };
  } catch { return { version: 1, products: {} }; }
}
function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function fetchWithRetry(url, options = {}, { label = url, attempts = 5 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response;
    try { response = await fetch(url, options); }
    catch (error) {
      if (attempt === attempts) throw new Error(`${label}: falha de rede (${error.message})`);
      await sleep(1000 * attempt);
      continue;
    }
    if (response.ok) return response;
    const body = (await response.text()).slice(0, 600);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === attempts) throw new Error(`${label}: HTTP ${response.status} ${body}`);
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt * attempt);
  }
}

async function token() {
  const basic = Buffer.from(`${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: process.env.BLING_REFRESH_TOKEN });
  const response = await fetchWithRetry(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'enable-jwt': '1' },
    body
  }, { label: 'OAuth do Bling' });
  const data = await response.json();
  if (!text(data.access_token)) throw new Error('OAuth do Bling não retornou access_token.');
  // O Bling devolve refresh_token também nas renovações. Nunca o colocamos em
  // log ou no relatório: no Actions ele fica só em um arquivo temporário,
  // consumido pelo passo seguinte para atualizar a secret do repositório.
  if (text(data.refresh_token) && text(process.env.BLING_REFRESH_TOKEN_FILE)) {
    writeFileSync(process.env.BLING_REFRESH_TOKEN_FILE, text(data.refresh_token), { encoding: 'utf8', mode: 0o600 });
    console.log('Refresh token do Bling renovado com segurança.');
  }
  return data.access_token;
}

function optional(target, key, value) { if (value !== undefined && value !== null && text(value) !== '') target[key] = value; }
function sourceStock(source) {
  // Nao use "quantidade" generico: em alguns cadastros ele e quantidade de
  // embalagem. Somente campos explicitamente de estoque podem alterar saldo.
  const keys = ['estoque', 'estoqueAtual', 'estoque_atual', 'saldoEstoque', 'saldo_estoque', 'quantidadeEstoque', 'quantidade_estoque', 'stock'];
  const key = keys.find(candidate => hasOwn(source, candidate) && text(source[candidate]) !== '');
  if (!key) return { present: false };
  const value = number(source[key]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`estoque invalido no campo ${key}`);
  return { present: true, value };
}
function sourceToPayload(source) {
  const codigo = text(source.codigo || source.sku || source.id);
  const nome = text(source.nome || source.descricao || source.name);
  if (!codigo || !nome) throw new Error('produto sem Código ou Descrição');
  const payload = {
    codigo,
    nome,
    preco: number(source.preco),
    unidade: text(source.unidade) || 'UN',
    situacao: source.ativo === false || /^inativ/i.test(text(source.situacao)) ? 'I' : 'A'
  };
  optional(payload, 'descricaoCurta', text(source.descricao_curta || source.descrição_curta));
  optional(payload, 'descricaoComplementar', text(source.descricao || source.descrição));
  optional(payload, 'gtin', text(source.gtin || source.ean));
  optional(payload, 'gtinEmbalagem', text(source.gtin_embalagem || source.ean_embalagem));
  optional(payload, 'marca', text(source.marca));
  optional(payload, 'observacoes', text(source.observacoes || source.observações));
  optional(payload, 'linkExterno', text(source.link_externo));
  // Deliberadamente não há categoria, grupo de produto, fornecedor ou código de fornecedor neste payload.
  return payload;
}

async function firebaseProducts() {
  const url = `${process.env.FIREBASE_DATABASE_URL.replace(/\/$/, '')}/produtos.json`;
  const response = await fetchWithRetry(url, { headers: { Accept: 'application/json' } }, { label: 'Firebase' });
  const data = await response.json();
  const entries = Array.isArray(data) ? data.map((value, index) => [String(index), value]) : Object.entries(data || {});
  const products = [], skipped = [];
  for (const [key, value] of entries) {
    if (!value || typeof value !== 'object') continue;
    try {
      const stock = sourceStock(value);
      products.push({ firebaseKey: key, payload: sourceToPayload(value), stock });
    }
    catch (error) { skipped.push({ firebaseKey: key, reason: error.message }); }
  }
  return { products, skipped };
}

async function blingProducts(accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'enable-jwt': '1' };
  const byCode = new Map();
  for (let page = 1; page <= 1000; page++) {
    const response = await fetchWithRetry(`${API_BASE}/produtos?pagina=${page}&limite=100`, { headers }, { label: `Listagem Bling página ${page}` });
    const body = await response.json();
    const rows = Array.isArray(body.data) ? body.data : [];
    // A listagem pode trazer tipo/formato. Quando não trouxer, buscamos o
    // detalhe do produto antes do PUT para não remover campos obrigatórios.
    for (const row of rows) {
      if (text(row.codigo) && row.id !== undefined) {
        byCode.set(text(row.codigo), { id: row.id, tipo: text(row.tipo), formato: text(row.formato) });
      }
    }
    if (rows.length < 100) break;
    await sleep(450); // 2,2 req/s: abaixo do limite global de 3 req/s do Bling
  }
  return byCode;
}

async function blingProductDetail(accessToken, id) {
  const response = await fetchWithRetry(`${API_BASE}/produtos/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'enable-jwt': '1' }
  }, { label: `Detalhe do produto Bling ${id}` });
  const body = await response.json();
  return body?.data || {};
}

async function sendProduct(accessToken, existing, payload) {
  const existingId = typeof existing === 'object' ? existing?.id : existing;
  const method = existingId ? 'PUT' : 'POST';
  const url = existingId ? `${API_BASE}/produtos/${encodeURIComponent(existingId)}` : `${API_BASE}/produtos`;
  const requestPayload = { ...payload };

  if (existingId) {
    let tipo = text(existing?.tipo);
    let formato = text(existing?.formato);
    if (!tipo || !formato) {
      const detail = await blingProductDetail(accessToken, existingId);
      tipo = text(detail.tipo);
      formato = text(detail.formato);
      await sleep(450); // mantém o total abaixo de 3 requisições/segundo
    }
    if (!tipo || !formato) throw new Error(`Produto ${payload.codigo}: Bling não retornou tipo e formato obrigatórios.`);
    requestPayload.tipo = tipo;
    requestPayload.formato = formato;
  } else {
    // Produto novo simples. Os itens existentes sempre usam os valores já
    // cadastrados no Bling, preservando suas estruturas ou variações.
    requestPayload.tipo = 'P';
    requestPayload.formato = 'S';
  }

  const response = await fetchWithRetry(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json', 'enable-jwt': '1' },
    body: JSON.stringify(requestPayload)
  }, { label: `${method} produto ${payload.codigo}` });
  const body = await response.json().catch(() => ({}));
  return existingId || body?.data?.id || null;
}

async function defaultDeposit(accessToken) {
  const response = await fetchWithRetry(`${API_BASE}/depositos?pagina=1&limite=100&situacao=1`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'enable-jwt': '1' }
  }, { label: 'Listagem de depositos do Bling' });
  const rows = (await response.json())?.data || [];
  const deposit = rows.find(row => row.padrao === true || text(row.padrao).toLowerCase() === 'true');
  if (!deposit?.id) throw new Error('O Bling nao retornou um deposito padrao ativo. Confirme o deposito Geral como padrao.');
  console.log(`Deposito padrao do Bling: ${text(deposit.descricao) || 'Geral'} (id ${deposit.id}).`);
  return deposit;
}

async function physicalBalances(accessToken, productIds, depositId) {
  const balances = new Map();
  for (let start = 0; start < productIds.length; start += 100) {
    const ids = productIds.slice(start, start + 100);
    const query = new URLSearchParams();
    for (const id of ids) query.append('idsProdutos[]', id);
    const response = await fetchWithRetry(`${API_BASE}/estoques/saldos?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'enable-jwt': '1' }
    }, { label: `Saldos de estoque Bling (${start + 1}-${start + ids.length})` });
    const rows = (await response.json())?.data || [];
    for (const row of rows) {
      const productId = row?.produto?.id;
      if (productId === undefined || productId === null) continue;
      const deposit = (row.depositos || []).find(item => String(item.id) === String(depositId));
      balances.set(String(productId), deposit ? number(deposit.saldoFisico) : 0);
    }
    await sleep(450);
  }
  return balances;
}

async function reconcileStock(accessToken, { productId, depositId, desired, current, codigo }) {
  const difference = Math.round((desired - current) * 1000000) / 1000000;
  if (Math.abs(difference) < 0.000001) return false;
  // A API v3 registra movimentos: E e entrada e S e saida. Nao enviamos um
  // "saldo final" sem auditoria; aplicamos somente a diferenca para o Geral.
  await sleep(450);
  await fetchWithRetry(`${API_BASE}/estoques`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json', 'enable-jwt': '1' },
    body: JSON.stringify({
      deposito: { id: depositId },
      produto: { id: productId },
      operacao: difference > 0 ? 'E' : 'S',
      quantidade: Math.abs(difference),
      observacoes: `Sincronizacao automatica Firebase (produto ${codigo})`
    })
  }, { label: `Movimento de estoque do produto ${codigo}` });
  return true;
}

const report = {
  startedAt: new Date().toISOString(), mode: APPLY ? 'production' : 'dry-run',
  stockSync: SYNC_STOCK, created: 0, updated: 0, unchanged: 0, deferred: 0,
  stockChecked: 0, stockUpdated: 0, stockUnchanged: 0, stockSkipped: 0,
  invalid: [], errors: [], batches: 0
};
try {
  const state = readState();
  const { products, skipped } = await firebaseProducts();
  report.invalid.push(...skipped);
  const changed = products.filter(product => state.products[product.firebaseKey]?.hash !== hash(product.payload));
  // Com SYNC_STOCK=yes, sempre conciliamos o saldo: uma venda ou ajuste no
  // Bling nao pode vencer a fonte oficial, mesmo sem nova edicao no Firebase.
  const stockCandidates = SYNC_STOCK ? products.filter(product => product.stock.present) : [];
  const workByKey = new Map();
  for (const product of changed) workByKey.set(product.firebaseKey, { ...product, catalogChanged: true });
  for (const product of stockCandidates) {
    const previous = workByKey.get(product.firebaseKey);
    workByKey.set(product.firebaseKey, { ...(previous || product), catalogChanged: previous?.catalogChanged || false });
  }
  const work = [...workByKey.values()];
  const selected = MAX_PRODUCTS > 0 ? work.slice(0, MAX_PRODUCTS) : work;
  report.unchanged = products.length - changed.length;
  report.deferred = work.length - selected.length;
  report.stockChecked = selected.filter(product => product.stock.present && SYNC_STOCK).length;
  const batches = Array.from({ length: Math.ceil(selected.length / BATCH_SIZE) }, (_, index) => selected.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE));
  report.batches = batches.length;
  console.log(`${products.length} produtos no Firebase; ${changed.length} pendentes; ${selected.length} selecionado(s); ${batches.length} lote(s) de até ${BATCH_SIZE}.`);

  if (APPLY && selected.length) {
    const accessToken = await token();
    const existingByCode = await blingProducts(accessToken);
    const deposit = SYNC_STOCK && report.stockChecked ? await defaultDeposit(accessToken) : null;
    const productIdsForStock = selected
      .filter(product => product.stock.present && SYNC_STOCK)
      .map(product => existingByCode.get(product.payload.codigo)?.id || state.products[product.firebaseKey]?.blingId)
      .filter(id => id !== undefined && id !== null);
    const balances = deposit ? await physicalBalances(accessToken, [...new Set(productIdsForStock.map(String))], deposit.id) : new Map();
    for (const [index, batch] of batches.entries()) {
      console.log(`Processando lote ${index + 1}/${batches.length} (${batch.length} produtos).`);
      for (const product of batch) {
        try {
          let madeBlingRequest = false;
          const existing = existingByCode.get(product.payload.codigo);
          let id = existing?.id || state.products[product.firebaseKey]?.blingId || null;
          if (product.catalogChanged || !id) {
            id = await sendProduct(accessToken, existing, product.payload);
            madeBlingRequest = true;
            state.products[product.firebaseKey] = { hash: hash(product.payload), blingId: id, codigo: product.payload.codigo, syncedAt: new Date().toISOString() };
            if (existing) report.updated++; else {
              report.created++;
              if (id) existingByCode.set(product.payload.codigo, { id, tipo: 'P', formato: 'S' });
            }
          }
          if (product.stock.present && SYNC_STOCK) {
            if (!id || !deposit) throw new Error(`Produto ${product.payload.codigo}: nao foi possivel identificar o produto ou deposito para o estoque.`);
            const current = balances.get(String(id));
            const moved = await reconcileStock(accessToken, { productId: id, depositId: deposit.id, desired: product.stock.value, current: current ?? 0, codigo: product.payload.codigo });
            if (moved) report.stockUpdated++; else report.stockUnchanged++;
            madeBlingRequest ||= moved;
          }
          if (madeBlingRequest) await sleep(450);
        } catch (error) {
          report.errors.push({ firebaseKey: product.firebaseKey, codigo: product.payload.codigo, reason: error.message });
          await sleep(450);
        }
      }
    }
    writeJson(STATE_FILE, state);
  }
  report.finishedAt = new Date().toISOString();
  writeJson('bling-sync-report.json', report);
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.errors.push({ reason: error.message });
  writeJson('bling-sync-report.json', report);
  console.error(error);
  process.exitCode = 1;
}
