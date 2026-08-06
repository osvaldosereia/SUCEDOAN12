import { number, productCode, productImage, productKey, productName, text } from '../core/utils.js';

function webhookUrl(config, channel) {
  if (channel === 'image') return text(config.makeImageWebhookUrl || config.makeAiWebhookUrl);
  if (channel === 'instagram-kit') return text(config.makeInstagramKitWebhookUrl);
  return text(config.makeTextWebhookUrl || config.makeAiWebhookUrl);
}

export async function callMake(config, channel, payload, { timeout = 120000 } = {}) {
  const url = webhookUrl(config, channel);
  if (!url) {
    const label = channel === 'image' ? 'IA de imagens' : channel === 'instagram-kit' ? 'Instagram de kits' : 'IA de textos';
    throw new Error(`Configure o webhook ${label} nas Configurações da V2.`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const body = new URLSearchParams();
  body.set('payload', JSON.stringify(payload));
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body,
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Make retornou ${response.status}${raw ? `: ${raw.slice(0, 260)}` : ''}`);
    if (!raw.trim()) return { ok: true };
    try { return JSON.parse(raw); } catch { return { ok: true, texto: raw }; }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('A automação do Make excedeu o tempo de resposta. Confira a execução no cenário.');
    throw error;
  } finally { clearTimeout(timer); }
}

export function unwrapMakeResult(result) {
  if (typeof result === 'string') {
    try { return unwrapMakeResult(JSON.parse(result)); } catch { return { texto: result }; }
  }
  if (!result || typeof result !== 'object') return {};
  if (typeof result.texto === 'string') {
    try { return { ...result, ...unwrapMakeResult(JSON.parse(result.texto)) }; } catch {}
  }
  if (result.choices?.[0]?.message?.content) return unwrapMakeResult(result.choices[0].message.content);
  if (result.output?.[0]?.content?.[0]?.text) return unwrapMakeResult(result.output[0].content[0].text);
  if (result.body && typeof result.body === 'object') return { ...result, ...result.body };
  if (result.data && !Array.isArray(result.data) && typeof result.data === 'object') return { ...result, ...result.data };
  return result;
}

function round(value) { return Math.round(number(value) * 100) / 100; }
function brl(value) { return round(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' '); }

export function compactProductForMake(product) {
  return {
    firebaseKey: productKey(product), id: text(product.id || productKey(product)), codigo: productCode(product), gtin: text(product.gtin || product.ean),
    nome: productName(product), descricao: text(product.descricao), descricao_curta: text(product.descricao_curta), categoria: text(product.categoria),
    subcategoria: text(product.subcategoria), subsubcategoria: text(product.subsubcategoria), marca: text(product.marca), fornecedor: text(product.fornecedor),
    embalagem: text(product.embalagem), ncm: text(product.ncm),
    tags: Array.isArray(product.tags) ? product.tags : text(product.tags).split(/[,;|]/).map(item => item.trim()).filter(Boolean),
    preco: number(product.preco), preco_custo: number(product.preco_custo), estoque: number(product.estoque), validade: text(product.validade), imagem_url: productImage(product),
  };
}

export function compactKitForMake(kit, products = []) {
  const byCode = new Map();
  products.forEach(product => {
    [productCode(product), productKey(product), text(product.gtin || product.ean)].filter(Boolean).forEach(code => byCode.set(code, product));
  });
  const items = Array.isArray(kit?.produtos) ? kit.produtos : [];
  const normalizedItems = items.map((item, index) => {
    const code = text(item?.codigo || item?.code || item); const product = byCode.get(code); const qtd = Math.max(1, Math.floor(number(item?.qtd || item?.quantidade || 1)));
    const unitPrice = round(product?.preco); const totalPrice = round(unitPrice * qtd);
    return {
      indice: index + 1, codigo: code, qtd, quantidade: qtd, nome: product ? productName(product) : code, marca: text(product?.marca),
      categoria: text(product?.categoria), subcategoria: text(product?.subcategoria), embalagem: text(product?.embalagem), descricao: text(product?.descricao),
      preco: unitPrice, preco_unitario: unitPrice, preco_total: totalPrice, preco_unitario_formatado: brl(unitPrice), preco_total_formatado: brl(totalPrice),
      estoque: number(product?.estoque), imagem_url: productImage(product || {}), substitutos: Array.isArray(item?.substitutos) ? item.substitutos : [],
    };
  });
  const calculatedOriginal = round(normalizedItems.reduce((sum, item) => sum + item.preco_total, 0));
  const original = round(kit?.preco_original || kit?.preco_sem_desconto || kit?.preco_anterior || kit?.dados_financeiros?.preco_original || calculatedOriginal);
  const promotional = round(kit?.preco_promocional || kit?.preco_com_desconto || kit?.preco_novo || kit?.preco_final || kit?.preco || kit?.dados_financeiros?.preco_promocional);
  const economy = round(kit?.economia || kit?.valor_economia || kit?.dados_financeiros?.economia || Math.max(0, original - promotional));
  const calculatedDiscount = original > 0 ? round((economy / original) * 100) : 0;
  const discount = round(kit?.desconto_percentual_aplicado || kit?.desconto_percentual || kit?.dados_financeiros?.desconto_percentual || calculatedDiscount);
  const financials = {
    moeda: 'BRL', preco_original: original, preco_sem_desconto: original, preco_anterior: original,
    preco_promocional: promotional, preco_com_desconto: promotional, preco_novo: promotional, preco_final: promotional,
    economia: economy, valor_economia: economy, desconto_percentual: discount, percentual_desconto: discount,
    preco_original_formatado: brl(original), preco_sem_desconto_formatado: brl(original), preco_anterior_formatado: brl(original),
    preco_promocional_formatado: brl(promotional), preco_com_desconto_formatado: brl(promotional), preco_novo_formatado: brl(promotional),
    economia_formatada: brl(economy), valor_economia_formatado: brl(economy), desconto_formatado: `${discount}%`,
  };
  const factor = original > 0 ? promotional / original : 1;
  const pricedItems = normalizedItems.map(item => {
    const newUnit = round(item.preco_unitario * factor);
    const newTotal = round(newUnit * item.qtd);
    const itemEconomyUnit = round(item.preco_unitario - newUnit);
    const itemEconomyTotal = round(item.preco_total - newTotal);
    const itemEconomyUnitFormatted = brl(itemEconomyUnit);
    const itemEconomyTotalFormatted = brl(itemEconomyTotal);
    return {
      ...item,
      preco_antigo_unitario: item.preco_unitario,
      preco_antigo_total: item.preco_total,
      preco_novo_unitario_kit: newUnit,
      preco_novo_total_kit: newTotal,
      economia_unitaria_kit: itemEconomyUnit,
      economia_total_kit: itemEconomyTotal,
      economia_unitaria: itemEconomyUnit,
      economia_total: itemEconomyTotal,
      desconto_percentual_kit: discount,
      preco_antigo_unitario_formatado: brl(item.preco_unitario),
      preco_antigo_total_formatado: brl(item.preco_total),
      preco_novo_unitario_kit_formatado: brl(newUnit),
      preco_novo_total_kit_formatado: brl(newTotal),
      economia_unitaria_kit_formatada: itemEconomyUnitFormatted,
      economia_unitaria_kit_formatado: itemEconomyUnitFormatted,
      economia_total_kit_formatada: itemEconomyTotalFormatted,
      economia_total_kit_formatado: itemEconomyTotalFormatted,
      economia_unitaria_formatada: itemEconomyUnitFormatted,
      economia_total_formatada: itemEconomyTotalFormatted,
    };
  });
  return {
    id: text(kit?.id), codigo: text(kit?.codigo), nome: text(kit?.nome), descricao: text(kit?.descricao), preco: promotional,
    preco_original: original, preco_sem_desconto: original, preco_anterior: original, preco_promocional: promotional, preco_com_desconto: promotional,
    preco_novo: promotional, preco_final: promotional, economia: economy, valor_economia: economy, economia_kit: economy,
    economia_total: economy, economia_total_kit: economy, desconto_percentual: discount, desconto_percentual_aplicado: discount,
    preco_original_formatado: financials.preco_original_formatado, preco_anterior_formatado: financials.preco_anterior_formatado,
    preco_promocional_formatado: financials.preco_promocional_formatado, preco_novo_formatado: financials.preco_novo_formatado,
    economia_formatada: financials.economia_formatada, valor_economia_formatado: financials.valor_economia_formatado,
    economia_kit_formatada: financials.economia_formatada, economia_total_formatada: financials.economia_formatada,
    economia_total_kit_formatada: financials.economia_formatada, desconto_formatado: financials.desconto_formatado, dados_financeiros: financials,
    imagem: text(kit?.imagem), data_inicio: text(kit?.data_inicio), data_fim: text(kit?.data_fim), limite_kits: number(kit?.limite_kits),
    produtos: pricedItems, referencias_imagens: pricedItems.map(item => item.imagem_url).filter(Boolean),
    resumo_financeiro: `DE ${financials.preco_original_formatado} | POR ${financials.preco_promocional_formatado} | ECONOMIA ${financials.economia_formatada} | ${financials.desconto_formatado} OFF`,
  };
}

export function assertMakeProductIdentity(product, result) {
  const data = unwrapMakeResult(result);
  const expected = [productKey(product), productCode(product)].map(value => text(value).toUpperCase()).filter(Boolean);
  const returned = [data.firebaseKey, data.key, data.id_produto, data.produto_id, data.codigo, data.codigo_produto, data.sku].map(value => text(value).toUpperCase()).filter(Boolean);
  if (expected.length && returned.length && !returned.some(value => expected.includes(value))) throw new Error('O Make retornou dados de outro produto. Confira o cenário antes de aplicar a resposta.');
  const expectedGtin = text(product.gtin || product.ean); const returnedGtins = [data.gtin, data.ean, data.codigo_barras, data.barcode].map(text).filter(Boolean);
  if (expectedGtin && returnedGtins.length && !returnedGtins.includes(expectedGtin)) throw new Error('O Make retornou EAN/GTIN diferente do produto aberto.');
  return data;
}

export function extractMakeTags(result) {
  const data = unwrapMakeResult(result); const source = data.tags_sugeridas ?? data.tags ?? data.tag ?? [];
  if (Array.isArray(source)) return source.map(text).filter(Boolean);
  return text(source).split(/[,;|]/).map(item => item.trim()).filter(Boolean);
}

export function extractMakeImage(result) {
  const data = unwrapMakeResult(result);
  const direct = data.imagem_principal || data.imagem || data.imagem_url || data.image || data.image_url || data.url_imagem || data.url || data.src;
  if (text(direct)) return text(direct);
  const first = Array.isArray(data.imagens) ? data.imagens[0] : Array.isArray(data.data) ? data.data[0] : null;
  if (typeof first === 'string') return text(first);
  if (first?.url || first?.imagem || first?.image_url) return text(first.url || first.imagem || first.image_url);
  const base64 = data.b64_json || data.base64 || first?.b64_json;
  return text(base64) ? `data:image/png;base64,${text(base64)}` : '';
}
