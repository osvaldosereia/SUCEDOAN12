import { CONFIG } from './config.js';
import {
  cleanCep, cleanCpf, cleanPhone, fmt, formatCep, formatPhone,
  parseDate, readStorage, roundMoney, validEmail, validPhone, writeStorage
} from './core.js';
import { calculateCartPricing, isAvailable } from './commerce.js';

export function normalizePayment(code) {
  const key = String(code || '').trim().toUpperCase();
  const names = {
    DINHEIRO: 'Dinheiro',
    PIX: 'Pix',
    CARTAO_DE_DEBITO: 'Cartão de Débito',
    CARTAO_DE_CREDITO: 'Cartão de Crédito',
    VALE_ALIMENTACAO: 'Vale Alimentação',
    VALE_REFEICAO: 'Vale Refeição'
  };
  return { code: key, name: names[key] || code || '', blingId: '' };
}

export function validateCheckoutData(form, state) {
  const pricing = calculateCartPricing(state);
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Cuiaba' }));
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const sameDayClosed = form.deliveryDate === todayKey && today.getHours() >= 10;
  const errors = [];
  const add = (field, label, valid) => { if (!valid) errors.push({ field, label }); };
  add('deliveryDate', sameDayClosed ? 'Entrega para hoje somente até 10h' : 'Escolha a entrega', Boolean(form.deliveryDate) && !sameDayClosed);
  add('name', 'Nome completo', Boolean(form.name));
  add('cpf', 'CPF com 11 números', cleanCpf(form.cpf).length === 11);
  add('phone', 'WhatsApp com DDD', validPhone(form.phone));
  add('email', 'E-mail válido', validEmail(form.email));
  add('cep', 'CEP com 8 números', cleanCep(form.cep).length === 8);
  add('city', 'Cidade', Boolean(form.city));
  add('district', 'Bairro', Boolean(form.district));
  add('street', 'Rua ou avenida', Boolean(form.street));
  add('number', 'Número', Boolean(form.number));
  add('payment', 'Forma de pagamento', Boolean(form.payment));
  if (pricing.subtotalBefore < CONFIG.MIN_ORDER) errors.push({ field: 'cart', label: `Pedido mínimo de ${fmt(CONFIG.MIN_ORDER)}` });
  if (!pricing.items.some(item => !item.product.isFee)) errors.push({ field: 'cart', label: 'Adicione produtos ao pedido' });
  return { valid: errors.length === 0, errors, pricing };
}

