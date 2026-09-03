const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LIMIT = Math.max(10, Math.min(80, Number(process.env.LI_ALL_MUG_ORDER_LIMIT || 40) || 40));
const SPACING_MS = Math.max(150, Number(process.env.LI_ORDER_SPACING_MS || 300) || 300);

if (!AUTH) throw new Error('Token Loja Integrada ausente.');

const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');
const nowIso = () => new Date().toISOString();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const present = value => value !== undefined && value !== null && (typeof value !== 'string' || text(value) !== '');
const resourceId = value => text(typeof value === 'object' ? value?.resource_uri || value?.id : value).match(/\/(\d+)\/?$/)?.[1] || text(typeof value === 'object' ? value?.id : '').replace(/\D+/g, '');

function mergeNonBlank(current = {}, incoming = {}) {
  const out = { ...(current || {}) };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (!present(value)) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    out[key] = value;
  }
  return out;
}
function firstNumber(...values) {
  for (const value of values) {
    if (value === '' || value === null || value === undefined) continue;
    const n = Number(value); if (Number.isFinite(n)) return n;
  }
  return null;
}
async function li(path, attempt = 1) {
  const url = /^https?:\/\//i.test(path) ? path : `${LI_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    headers:{ Authorization:AUTH, Accept:'application/json', 'User-Agent':'CanecaFacil-All-Mug-Orders/2.1' },
    signal:AbortSignal.timeout(20000)
  });
  const raw = await response.text();
  let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) {
    if (attempt < 4 && [408,425,429,500,502,503,504].includes(response.status)) {
      const retry = Number(response.headers.get('retry-after') || 0) * 1000;
      await sleep(Math.max(retry, 500 * attempt));
      return li(path, attempt + 1);
    }
    throw new Error(`Loja Integrada ${response.status}: ${text(data?.message || data?.detail || raw).slice(0,260)}`);
  }
  await sleep(SPACING_MS);
  return data;
}
async function fb(path, { method='GET', body } = {}) {
  const response = await fetch(`${FIREBASE}/${path}.json`, {
    method, headers:{ Accept:'application/json', ...(body === undefined ? {} : { 'Content-Type':'application/json' }) },
    body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(20000)
  });
  const raw = await response.text(); let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(`Firebase ${response.status}: ${text(raw).slice(0,220)}`);
  return data;
}
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text(value).toLowerCase()));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function isMug(product = {}) {
  const hay = norm([product.tipo_produto,product.categoria,product.subcategoria,product.subsubcategoria,product.nome].join(' '));
  return hay.includes('caneca');
}
function productLiId(product = {}) {
  const liData = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
  return text(liData.produto_id || liData.product_id || product.loja_integrada_produto_id || product.loja_integrada_product_id || product.li_product_id);
}
function productSku(product = {}) { return text(product.codigo || product.sku || product.codigo_produto).toUpperCase(); }
function productArt(product = {}) {
  return text(product?.arte_aprovada?.url || product.arte_horizontal || product.arte_mestre_url || product.arte_final_url || product.arte_impressao?.url || product.arte_personalizacao);
}
function orderItems(order = {}) {
  for (const key of ['itens','items','produtos','line_items']) if (Array.isArray(order?.[key])) return order[key];
  return [];
}
function itemProductId(item = {}) { return text(item.produto_id || item.id_produto || item.product_id || item?.produto?.id || resourceId(item.produto)); }
function itemSku(item = {}) { return text(item.sku || item.codigo || item.codigo_produto || item?.produto?.sku).toUpperCase(); }
function itemQty(item = {}) { return Math.max(1, Number(item.quantidade || item.qtd || item.quantity || 1) || 1); }
function itemPrice(item = {}) { return Number(item.preco_venda || item.preco || item.price || item.valor || 0) || 0; }
function itemName(item = {}) { return text(item.nome || item.nome_produto || item.name || item?.produto?.nome || 'Caneca'); }
function orderId(order = {}) { return text(order.id || order.numero || resourceId(order.resource_uri)); }
function orderDate(order = {}) { return text(order.data_criacao || order.criado_em || order.created_at || order.data || order.data_modificacao); }
function orderEmail(order = {}) { return text(order.cliente_email || order?.cliente?.email).toLowerCase(); }
function orderComment(order = {}) { return text([order.cliente_obs,order.comentario,order.observacao,order.observacoes,order.obs,order?.cliente?.obs,order.utm_campaign,order.campanha,order.tracking_campaign,order.origem_campanha].filter(Boolean).join(' ')); }
function extractCodes(value) { return [...new Set((text(value).toUpperCase().match(/CF-\d{6}-[A-Z0-9]{4,24}/g)||[]))]; }

