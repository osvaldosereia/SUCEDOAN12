import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_PER_POSITION = 12;
export const NO_REPEAT_DAYS = 30;

export const FIXED_POSITIONS = [
  {local:'home.hero',label:'Home · banner principal',compatibility:'all'},
  {local:'home.compra-mes.topo',label:'Home · antes da compra do mês',compatibility:'all'},
  {local:'home.higiene.topo',label:'Home · higiene da família',compatibility:'higiene'},
  {local:'categorias.topo',label:'Página · categorias',compatibility:'all'},
  {local:'ofertas.topo',label:'Página · ofertas',compatibility:'all'},
  {local:'cestas.topo',label:'Página · cestas básicas',compatibility:'all'},
  {local:'kits.topo',label:'Página · kits promocionais',compatibility:'all'},
  {local:'busca.topo',label:'Página · resultados da busca',compatibility:'all'},
  {local:'favoritos.topo',label:'Página · favoritos',compatibility:'all'},
  {local:'rotina.compra-mes.topo',label:'Rotina · compra do mês',compatibility:'all'},
  {local:'rotina.limpeza.topo',label:'Rotina · limpeza',compatibility:'limpeza'},
  {local:'rotina.higiene.topo',label:'Rotina · higiene',compatibility:'higiene'},
  {local:'rotina.cafe.topo',label:'Rotina · café da manhã',compatibility:'cafe'}
];

export const CONTEXT_POSITIONS = [
  {local:'categoria',label:'Categoria específica',relation:'categoria'},
  {local:'subcategoria',label:'Subcategoria específica',relation:'subcategoria'},
  {local:'marca',label:'Marca específica',relation:'marca'},
  {local:'produto',label:'Produto específico',relation:'produto'},
  {local:'kit',label:'Kit promocional específico',relation:'kit',requiresMembership:true},
  {local:'cesta',label:'Cesta básica específica',relation:'cesta',requiresMembership:true}
];

export const POSITION_FAMILIES = [...FIXED_POSITIONS, ...CONTEXT_POSITIONS]
  .map((position,index)=>({...position,index}));

const LEGACY_POSITIONS = {
  'home.cestas.topo':'cestas.topo',
  'home.kits.topo':'kits.topo',
  'home.ofertas.topo':'ofertas.topo',
  'home.limpeza.topo':'rotina.limpeza.topo',
  'home.cafe.topo':'rotina.cafe.topo',
  'home.categorias.topo':'categorias.topo'
};

const text = value => value === null || value === undefined ? '' : String(value).trim();
const normalized = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const number = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let raw = text(value).replace(/[^\d,.-]/g,'');
  if (!raw) return 0;
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  if (comma > -1 && dot > -1) raw = comma > dot ? raw.replace(/\./g,'').replace(',','.') : raw.replace(/,/g,'');
  else if (comma > -1) raw = raw.replace(/\./g,'').replace(',','.');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = value => number(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const slug = value => normalized(value).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,72) || 'produto';
const localOf = banner => LEGACY_POSITIONS[text(banner?.exibicao?.local || banner?.local || banner?.posicao)] || text(banner?.exibicao?.local || banner?.local || banner?.posicao);
const targetOf = banner => text(banner?.exibicao?.alvo || banner?.alvo);
const productId = product => text(product?.firebaseKey || product?.id || product?.codigo || product?.gtin || product?.ean);
const productCode = product => text(product?.codigo || product?.sku || product?.id || product?.firebaseKey);
const productImage = product => text(product?.url_imagem || product?.imagem_url || product?.imagem || product?.image || product?.img);

export function parseDate(value,{endOfDay=false}={}) {
  const raw = text(value);
  if (!raw) return Number.NaN;
  let match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return Date.parse(`${match[3]}-${match[2]}-${match[1]}T${endOfDay?'23:59:59':'00:00:00'}-04:00`);
  match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return Date.parse(`${match[1]}-${match[2]}-${match[3]}T${endOfDay?'23:59:59':'00:00:00'}-04:00`);
  return Date.parse(raw);
}

function productExpiry(product) {
  return parseDate(product?.validade || product?.vencimento || product?.data_validade || product?.validade_produto || product?.dataValidade || product?.expiry || product?.expiry_date,{endOfDay:true});
}

