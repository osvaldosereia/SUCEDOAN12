const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LIMIT = Math.max(10, Math.min(100, Number(process.env.LI_ORDER_LIMIT || 60) || 60));
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

if (!AUTH) throw new Error('Token Loja Integrada ausente.');

const text = value => String(value ?? '').trim();
const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nowIso = () => new Date().toISOString();
const resourceId = value => text(typeof value === 'object' ? value?.resource_uri || value?.id : value).match(/\/(\d+)\/?$/)?.[1] || text(typeof value === 'object' ? value?.id : '').replace(/\D+/g, '');
const pendingQty = row => Math.max(1, Math.min(50, Number.parseInt(row?.quantidade_match ?? row?.quantidade ?? 1, 10) || 1));

async function li(path) {
  const url = /^https?:\/\//i.test(path) ? path : `${LI_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    headers: { Authorization: AUTH, Accept: 'application/json', 'User-Agent': 'CanecaFacil-Personalized-Orders/1.1' },
    signal: AbortSignal.timeout(20000)
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) throw new Error(`Loja Integrada ${response.status}: ${text(data?.message || data?.detail || raw).slice(0, 300)}`);
  return data;
}

async function fb(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${FIREBASE}/${path}.json`, {
    method,
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(`Firebase ${response.status}: ${text(raw).slice(0, 220)}`);
  return data;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(text(value).toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function orderItems(order = {}) {
  for (const key of ['itens', 'items', 'produtos', 'line_items']) if (Array.isArray(order?.[key])) return order[key];
  return [];
}
function itemProductId(item = {}) { return text(item.produto_id || item.id_produto || item.product_id || item?.produto?.id || resourceId(item.produto)); }
function itemSku(item = {}) { return text(item.sku || item.codigo || item.codigo_produto || item?.produto?.sku); }
function itemName(item = {}) { return text(item.nome || item.nome_produto || item.name || item?.produto?.nome || 'Caneca'); }
function itemQty(item = {}) { return Math.max(1, Number(item.quantidade || item.qtd || item.quantity || 1) || 1); }
function itemPrice(item = {}) { return Number(item.preco_venda || item.preco || item.price || item.valor || 0) || 0; }
function orderId(order = {}) { return text(order.id || order.numero || resourceId(order.resource_uri)); }
function orderDate(order = {}) { return text(order.data_criacao || order.criado_em || order.created_at || order.data || order.data_modificacao); }
function orderEmail(order = {}) { return text(order.cliente_email || order?.cliente?.email).toLowerCase(); }
function orderComment(order = {}) {
  return text([
    order.cliente_obs, order.comentario, order.observacao, order.observacoes, order.obs, order?.cliente?.obs,
    order.utm_campaign, order.campanha, order.tracking_campaign, order.origem_campanha
  ].filter(Boolean).join(' '));
}
function extractCodes(value) {
  const matches = text(value).toUpperCase().match(/CF-\d{6}-[A-Z0-9]{4,24}/g) || [];
  return [...new Set(matches)];
}

async function resolveSituation(order = {}) {
  let situation = order.situacao || order.status || order.status_pedido || null;
  if (situation && typeof situation === 'object') return situation;
  const uri = text(situation || order.situacao_resource_uri || order.status_resource_uri);
  if (/\/situacao\//i.test(uri)) {
    try {
      const path = uri.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/api\/v1/i, '');
      return await li(path);
    } catch (error) { console.warn(`Situação não resolvida para pedido ${orderId(order)}: ${error.message}`); }
  }
  return { nome: text(order.situacao_nome || order.status_nome || situation), codigo: text(order.situacao_codigo || order.status_codigo) };
}

function paymentState(situation = {}) {
  const hay = norm(`${situation.nome || ''} ${situation.codigo || ''}`);
  if (situation.cancelado === true || /cancel|reembols|estorn/.test(hay)) return 'cancelado';
  if (situation.aprovado === true || /pago|aprovad|payment.approved|confirmad/.test(hay)) return 'pago';
  return 'pendente';
}
function commercialState(payment, situation = {}) {
  const hay = norm(`${situation.nome || ''} ${situation.codigo || ''}`);
  if (payment === 'cancelado') return 'cancelado';
  if (/entreg/.test(hay)) return 'entregue';
  if (/enviad|despach/.test(hay)) return 'enviado';
  if (payment === 'pago') return 'pago';
  return 'aguardando_pagamento';
}
function customer(order = {}) {
  return {
    nome: text(order.cliente_nome || order?.cliente?.nome), email: orderEmail(order),
    telefone: text(order.cliente_telefone_celular || order.cliente_telefone_principal || order?.cliente?.telefone_celular || order?.cliente?.telefone),
    whatsapp: text(order.cliente_telefone_celular || order?.cliente?.telefone_celular || order?.cliente?.whatsapp),
    cpf: text(order.cliente_cpf || order?.cliente?.cpf), cnpj: text(order.cliente_cnpj || order?.cliente?.cnpj)
  };
}
function shipping(order = {}) {
  const envio = (Array.isArray(order.envios) ? order.envios[0] : order.envio) || {};
  return {
    servico: text(envio.forma_envio_nome || envio.nome || order.forma_envio_nome), valor: Number(envio.valor || order.valor_envio || order.frete_valor || 0) || 0,
    prazo: Number(envio.prazo || order.prazo_envio || 0) || 0, endereco: text(order.endereco_entrega || order.entrega_endereco || order?.endereco?.endereco),
    numero: text(order.numero_entrega || order.entrega_numero || order?.endereco?.numero), complemento: text(order.complemento_entrega || order.entrega_complemento || order?.endereco?.complemento),
    bairro: text(order.bairro_entrega || order.entrega_bairro || order?.endereco?.bairro), cidade: text(order.cidade_entrega || order.entrega_cidade || order?.endereco?.cidade),
    uf: text(order.estado_entrega || order.entrega_estado || order?.endereco?.estado), cep: text(order.cep_entrega || order.entrega_cep || order?.endereco?.cep)
  };
}
function creationArt(creation = {}) { return text(creation?.arte_aprovada?.url || creation.arte_aprovada_url || creation.arte_horizontal || creation.arte_personalizacao || creation.arte_impressao?.url); }
function pendingRows(raw = {}) {
  return Object.entries(raw || {}).map(([key, value]) => ({ key, ...(value || {}) }))
    .filter(row => text(row.criacao_id || row.id || row.key) && !['cancelada','cancelado'].includes(norm(row.status)));
}
function pendingCode(row) { return text(row.criacao_id || row.id || row.key).toUpperCase(); }
function withOwnQty(rows) { return rows.map(row => ({ ...row, quantidade_match:pendingQty(row) })); }

function matchByHint(order, rows) {
  const id = orderId(order);
  return withOwnQty(rows.filter(row => text(row.pedido_id_hint) === id || text(row.pedido_id) === id));
}
function matchByCodes(order, rows) {
  const codes = extractCodes(orderComment(order)); if (!codes.length) return [];
  const set = new Set(codes); return withOwnQty(rows.filter(row => set.has(pendingCode(row))));
}

async function matchByEmailProduct(order, rows) {
  const email = orderEmail(order); if (!email) return [];
  const hash = await sha256(email), items = orderItems(order), currentOrderId = orderId(order);
  const orderTs = new Date(orderDate(order) || Date.now()).getTime() || Date.now();
  const candidates = rows.filter(row => {
    if (row.pedido_id && text(row.pedido_id) !== currentOrderId) return false;
    if (!row.cliente_email_hash || row.cliente_email_hash !== hash) return false;
    const productId = text(row.loja_integrada_produto_id);
    if (!productId || !items.some(item => itemProductId(item) === productId || (row.sku && itemSku(item) === row.sku))) return false;
    const approvedTs = new Date(row.aprovado_em || row.atualizado_em || 0).getTime() || 0;
    return approvedTs && approvedTs <= orderTs + 2 * 60 * 60 * 1000 && orderTs - approvedTs <= LOOKBACK_MS;
  }).sort((a, b) => new Date(a.aprovado_em || 0) - new Date(b.aprovado_em || 0));

  const capacity = new Map();
  for (const item of items) {
    const key = itemProductId(item) || `sku:${itemSku(item)}`;
    capacity.set(key, (capacity.get(key) || 0) + itemQty(item));
  }
  const selected = [];
  for (const row of candidates) {
    const key = text(row.loja_integrada_produto_id) || `sku:${text(row.sku)}`;
    const left = capacity.get(key) || 0; if (left <= 0) continue;
    const take = Math.min(pendingQty(row), left); if (take <= 0) continue;
    selected.push({ ...row, quantidade_match:take }); capacity.set(key, left - take);
  }
  return selected;
}

function sourceItem(order, pending) {
  return orderItems(order).find(item => itemProductId(item) === text(pending.loja_integrada_produto_id))
    || orderItems(order).find(item => text(pending.sku) && itemSku(item) === text(pending.sku)) || {};
}

async function syncMatchedOrder(order, matched, situation) {
  const id = orderId(order); if (!id || !matched.length) return { id, matched:0, units:0, payment:'pendente' };
  const payment = paymentState(situation), status = commercialState(payment, situation), now = nowIso(), items = [];

  for (const pending of matched) {
    const code = pendingCode(pending);
    const creation = await fb(`canecas/personalizadas/${safeKey(code)}`).catch(() => null);
    if (!creation) { console.warn(`Criação ${code} não localizada para pedido ${id}.`); continue; }
    const source = sourceItem(order, pending), art = creationArt(creation), qty = pendingQty(pending);
    items.push({
      id:`${id}-${code}`, produto_key:text(pending.produto_key || creation.modelo_key || creation.produto_key),
      codigo:text(pending.sku || itemSku(source)), sku:text(pending.sku || itemSku(source)),
      nome:itemName(source) || text(pending.modelo_nome || creation.modelo_nome || 'Caneca personalizada'),
      quantidade:qty, preco:itemPrice(source), criacao_id:code, codigo_criacao:code, personalizada:true,
      loja_integrada_produto_id:text(pending.loja_integrada_produto_id || itemProductId(source)),
      arte_aprovada:art ? { url:art, versao:text(creation.arte_versao_aprovada || creation?.arte_aprovada?.versao || 'v1') || 'v1' } : null,
      arte_horizontal:art
    });
  }
  if (!items.length) return { id, matched:0, units:0, payment };

  const existing = await fb(`canecas/pedidos/${safeKey(id)}`).catch(() => null);
  const payload = {
    id, origem:'canecafacil', canal:'loja_integrada',
    status: existing?.status && !['novo','aguardando_pagamento','pago'].includes(existing.status) ? existing.status : status,
    status_comercial: existing?.status_comercial && !['novo','aguardando_pagamento','pago'].includes(existing.status_comercial) ? existing.status_comercial : status,
    cliente:{ ...(existing?.cliente || {}), ...customer(order) }, entrega:{ ...(existing?.entrega || {}), ...shipping(order) },
    pagamento:{ ...(existing?.pagamento || {}), status:payment, situacao_nome:text(situation.nome), situacao_codigo:text(situation.codigo), atualizado_em:now },
    pagamento_status:payment, itens, criacoes_ids:items.map(item => item.criacao_id), criacao_id:items.length === 1 ? items[0].criacao_id : '',
    quantidade_personalizada_total:items.reduce((sum,item) => sum + item.quantidade, 0), comentario_loja_integrada:orderComment(order),
    loja_integrada:{ ...(existing?.loja_integrada || {}), pedido_id:id, resource_uri:text(order.resource_uri), situacao:situation, sincronizado_em:now },
    criado_em:existing?.criado_em || orderDate(order) || now, atualizado_em:now
  };
  await fb(`canecas/pedidos/${safeKey(id)}`, { method:'PUT', body:payload });

  for (const item of items) {
    const code = item.criacao_id;
    await Promise.all([
      fb(`canecas/personalizadas/${safeKey(code)}`, { method:'PATCH', body:{
        status:payment === 'cancelado' ? 'pedido_cancelado' : 'encomendada', atendimento_status:payment === 'cancelado' ? 'novo' : 'encomendou',
        pedido_id:id, pedido_loja_integrada_id:id, quantidade_encomendada:item.quantidade,
        encomenda:{ status:payment === 'pago' ? 'paga' : payment === 'cancelado' ? 'cancelada' : 'pedido_criado', codigo_arte:code, pedido_id:id,
          quantidade:item.quantidade, loja_integrada_produto_id:item.loja_integrada_produto_id, pagamento_status:payment, atualizado_em:now, origem:'produto_original_loja_integrada' },
        atualizado_em:now
      }}),
      fb(`canecas/encomendas_pendentes/${safeKey(code)}`, { method:'PATCH', body:{
        status:payment === 'pago' ? 'paga' : payment === 'cancelado' ? 'cancelada' : 'vinculada', pedido_id:id, quantidade:item.quantidade,
        pagamento_status:payment, atualizado_em:now
      }})
    ]);

    if (payment === 'pago' && item.arte_horizontal) {
      const jobId = safeKey(`PJ-${id}-${code}`), existingJob = await fb(`canecas/print_jobs/${jobId}`).catch(() => null);
      if (!existingJob) {
        await fb(`canecas/print_jobs/${jobId}`, { method:'PUT', body:{
          id:jobId, pedido_id:id, origem:'canecafacil', origem_label:'CANECAFÁCIL', cliente_nome:payload.cliente.nome,
          cliente_telefone:payload.cliente.telefone || payload.cliente.whatsapp, produto_key:item.produto_key, produto_codigo:item.codigo,
          produto_nome:item.nome, quantidade:item.quantidade, criacao_id:code, codigo_criacao:code, arte_aprovada:item.arte_aprovada,
          status:'aguardando', pagamento_status:'pago', criado_em:now, atualizado_em:now, tentativas_impressao:0
        }});
      } else if (Number(existingJob.quantidade || 1) !== item.quantidade) {
        await fb(`canecas/print_jobs/${jobId}`, { method:'PATCH', body:{ quantidade:item.quantidade, atualizado_em:now } });
      }
    }
  }
  return { id, matched:items.length, units:items.reduce((sum,item) => sum + item.quantidade, 0), payment };
}

const pendingRaw = await fb('canecas/encomendas_pendentes').catch(() => ({}));
const pending = pendingRows(pendingRaw);
if (!pending.length) { console.log('SEM_ENCOMENDAS_PENDENTES'); process.exit(0); }

const search = await li(`/pedido/search?limit=${LIMIT}`);
const summaries = Array.isArray(search?.objects) ? search.objects : Array.isArray(search) ? search : [];
console.log(`PENDENTES ${pending.length} · PEDIDOS_RECENTES ${summaries.length}`);

let linked = 0, linkedUnits = 0, queued = 0;
const handledOrders = new Set();
for (const summary of summaries) {
  const id = orderId(summary); if (!id) continue;
  let matched = matchByHint(summary, pending), order = summary;
  if (!matched.length) { order = await li(`/pedido/${encodeURIComponent(id)}`).catch(() => summary); matched = matchByHint(order, pending); }
  if (!matched.length) matched = matchByCodes(order, pending);
  if (!matched.length) matched = await matchByEmailProduct(order, pending);
  if (!matched.length) continue;
  const situation = await resolveSituation(order), result = await syncMatchedOrder(order, matched, situation);
  linked += result.matched; linkedUnits += result.units; if (result.payment === 'pago') queued += result.matched; handledOrders.add(id);
  console.log(`PEDIDO ${id} · artes=${result.matched} · unidades=${result.units} · pagamento=${result.payment}`);
}

const linkedPending = pending.filter(row => text(row.pedido_id) && !handledOrders.has(text(row.pedido_id)));
for (const row of linkedPending.slice(0, 40)) {
  const id = text(row.pedido_id), order = await li(`/pedido/${encodeURIComponent(id)}`).catch(() => null); if (!order) continue;
  const sameOrder = withOwnQty(pending.filter(item => text(item.pedido_id) === id));
  const situation = await resolveSituation(order), result = await syncMatchedOrder(order, sameOrder, situation);
  if (result.payment === 'pago') queued += result.matched;
  console.log(`REVALIDADO ${id} · artes=${result.matched} · unidades=${result.units} · pagamento=${result.payment}`);
}

console.log(`RESUMO artes_vinculadas=${linked} · unidades=${linkedUnits} · filas_pagas=${queued}`);