export function buildOrderPayload(state, form, { timestamp = Date.now(), random = Math.floor(Math.random() * 1000) } = {}) {
  const pricing = calculateCartPricing(state);
  const payment = normalizePayment(form.payment || 'DINHEIRO');
  const orderId = `${timestamp}${String(random).padStart(3, '0')}`;
  const orderNumber = String(timestamp).slice(-6);
  const productItems = pricing.items.filter(item => !item.product.isFee && isAvailable(item.product));
  const orderItems = productItems.map(item => {
    const line = pricing.linePrices.get(item.id) || { effective: Number(item.product.price || 0) };
    return {
      produtoId: String(item.product.id || ''),
      firebaseKey: String(item.product.firebaseKey || ''),
      sku: String(item.product.codigo || item.product.id || ''),
      identificadores: {
        id: String(item.product.id || ''),
        firebaseKey: String(item.product.firebaseKey || ''),
        sku: String(item.product.codigo || item.product.id || ''),
        gtin: String(item.product.gtin || ''),
        ean: String(item.product.ean || item.product.gtin || '')
      },
      nome: String(item.product.name || ''),
      qtd: Number(item.qty || 0),
      price: Number(line.effective || item.product.price || 0),
      precoOriginal: Number(item.product.price || 0),
      descontoCupom: Number(line.couponDiscount || 0),
      descontoValidadeQuantidade: Number(line.expiryBulkDiscount || 0),
      descontoAtacado: Number(line.wholesaleDiscount || 0),
      gtin: String(item.product.gtin || ''),
      ean: String(item.product.ean || item.product.gtin || ''),
      url_imagem: String(item.product.url_imagem || item.product.img || ''),
      gondola: String(item.product.gondola || 'Z-Sem Gôndola'),
      prateleira: String(item.product.prateleira || '-'),
      localizacao: String(item.product.localizacao || ''),
      categoria: String(item.product.categoria || ''),
      subcategoria: String(item.product.subcategoria || ''),
      subsubcategoria: String(item.product.subsubcategoria || ''),
      marca: String(item.product.marca || ''),
      embalagem: String(item.product.embalagem || '')
    };
  });
  const totalProducts = roundMoney(orderItems.reduce((sum, item) => sum + item.qtd * item.price, 0));
  const difference = roundMoney(pricing.total - totalProducts);
  return {
    pedido: {
      id: orderId,
      numero: orderNumber,
      idempotencyKey: orderId,
      metadados: {
        appVersion: CONFIG.APP_VERSION,
        pedidoCriadoEm: new Date(timestamp).toISOString(),
        catalogoCarregadoEm: state.catalogLoadedAt ? new Date(state.catalogLoadedAt).toISOString() : null,
        catalogoFonte: state.catalogSource,
        catalogoVersao: state.catalogVersion,
        catalogVerified: true,
        previewModular: true
      },
      itens: orderItems,
      total: pricing.total,
      totalProdutos: totalProducts,
      outrasDespesasBling: difference > 0 ? difference : 0,
      descontoBling: difference < 0 ? Math.abs(difference) : 0,
      desconto: pricing.discount,
      cupom: pricing.coupon && pricing.eligibility.eligible ? {
        codigo: pricing.coupon.codigo,
        tipo: pricing.coupon.tipo,
        percentual: Number(pricing.coupon.desconto || 0),
        valorDesconto: pricing.couponDiscount,
        itensParticipantes: pricing.participatingItems
      } : null,
      kitPromocional: pricing.kitDiscount > 0 ? { valorDesconto: pricing.kitDiscount } : null,
      atacado: pricing.wholesaleDiscount > 0 ? {
        percentual: CONFIG.WHOLESALE_DISCOUNT_RATE * 100,
        quantidadeMinima: CONFIG.WHOLESALE_MIN_QTY,
        valorDesconto: pricing.wholesaleDiscount,
        itensParticipantes: pricing.wholesaleItems
      } : null,
      validadeQuantidade: pricing.expiryBulkDiscount > 0 ? {
        percentual: CONFIG.EXPIRY_BULK_DISCOUNT_RATE * 100,
        quantidadeMinima: CONFIG.WHOLESALE_MIN_QTY,
        diasMaximos: CONFIG.EXPIRY_BULK_MAX_DAYS - 1,
        valorDesconto: pricing.expiryBulkDiscount,
        itensParticipantes: pricing.expiryBulkItems
      } : null,
      observacoes: Object.keys(state.basketCustomizations || {}).length ? 'Pedido com Cesta/Kit' : 'Pedido Comum',
      cliente: {
        nome: String(form.name || '').trim(),
        cpf: cleanCpf(form.cpf),
        telefone: cleanPhone(form.phone),
        telefoneFormatado: formatPhone(form.phone),
        celular: cleanPhone(form.phone),
        email: String(form.email || '').trim().toLowerCase(),
        cep: cleanCep(form.cep),
        cepFormatado: formatCep(form.cep),
        cidade: String(form.city || '').trim(),
        uf: 'MT',
        bairro: String(form.district || '').trim(),
        rua: String(form.street || '').trim(),
        quadra: String(form.block || '').trim(),
        casa: String(form.number || '').trim(),
        numero: String(form.number || '').trim(),
        complemento: [form.block ? `Quadra ${form.block}` : '', form.reference || ''].filter(Boolean).join('. '),
        frente: String(form.reference || '').trim(),
        pagamento: payment.name,
        pagamentoCodigo: payment.code,
        pagamentoIdBling: payment.blingId,
        agendamento: String(form.deliveryDate || '')
      }
    }
  };
}