export function offerData(product,nowMs=Date.now()) {
  const regular = number(product?.preco || product?.price || product?.preco_normal);
  let offer = number(product?.preco_oferta || product?.precoOferta || product?.oferta?.preco || product?.preco_promocional);
  const informedDiscount = number(product?.desconto_validade || product?.descontoValidade || product?.percentual_desconto || product?.desconto);
  if (!(offer > 0 && regular > 0 && offer < regular) && informedDiscount > 0 && informedDiscount < 100 && regular > 0) {
    offer = regular * (1 - informedDiscount / 100);
  }
  const start = text(product?.data_inicio_oferta || product?.inicio_oferta || product?.inicioOferta || product?.oferta?.inicio || product?.oferta_inicio);
  const end = text(product?.validade_oferta || product?.validadeOferta || product?.oferta?.fim || product?.oferta_fim);
  const startMs = parseDate(start);
  const offerEndMs = parseDate(end,{endOfDay:true});
  const effectiveStartMs = Math.max(nowMs,Number.isFinite(startMs) ? startMs : nowMs);
  const productEndMs = productExpiry(product);
  const effectiveEndMs = Number.isFinite(productEndMs) ? Math.min(offerEndMs,productEndMs) : offerEndMs;
  const discountPct = regular > 0 && offer > 0 && offer < regular ? Math.round(((regular-offer)/regular)*100) : 0;
  return {
    regular,offer,start,end,startMs,offerEndMs,productEndMs,effectiveStartMs,effectiveEndMs,discountPct,
    valid:Number.isFinite(effectiveEndMs) && effectiveEndMs > effectiveStartMs && offer > 0 && regular > 0 && offer < regular
  };
}

export function normalizeProducts(raw) {
  const source = raw?.produtos && typeof raw.produtos === 'object' ? raw.produtos : raw;
  if (Array.isArray(source)) return source.filter(Boolean).map((product,index)=>({...product,firebaseKey:text(product.firebaseKey || product.id || product.codigo || index)}));
  if (!source || typeof source !== 'object') return [];
  return Object.entries(source).filter(([,product])=>product && typeof product === 'object')
    .map(([key,product])=>({...product,firebaseKey:text(product.firebaseKey || key)}));
}

function productGroup(product) {
  const taxonomy = normalized([product?.categoria,product?.subcategoria,product?.subsubcategoria].filter(Boolean).join(' '));
  const name = normalized(product?.nome);
  if (/beleza|higiene|shampoo|condicionador|sabonete|desodorante|absorvente|cabelo|cosmetico|perfumaria|fralda|creme dental/.test(taxonomy)
    || /\b(shampoo|condicionador|sabonete|desodorante|absorvente|fralda|hidratante|protetor solar|creme dental)\b/.test(name)) return 'higiene';
  if (/limpeza|lavanderia|detergente|sabao|amaciante|desinfetante|alvejante|multiuso|esponja|saco de lixo|inseticida/.test(taxonomy)
    || /\b(detergente|sabao|amaciante|desinfetante|alvejante|limpador|esponja|inseticida)\b/.test(name)) return 'limpeza';
  if (/cafe|cereal|matinal|biscoito|bolacha|pao|leite|achocolatado|geleia|torrada/.test(taxonomy)
    || /\b(cafe|cereal|biscoito|bolacha|pao|leite|achocolatado|geleia|torrada)\b/.test(name)) return 'cafe';
  return 'geral';
}

export function productEligible(product,nowMs=Date.now()) {
  const status = normalized(product?.situacao || product?.status || 'a');
  const stock = number(product?.estoque || product?.stock || product?.quantidade);
  const offer = offerData(product,nowMs);
  return !['i','inativo','inactive','false','0','excluido'].includes(status)
    && stock > 0 && offer.valid && Boolean(productImage(product));
}

const activeForCapacity = (banner,nowMs) => {
  if (!banner || banner.ativo === false) return false;
  const end = parseDate(banner?.periodo?.fim || banner?.banner_fim);
  return !Number.isFinite(end) || end > nowMs;
};

