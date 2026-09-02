const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');

const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');
const nowIso = () => new Date().toISOString();

async function fb(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${FIREBASE}/${path}.json`, {
    method,
    headers: { Accept:'application/json', ...(body === undefined ? {} : { 'Content-Type':'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(`Firebase ${response.status}: ${text(raw).slice(0,220)}`);
  return data;
}

function paymentStatus(order = {}) {
  return norm(order?.pagamento?.status || order.pagamento_status || 'pendente');
}
function isReleased(order = {}) { return paymentStatus(order) === 'pago'; }
function creationIds(order = {}) {
  const ids = new Set();
  for (const id of Array.isArray(order.criacoes_ids) ? order.criacoes_ids : []) if (text(id)) ids.add(text(id));
  if (text(order.criacao_id)) ids.add(text(order.criacao_id));
  for (const item of Array.isArray(order.itens) ? order.itens : []) {
    const id = text(item.criacao_id || item.codigo_criacao);
    if (id) ids.add(id);
  }
  return [...ids];
}
function units(order = {}) {
  const n = Number(order.quantidade_personalizada_total);
  if (n > 0) return n;
  return (Array.isArray(order.itens) ? order.itens : []).reduce((sum,item) => sum + Math.max(1, Number(item.quantidade || 1) || 1), 0);
}

const [ordersRaw, jobsRaw] = await Promise.all([
  fb('canecas/pedidos').catch(() => ({})),
  fb('canecas/print_jobs').catch(() => ({}))
]);
const orders = Object.entries(ordersRaw || {}).map(([key,value]) => ({ key, ...(value || {}) }));
const orderMap = new Map(orders.map(order => [text(order.id || order.key), order]));
const now = nowIso();
let releasedCount = 0;
let blockedJobs = 0;
let releasedJobs = 0;
let alerts = 0;

for (const order of orders) {
  const id = text(order.id || order.key);
  if (!id) continue;
  const released = isReleased(order);
  const wasReleased = order.liberado_producao === true;
  const productionStatus = released ? 'liberado' : (paymentStatus(order) === 'cancelado' ? 'cancelado' : 'bloqueado_pagamento');
  const patch = {
    liberado_producao: released,
    producao_status: productionStatus,
    pagamento_confirmado: released,
    atualizado_em: now
  };
  if (released) patch.liberado_producao_em = text(order.liberado_producao_em) || now;
  await fb(`canecas/pedidos/${safeKey(order.key)}`, { method:'PATCH', body:patch });

  for (const creationId of creationIds(order)) {
    await fb(`canecas/personalizadas/${safeKey(creationId)}`, { method:'PATCH', body:{
      liberado_producao:released,
      producao_status:productionStatus,
      pagamento_status:paymentStatus(order),
      pagamento_confirmado:released,
      liberado_producao_em:released ? (text(order.liberado_producao_em) || now) : null,
      atualizado_em:now
    }}).catch(error => console.warn(`Criação ${creationId}: ${error.message}`));
  }

  if (released) {
    releasedCount += 1;
    if (!wasReleased) {
      const alertId = safeKey(`PAGO-${id}`);
      await fb(`canecas/alertas_producao/${alertId}`, { method:'PUT', body:{
        id:alertId,
        tipo:'pagamento_aprovado',
        titulo:'PAGO · LIBERADO PARA PRODUÇÃO',
        pedido_id:id,
        cliente_nome:text(order?.cliente?.nome || order.cliente_nome),
        unidades:units(order),
        liberado_producao:true,
        lido:false,
        criado_em:now,
        atualizado_em:now
      }});
      alerts += 1;
    }
  }
}

for (const [key, jobValue] of Object.entries(jobsRaw || {})) {
  const job = jobValue || {};
  const order = orderMap.get(text(job.pedido_id));
  const isCanecaFacil = /canecafacil|caneca_facil/i.test(text(job.origem || job.origem_label));
  if (!isCanecaFacil || !order) continue;
  const released = isReleased(order);
  const status = norm(job.status || 'aguardando');

  if (released) {
    const patch = {
      pagamento_status:'pago',
      liberado_producao:true,
      liberado_producao_em:text(order.liberado_producao_em) || now,
      atualizado_em:now
    };
    if (status === 'bloqueado_pagamento') patch.status = 'aguardando';
    await fb(`canecas/print_jobs/${safeKey(key)}`, { method:'PATCH', body:patch });
    releasedJobs += 1;
  } else if (['aguardando','reimpressao','bloqueado_pagamento'].includes(status)) {
    await fb(`canecas/print_jobs/${safeKey(key)}`, { method:'PATCH', body:{
      status:'bloqueado_pagamento',
      pagamento_status:paymentStatus(order) || 'pendente',
      liberado_producao:false,
      bloqueado_motivo:'pagamento_nao_aprovado',
      atualizado_em:now
    }});
    blockedJobs += 1;
  }
}

console.log(`LIBERACAO_PRODUCAO pedidos_liberados=${releasedCount} jobs_liberados=${releasedJobs} jobs_bloqueados=${blockedJobs} novos_alertas=${alerts}`);
