(() => {
'use strict';

const BUILD='20260828-mug-text-limit-v1';
const FALLBACK_FB='https://cedar-chemist-310801-default-rtdb.firebaseio.com';
const PRODUCTS_NODE='produtos';
const MODELS_NODE='canecas/modelos_criacao';
const TEXT_TYPES=new Set(['texto','texto_longo']);
const state={key:'',limits:new Map(),pending:new Map(),loadingKey:'',patching:false};

const text=value=>String(value??'').trim();
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

function localConfig(){try{return JSON.parse(localStorage.getItem('da_admin_v2_config')||'{}')||{};}catch{return{};}}
function firebaseBase(){return text(localConfig().firebaseUrl||FALLBACK_FB).replace(/\/+$/,'');}
function productsNode(){return text(localConfig().productsNode||PRODUCTS_NODE).replace(/^\/+|\/+$/g,'')||PRODUCTS_NODE;}
function defaultMax(tipo){return tipo==='texto_longo'?220:tipo==='texto'?120:0;}
function normalizeMax(value,tipo){if(!TEXT_TYPES.has(tipo))return 0;const parsed=Number.parseInt(String(value??''),10);return Number.isFinite(parsed)&&parsed>0?Math.min(1000,Math.max(1,parsed)):defaultMax(tipo);}
function currentKey(){return text($('[data-editor-section="mug-personalizacao"]')?.dataset.mugV3RenderedKey||state.key);}

async function firebase(path,options={}){
  const response=await fetch(`${firebaseBase()}/${path}.json${options.method?'':`?_=${Date.now()}`}`,{cache:'no-store',headers:{Accept:'application/json',...(options.headers||{})},...options});
  if(!response.ok)throw new Error(`Firebase respondeu ${response.status}`);
  const raw=await response.text();return raw?JSON.parse(raw):null;
}

function limitFromConfig(field={}){return normalizeMax(field.max_caracteres,field.tipo);}
function cacheConfig(key,product={}){
  const map=new Map();
  const fields=Array.isArray(product.personalizacao_config_publica?.campos)?product.personalizacao_config_publica.campos:[];
  fields.forEach(field=>{if(TEXT_TYPES.has(field?.tipo))map.set(text(field.id),limitFromConfig(field));});
  state.key=key;state.limits=map;
}

async function loadConfig(key){
  if(!key||state.loadingKey===key)return;
  state.loadingKey=key;
  try{const product=await firebase(`${productsNode()}/${encodeURIComponent(key)}`);if(product&&typeof product==='object')cacheConfig(key,product);}catch(error){console.warn('[Limite de caracteres] Falha ao carregar configuração:',error);}finally{state.loadingKey='';apply();}
}

function ensureStyles(){
  if($('#mugTextLimitStylesV1'))return;
  const style=document.createElement('style');style.id='mugTextLimitStylesV1';style.textContent=`
    .mug-v3-char-limit{display:grid;gap:4px}.mug-v3-char-limit small{font-weight:500;color:#747a71}.mug-v3-char-limit[hidden]{display:none!important}
  `;document.head.appendChild(style);
}

function cardId(card){return text($('[data-v3-x="id"]',card)?.value);}
function cardType(card){return text($('[data-v3-x="tipo"]',card)?.value);}
function storedLimit(id,tipo){return state.pending.get(id)||state.limits.get(id)||defaultMax(tipo);}

function ensureCard(card){
  const tipo=cardType(card),id=cardId(card);
  let label=$('[data-mug-char-limit-admin]',card);
  if(!label){
    label=document.createElement('label');label.className='mug-v3-char-limit';label.dataset.mugCharLimitAdmin='1';
    label.innerHTML='<span>Máximo de caracteres <small>(1 a 1000)</small></span><input data-mug-char-limit-input type="number" min="1" max="1000" step="1" inputmode="numeric">';
    const anchor=$('[data-v3-x="padrao"]',card)?.closest('label')||$('[data-v3-x="label"]',card)?.closest('label');
    if(anchor)anchor.insertAdjacentElement('afterend',label);else $('.mug-v3-grid',card)?.appendChild(label);
  }
  const enabled=TEXT_TYPES.has(tipo);label.hidden=!enabled;
  const input=$('[data-mug-char-limit-input]',label);if(!input)return;
  if(enabled&&document.activeElement!==input){input.value=String(storedLimit(id,tipo));}
  input.disabled=!enabled;
}

function apply(){
  ensureStyles();const key=currentKey();if(key&&key!==state.key)loadConfig(key);
  $$('.mug-v3-field[data-mug-v3-field]').forEach(ensureCard);
}

function captureLimits(){
  const map=new Map();
  $$('.mug-v3-field[data-mug-v3-field]').forEach(card=>{const tipo=cardType(card),id=cardId(card);if(!id||!TEXT_TYPES.has(tipo))return;const input=$('[data-mug-char-limit-input]',card);map.set(id,normalizeMax(input?.value,tipo));});
  state.pending=map;return map;
}

async function persist(key,limits){
  if(!key||!limits?.size||state.patching)return;
  state.patching=true;
  try{
    const product=await firebase(`${productsNode()}/${encodeURIComponent(key)}`);if(!product||typeof product!=='object')return;
    const cfg=product.personalizacao_config_publica&&typeof product.personalizacao_config_publica==='object'?{...product.personalizacao_config_publica}:{};
    const fields=Array.isArray(cfg.campos)?cfg.campos.map(field=>{const id=text(field?.id);if(!TEXT_TYPES.has(field?.tipo))return field;return{...field,max_caracteres:normalizeMax(limits.get(id)??field.max_caracteres,field.tipo)};}):[];
    const nextCfg={...cfg,versao:Math.max(5,Number(cfg.versao)||0),campos:fields,atualizado_em:new Date().toISOString()};
    await firebase(`${productsNode()}/${encodeURIComponent(key)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({personalizacao_config_publica:nextCfg,personalizacao_template_versao:5,last_update:Date.now()})});
    if(product.modelo_caneca===true){await firebase(`${MODELS_NODE}/${encodeURIComponent(key)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({personalizacao_config_publica:nextCfg,atualizado_em:new Date().toISOString()})}).catch(()=>null);}
    cacheConfig(key,{personalizacao_config_publica:nextCfg});state.pending=new Map(limits);
    window.dispatchEvent(new CustomEvent('mug-text-limit-saved',{detail:{key,source:BUILD}}));
  }catch(error){console.error('[Limite de caracteres] Falha ao salvar:',error);}finally{state.patching=false;setTimeout(apply,60);}
}

document.addEventListener('click',event=>{
  if(event.target.closest('#mugV3Save')){captureLimits();return;}
},true);

document.addEventListener('input',event=>{
  const input=event.target.closest('[data-mug-char-limit-input]');if(!input)return;
  const card=input.closest('[data-mug-v3-field]'),id=cardId(card),tipo=cardType(card);if(id&&TEXT_TYPES.has(tipo))state.pending.set(id,normalizeMax(input.value,tipo));
},true);

document.addEventListener('change',event=>{if(event.target.closest('[data-v3-x="tipo"]'))setTimeout(apply,0);},true);
window.addEventListener('mug-template-saved',event=>{const key=text(event.detail?.key||currentKey());const limits=state.pending.size?new Map(state.pending):captureLimits();persist(key,limits);});
window.addEventListener('admin-v2-products-invalidated',()=>setTimeout(apply,150));
new MutationObserver(()=>apply()).observe(document.documentElement,{childList:true,subtree:true});

[0,150,500,1200].forEach(ms=>setTimeout(apply,ms));
console.info(`Canecas · limite de caracteres · ${BUILD}`);
})();