const collectionList = value => Array.isArray(value) ? value.filter(Boolean) : (value && typeof value === 'object' ? Object.values(value).filter(Boolean) : []);
const collectionCodes = item => {
  if (item && typeof item === 'object') {
    const main = normalized(item.codigo || item.produto || item.product_code || item.sku || item.id || item.firebaseKey);
    const substitutes = Array.isArray(item.substitutos || item.subs) ? (item.substitutos || item.subs) : [item.substitutos || item.subs];
    return [main,...substitutes.map(normalized)].filter(Boolean);
  }
  return [normalized(text(item).replace(/^\d+\s*x\s*/i,''))].filter(Boolean);
};
const collectionContainsProduct = (collection,product) => {
  const references = new Set([productId(product),productCode(product),product?.gtin,product?.ean,product?.sku].map(normalized).filter(Boolean));
  return (collection?.produtos || collection?.products || collection?.itens || collection?.items || [])
    .some(item=>collectionCodes(item).some(code=>references.has(code)));
};
const collectionUsable = (collection,nowMs) => {
  if (!collection || collection.ativo === false) return false;
  const status = normalized(collection.status || collection.situacao || 'ativo');
  if (['i','inativo','inactive','false','0','encerrado'].includes(status)) return false;
  const stock = collection.estoque_disponivel ?? collection.estoque ?? collection.stock;
  if (stock !== undefined && stock !== null && text(stock) !== '' && number(stock) <= 0) return false;
  const start = parseDate(collection.data_inicio || collection.inicio || collection.periodo?.inicio);
  const end = parseDate(collection.data_fim || collection.fim || collection.periodo?.fim,{endOfDay:true});
  return (!Number.isFinite(start) || start <= nowMs) && (!Number.isFinite(end) || end > nowMs);
};

function contextualOptions(family,product,kits,cestas) {
  const category = text(product?.categoria);
  const subcategory = text(product?.subcategoria);
  const brand = text(product?.marca || product?.brand);
  const id = productId(product) || productCode(product);
  if (family.local === 'categoria' && category) return [{target:category,label:`Categoria · ${category}`}];
  if (family.local === 'subcategoria' && subcategory) return [{target:category ? `${category}::${subcategory}` : subcategory,label:`Subcategoria · ${category ? `${category} › ` : ''}${subcategory}`}];
  if (family.local === 'marca' && brand) return [{target:brand,label:`Marca · ${brand}`}];
  if (family.local === 'produto' && id) return [{target:id,label:`Produto · ${text(product?.nome || id)}`}];
  const collections = family.local === 'kit' ? kits : family.local === 'cesta' ? cestas : [];
  return collections.filter(collection=>collectionContainsProduct(collection,product)).map(collection=>({
    target:text(collection.id || collection.codigo || collection.nome),
    label:`${family.local === 'kit' ? 'Kit' : 'Cesta'} · ${text(collection.nome || collection.codigo || collection.id)}`
  })).filter(option=>option.target);
}

function semanticAffinity(local,product,offer) {
  const semantic = normalized([product?.categoria,product?.subcategoria,product?.subsubcategoria,product?.nome,product?.marca].filter(Boolean).join(' '));
  const essential = /arroz|feijao|oleo|acucar|farinha|macarrao|molho|cafe|leite|mercearia|limpeza|higiene|papel|tempero|cesta/.test(semantic);
  const kitLike = /\bkit\b|combo|conjunto|leve\s*\d+|pague\s*\d+/.test(semantic);
  const absoluteSaving = Math.max(0,offer.regular-offer.offer);
  switch (local) {
    case 'home.hero': return Math.min(35,absoluteSaving*2) + offer.discountPct;
    case 'home.compra-mes.topo':
    case 'rotina.compra-mes.topo': return essential ? 55 : -15;
    case 'ofertas.topo': return offer.discountPct*2;
    case 'cestas.topo': return essential ? 60 : -20;
    case 'kits.topo': return kitLike ? 70 : 0;
    case 'categorias.topo': return text(product?.categoria) ? 20 : -30;
    case 'favoritos.topo': return offer.discountPct + Math.min(20,number(product?.estoque));
    case 'busca.topo': return Math.min(30,number(product?.estoque));
    default: return 25;
  }
}

