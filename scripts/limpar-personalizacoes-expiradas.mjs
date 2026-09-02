const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const DRY_RUN = /^(1|true|yes)$/i.test(String(process.env.DRY_RUN || ''));
const DEFAULT_DAYS = Math.max(7, Number(process.env.CF_CREATION_DAYS || 30) || 30);

const text = value => String(value ?? '').trim();
const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function fb(path, method = 'GET') {
  const response = await fetch(`${FIREBASE}/${path}.json`, { method, headers:{ Accept:'application/json' }, signal:AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Firebase ${response.status} em ${path}`);
  return response.json().catch(() => null);
}

function isPurchased(row = {}) {
  if (text(row.pedido_id || row.pedido_loja_integrada_id)) return true;
  const state = norm(`${row.status || ''} ${row.atendimento_status || ''} ${row?.encomenda?.status || ''} ${row?.pagamento_status || ''}`);
  return /encomend|pedido|pago|produc|impress|enviad|entreg|carrinho/.test(state);
}

function expiresAt(row = {}) {
  const explicit = Date.parse(text(row.expira_em));
  if (Number.isFinite(explicit)) return explicit;
  const created = Date.parse(text(row.criado_em || row.created_at));
  return Number.isFinite(created) ? created + DEFAULT_DAYS * 86400000 : Number.POSITIVE_INFINITY;
}

const creations = await fb('canecas/personalizadas').catch(() => ({})) || {};
const now = Date.now();
let expired = 0, deleted = 0, protectedRows = 0, resultDeleted = 0;

for (const [key, row] of Object.entries(creations)) {
  if (!row || typeof row !== 'object') continue;
  if (isPurchased(row)) { protectedRows += 1; continue; }
  if (expiresAt(row) > now) continue;
  expired += 1;
  const code = text(row.id || key);
  console.log(`${DRY_RUN ? 'DRY ' : ''}EXPIRADA ${code} · status=${text(row.status) || 'sem-status'}`);
  if (DRY_RUN) continue;
  await fb(`canecas/personalizadas/${safeKey(key)}`, 'DELETE');
  deleted += 1;
  const requestId = text(row.request_id);
  if (requestId) {
    await fb(`canecas/geracoes/${safeKey(requestId)}`, 'DELETE').catch(() => null);
    resultDeleted += 1;
  }
}

console.log(`RESUMO expiradas=${expired} removidas=${deleted} resultados_removidos=${resultDeleted} protegidas=${protectedRows} dry_run=${DRY_RUN}`);