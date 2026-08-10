import {
  cleanCpf, fmt, formatCep, formatPhone
} from '../app-next/src/core.js?v=20260727-7';

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function lookupCustomer(raw, cpf) {
  const customer = raw?.data && !raw.nome ? raw.data : raw || {};
  const address = customer.endereco?.geral || customer.endereco || {};
  const phone = String(customer.celular || customer.telefone || '').replace(/\D/g, '');
  const cep = String(address.cep || customer.cep || '').replace(/\D/g, '');

  return {
    nome: String(customer.nome || '').trim(),
    cpf: cleanCpf(customer.numeroDocumento || customer.cpf || cpf),
    telefone: phone,
    telefoneFormatado: formatPhone(phone),
    celular: phone,
    email: String(customer.email || '').trim().toLowerCase(),
    cep,
    cepFormatado: formatCep(cep),
    cidade: String(address.municipio || address.cidade || customer.cidade || '').trim(),
    uf: String(address.uf || customer.uf || 'MT').trim() || 'MT',
    bairro: String(address.bairro || customer.bairro || '').trim(),
    rua: String(address.endereco || address.rua || customer.rua || '').trim(),
    quadra: String(customer.quadra || '').trim(),
    casa: String(address.numero || customer.numero || customer.casa || '').trim(),
    numero: String(address.numero || customer.numero || customer.casa || '').trim(),
    complemento: String(address.complemento || customer.complemento || '').trim(),
    frente: String(customer.frente || customer.referencia || '').trim(),
    pagamento: 'Pix',
    pagamentoCodigo: 'PIX',
    pagamentoIdBling: 9144864,
    agendamento: ''
  };
}

function orderItem(row) {
  const product = row.product || {};
  const sku = String(product.codigo || product.id || '');
  const firebaseKey = String(product.firebaseKey || product.id || '');
  const gtin = String(product.gtin || product.ean || '');
  return {
    produtoId: String(product.id || ''),
    firebaseKey,
    sku,
    identificadores: {
      id: String(product.id || ''), firebaseKey, sku, gtin, ean: gtin
    },
    nome: String(product.name || ''),
    qtd: Number(row.qty || 0),
    price: Number(row.unit || product.price || 0),
    precoOriginal: Number(row.baseUnit || product.price || 0),
    descontoCampanha: roundMoney((Number(row.baseUnit || 0) - Number(row.unit || 0)) * Number(row.qty || 0)),
    gtin,
    ean: gtin,
    url_imagem: String(product.url_imagem || product.img || ''),
    gondola: String(product.gondola || 'Z-Sem Gôndola'),
    prateleira: String(product.prateleira || '-'),
    localizacao: String(product.localizacao || ''),
    categoria: String(product.categoria || ''),
    subcategoria: String(product.subcategoria || ''),
    subsubcategoria: String(product.subsubcategoria || ''),
    marca: String(product.marca || ''),
    embalagem: String(product.embalagem || '')
  };
}

export function buildComplementPayload({
  pricing, cpf, customer, campaignReference = '', sourceUrl = '',
  timestamp = Date.now(), random = Math.floor(Math.random() * 1000)
}) {
  const cleanDocument = cleanCpf(cpf);
  if (cleanDocument.length !== 11) throw new Error('Digite os 11 números do CPF.');
  if (!customer) throw new Error('CPF não encontrado no cadastro.');
  const items = (pricing?.items || []).map(orderItem).filter(item => item.firebaseKey && item.sku && item.qtd > 0);
  if (!items.length) throw new Error('Adicione pelo menos um produto ao complemento.');

  const suffix = String(random).padStart(3, '0');
  const orderId = `COMP-${timestamp}${suffix}`;
  const totalProducts = roundMoney(items.reduce((sum, item) => sum + item.qtd * item.price, 0));
  const customerData = lookupCustomer(customer, cleanDocument);
  const campaigns = [...new Set((pricing.items || []).map(item => item.discountCode).filter(Boolean))];

  return {
    pedido: {
      id: orderId,
      numero: orderId,
      idempotencyKey: orderId,
      origem: 'complemente',
      tipo: 'pedido_complementar',
      metadados: {
        pedidoCriadoEm: new Date(timestamp).toISOString(),
        catalogVerified: true,
        fluxo: 'complemente-cpf-v1',
        linkOrigem: String(sourceUrl || ''),
        campanhaReferencia: String(campaignReference || '')
      },
      itens: items,
      total: Number(pricing.total || totalProducts),
      totalProdutos: totalProducts,
      outrasDespesasBling: 0,
      descontoBling: 0,
      desconto: Number(pricing.discount || 0),
      campanha: campaigns.length ? { codigos: campaigns, referencia: String(campaignReference || '') } : null,
      observacoes: 'Pedido complementar independente enviado pelo mini catálogo Dona Antônia.',
      cliente: customerData
    }
  };
}

export function buildComplementWhatsAppMessage(payload) {
  const order = payload?.pedido || {};
  const lines = (order.itens || []).map(item => `• ${item.qtd}x ${item.nome} — ${fmt(item.qtd * item.price)}`);
  return [
    `*PEDIDO COMPLEMENTAR #${order.numero}*`, '', ...lines, '',
    `*TOTAL: ${fmt(order.total)}*`, '',
    'Por favor, confirme a inclusão destes produtos no meu atendimento.'
  ].join('\n');
}