function stableJitter(value) {
  let hash = 2166136261;
  for (const char of text(value)) hash = Math.imul(hash ^ char.charCodeAt(0),16777619);
  return (hash >>> 0) % 1000 / 1000;
}

function scoreProduct(family,product,option,targetLoads,nowMs) {
  const offer = offerData(product,nowMs);
  const stock = number(product?.estoque || product?.stock || product?.quantidade);
  const hours = Math.max(0,(offer.effectiveEndMs-offer.effectiveStartMs)/3600000);
  const urgency = Math.max(0,21-Math.min(21,hours/24));
  const futurePenalty = offer.effectiveStartMs > nowMs ? Math.min(20,(offer.effectiveStartMs-nowMs)/3600000/6) : 0;
  const targetLoad = targetLoads.get(`${family.local}::${option.target}`) || 0;
  return offer.discountPct*4
    + Math.min(35,stock*1.5)
    + urgency
    + semanticAffinity(family.local,product,offer)
    - targetLoad*12
    - futurePenalty
    + stableJitter(`${family.local}:${productCode(product)}`);
}

function recentProductSet(catalog,nowMs,noRepeatDays) {
  const cutoff = nowMs-noRepeatDays*86400000;
  const recent = new Set();
  for (const banner of catalog.banners || []) {
    const created = parseDate(banner?.criado_em || banner?.atualizado_em);
    if (Number.isFinite(created) && created < cutoff) continue;
    const product = Array.isArray(banner?.origem?.produtos) ? banner.origem.produtos[0] : null;
    [banner?.origem?.valor,product?.firebaseKey,product?.id,product?.codigo,product?.gtin,banner?.link?.valor]
      .map(text).filter(Boolean).forEach(value=>recent.add(value));
  }
  return recent;
}

function wasRecent(product,recent) {
  return [productId(product),productCode(product),text(product?.gtin),text(product?.ean)]
    .filter(Boolean).some(value=>recent.has(value));
}

