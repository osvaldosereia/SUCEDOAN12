import { APP_CONFIG } from './config.js';

function text(value){return String(value??'').trim();}
function number(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function entries(raw){return Array.isArray(raw)?raw:Object.values(raw||{});}
async function fetchJson(url,timeoutMs=6000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(url,{cache:'no-cache',headers:{Accept:'application/json'},signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.json();}finally{clearTimeout(timer);}}

export function normalizeBasket(raw={}){
  const id=text(raw.id||raw.codigo);
  const productRefs=Array.isArray(raw.produtos)?raw.produtos.map(item=>text(item?.firebaseKey||item?.id||item?.codigo||item)).filter(Boolean):[];
  return Object.freeze({id,nome:text(raw.nome||'Cesta básica'),descricao:text(raw.descricao),imagem:text(raw.imagem||raw.url_imagem),preco:number(raw.preco),precoOriginal:number(raw.preco_original||raw.precoOriginal),productRefs,ativo:raw.ativo!==false});
}

export function normalizeKit(raw={}){
  const id=text(raw.id||raw.codigo);
  const productRefs=Array.isArray(raw.produtos)?raw.produtos.map(item=>text(item?.firebaseKey||item?.id||item?.codigo||item)).filter(Boolean):[];
  return Object.freeze({id,nome:text(raw.nome||'Kit promocional'),descricao:text(raw.descricao),imagem:text(raw.imagem||raw.url_imagem),preco:number(raw.preco||raw.preco_promocional),precoOriginal:number(raw.preco_original||raw.precoOriginal||raw.soma_avulsa),productRefs,ativo:raw.ativo!==false,inicio:text(raw.data_inicio||raw.dataInicio),fim:text(raw.data_fim||raw.dataFim)});
}

export function currentOffers(products=[]){
  const now=Date.now();
  return products.filter(product=>{
    if(!(product.precoOferta>0&&product.precoOferta<product.preco))return false;
    if(!product.validadeOferta)return true;
    const end=new Date(`${product.validadeOferta}T23:59:59`).getTime();
    return Number.isNaN(end)||end>=now;
  });
}

async function loadCollection(url,normalizer){
  try{return entries(await fetchJson(url)).map(normalizer).filter(item=>item.id&&item.ativo);}catch{return [];}
}

export async function loadHomeCollections(){
  const [baskets,kits]=await Promise.all([
    loadCollection(APP_CONFIG.snapshots.baskets,normalizeBasket),
    loadCollection(APP_CONFIG.snapshots.kits,normalizeKit)
  ]);
  return Object.freeze({baskets,kits});
}
