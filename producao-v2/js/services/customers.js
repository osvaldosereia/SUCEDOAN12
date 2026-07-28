import { number, text } from '../core/utils.js';

const CACHE_MS = 15000;
let customersCache = null;
let customersCacheAt = 0;

function baseUrl(config) {
  return text(config?.firebaseUrl).replace(/\/+$/, '');
}

function clientsNode(config) {
  return text(config?.clientsNode || 'clientes').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '') || 'clientes';
}

function databaseUrl(config, path = '') {
  const root = baseUrl(config);
  const clean = text(path).replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '');
  if (!root) throw new Error('Firebase URL nao configurada.');
  return `${root}/${clean}.json`;
}

async function request(url, options = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { cache: 'no-store', ...options, signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Clientes retornaram ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
    }
    if (response.status === 204) return null;
    return await response.json().catch(() => null);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao consultar clientes.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function digits(value) {
  return text(value).replace(/\D/g, '');
}

function first(...values) {
  return values.map(text).find(Boolean) || '';
}

function safeKey(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function orderDate(order = {}) {
  return first(order.criado_em, order.created_at, order.data, order.timestamp, new Date().toISOString());
}

function orderNumber(order = {}) {
  return first(order.numero_pedido, order.numero, order.id, order.firebaseKey);
}

function customerSource(order = {}) {
  return order.cliente && typeof order.cliente === 'object' ? order.cliente : {};
}

function addressSource(order = {}) {
  const client = customerSource(order);
  const source = order.entrega || order.endereco_entrega || client.endereco || order.endereco || {};
  if (source && typeof source === 'object') return source;
  return { endereco: source };
}

function paymentLabel(order = {}) {
  const payment = order.pagamento && typeof order.pagamento === 'object' ? order.pagamento : {};
  return first(payment.forma, payment.metodo, order.forma_pagamento, order.metodo_pagamento, order.pagamento);
}

function orderTotal(order = {}) {
  const payment = order.pagamento && typeof order.pagamento === 'object' ? order.pagamento : {};
  return number(order.total ?? order.valor_total ?? order.valorTotal ?? order.total_pedido ?? payment.total ?? payment.valor);
}

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject).filter(item => item !== undefined);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([key]) => !['cpf', 'cnpj', 'documento', 'document'].includes(key.toLowerCase()))
      .map(([key, item]) => [key, cleanObject(item)])
      .filter(([, item]) => item !== undefined && item !== '');
    return Object.fromEntries(entries);
  }
  if (value === null || value === undefined) return undefined;
  return value;
}

export function customerFromOrder(order = {}) {
  const client = customerSource(order);
  const address = addressSource(order);
  const phone = first(client.telefone, client.whatsapp, order.telefone, order.whatsapp, order.celular);
  const email = first(client.email, order.email);
  const name = first(client.nome, order.nome_cliente, order.nome, order.cliente_nome, 'Cliente');
  const phoneDigits = digits(phone);
  const key = phoneDigits.length >= 8
    ? `tel-${phoneDigits.slice(-13)}`
    : safeKey(email || `${name}-${address.cep || address.bairro || orderNumber(order)}`);
  const createdAt = orderDate(order);
  const orderKey = text(order.firebaseKey || order.id || orderNumber(order) || Date.now());
  const total = orderTotal(order);
  return cleanObject({
    key,
    cadastro: {
      nome: name,
      telefone: phone,
      telefone_formatado: first(client.telefoneFormatado, client.telefone_formatado, order.telefoneFormatado, phone),
      telefone_digits: phoneDigits,
      whatsapp: first(client.whatsapp, order.whatsapp, phone),
      celular: first(client.celular, order.celular, phone),
      email,
      endereco: {
        logradouro: first(address.logradouro, address.rua, address.street, address.endereco),
        numero: first(address.numero, address.number, address.casa),
        complemento: first(address.complemento, address.complement),
        bairro: first(address.bairro, address.district),
        cidade: first(address.cidade, address.city),
        uf: first(address.uf, address.estado, address.state),
        cep: first(address.cep, address.zip),
        referencia: first(address.referencia, address.ponto_referencia, address.frente, order.referencia),
        endereco_completo: first(address.endereco_completo, address.enderecoCompleto, address.fullAddress),
        agendamento: first(address.agendamento, order.agendamento),
      },
      origem: 'pedidos_admin_v2',
      atualizado_em: new Date().toISOString(),
      ultimo_pedido_em: createdAt,
      ultimo_pedido_numero: orderNumber(order),
      ultimo_pedido_valor: total,
    },
    pedido: {
      numero: orderNumber(order),
      criado_em: createdAt,
      total,
      status: first(order.status_entrega, order.status_separacao, order.status, 'novo'),
      forma_pagamento: paymentLabel(order),
    },
    orderKey,
  });
}