export function selectBannerDecision({catalog,products,kits=[],cestas=[],nowMs=Date.now(),maxPerPosition=MAX_PER_POSITION,noRepeatDays=NO_REPEAT_DAYS}) {
  catalog = catalog && typeof catalog === 'object' ? catalog : {};
  catalog.banners = Array.isArray(catalog.banners) ? catalog.banners : [];
  const normalizedProducts = normalizeProducts(products);

  const productsByReference = new Map();
  for (const product of normalizedProducts) {
    for (const reference of [productId(product),productCode(product),text(product.gtin),text(product.ean)].filter(Boolean)) productsByReference.set(normalized(reference),product);
  }

  let deactivatedByProduct = 0;
  for (const banner of catalog.banners) {
    if (!activeForCapacity(banner,nowMs)) continue;
    const snapshot = Array.isArray(banner?.origem?.produtos) ? banner.origem.produtos[0] : null;
    const references = [snapshot?.firebaseKey,snapshot?.id,snapshot?.codigo,snapshot?.gtin,banner?.origem?.valor,banner?.link?.valor].map(normalized).filter(Boolean);
    if (!references.length) continue;
    const linked = references.map(reference=>productsByReference.get(reference)).find(Boolean);
    if (!linked || !productEligible(linked,nowMs)) {
      banner.ativo = false;
      banner.automacao = banner.automacao && typeof banner.automacao === 'object' ? banner.automacao : {};
      banner.automacao.desativado_por = 'produto_excluido_inativo_sem_estoque_sem_preco_ou_oferta_encerrada';
      banner.automacao.desativado_em = new Date(nowMs).toISOString();
      deactivatedByProduct += 1;
    }
  }

  const familyLoads = new Map(POSITION_FAMILIES.map(family=>[family.local,0]));
  const targetLoads = new Map();
  for (const banner of catalog.banners) {
    if (!activeForCapacity(banner,nowMs)) continue;
    const local = localOf(banner);
    const target = targetOf(banner);
    familyLoads.set(local,(familyLoads.get(local) || 0)+1);
    targetLoads.set(`${local}::${target}`,(targetLoads.get(`${local}::${target}`) || 0)+1);
  }

  const usableKits = collectionList(kits).filter(collection=>collectionUsable(collection,nowMs));
  const usableCestas = collectionList(cestas).filter(collection=>collectionUsable(collection,nowMs));
  const eligible = normalizedProducts.filter(product=>productEligible(product,nowMs));
  const recent = recentProductSet(catalog,nowMs,noRepeatDays);
  const fresh = eligible.filter(product=>!wasRecent(product,recent));

  const candidates = POSITION_FAMILIES.map(family=>{
    const familyLoad = familyLoads.get(family.local) || 0;
    if (familyLoad >= maxPerPosition) return {...family,familyLoad,pool:[]};
    const pool = [];
    for (const product of fresh) {
      if (family.compatibility && family.compatibility !== 'all' && productGroup(product) !== family.compatibility) continue;
      const options = FIXED_POSITIONS.some(position=>position.local === family.local)
        ? [{target:'',label:family.label}]
        : contextualOptions(family,product,usableKits,usableCestas);
      for (const option of options) {
        const targetLoad = targetLoads.get(`${family.local}::${option.target}`) || 0;
        if (targetLoad >= maxPerPosition) continue;
        pool.push({product,option,targetLoad,score:scoreProduct(family,product,option,targetLoads,nowMs)});
      }
    }
    pool.sort((a,b)=>b.score-a.score || productCode(a.product).localeCompare(productCode(b.product),'pt-BR'));
    return {...family,familyLoad,pool};
  }).filter(family=>family.pool.length > 0)
    .sort((a,b)=>a.familyLoad-b.familyLoad || a.index-b.index);

  if (!candidates.length) return {
    ok:false,status:'sem_posicao_ou_oferta_compativel',eligibleProducts:eligible.length,freshProducts:fresh.length,
    deactivatedByProduct,familyLoads:Object.fromEntries(familyLoads),availableKits:usableKits.length,availableCestas:usableCestas.length,catalog
  };

  const minLoad = candidates[0].familyLoad;
  const family = candidates.find(candidate=>candidate.familyLoad === minLoad);
  const selected = family.pool[0];
  const offer = offerData(selected.product,nowMs);
  return {
    ok:true,
    family:{local:family.local,label:family.label,loadBefore:family.familyLoad,index:family.index},
    target:selected.option.target,
    targetLabel:selected.option.label,
    targetLoadBefore:selected.targetLoad,
    product:selected.product,
    offer,
    commercialScore:Math.round(selected.score*100)/100,
    eligibleProducts:eligible.length,
    freshProducts:fresh.length,
    deactivatedByProduct,
    familyLoads:Object.fromEntries(familyLoads),
    availableKits:usableKits.length,
    availableCestas:usableCestas.length,
    catalog
  };
}

function positionObjective(local) {
  const objectives = {
    'home.hero':'máximo impacto comercial para a vitrine principal',
    'home.compra-mes.topo':'produto essencial para compra recorrente da família',
    'home.higiene.topo':'cuidado pessoal e higiene da família',
    'categorias.topo':'representar claramente a categoria do produto',
    'ofertas.topo':'destacar economia, desconto e urgência da oferta',
    'cestas.topo':'item essencial ligado à compra de cesta básica',
    'kits.topo':'produto com afinidade a kits, combos ou compra conjunta',
    'busca.topo':'produto reconhecível e fácil de decidir na busca',
    'favoritos.topo':'oferta forte, desejável e com bom estoque',
    'rotina.compra-mes.topo':'item útil para abastecimento mensal',
    'rotina.limpeza.topo':'produto de limpeza no contexto correto',
    'rotina.higiene.topo':'produto de higiene e beleza no contexto correto',
    'rotina.cafe.topo':'produto adequado ao café da manhã',
    categoria:'oferta pertencente à categoria exibida',
    subcategoria:'oferta pertencente à subcategoria exibida',
    marca:'oferta da marca exibida',
    produto:'oferta diretamente relacionada à página do produto',
    kit:'produto que realmente compõe o kit exibido',
    cesta:'produto que realmente compõe a cesta básica exibida'
  };
  return objectives[local] || 'oferta semanticamente adequada ao local';
}

