export const PRESET_LEVELS=Object.freeze(['basic','recommended','complete']);

export const FEATURE_KEYS=Object.freeze([
  'openai',
  'baskets',
  'products',
  'offers',
  'checkout',
  'profile',
  'commerce_info',
  'external_links',
]);

export const PRESET_META=Object.freeze({
  basic:{label:'Básico',description:'Sem IA. Mantém compra estruturada, catálogo, cestas, pagamento/entrega e checkout.'},
  recommended:{label:'Recomendado',description:'Usa IA leve somente quando necessário e mantém todas as ferramentas internas do Chat Comprar.'},
  complete:{label:'Completo',description:'Ativa todas as ferramentas permitidas, inclusive links externos.'},
});

export const FEATURE_META=Object.freeze({
  openai:{label:'OpenAI / IA',description:'Interpreta texto livre quando regras diretas não forem suficientes.'},
  baskets:{label:'Cestas',description:'Permite mostrar e selecionar cestas básicas.'},
  products:{label:'Produtos',description:'Permite catálogo, categorias e pesquisa de produtos.'},
  offers:{label:'Ofertas',description:'Permite mostrar produtos marcados como oferta.'},
  checkout:{label:'Checkout',description:'Permite abrir e concluir o fechamento do pedido.'},
  profile:{label:'Cadastro do cliente',description:'Permite exibir e usar os dados básicos do cadastro dentro do chat.'},
  commerce_info:{label:'Pagamento e entrega',description:'Permite responder sobre formas de pagamento e área de entrega.'},
  external_links:{label:'Links externos',description:'Permite regras que abrem páginas fora do fluxo interno do chat.'},
});

const PRESETS=Object.freeze({
  basic:Object.freeze({openai:false,baskets:true,products:true,offers:true,checkout:true,profile:false,commerce_info:true,external_links:false}),
  recommended:Object.freeze({openai:true,baskets:true,products:true,offers:true,checkout:true,profile:true,commerce_info:true,external_links:false}),
  complete:Object.freeze({openai:true,baskets:true,products:true,offers:true,checkout:true,profile:true,commerce_info:true,external_links:true}),
});

export function presetFlags(level='recommended'){
  const key=PRESET_LEVELS.includes(level)?level:'recommended';
  return {...PRESETS[key]};
}

export function normalizeFlags(value={},fallback='recommended'){
  const base=presetFlags(fallback);
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  for(const key of FEATURE_KEYS){
    if(Object.prototype.hasOwnProperty.call(source,key))base[key]=source[key]!==false;
  }
  return base;
}

export function inferLevel(value={}){
  const flags=normalizeFlags(value);
  for(const level of PRESET_LEVELS){
    const preset=PRESETS[level];
    if(FEATURE_KEYS.every(key=>flags[key]===preset[key]))return level;
  }
  return 'custom';
}

const MODE_FEATURE=Object.freeze({
  baskets:'baskets',
  offers:'offers',
  products:'products',
  product_lookup:'products',
  checkout:'checkout',
  cta_url:'external_links',
});

const MENU_FEATURE=Object.freeze({
  baskets:'baskets',
  offers:'offers',
  products:'products',
  payment:'commerce_info',
  delivery:'commerce_info',
  profile:'profile',
});

export function modeAllowed(mode,flags={}){
  const normalized=normalizeFlags(flags);
  const key=String(mode||'');
  if(key==='offers')return normalized.offers!==false&&normalized.products!==false;
  const feature=MODE_FEATURE[key];
  return !feature||normalized[feature]!==false;
}

export function menuItemAllowed(kind,flags={}){
  const normalized=normalizeFlags(flags);
  const key=String(kind||'');
  if(key==='offers')return normalized.offers!==false&&normalized.products!==false;
  const feature=MENU_FEATURE[key];
  return !feature||normalized[feature]!==false;
}

export function publicConfig(runtime={}){
  const fallback=PRESET_LEVELS.includes(runtime?.config_level)?runtime.config_level:'recommended';
  const integrations=normalizeFlags(runtime?.integration_flags,fallback);
  return {
    config_level:inferLevel(integrations),
    integrations,
    presets:PRESET_LEVELS.map(id=>({id,...PRESET_META[id],flags:presetFlags(id)})),
    features:FEATURE_KEYS.map(id=>({id,...FEATURE_META[id]})),
  };
}