async function resolveSituation(order = {}) {
  let situation = order.situacao || order.status || order.status_pedido || null;
  if (situation && typeof situation === 'object') return situation;
  const uri = text(situation || order.situacao_resource_uri || order.status_resource_uri);
  if (/\/situacao\//i.test(uri)) {
    try { return await li(uri.replace(/^https?:\/\/[^/]+/i,'').replace(/^\/api\/v1/i,'')); }
    catch (error) { console.warn(`Situação ${orderId(order)}: ${error.message}`); }
  }
  return { nome:text(order.situacao_nome || order.status_nome || situation), codigo:text(order.situacao_codigo || order.status_codigo) };
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
    nome:text(order.cliente_nome || order?.cliente?.nome), email:orderEmail(order),
    telefone:text(order.cliente_telefone_celular || order.cliente_telefone_principal || order?.cliente?.telefone_celular || order?.cliente?.telefone),
    whatsapp:text(order.cliente_telefone_celular || order?.cliente?.telefone_celular || order?.cliente?.whatsapp),
    cpf:text(order.cliente_cpf || order?.cliente?.cpf), cnpj:text(order.cliente_cnpj || order?.cliente?.cnpj)
  };
}
function shipping(order = {}) {
  const envio = (Array.isArray(order.envios) ? order.envios[0] : order.envio) || {};
  return {
    servico:text(envio.forma_envio_nome || envio.nome || order.forma_envio_nome), valor:firstNumber(envio.valor,order.valor_envio,order.frete_valor),
    prazo:firstNumber(envio.prazo,order.prazo_envio), endereco:text(order.endereco_entrega || order.entrega_endereco || order?.endereco?.endereco),
    numero:text(order.numero_entrega || order.entrega_numero || order?.endereco?.numero), complemento:text(order.complemento_entrega || order.entrega_complemento || order?.endereco?.complemento),
    bairro:text(order.bairro_entrega || order.entrega_bairro || order?.endereco?.bairro), cidade:text(order.cidade_entrega || order.entrega_cidade || order?.endereco?.cidade),
    uf:text(order.estado_entrega || order.entrega_estado || order?.endereco?.estado), cep:text(order.cep_entrega || order.entrega_cep || order?.endereco?.cep)
  };
}
function totals(order = {}, items = []) {
  const calc = items.reduce((sum,item)=>sum + item.preco * item.quantidade,0);
  const subtotal = firstNumber(order.subtotal,order.valor_subtotal,order.total_produtos,order.valor_produtos,calc);
  const frete = firstNumber(order.valor_envio,order.frete_valor,order?.envio?.valor,Array.isArray(order.envios)?order.envios[0]?.valor:null,0);
  const desconto = firstNumber(order.valor_desconto,order.desconto,order.total_desconto,0);
  const total = firstNumber(order.valor_total,order.total,order.valor_pedido,order.valor_final,subtotal !== null ? subtotal + (frete || 0) - (desconto || 0) : null);
  return { subtotal,frete,desconto,total };
}
function advancedStatus(value) { return present(value) && !['novo','aguardando_pagamento','pago'].includes(norm(value)); }

const [productsRaw,pendingRaw] = await Promise.all([fb('produtos').catch(()=>({})),fb('canecas/encomendas_pendentes').catch(()=>({}))]);
const mugProducts = Object.entries(productsRaw || {}).map(([key,value])=>({ key,...(value || {}) })).filter(isMug);
const pendingPersonalizations = Object.entries(pendingRaw || {}).map(([key,value])=>({ key,...(value || {}) })).filter(row=>!['cancelada','cancelado','paga'].includes(norm(row.status)));
const byId = new Map(), bySku = new Map();
for (const product of mugProducts) {
  const id = productLiId(product), sku = productSku(product);
  if (id) byId.set(id,product); if (sku) bySku.set(sku,product);
}
console.log(`CATALOGO_CANECAS ${mugProducts.length} · ids_li=${byId.size} · skus=${bySku.size} · personalizacoes_pendentes=${pendingPersonalizations.length}`);