export function customersFromOrders(orders = []) {
  const grouped = new Map();
  for (const order of Array.isArray(orders) ? orders : []) {
    const normalized = customerFromOrder(order);
    if (!normalized?.key) continue;
    const current = grouped.get(normalized.key) || {
      firebaseKey: normalized.key,
      ...normalized.cadastro,
      pedidos: {},
    };
    current.pedidos[normalized.orderKey] = normalized.pedido;
    const currentDate = new Date(current.ultimo_pedido_em || 0).getTime() || 0;
    const nextDate = new Date(normalized.cadastro.ultimo_pedido_em || 0).getTime() || 0;
    grouped.set(normalized.key, {
      ...current,
      ...normalized.cadastro,
      ultimo_pedido_em: nextDate >= currentDate ? normalized.cadastro.ultimo_pedido_em : current.ultimo_pedido_em,
      ultimo_pedido_numero: nextDate >= currentDate ? normalized.cadastro.ultimo_pedido_numero : current.ultimo_pedido_numero,
      ultimo_pedido_valor: nextDate >= currentDate ? normalized.cadastro.ultimo_pedido_valor : current.ultimo_pedido_valor,
      pedidos: current.pedidos,
    });
  }
  return [...grouped.values()].map(customer => {
    const orderRows = Object.entries(customer.pedidos || {}).map(([key, row]) => ({ firebaseKey: key, ...(row || {}) }));
    return {
      ...customer,
      pedidos_lista: orderRows.sort((a, b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0)),
      total_pedidos: orderRows.length,
      valor_total_pedidos: orderRows.reduce((sum, row) => sum + number(row.total), 0),
    };
  }).sort((a, b) => new Date(b.ultimo_pedido_em || 0) - new Date(a.ultimo_pedido_em || 0));
}

export async function upsertCustomerFromOrder(config, order) {
  if (!config.writeMode) return null;
  const normalized = customerFromOrder(order);
  if (!normalized?.key) return null;
  const node = clientsNode(config);
  await request(databaseUrl(config, `${node}/${encodeURIComponent(normalized.key)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalized.cadastro),
  });
  await request(databaseUrl(config, `${node}/${encodeURIComponent(normalized.key)}/pedidos/${encodeURIComponent(normalized.orderKey)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalized.pedido),
  });
  customersCache = null;
  return normalized.key;
}

export async function syncCustomersFromOrders(config, orders = []) {
  if (!config.writeMode || !Array.isArray(orders) || !orders.length) return 0;
  let saved = 0;
  for (const order of orders) {
    const result = await upsertCustomerFromOrder(config, order).catch(error => {
      console.warn('Nao foi possivel atualizar cliente do pedido:', error);
      return null;
    });
    if (result) saved += 1;
  }
  return saved;
}

export async function loadCustomers(config, { force = false } = {}) {
  const fresh = customersCache && Date.now() - customersCacheAt < CACHE_MS;
  if (!force && fresh) return structuredClone(customersCache);
  const data = await request(`${databaseUrl(config, clientsNode(config))}?_=${Date.now()}`, {}, 20000);
  const customers = Object.entries(data || {})
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([firebaseKey, value]) => {
      const pedidos = value.pedidos && typeof value.pedidos === 'object' ? value.pedidos : {};
      const orderRows = Object.entries(pedidos).map(([key, row]) => ({ firebaseKey: key, ...(row || {}) }));
      const total = orderRows.reduce((sum, row) => sum + number(row.total), 0);
      return {
        firebaseKey,
        ...value,
        pedidos_lista: orderRows.sort((a, b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0)),
        total_pedidos: orderRows.length,
        valor_total_pedidos: total,
      };
    })
    .sort((a, b) => new Date(b.ultimo_pedido_em || 0) - new Date(a.ultimo_pedido_em || 0));
  customersCache = customers;
  customersCacheAt = Date.now();
  return structuredClone(customers);
}

export function invalidateCustomersCache() {
  customersCache = null;
  customersCacheAt = 0;
}