export function buildPrompt(decision) {
  const product = decision.product;
  const offer = decision.offer;
  const name = text(product.nome || product.name || 'Produto em oferta');
  return `Crie um banner publicitário vertical 2:3 (1024x1536) para o supermercado Dona Antônia.

POSIÇÃO: ${decision.family.label}
CONTEXTO: ${decision.targetLabel || decision.family.label}
OBJETIVO DESTA POSIÇÃO: ${positionObjective(decision.family.local)}

DADOS EXATOS DA OFERTA
Produto: ${name}
Preço anterior: R$ ${money(offer.regular)}
Preço da oferta: R$ ${money(offer.offer)}
Desconto: ${offer.discountPct}%

Use a foto fornecida como referência fiel do produto e da embalagem. Crie direção de arte profissional de varejo, leitura imediata, contraste alto e composição sofisticada. O produto deve ser o protagonista. Não invente marca, preço, volume, quantidade ou benefício. Escreva corretamente em português do Brasil. Inclua somente o nome essencial do produto, preço anterior, preço da oferta e desconto. Não inclua QR code, telefone, endereço, validade ou textos pequenos. Preserve áreas seguras e não corte o produto.`;
}

export function buildBannerRecord(decision,{nowMs=Date.now(),imagePath,requestId=''}) {
  const product = decision.product;
  const offer = decision.offer;
  const code = productCode(product) || productId(product);
  const id = productId(product);
  const name = text(product.nome || product.name || 'Produto em oferta');
  const bannerId = `banner-produto-${slug(code)}-${nowMs}`;
  const finalImagePath = imagePath || `site/banners/ativos/${bannerId}/banner-${nowMs}.webp`;
  return {
    id:bannerId,ativo:true,titulo:`Oferta · ${name}`,alt:`${name} em oferta na Dona Antônia`,tipo_conteudo:'produto',texto_arte:'',
    origem:{tipo:'produto',valor:id,produtos:[{firebaseKey:text(product.firebaseKey || id),id,codigo:code,nome:name,imagem_url:productImage(product)}]},
    exibicao:{local:decision.family.local,alvo:decision.target,ordem:decision.family.loadBefore+1},
    imagem:finalImagePath,link:{tipo:'produto',valor:code},
    periodo:{inicio:new Date(offer.effectiveStartMs).toISOString(),fim:new Date(offer.effectiveEndMs).toISOString(),fuso_horario:'America/Cuiaba',regra_duracao:'periodo_da_oferta_limitado_pelo_vencimento_produto',encurtado_pelo_vencimento_produto:Number.isFinite(offer.productEndMs)&&offer.productEndMs<offer.offerEndMs},
    criado_em:new Date(nowMs).toISOString(),atualizado_em:new Date(nowMs).toISOString(),
    geracao:{largura:1024,altura:1536,proporcao:'2:3',formato:'webp',compression:25,asset_unico:true,modelo:'make_openai_nativo'},
    grupo_id:bannerId,asset_id:bannerId,exibicoes:[],controle:{},
    oferta:{preco_anterior:offer.regular,preco_oferta:offer.offer,percentual_desconto:offer.discountPct,inicio:offer.start||null,fim:offer.end},
    automacao:{automatico:true,motor:'github_actions_selecao_make_geracao_v13_1',requisicao_id:requestId,estrategia:'familia_menos_preenchida_primeiro_oferta_ideal_depois_v13_1',ordem_selecao:'posicao_depois_oferta',espaco_escolhido:decision.family.local,alvo_escolhido:decision.target,carga_familia_antes:decision.family.loadBefore,carga_alvo_antes:decision.targetLoadBefore,pontuacao_comercial:decision.commercialScore,limite_por_posicao:MAX_PER_POSITION,dias_sem_repetir:NO_REPEAT_DAYS,repeticao_estrita:true}
  };
}

async function fetchJson(url) {
  const response = await fetch(url,{headers:{accept:'application/json','user-agent':'Dona-Antonia-Banner-Intelligence-V13'}});
  if (!response.ok) throw new Error(`Falha ao ler ${url}: HTTP ${response.status}`);
  return response.json();
}