function matchedProduct(item = {}) { return byId.get(itemProductId(item)) || bySku.get(itemSku(item)) || null; }
function pendingCode(row={}) { return text(row.criacao_id || row.id || row.key).toUpperCase(); }
async function personalizedOrderLikely(order={}) {
  const id=orderId(order),codes=new Set(extractCodes(orderComment(order)));
  if(pendingPersonalizations.some(row=>text(row.pedido_id_hint)===id||text(row.pedido_id)===id||codes.has(pendingCode(row)))) return true;
  const email=orderEmail(order);if(!email)return false;const hash=await sha256(email);
  const ids=new Set(orderItems(order).map(itemProductId).filter(Boolean)),skus=new Set(orderItems(order).map(itemSku).filter(Boolean));
  return pendingPersonalizations.some(row=>text(row.cliente_email_hash)===hash && ((text(row.loja_integrada_produto_id)&&ids.has(text(row.loja_integrada_produto_id))) || (text(row.sku)&&skus.has(text(row.sku).toUpperCase()))));
}
function personalizedQty(existing = {}, productId, sku) {
  return (Array.isArray(existing.itens) ? existing.itens : []).filter(item => item.personalizada === true && (text(item.loja_integrada_produto_id) === productId || (sku && text(item.sku || item.codigo).toUpperCase() === sku)))
    .reduce((sum,item)=>sum + Math.max(1,Number(item.quantidade || 1) || 1),0);
}
function preservedPersonalized(existing = {}) { return (Array.isArray(existing.itens) ? existing.itens : []).filter(item => item.personalizada === true); }
function buildStandardItems(order, existing = {}) {
  const standard = [];
  for (const source of orderItems(order)) {
    const product = matchedProduct(source); if (!product) continue;
    const productId = itemProductId(source) || productLiId(product), sku = itemSku(source) || productSku(product);
    const totalQty = itemQty(source), customQty = personalizedQty(existing,productId,sku), qty = Math.max(0,totalQty-customQty);
    if (!qty) continue;
    standard.push({
      id:`${orderId(order)}-STD-${product.key}`, produto_key:product.key, codigo:sku || productSku(product), sku:sku || productSku(product),
      nome:itemName(source) || text(product.nome || 'Caneca'), quantidade:qty, preco:itemPrice(source), personalizada:false,
      loja_integrada_produto_id:productId, arte_aprovada:productArt(product)?{url:productArt(product),versao:'catalogo'}:null,
      arte_horizontal:productArt(product)
    });
  }
  return standard;
}
async function ensureStandardJobs(payload, standardItems, released, now) {
  for (const item of standardItems) {
    const jobId = safeKey(`PJ-${payload.id}-STD-${item.produto_key || item.loja_integrada_produto_id || item.sku}`);
    const existingJob = await fb(`canecas/print_jobs/${jobId}`).catch(()=>null);
    if (!released) {
      if (existingJob && ['aguardando','reimpressao'].includes(norm(existingJob.status))) {
        await fb(`canecas/print_jobs/${jobId}`, { method:'PATCH', body:{ status:'bloqueado_pagamento',pagamento_status:payload.pagamento_status,liberado_producao:false,atualizado_em:now } });
      }
      continue;
    }
    if (!item.arte_horizontal) { console.warn(`ARTE_PADRAO_AUSENTE pedido=${payload.id} produto=${item.produto_key}`); continue; }
    const body = {
      id:jobId,pedido_id:payload.id,origem:'canecafacil',origem_label:'CANECAFÁCIL',cliente_nome:payload.cliente?.nome,
      cliente_telefone:payload.cliente?.telefone || payload.cliente?.whatsapp,produto_key:item.produto_key,produto_codigo:item.codigo,
      produto_nome:item.nome,quantidade:item.quantidade,arte_aprovada:item.arte_aprovada,status:existingJob?.status === 'impresso' ? 'impresso' : 'aguardando',
      quantidade_impressa:Number(existingJob?.quantidade_impressa || 0),pagamento_status:'pago',liberado_producao:true,
      liberado_producao_em:text(payload.liberado_producao_em) || now,origem_liberacao:'loja_integrada_pagamento_aprovado',
      criado_em:existingJob?.criado_em || now,atualizado_em:now,tentativas_impressao:Number(existingJob?.tentativas_impressao || 0)
    };
    await fb(`canecas/print_jobs/${jobId}`, { method:'PUT', body });
  }
}

