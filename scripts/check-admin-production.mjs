import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const BASE_URL = String(process.env.ADMIN_BASE_URL || 'https://donaantonia.com.br').replace(/\/+$/, '');
const BUILD = '20260725-admin-v12-fix-abas2';
const OFFER_MAX_AGE_HOURS = Math.max(2, Number(process.env.OFFER_MAX_AGE_HOURS || 3));
const ATTEMPTS = Math.max(1, Number(process.env.CHECK_ATTEMPTS || 4));
const RETRY_DELAY_MS = Math.max(1000, Number(process.env.CHECK_RETRY_DELAY_MS || 5000));
const TIMEOUT_MS = Math.max(3000, Number(process.env.CHECK_TIMEOUT_MS || 15000));

const report = {
  checkedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  ok: true,
  checks: [],
  errors: [],
  warnings: [],
};

let publicProductCount = 0;
let adminProductCount = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function record(name, ok, detail = '', severity = 'error') {
  const row = { name, ok: Boolean(ok), detail: String(detail || '') };
  report.checks.push(row);
  if (!ok) {
    if (severity === 'warning') report.warnings.push(row);
    else report.errors.push(row);
  }
  return ok;
}

async function fetchResource(pathname, { json = false } = {}) {
  const url = `${BASE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}_health=${Date.now()}`, {
        cache: 'no-store',
        redirect: 'follow',
        headers: { Accept: json ? 'application/json' : 'text/html,application/xhtml+xml,text/plain,*/*' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = json ? await response.json() : await response.text();
      return { body, finalUrl: response.url, status: response.status };
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${url}: ${lastError?.message || lastError || 'falha desconhecida'}`);
}

function objectCount(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0;
}

function parseDate(value) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function checkStructuralAdmin() {
  try {
    const output = execFileSync(process.execPath, ['scripts/test-admin-v2-definitivo.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const detail = String(output || '').trim().split('\n').filter(Boolean).at(-1) || 'Teste estrutural concluído.';
    record('Todas as 18 abas passam no teste estrutural', true, detail);
  } catch (error) {
    const stdout = String(error?.stdout || '').trim();
    const stderr = String(error?.stderr || '').trim();
    record('Todas as 18 abas passam no teste estrutural', false, [stdout, stderr, error?.message].filter(Boolean).join('\n').slice(0, 4000));
  }
}

async function checkHtml(pathname, patterns, name) {
  try {
    const { body, finalUrl } = await fetchResource(pathname);
    const missing = patterns.filter(pattern => !body.includes(pattern));
    record(name, missing.length === 0, missing.length ? `Conteúdo ausente: ${missing.join(', ')}` : `OK · ${finalUrl}`);
  } catch (error) {
    record(name, false, error.message);
  }
}

async function checkSource(pathname, { required = [], forbidden = [] }, name) {
  try {
    const { body } = await fetchResource(pathname);
    const missing = required.filter(pattern => !body.includes(pattern));
    const foundForbidden = forbidden.filter(pattern => body.includes(pattern));
    const ok = missing.length === 0 && foundForbidden.length === 0;
    const detail = ok
      ? `OK · ${pathname}`
      : `${missing.length ? `ausente: ${missing.join(', ')}` : ''}${missing.length && foundForbidden.length ? ' · ' : ''}${foundForbidden.length ? `proibido: ${foundForbidden.join(', ')}` : ''}`;
    record(name, ok, detail);
  } catch (error) {
    record(name, false, error.message);
  }
}

async function checkJson(pathname, name, validator) {
  try {
    const { body } = await fetchResource(pathname, { json: true });
    const result = validator(body);
    record(name, result.ok, result.detail, result.severity || 'error');
  } catch (error) {
    record(name, false, error.message);
  }
}

async function checkRouteModulesPublished() {
  const modules = [
    'catalog-auto-sync.js', 'product-lifecycle-bootstrap.js', 'quick-read-bootstrap.js',
    'nfe-bootstrap.js', 'orders-bootstrap.js', 'order-tools-bootstrap.js',
    'collections-bootstrap.js', 'offers-bootstrap.js', 'coupons-bootstrap.js',
    'quick-purchase-bootstrap.js', 'registries-bootstrap.js', 'diagnostics-bootstrap.js',
    'backup-bootstrap.js',
  ];
  const results = await Promise.all(modules.map(async moduleFile => {
    try {
      const { body } = await fetchResource(`/producao-v2/js/${moduleFile}`);
      return { moduleFile, ok: body.length > 20, detail: body.length > 20 ? 'OK' : 'vazio' };
    } catch (error) {
      return { moduleFile, ok: false, detail: error.message };
    }
  }));
  const failed = results.filter(result => !result.ok);
  record(
    'Módulos sob demanda das 18 abas estão publicados',
    failed.length === 0,
    failed.length ? failed.map(result => `${result.moduleFile}: ${result.detail}`).join(' · ') : `${results.length} módulos acessíveis`,
  );
}

async function checkAdminRuntime() {
  try {
    globalThis.location = new URL(`${BASE_URL}/producao-v2/`);
    const moduleUrl = new URL(`../producao-v2/js/services/firebase.js?_health=${Date.now()}`, import.meta.url);
    const { loadProduct, loadProducts } = await import(moduleUrl.href);
    const config = {
      firebaseUrl: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com',
      productsNode: 'produtos',
      adminProductsPath: 'site/produtos-admin.json',
      writeMode: false,
    };
    const startedAt = Date.now();
    const products = await loadProducts(config, { force: true });
    const first = products[0];
    if (!first?.firebaseKey) throw new Error('A lista retornou sem chave de produto.');
    const full = await loadProduct(config, first.firebaseKey);
    const elapsed = Date.now() - startedAt;
    const ok = products.length === adminProductCount && Boolean(full?.firebaseKey && full?.nome && full?.codigo);
    record('Runtime do Admin carrega lista e cadastro completo', ok, `${products.length} produto(s) em ${elapsed} ms · cadastro ${full?.nome || 'não carregado'}`);
  } catch (error) {
    record('Runtime do Admin carrega lista e cadastro completo', false, error?.stack || error?.message || String(error));
  }
}

async function checkOrdersRuntime() {
  try {
    const moduleUrl = new URL(`../producao-v2/js/services/orders.js?_health=${Date.now()}`, import.meta.url);
    const { loadRecentOrders } = await import(moduleUrl.href);
    const config = { firebaseUrl: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com' };
    const startedAt = Date.now();
    const result = await loadRecentOrders(config, { limit: 12, force: true });
    const elapsed = Date.now() - startedAt;
    const count = Array.isArray(result?.orders) ? result.orders.length : 0;
    const keysOk = result?.orders?.every(order => Boolean(order?.firebaseKey)) === true;
    record(
      'Pedidos usam consulta limitada no Firebase',
      count > 0 && count <= 12 && keysOk,
      `${count} pedido(s) retornado(s) em ${elapsed} ms · limite solicitado 12 · chaves ${keysOk ? 'OK' : 'ausentes'}`,
    );
  } catch (error) {
    record('Pedidos usam consulta limitada no Firebase', false, error?.stack || error?.message || String(error));
  }
}

checkStructuralAdmin();

await checkHtml('/producao/', ['producao-v2', BUILD], 'Entrada /producao aponta para o Admin oficial');
await checkHtml('/admin/', ['producao-v2', BUILD], 'Atalho /admin aponta para o Admin oficial');
await checkHtml('/producao-v2/', ['Admin oficial', BUILD, './js/app.js', './js/stock-bootstrap.js', 'data-route="order-tools"'], 'Admin oficial carregado');
await checkRouteModulesPublished();
await checkSource('/producao-v2/js/modules/stock.js', {
  required: ['refresh()', 'this.render();', 'loading="lazy"'],
}, 'Módulo de Estoque publicado com atualização correta');
await checkSource('/producao-v2/js/stock-bootstrap.js', {
  required: [BUILD, 'module?.refresh()'],
}, 'Bootstrap de Estoque publicado na build correta');
await checkSource('/producao-v2/js/order-tools-bootstrap.js', {
  required: ['const CONTINGENCY_LIMIT = 60', 'const VISIBLE_LIMIT = 30', 'loadRecentOrders'],
  forbidden: ['MutationObserver', 'loadOrders('],
}, 'Contingência publicada sem ciclo de renderização');

await checkJson('/site/produtos-home.json', 'Catálogo público possui produtos', value => {
  publicProductCount = objectCount(value);
  return { ok: publicProductCount > 0, detail: `${publicProductCount} produto(s)` };
});

await checkJson('/site/produtos-admin.json', 'Índice administrativo possui todos os produtos', value => {
  adminProductCount = objectCount(value);
  const first = value && typeof value === 'object' ? Object.values(value)[0] : null;
  const fieldsOk = Boolean(first?.firebaseKey && first?.nome && first?.codigo && Object.prototype.hasOwnProperty.call(first, 'estoque'));
  return {
    ok: adminProductCount > 0 && adminProductCount >= publicProductCount && fieldsOk,
    detail: `${adminProductCount} produto(s) administrativos · ${publicProductCount} público(s) · campos ${fieldsOk ? 'OK' : 'incompletos'}`,
  };
});

await checkAdminRuntime();
await checkOrdersRuntime();

await checkJson('/catalog-version.json', 'Versão do catálogo válida', value => ({
  ok: Boolean(value?.version && value?.products && value?.adminProducts && Number(value?.adminProductCount) === adminProductCount),
  detail: value?.version
    ? `${value.version} · público ${value.productCount || 0} · admin ${value.adminProductCount || 0}`
    : 'version/products/adminProducts ausentes',
}));

await checkJson('/site/banners/banners.json', 'Banners permanecem removidos', value => {
  const list = Array.isArray(value) ? value : Array.isArray(value?.banners) ? value.banners : [];
  return {
    ok: value?.disabled === true && list.length === 0,
    detail: `disabled=${String(value?.disabled)} · ${list.length} banner(s)`,
  };
});

await checkJson('/site/cuponsativos.json', 'Arquivo de cupons válido', value => ({
  ok: Array.isArray(value) || (value && typeof value === 'object'),
  detail: `${Array.isArray(value) ? value.length : objectCount(value)} cupom(ns)`,
}));

await checkJson('/site/compra-rapida.json', 'Compra Rápida válida', value => ({
  ok: Boolean(value && typeof value === 'object' && Array.isArray(value.secoes)),
  detail: `${Array.isArray(value?.secoes) ? value.secoes.length : 0} seção(ões)`,
}));

await checkJson('/site/ofertas-historico.json', 'Histórico de ofertas válido', value => ({
  ok: Boolean(value && Array.isArray(value.ofertas) && Array.isArray(value.eventos)),
  detail: `${Array.isArray(value?.ofertas) ? value.ofertas.length : 0} oferta(s) no histórico`,
}));

await checkJson('/site/ofertas-automaticas-estado.json', 'Rotina horária de ofertas atualizada', value => {
  const executedAt = parseDate(value?.ultima_execucao);
  const ageHours = executedAt ? (Date.now() - executedAt.getTime()) / 3_600_000 : Number.POSITIVE_INFINITY;
  const active = Array.isArray(value?.ofertas_ativas) ? value.ofertas_ativas : [];
  const expired = active.filter(item => {
    const end = parseDate(item?.fim || item?.validade_oferta);
    return end && end.getTime() < Date.now();
  });
  const statusOk = String(value?.ultima_execucao_status || '').toLowerCase() === 'sucesso';
  return {
    ok: Boolean(executedAt && ageHours <= OFFER_MAX_AGE_HOURS && statusOk && expired.length === 0),
    detail: executedAt
      ? `${ageHours.toFixed(1)}h desde a execução · status ${value?.ultima_execucao_status || 'ausente'} · ${expired.length} expirada(s) ainda ativa(s)`
      : 'ultima_execucao ausente ou inválida',
  };
});

report.ok = report.errors.length === 0;
await writeFile('admin-production-report.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');

for (const check of report.checks) {
  console.log(`${check.ok ? 'OK' : 'FALHA'} · ${check.name}: ${check.detail}`);
}

if (!report.ok) {
  console.error(`Verificação de produção encontrou ${report.errors.length} erro(s).`);
  process.exitCode = 1;
} else {
  console.log(`Produção validada com ${report.checks.length} verificações.`);
}
