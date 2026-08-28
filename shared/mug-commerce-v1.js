export const MUG_COMMERCE_BUILD = '20260828-mug-commerce-v1';
export const FIREBASE_BASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
export const MUG_NODES = Object.freeze({
  products: 'produtos',
  creations: 'canecas/personalizadas',
  publicCreations: 'canecas/personalizadas_publicas',
  models: 'canecas/modelos_criacao',
  privateModels: 'canecas/modelos_privados',
  orders: 'canecas/pedidos',
  printJobs: 'canecas/print_jobs',
  audit: 'canecas/auditoria',
  integrations: 'canecas/integracoes'
});

export const ORDER_STAGES = Object.freeze([
  ['novo', 'Novo interesse'],
  ['atendimento', 'Em atendimento'],
  ['aguardando_dados', 'Aguardando dados'],
  ['aguardando_pagamento', 'Aguardando pagamento'],
  ['pago', 'Pago'],
  ['producao', 'Em produção'],
  ['pronto_envio', 'Pronto para envio'],
  ['enviado', 'Enviado'],
  ['entregue', 'Entregue'],
  ['cancelado', 'Cancelado']
]);

export const PAYMENT_STATES = Object.freeze([
  ['pendente', 'Pendente'], ['pago', 'Pago'], ['reembolsado', 'Reembolsado'], ['cancelado', 'Cancelado']
]);

export const PRINT_STATES = Object.freeze([
  ['aguardando', 'Aguardando'], ['imprimindo', 'Imprimindo'], ['impresso', 'Impresso'], ['reimpressao', 'Reimpressão'], ['cancelado', 'Cancelado']
]);

export function text(value) { return String(value ?? '').trim(); }
export function norm(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
export function digits(value) { return text(value).replace(/\D+/g, ''); }
export function nowIso() { return new Date().toISOString(); }
export function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
export function dateTime(value) { const d = new Date(value || 0); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR'); }
export function safeKey(value) { return text(value).replace(/[.#$\[\]/]/g, '_'); }
export function orderId(origin='CF') {
  const d = new Date();
  const y = String(d.getFullYear()).slice(-2), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${origin}-${y}${m}${day}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}
export function printJobId(orderIdValue, itemKey='1') { return safeKey(`PJ-${orderIdValue}-${itemKey}`); }
export function sourceLabel(value) {
  const v = norm(value);
  if (v.includes('canecafacil') || v.includes('caneca_facil') || v === 'cf') return 'CANECAFÁCIL';
  return 'DONA ANTÔNIA';
}
export function sourceCode(value) { return sourceLabel(value) === 'CANECAFÁCIL' ? 'canecafacil' : 'dona_antonia'; }
export function isMug(product={}) {
  const hay = norm([product.tipo_produto, product.categoria, product.subcategoria, product.subsubcategoria, product.nome].join(' '));
  return hay.includes('caneca');
}
export function mugArt(record={}) {
  return text(record.arte_aprovada?.url || record.arte_aprovada_url || record.arte_horizontal || record.arte_personalizacao || record.arte_impressao?.url || record.arte_final_url);
}
export function mugImage(record={}) {
  const values = [record.mockup_1, record.url_imagem, record.imagem_url, record.imagem, ...(Array.isArray(record.imagens_site) ? record.imagens_site : []), ...(Array.isArray(record.imagens) ? record.imagens : [])];
  return values.map(text).find(v => /^https?:\/\//i.test(v)) || mugArt(record);
}
export function normalizeOrder(id, value={}) {
  const customer = value.cliente || {};
  const shipping = value.entrega || value.frete || {};
  const payment = value.pagamento || {};
  return {
    ...value,
    id: text(value.id || id),
    origem: sourceCode(value.origem || value.canal || 'canecafacil'),
    status: text(value.status || value.status_comercial || 'novo'),
    cliente: {
      nome: text(customer.nome || value.cliente_nome), telefone: text(customer.telefone || customer.whatsapp || value.cliente_whatsapp), email: text(customer.email || value.cliente_email),
      cpf: text(customer.cpf || value.cliente_cpf), ...customer
    },
    entrega: { ...shipping },
    pagamento: { status: text(payment.status || value.pagamento_status || 'pendente'), forma: text(payment.forma || value.pagamento_forma), ...payment },
    itens: Array.isArray(value.itens) ? value.itens : [],
    criado_em: value.criado_em || value.created_at || nowIso(),
    atualizado_em: value.atualizado_em || value.updated_at || value.criado_em || nowIso()
  };
}

export async function fbGet(path, base=FIREBASE_BASE) {
  const response = await fetch(`${String(base).replace(/\/+$/,'')}/${path}.json?_=${Date.now()}`, { cache:'no-store', headers:{ Accept:'application/json' } });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json();
}
export async function fbWrite(path, payload, method='PATCH', base=FIREBASE_BASE) {
  const response = await fetch(`${String(base).replace(/\/+$/,'')}/${path}.json`, { method, headers:{ 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json().catch(() => null);
}
export async function audit(action, data={}, base=FIREBASE_BASE) {
  const id = safeKey(`${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
  return fbWrite(`${MUG_NODES.audit}/${id}`, { action, data, criado_em:nowIso() }, 'PUT', base).catch(() => null);
}

export function buildPrintJob(order, item={}, index=0) {
  const id = printJobId(order.id, item.id || item.firebaseKey || item.codigo || index+1);
  const art = text(item.arte_aprovada?.url || item.arte_aprovada_url || item.arte_horizontal || item.arte_personalizacao || item.arte_impressao?.url || order.arte_aprovada?.url || order.arte_horizontal);
  return {
    id,
    pedido_id: order.id,
    origem: sourceCode(order.origem),
    origem_label: sourceLabel(order.origem),
    cliente_nome: text(order.cliente?.nome || order.cliente_nome),
    cliente_telefone: text(order.cliente?.telefone || order.cliente?.whatsapp || order.cliente_whatsapp),
    produto_key: text(item.firebaseKey || item.product_key || item.produto_key),
    produto_codigo: text(item.codigo || item.sku),
    produto_nome: text(item.nome || 'Caneca personalizada'),
    quantidade: Math.max(1, Number(item.quantidade || item.qtd || 1)),
    arte_aprovada: { url: art, versao: text(item.arte_versao || order.arte_versao || 'v1') || 'v1' },
    status: 'aguardando',
    pagamento_status: text(order.pagamento?.status || order.pagamento_status || 'pago'),
    criado_em: nowIso(), atualizado_em: nowIso(), tentativas_impressao: 0
  };
}