const search = await li(`/pedido/search?limit=${LIMIT}`);
const summaries = Array.isArray(search?.objects) ? search.objects : Array.isArray(search) ? search : [];
let scanned=0,mugOrders=0,created=0,updated=0,standardJobs=0,mixed=0,protectedPersonalized=0,errors=0;
for (const summary of summaries) {
  const id = orderId(summary); if (!id) continue;
  scanned += 1;
  try {
    let order = summary;
    if (!orderItems(order).length) order = await li(`/pedido/${encodeURIComponent(id)}`);
    const mugSources = orderItems(order).filter(item => matchedProduct(item));
    if (!mugSources.length) continue;
    mugOrders += 1;
    const existing = await fb(`canecas/pedidos/${safeKey(id)}`).catch(()=>null);
    const personalized = preservedPersonalized(existing || {});
    if(!personalized.length && await personalizedOrderLikely(order)) {
      protectedPersonalized += 1;console.warn(`PROTEGIDO_PERSONALIZACAO_PENDENTE pedido=${id} · aguardando vínculo CF-ID`);continue;
    }
    const standard = buildStandardItems(order,existing || {});
    if (personalized.length && standard.length) mixed += 1;
    const items = [...personalized,...standard];
    const situation = await resolveSituation(order), payment = paymentState(situation), status = commercialState(payment,situation), released = payment === 'pago', now = nowIso();
    const financial = totals(order,items);
    const payload = {
      id,origem:'canecafacil',canal:'loja_integrada',tipo_pedido:personalized.length ? (standard.length?'misto':'personalizado') : 'padronizado',
      status:advancedStatus(existing?.status)?existing.status:status,status_comercial:advancedStatus(existing?.status_comercial)?existing.status_comercial:status,
      cliente:mergeNonBlank(existing?.cliente || {},customer(order)),entrega:mergeNonBlank(existing?.entrega || {},shipping(order)),
      pagamento:{...(existing?.pagamento || {}),status:payment,situacao_nome:text(situation.nome),situacao_codigo:text(situation.codigo),atualizado_em:now},
      pagamento_status:payment,pagamento_confirmado:released,liberado_producao:released,
      producao_status:released?'liberado':payment==='cancelado'?'cancelado':'bloqueado_pagamento',
      liberado_producao_em:released?(text(existing?.liberado_producao_em)||now):null,itens,
      quantidade_total_canecas:items.reduce((sum,item)=>sum+Math.max(1,Number(item.quantidade||1)||1),0),
      subtotal:financial.subtotal,frete_valor:financial.frete,desconto:financial.desconto,total:financial.total,
      loja_integrada:{...(existing?.loja_integrada || {}),pedido_id:id,resource_uri:text(order.resource_uri),situacao:situation,sincronizado_em:now,pagamento_autoritativo:true},
      criado_em:existing?.criado_em || orderDate(order) || now,atualizado_em:now
    };
    if (existing?.criacoes_ids) payload.criacoes_ids=existing.criacoes_ids;
    if (existing?.criacao_id) payload.criacao_id=existing.criacao_id;
    await fb(`canecas/pedidos/${safeKey(id)}`, { method:'PUT',body:payload });
    await ensureStandardJobs(payload,standard,released,now);standardJobs += released ? standard.filter(item=>item.arte_horizontal).length : 0;
    if (existing) updated += 1; else created += 1;
    console.log(`PEDIDO_CANECAS ${id} · tipo=${payload.tipo_pedido} · itens=${items.length} · pago=${released?'sim':'nao'} · total=${financial.total ?? 'n/d'}`);
  } catch (error) { errors += 1;console.error(`ERRO_PEDIDO ${id}: ${error.message || error}`); }
}
console.log(`RESUMO_CANECAS verificados=${scanned} · pedidos_canecas=${mugOrders} · novos=${created} · atualizados=${updated} · mistos=${mixed} · protegidos_personalizados=${protectedPersonalized} · jobs_padrao=${standardJobs} · erros=${errors}`);
if (errors) process.exitCode=1;