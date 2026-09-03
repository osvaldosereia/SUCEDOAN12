const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const DAY = 86400000;
const DAYS_WITHOUT_ORDER = 15;
const DAYS_ORDERED = 90;
const GRACE_MS = 6 * 60 * 60 * 1000;
const POLICY = 'canecafacil-retencao-15-90-v1';

const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');
const now = Date.now();
const nowIso = new Date(now).toISOString();

function parseDate(value) {
  const ts = new Date(value || 0).getTime();
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}

function isOrdered(c = {}) {
  const status = norm(`${c.atendimento_status || ''} ${c.status || ''} ${c?.encomenda?.status || ''} ${c?.pedido?.status || ''}`);
  return /pedido|encomend|pago|produc|impress|enviad|entreg|liberado/.test(status)
    || Boolean(c.pedido_id || c.pedido_numero || c.pedido_loja_integrada_id || c?.encomenda?.pedido_id || c?.pagamento?.status);
}

function createdAt(c = {}) {
  return parseDate(c.criado_em || c.created_at || c.gerado_em || c.createdAt || c.atualizado_em);
}

async function fb(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${FIREBASE}/${path}.json`, {
    method,
    headers:{ Accept:'application/json', ...(body === undefined ? {} : { 'Content-Type':'application/json' }) },
    body:body === undefined ? undefined : JSON.stringify(body),
    signal:AbortSignal.timeout(25000)
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(`Firebase ${response.status}: ${text(raw).slice(0, 240)}`);
  return data;
}

function retentionFor(c = {}) {
  const ordered = isOrdered(c);
  const old = c.retencao && typeof c.retencao === 'object' ? c.retencao : {};
  const oldOrdered = old.encomendada === true;
  const created = createdAt(c);
  if (!created) return null;

  let base;
  if (ordered) {
    base = oldOrdered ? (parseDate(old.base_em) || created) : now;
  } else {
    base = parseDate(old.base_em) || created;
  }

  const days = ordered ? DAYS_ORDERED : DAYS_WITHOUT_ORDER;
  const expires = base + days * DAY;
  return { ordered, base, days, expires };
}

async function removeCreation(key, creation) {
  const code = text(creation.id || creation.codigo_criacao || key).toUpperCase();
  await Promise.all([
    fb(`canecas/personalizadas/${safeKey(key)}`, { method:'DELETE' }),
    fb(`canecas/encomendas_pendentes/${safeKey(code)}`, { method:'DELETE' }).catch(() => null)
  ]);
  console.log(`APAGADA ${code || key}`);
}

const creations = await fb('canecas/personalizadas').catch(error => {
  console.error(error.message);
  process.exitCode = 1;
  return null;
});

if (!creations || typeof creations !== 'object') {
  console.log('Nenhuma criação para revisar.');
  process.exit(process.exitCode || 0);
}

let reviewed = 0;
let patched = 0;
let deleted = 0;
let skipped = 0;

for (const [key, creationRaw] of Object.entries(creations)) {
  const creation = creationRaw && typeof creationRaw === 'object' ? creationRaw : {};
  reviewed += 1;
  const retention = retentionFor(creation);
  if (!retention) { skipped += 1; continue; }

  const expired = now >= retention.expires + GRACE_MS;
  if (expired) {
    await removeCreation(key, creation);
    deleted += 1;
    continue;
  }

  const old = creation.retencao && typeof creation.retencao === 'object' ? creation.retencao : {};
  const next = {
    politica:POLICY,
    encomendada:retention.ordered,
    dias:retention.days,
    base_em:new Date(retention.base).toISOString(),
    expira_em:new Date(retention.expires).toISOString(),
    revisado_em:nowIso
  };

  const needsPatch = old.politica !== POLICY
    || old.encomendada !== next.encomendada
    || Number(old.dias) !== next.dias
    || text(old.base_em) !== next.base_em
    || text(old.expira_em) !== next.expira_em;

  if (needsPatch) {
    await fb(`canecas/personalizadas/${safeKey(key)}/retencao`, { method:'PUT', body:next });
    patched += 1;
  }
}

console.log(JSON.stringify({ reviewed, patched, deleted, skipped, policy:POLICY, finished_at:new Date().toISOString() }));