export async function run() {
  const runtime = globalThis.process;
  const root = runtime.cwd();
  const bannersPath = text(runtime.env.BANNERS_PATH || 'site/banners/banners.json');
  const kitsPath = text(runtime.env.KITS_PATH || 'site/kits.json');
  const cestasPath = text(runtime.env.CESTAS_PATH || 'site/produtos-cesta-basica.json');
  const firebaseUrl = text(runtime.env.FIREBASE_PRODUTOS_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos.json');
  const dryRun = normalized(runtime.env.DRY_RUN) === 'true' || runtime.env.DRY_RUN === '1';
  const nowMs = Date.now();
  const [catalogRaw,kitsRaw,cestasRaw,products] = await Promise.all([
    fs.readFile(path.join(root,bannersPath),'utf8'),
    fs.readFile(path.join(root,kitsPath),'utf8'),
    fs.readFile(path.join(root,cestasPath),'utf8'),
    fetchJson(firebaseUrl)
  ]);
  const catalog = JSON.parse(catalogRaw);
  const decision = selectBannerDecision({catalog,products,kits:JSON.parse(kitsRaw),cestas:JSON.parse(cestasRaw),nowMs});
  if (!decision.ok) {
    console.log(JSON.stringify({status:decision.status,ofertas_elegiveis:decision.eligibleProducts,ofertas_nao_repetidas:decision.freshProducts,desativados_por_produto:decision.deactivatedByProduct,cargas_por_familia:decision.familyLoads},null,2));
    return decision;
  }
  const requestId = text(runtime.env.REQUEST_ID || runtime.env.GITHUB_RUN_ID || nowMs);
  const record = buildBannerRecord(decision,{nowMs,requestId});
  const prompt = buildPrompt(decision);
  const summary = {
    status:dryRun?'dry_run':'enviando_ao_make',
    posicao:decision.family.local,
    alvo:decision.target,
    produto:record.origem.produtos[0].nome,
    codigo:record.origem.produtos[0].codigo,
    pontuacao:decision.commercialScore,
    carga_antes:decision.family.loadBefore,
    ofertas_elegiveis:decision.eligibleProducts,
    ofertas_nao_repetidas:decision.freshProducts,
    inicio:record.periodo.inicio,
    fim:record.periodo.fim
  };
  console.log(JSON.stringify(summary,null,2));
  if (dryRun) return {...decision,record,prompt};
  const makeWebhook = text(runtime.env.MAKE_BANNER_WEBHOOK_URL);
  if (!makeWebhook) throw new Error('Configure o secret MAKE_BANNER_WEBHOOK_URL no GitHub.');
  const payload = {
    acao:'criar_banner_preselecionado',
    versao_contrato:'13.1',
    origem:'github-actions-seletor-v13.1',
    requisicao_id:requestId,
    banner_id:record.id,
    banner_path:record.imagem,
    imagem_url:productImage(decision.product),
    prompt,
    catalogo_gerado_json:JSON.stringify({schema_version:13,banners:[record]}),
    selecao:{
      local:decision.family.local,
      alvo:decision.target,
      rotulo:decision.targetLabel || decision.family.label,
      carga_familia_antes:decision.family.loadBefore,
      carga_alvo_antes:decision.targetLoadBefore,
      pontuacao_comercial:decision.commercialScore,
      produto_id:productId(decision.product),
      produto_codigo:productCode(decision.product),
      produto_nome:text(decision.product.nome),
      inicio_banner:record.periodo.inicio,
      fim_banner:record.periodo.fim
    }
  };
  const response = await fetch(makeWebhook,{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify(payload)});
  const responseText = await response.text();
  if (!response.ok) throw new Error(`Make recusou o banner preselecionado: HTTP ${response.status} · ${responseText.slice(0,500)}`);
  console.log(JSON.stringify({status:'make_aceitou',http:response.status,requisicao_id:requestId,resposta:responseText.slice(0,500)},null,2));
  return {...decision,record,prompt,makeStatus:response.status};
}

if (globalThis.process?.argv?.[1] && import.meta.url === pathToFileURL(globalThis.process.argv[1]).href) {
  run().catch(error=>{console.error(error?.stack || error);globalThis.process.exitCode=1;});
}
