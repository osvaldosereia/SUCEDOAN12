import { clone, number, productKey, text } from './utils.js';
import { recalculateNfeItems, round } from './nfe.js';

export function normalizeNfeDate(value = '') {
  const raw = text(value);
  if (!raw) return '';
  let day;
  let month;
  let year;
  let match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
  } else {
    match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return '';
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year).padStart(4, '0')}`;
}

function dateTimestamp(value = '') {
  const normalized = normalizeNfeDate(value);
  if (!normalized) return NaN;
  const [day, month, year] = normalized.split('/').map(Number);
  return Date.UTC(year, month - 1, day, 12);
}

function earlierDate(current, incoming) {
  const currentDate = normalizeNfeDate(current);
  const incomingDate = normalizeNfeDate(incoming);
  if (!currentDate) return incomingDate;
  if (!incomingDate) return currentDate;
  return dateTimestamp(incomingDate) < dateTimestamp(currentDate) ? incomingDate : currentDate;
}

function listFromValue(value) {
  if (Array.isArray(value)) return clone(value);
  if (value && typeof value === 'object') return Object.values(clone(value));
  return [];
}

function defaultChoices(product = null) {
  return {
    name: product ? 'old' : 'nfe',
    gtin: product?.gtin || product?.ean ? 'old' : 'nfe',
    ncm: product?.ncm ? 'old' : 'nfe',
    packaging: product?.embalagem ? 'old' : 'nfe',
    cost: 'nfe',
    price: product?.preco ? 'old' : 'nfe',
  };
}

function ensureItemDefaults(item, note = null) {
  item.validity = normalizeNfeDate(item.validity);
  item.validityMode = ['keep', 'earliest', 'replace'].includes(item.validityMode) ? item.validityMode : 'earliest';
  item.noExpiry = Boolean(item.noExpiry);
  item.addStock = item.addStock !== false;
  item.skipped = Boolean(item.skipped);
  item.choices = { ...defaultChoices(item.matchedProduct), ...(item.choices || {}) };
  item.newProductDraft = {
    codigo: item.ean || item.supplierCodes?.[0] || '',
    nome: item.name,
    gtin: item.ean,
    ncm: item.ncm,
    embalagem: item.packaging || 'UN',
    categoria: 'A CLASSIFICAR',
    subcategoria: '',
    marca: '',
    fornecedor: note?.supplier || '',
    preco_custo: item.unitCost,
    preco: item.suggestedPrice,
    estoque: 0,
    situacao: 'A',
    url_imagem: '',
    descricao: '',
    ...(item.newProductDraft || {}),
  };
  return item;
}

export function prepareNfeAnalysis(analysis, margin = 40) {
  const result = clone(analysis);
  result.items = (result.items || []).map(item => ensureItemDefaults(item, result.note));
  recalculateNfeItems(result.items, result.note, margin);
  result.items.forEach(item => ensureItemDefaults(item, result.note));
  return result;
}

export function updateNfeItem(analysis, itemId, patch, margin = 40) {
  const result = prepareNfeAnalysis(analysis, margin);
  const item = result.items.find(candidate => candidate.id === itemId);
  if (!item) return result;
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (key === 'choices') item.choices = { ...(item.choices || {}), ...(value || {}) };
    else if (key === 'newProductDraft') item.newProductDraft = { ...(item.newProductDraft || {}), ...(value || {}) };
    else item[key] = value;
  });
  item.validity = normalizeNfeDate(item.validity);
  if (item.noExpiry) item.validity = '';
  ensureItemDefaults(item, result.note);
  recalculateNfeItems(result.items, result.note, margin);
  result.items.forEach(row => ensureItemDefaults(row, result.note));
  return result;
}

function chosenValue(item, product, field) {
  const imported = { name: item.name, gtin: item.ean, ncm: item.ncm, packaging: item.packaging, cost: item.unitCost, price: item.suggestedPrice };
  const current = { name: product?.nome || '', gtin: product?.gtin || product?.ean || '', ncm: product?.ncm || '', packaging: product?.embalagem || '', cost: number(product?.preco_custo), price: number(product?.preco) };
  return item.choices?.[field] === 'nfe' ? imported[field] : current[field];
}

function deterministicNewKey(item, note, usedKeys) {
  const candidates = [item.ean, item.supplierCodes?.[0], `NFE${note.number || ''}${item.lines?.[0] || ''}`]
    .map(value => text(value).replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean);
  const base = candidates[0] || `nfe_${Date.now()}`;
  let candidate = base;
  let suffix = 2;
  while (usedKeys.has(candidate)) { candidate = `${base}_${suffix}`; suffix += 1; }
  usedKeys.add(candidate);
  return candidate;
}

function futureValidity(item, product, isNew) {
  const current = normalizeNfeDate(product?.validade);
  if (item.noExpiry) return isNew ? '' : current;
  const incoming = normalizeNfeDate(item.validity);
  if (item.validityMode === 'keep' && !isNew) return current;
  if (item.validityMode === 'replace' || isNew) return incoming;
  return earlierDate(current, incoming);
}

function lotRecord(item, note, createdAt) {
  return {
    id: `${note.key}|${item.groupKey}`, chave_nfe: note.key, grupo_nfe: item.groupKey,
    numero_nfe: note.number || '', serie_nfe: note.series || '', fornecedor: note.supplier || '',
    fornecedor_documento: note.supplierCnpj || '', quantidade: round(item.incomingUnits),
    quantidade_comercial: round(item.commercialQuantity), multiplicador: number(item.multiplier),
    custo_unitario: round(item.unitCost), valor_bruto: round(item.gross), desconto: round(item.discount),
    valor_liquido: round(item.net), validade: item.noExpiry ? '' : normalizeNfeDate(item.validity),
    sem_validade: Boolean(item.noExpiry), recebido_em: note.issuedAt || '', registrado_em: createdAt,
  };
}

function entryRecord(item, note, key, createdAt) {
  return {
    id: `${note.key}|${item.groupKey}`, chave_nfe: note.key, grupo: item.groupKey,
    numero_nfe: note.number || '', serie_nfe: note.series || '', fornecedor: note.supplier || '',
    fornecedor_documento: note.supplierCnpj || '', produto_key: key, quantidade: round(item.incomingUnits),
    estoque_somado: item.addStock !== false, custo_unitario: round(item.unitCost), valor_liquido: round(item.net),
    validade: item.noExpiry ? '' : normalizeNfeDate(item.validity), sem_validade: Boolean(item.noExpiry), aplicado_em: createdAt,
  };
}

export function buildNfeSimulation(analysis, products = [], { margin = 40, createdAt = new Date().toISOString() } = {}) {
  const source = prepareNfeAnalysis(analysis, margin);
  const usedKeys = new Set((products || []).map(product => productKey(product)).filter(Boolean));
  const plans = [];

  for (const item of source.items || []) {
    const errors = [];
    const warnings = [];
    const isNew = !item.matchedProduct;
    const current = item.matchedProduct ? clone(item.matchedProduct) : null;
    if (item.skipped) {
      plans.push({ itemId: item.id, groupKey: item.groupKey, status: 'skipped', errors, warnings, item: clone(item), currentProduct: current, nextProduct: current });
      continue;
    }
    if (item.duplicate || source.globalDuplicate) errors.push(item.duplicateReason || 'Entrada duplicada bloqueada.');
    if (number(item.incomingUnits) <= 0) errors.push('Quantidade calculada precisa ser maior que zero.');
    if (number(item.unitCost) <= 0) errors.push('Custo unitário calculado precisa ser maior que zero.');
    if (!item.noExpiry && item.addStock !== false && !normalizeNfeDate(item.validity)) errors.push('Informe a validade do lote ou marque produto sem validade.');

    let key = current ? productKey(current) : '';
    if (isNew) key = text(item.newProductDraft?.firebaseKey) || deterministicNewKey(item, source.note || {}, usedKeys);
    const base = current || { firebaseKey:key,id:key,codigo:text(item.newProductDraft?.codigo)||item.ean||item.supplierCodes?.[0]||key,estoque:0,situacao:'A',entradas_nfe:[],lotes:[],historico_custos:[] };
    const next = clone(base);

    if (isNew) {
      Object.assign(next, clone(item.newProductDraft || {}));
      next.firebaseKey=key; next.id=text(next.id)||key; next.codigo=text(next.codigo)||item.ean||item.supplierCodes?.[0]||key;
      next.nome=text(next.nome)||item.name; next.gtin=String(next.gtin||item.ean||'').replace(/\D/g,''); next.ean=String(next.ean||next.gtin||'').replace(/\D/g,'');
      next.ncm=String(next.ncm||item.ncm||'').replace(/\D/g,''); next.embalagem=text(next.embalagem||item.packaging||'UN');
      next.fornecedor=text(next.fornecedor||source.note?.supplier); next.preco_custo=round(number(next.preco_custo||item.unitCost)); next.preco=round(number(next.preco||item.suggestedPrice));
      next.categoria=text(next.categoria); next.situacao=text(next.situacao||'A').toUpperCase();
      if(!next.nome)errors.push('Produto novo sem nome.'); if(!next.codigo)errors.push('Produto novo sem código comercial.');
      if(!next.categoria)errors.push('Produto novo sem categoria.'); if(!next.embalagem)errors.push('Produto novo sem embalagem.');
      if(next.situacao!=='I'&&number(next.preco)<=0)errors.push('Produto novo sem preço de venda válido.'); if(!next.url_imagem)warnings.push('Produto novo sem imagem pública.');
    } else {
      next.nome=chosenValue(item,current,'name')||current.nome; const gtin=String(chosenValue(item,current,'gtin')||'').replace(/\D/g,''); if(gtin){next.gtin=gtin;next.ean=gtin;}
      next.ncm=String(chosenValue(item,current,'ncm')||current.ncm||'').replace(/\D/g,''); next.embalagem=text(chosenValue(item,current,'packaging'))||current.embalagem;
      next.preco_custo=round(number(chosenValue(item,current,'cost'))); next.preco=round(number(chosenValue(item,current,'price')));
    }

    const stockBefore=round(number(base.estoque)); const stockAfter=round(stockBefore+(item.addStock!==false?number(item.incomingUnits):0)); next.estoque=stockAfter;
    const validityBefore=normalizeNfeDate(base.validade); const validityAfter=futureValidity(item,base,isNew); next.validade=validityAfter;
    const id=`${source.note.key}|${item.groupKey}`; const entries=listFromValue(base.entradas_nfe); if(entries.some(entry=>String(entry?.id||'')===id))errors.push('A entrada já existe no produto selecionado.');
    const lots=listFromValue(base.lotes); const history=listFromValue(base.historico_custos); const entry=entryRecord(item,source.note,key,createdAt); const lot=item.addStock!==false?lotRecord(item,source.note,createdAt):null;
    next.entradas_nfe=[...entries,entry]; next.lotes=lot?[...lots.filter(row=>String(row?.id||'')!==lot.id),lot]:lots;
    if(round(number(base.preco_custo))!==round(number(next.preco_custo))) next.historico_custos=[...history,{id,custo_anterior:round(number(base.preco_custo)),custo_novo:round(number(next.preco_custo)),origem:'NF-e',chave_nfe:source.note.key,alterado_em:createdAt}]; else next.historico_custos=history;
    next.last_update=Date.now(); next.updated_at=createdAt; if(item.addStock!==false)next.stock_updated_at=createdAt;

    const changes=[]; [['nome','Nome'],['gtin','EAN / GTIN'],['ncm','NCM'],['embalagem','Embalagem'],['preco_custo','Preço de custo'],['preco','Preço de venda'],['estoque','Estoque'],['validade','Validade']].forEach(([field,label])=>{const before=base[field]??'',after=next[field]??'';if(String(before)!==String(after))changes.push({field,label,before,after});});
    if(lot)changes.push({field:'lotes',label:'Lote',before:`${lots.length} lote(s)`,after:`${next.lotes.length} lote(s)`}); changes.push({field:'entradas_nfe',label:'Histórico NF-e',before:`${entries.length} entrada(s)`,after:`${next.entradas_nfe.length} entrada(s)`});
    plans.push({itemId:item.id,groupKey:item.groupKey,status:errors.length?'blocked':isNew?'new':'update',isNew,productKey:key,errors,warnings,item:clone(item),currentProduct:current,originalSnapshot:current?clone(current):null,nextProduct:next,stockBefore,stockAfter,validityBefore,validityAfter,lotRecord:lot,entryRecord:entry,changes});
  }

  const active=plans.filter(plan=>plan.status!=='skipped'); const errors=active.flatMap(plan=>plan.errors.map(message=>({itemId:plan.itemId,groupKey:plan.groupKey,message})));
  return {createdAt,mode:'simulation',note:clone(source.note),globalDuplicate:Boolean(source.globalDuplicate),plans,errors,warnings:active.flatMap(plan=>plan.warnings.map(message=>({itemId:plan.itemId,groupKey:plan.groupKey,message}))),canImport:active.length>0&&errors.length===0,summary:{total:plans.length,updates:plans.filter(plan=>plan.status==='update').length,newProducts:plans.filter(plan=>plan.status==='new').length,blocked:plans.filter(plan=>plan.status==='blocked').length,skipped:plans.filter(plan=>plan.status==='skipped').length,stockUnits:round(plans.filter(plan=>['update','new'].includes(plan.status)).reduce((sum,plan)=>sum+(plan.item.addStock!==false?number(plan.item.incomingUnits):0),0))}};
}

export function buildNfeImportRecord(analysis, simulation, { status='processando',session='',applied=[],ignored=[],error='' }={}) {
  const now=new Date().toISOString();
  return {chave_nfe:analysis.note.key,codigo_xml:analysis.note.key,numero_nfe:analysis.note.number||'',serie_nfe:analysis.note.series||'',fornecedor:analysis.note.supplier||'',fornecedor_documento:analysis.note.supplierCnpj||'',emitida_em:analysis.note.issuedAt||'',valor_total:round(analysis.note.total),xml_sha256:analysis.note.xmlHash||'',total_itens:simulation.plans.length,itens_aplicados:clone(applied),itens_ignorados:clone(ignored),status,sessao:session||null,erro:error||null,atualizada_em:now,...(status==='concluida'?{concluida_em:now}:{}),...(status==='falhou'?{falhou_em:now}:{}),registro_path:`fiscal/nfe-importadas/registros/${analysis.note.key}.json`};
}