export function buildFirebaseOrder(makePayload) {
  const order = makePayload?.pedido || {};
  const customer = order.cliente || {};
  const nowIso = new Date().toISOString();
  const items = (order.itens || []).map(item => ({
    produtoId: String(item.produtoId || item.identificadores?.id || ''),
    firebaseKey: String(item.firebaseKey || ''),
    sku: String(item.sku || ''),
    codigo: String(item.sku || ''),
    identificadores: item.identificadores || {},
    nome: String(item.nome || ''),
    quantidade: Number(item.qtd || 0),
    preco_unitario: Number(item.price || 0),
    subtotal: roundMoney(Number(item.qtd || 0) * Number(item.price || 0)),
    gtin: String(item.gtin || item.ean || ''),
    ean: String(item.ean || item.gtin || ''),
    url_imagem: String(item.url_imagem || '../site/img/produtos/sem-imagem.webp'),
    gondola: String(item.gondola || 'Z-Sem Gôndola'),
    prateleira: String(item.prateleira || '-'),
    localizacao: String(item.localizacao || ''),
    categoria: String(item.categoria || ''),
    subcategoria: String(item.subcategoria || ''),
    subsubcategoria: String(item.subsubcategoria || ''),
    marca: String(item.marca || ''),
    embalagem: String(item.embalagem || ''),
    status_separacao: 'pendente',
    quantidade_separada: 0,
    separado_em: '',
    separador: ''
  }));
  return {
    id: String(order.id || ''),
    numero_pedido: String(order.numero || order.id || ''),
    idempotency_key: String(order.idempotencyKey || order.id || ''),
    origem: 'site',
    metadados: order.metadados || {},
    status: 'recebido',
    status_separacao: 'pendente',
    criado_em: nowIso,
    atualizado_em: nowIso,
    link_pedido: `${CONFIG.SITE_BASE_URL}/pedido.html?id=${encodeURIComponent(String(order.id || ''))}`,
    firebase_path: `/pedidos/${String(order.id || '')}`,
    mini_site_interno: `${CONFIG.SITE_BASE_URL}/pedidos.html?id=${encodeURIComponent(String(order.id || ''))}`,
    separacao: {
      status: 'pendente', iniciado_em: '', finalizado_em: '', separador: '',
      total_itens: items.length, itens_separados: 0, itens_pendentes: items.length, observacoes_internas: ''
    },
    bling: { status: 'aguardando_make', id_contato: '', id_pedido_venda: '', numero_pedido_bling: '' },
    integracao: { whatsapp: 'aberto', firebase: 'salvo_pelo_site', make: 'pendente', criado_pelo_site_em: nowIso },
    cliente: {
      nome: String(customer.nome || 'Cliente Site'), cpf: String(customer.cpf || ''),
      telefone: String(customer.telefone || ''), telefoneFormatado: String(customer.telefoneFormatado || ''),
      celular: String(customer.celular || customer.telefone || ''), email: String(customer.email || '')
    },
    entrega: {
      agendamento: String(customer.agendamento || ''), cep: String(customer.cep || ''),
      cepFormatado: String(customer.cepFormatado || ''), cidade: String(customer.cidade || ''), uf: 'MT',
      bairro: String(customer.bairro || ''), rua: String(customer.rua || ''), numero: String(customer.numero || customer.casa || ''),
      casa: String(customer.casa || ''), quadra: String(customer.quadra || ''), complemento: String(customer.complemento || ''),
      frente: String(customer.frente || ''),
      endereco_completo: [customer.rua, customer.numero || customer.casa, customer.quadra ? `Quadra ${customer.quadra}` : '', customer.bairro, [customer.cidade, 'MT'].filter(Boolean).join('/'), customer.cepFormatado ? `CEP ${customer.cepFormatado}` : ''].filter(Boolean).join(', ')
    },
    pagamento: {
      forma: String(customer.pagamento || ''), codigo: String(customer.pagamentoCodigo || ''),
      total: Number(order.total || 0), totalProdutos: Number(order.totalProdutos || 0), desconto: Number(order.desconto || 0),
      outrasDespesasBling: Number(order.outrasDespesasBling || 0), descontoBling: Number(order.descontoBling || 0), total_texto: fmt(order.total)
    },
    cupom: order.cupom || null,
    kitPromocional: order.kitPromocional || null,
    atacado: order.atacado || null,
    validadeQuantidade: order.validadeQuantidade || null,
    observacoes: String(order.observacoes || ''),
    itens: items,
    envio: { status: 'aguardando_separacao', entregador: '', saiu_em: '', entregue_em: '', tentativas: [], observacoes: '' },
    historico: [{ data: nowIso, acao: 'pedido_recebido_site', usuario: 'site-next', observacao: 'Pedido salvo pela versão modular de testes.' }],
    controle: {
      pedido_original_site: true,
      bloquear_alteracao_por_whatsapp: true,
      aguardando_processamento_make: true,
      preview_modular: true,
      observacao_interna: 'WhatsApp é o canal prioritário. Firebase e Make são integrações secundárias.'
    }
  };
}

function formatOrderDate(value) {
  const date = parseDate(value, false);
  if (!date) return String(value || '');
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export function buildWhatsAppMessage(makePayload, pricing) {
  const order = makePayload.pedido;
  const customer = order.cliente;
  const itemLines = order.itens.map(item => `${item.qtd}x ${item.nome}`).join('\n');
  const discountLines = [
    pricing.couponDiscount > 0 ? `🏷️ *CUPOM:* − ${fmt(pricing.couponDiscount)}` : '',
    pricing.kitDiscount > 0 ? `🎁 *DESCONTO DO KIT:* − ${fmt(pricing.kitDiscount)}` : '',
    pricing.expiryBulkDiscount > 0 ? `⏳ *VALIDADE + 3 UNIDADES:* − ${fmt(pricing.expiryBulkDiscount)}` : '',
    pricing.wholesaleDiscount > 0 ? `📦 *DESCONTO ATACADO:* − ${fmt(pricing.wholesaleDiscount)}` : '',
    pricing.discount > 0 ? `✅ *ECONOMIA TOTAL:* − ${fmt(pricing.discount)}` : ''
  ].filter(Boolean).join('\n');
  return `*PEDIDO #${order.numero}*\n*ENTREGA:* ${formatOrderDate(customer.agendamento)}\n------------------------------\n*ITENS SELECIONADOS*\n${itemLines}\nTotal de itens: ${order.itens.reduce((sum, item) => sum + Number(item.qtd || 0), 0)}\n\n*RESUMO DE VALORES*\nValor normal sem descontos: ${fmt(pricing.subtotalBefore)}${discountLines ? `\n${discountLines}` : ''}\n💰 *TOTAL FINAL:* ${fmt(order.total)}\n------------------------------\n*👤 DADOS PARA ATENDIMENTO*\nNome: ${customer.nome}\nTelefone/WhatsApp: ${customer.telefoneFormatado}\nCidade: ${customer.cidade}/MT\nBairro: ${customer.bairro}\nRua: ${customer.rua}\nNº: ${customer.numero}${customer.quadra ? `\nQuadra: ${customer.quadra}` : ''}${customer.frente ? `\nReferência: ${customer.frente}` : ''}\n📅 *Agendamento:* ${formatOrderDate(customer.agendamento)}\n💳 *Pagamento:* ${customer.pagamento}\n------------------------------\nOlá! Gostaria de confirmar este pedido e o endereço de entrega.`;
}

export async function lookupClientByCpf(cpf) {
  const digits = cleanCpf(cpf);
  if (digits.length !== 11) throw new Error('Digite os 11 números do CPF.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(CONFIG.ENDPOINTS.CLIENT_LOOKUP, {
      method: 'POST', body: new URLSearchParams({ cpf: digits }), cache: 'no-store', signal: controller.signal
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { throw new Error('Não conseguimos buscar seus dados agora.'); }
    if (!response.ok || result.sucesso === false) throw new Error(result.erro || 'Não foi possível buscar seus dados agora.');
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithTimeout(url, options, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function readQueue() {
  const queue = readStorage(CONFIG.STORAGE.ORDER_QUEUE, []);
  return Array.isArray(queue) ? queue.filter(entry => entry?.id && entry.makePayload) : [];
}

function writeQueue(queue) {
  writeStorage(CONFIG.STORAGE.ORDER_QUEUE, (queue || []).filter(entry => entry?.id && entry.makePayload).slice(-CONFIG.ORDER_QUEUE_MAX));
}

export function enqueueOrder(makePayload) {
  const id = String(makePayload?.pedido?.id || '');
  if (!id) throw new Error('Pedido sem identificador.');
  const queue = readQueue();
  const existing = queue.find(entry => entry.id === id);
  const entry = {
    id,
    makePayload,
    firebaseOrder: buildFirebaseOrder(makePayload),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    firebaseStatus: existing?.firebaseStatus || 'pending',
    makeStatus: existing?.makeStatus || 'pending',
    makeAttempts: existing?.makeAttempts || 0,
    lastMakeAttemptAt: existing?.lastMakeAttemptAt || 0,
    lastError: ''
  };
  const index = queue.findIndex(item => item.id === id);
  if (index >= 0) queue[index] = entry;
  else queue.push(entry);
  writeQueue(queue);
  return entry;
}

function updateQueueEntry(id, changes) {
  const queue = readQueue();
  const index = queue.findIndex(entry => entry.id === String(id));
  if (index < 0) return null;
  queue[index] = { ...queue[index], ...changes, updatedAt: Date.now() };
  writeQueue(queue);
  return queue[index];
}

export async function processOrderQueue() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const queue = readQueue().sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
  for (const snapshot of queue.slice(0, 4)) {
    let entry = readQueue().find(item => item.id === snapshot.id);
    if (!entry) continue;
    if (entry.firebaseStatus !== 'sent') {
      try {
        const response = await fetchWithTimeout(`${CONFIG.ENDPOINTS.FIREBASE_ORDERS}/${encodeURIComponent(entry.id)}.json`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry.firebaseOrder), keepalive: true
        }, 8000);
        if (!response.ok) throw new Error(`Firebase respondeu ${response.status}`);
        entry = updateQueueEntry(entry.id, { firebaseStatus: 'sent', lastError: '' });
      } catch (error) {
        updateQueueEntry(entry.id, { firebaseStatus: 'pending', lastError: error.message || 'Falha no Firebase' });
      }
    }
    entry = readQueue().find(item => item.id === snapshot.id);
    if (!entry || entry.makeStatus === 'sent') continue;
    const now = Date.now();
    if (entry.makeAttempts > 0 && now - Number(entry.lastMakeAttemptAt || 0) < CONFIG.ORDER_RETRY_MS) continue;
    updateQueueEntry(entry.id, { makeStatus: 'sending', makeAttempts: Number(entry.makeAttempts || 0) + 1, lastMakeAttemptAt: now });
    try {
      const response = await fetchWithTimeout(CONFIG.ENDPOINTS.MAKE_ORDER, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry.makePayload), keepalive: true
      }, 12000);
      if (!response.ok) throw new Error(`Make respondeu ${response.status}`);
      updateQueueEntry(entry.id, { makeStatus: 'sent', lastError: '' });
    } catch (error) {
      updateQueueEntry(entry.id, { makeStatus: 'pending', lastError: error.message || 'Falha no Make' });
    }
    entry = readQueue().find(item => item.id === snapshot.id);
    if (entry?.firebaseStatus === 'sent' && entry?.makeStatus === 'sent') writeQueue(readQueue().filter(item => item.id !== entry.id));
  }
}

export function openWhatsApp(message) {
  const text = encodeURIComponent(message);
  const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const url = mobile
    ? `https://api.whatsapp.com/send?phone=${CONFIG.WHATSAPP_NUMBER}&text=${text}&type=phone_number&app_absent=0`
    : `https://web.whatsapp.com/send?phone=${CONFIG.WHATSAPP_NUMBER}&text=${text}`;
  if (typeof document === 'undefined') return url;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return url;
}
