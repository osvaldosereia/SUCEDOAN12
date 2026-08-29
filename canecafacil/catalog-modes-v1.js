import { MUG_NODES, fbGet, isMug, norm, text, money, mugImage } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD='20260828-canecafacil-catalog-modes-v1';
const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
let cache=null;

function activeProduct(p={}){
  if(!isMug(p))return false;
  if(p.canecafacil_ativo===false||p.canecafacil_ativo==='false')return false;
  if(p.ativo===true)return true;
  if(p.ativo===false)return false;
  const s=norm(p.situacao||p.status);
  return ['a','ativo','ativa','active','1','true'].includes(s)||(!s&&p.visivel!==false);
}
function keyOf(p={}){return text(p.__key||p.firebaseKey||p.id)}
function priceOf(p={}){return Number(p.preco_oferta||p.preco||p.price||0)}
function imagesOf(p={}){const a=[p.mockup_1,p.mockup_2,p.url_imagem,p.imagem,p.imagem_url,...(Array.isArray(p.imagens_site)?p.imagens_site:[]),...(Array.isArray(p.imagens)?p.imagens:[])].map(text).filter(v=>/^https?:\/\//i.test(v));return [...new Set(a)].slice(0,2)}
function personalizable(p={},models={}){const k=keyOf(p);return p.personalizacao_publica===true||p.personalizavel===true||p.canecafacil_personalizavel===true||Boolean(models[k])}
async function load(){if(cache)return cache;const [raw,models]=await Promise.all([fbGet(MUG_NODES.products).catch(()=>({})),fbGet(MUG_NODES.models).catch(()=>({}))]);const products=Object.entries(raw||{}).map(([__key,v])=>({__key,...(v||{})})).filter(activeProduct);cache={products,models:models||{}};return cache}
function card(p){const k=keyOf(p),imgs=imagesOf(p),img=imgs[0]||mugImage(p);return `<article class="product-card" data-product="${esc(k)}"><div class="product-media" data-open-product="${esc(k)}">${img?`<img loading="lazy" decoding="async" draggable="false" src="${esc(img)}" alt="${esc(p.nome||'Caneca')}">`:'<div class="hero-placeholder">☕</div>'}<span class="product-tag">Caneca</span></div><div class="product-info"><p class="product-name">${esc(p.nome||'Caneca')}</p><div class="product-meta"><span class="product-price">${money(priceOf(p))}</span></div></div></article>`}
async function render(){if(location.hash!=='#/padronizadas'&&location.hash!=='#/padronizadas/')return;const app=$('#app');if(!app)return;app.innerHTML='<section class="loading-page"><div class="loader"></div><p>Carregando canecas…</p></section>';const {products,models}=await load();if(location.hash!=='#/padronizadas'&&location.hash!=='#/padronizadas/')return;const list=products.filter(p=>!personalizable(p,models));app.innerHTML=`<section class="route-title"><div class="eyebrow">CanecaFácil</div><h1>Padronizadas</h1><p>Canecas prontas para escolher e encomendar.</p></section><section class="section" style="padding-top:18px">${list.length?`<div class="product-grid">${list.map(card).join('')}</div>`:'<div class="empty-state">Nenhuma caneca padronizada disponível no momento.</div>'}</section>`;app.querySelectorAll('[data-open-product]').forEach(el=>el.addEventListener('click',()=>{location.hash=`#/produto/${encodeURIComponent(el.dataset.openProduct)}`}));}
window.addEventListener('hashchange',()=>setTimeout(render,0));if(location.hash.startsWith('#/padronizadas'))setTimeout(render,0);document.documentElement.dataset.cfCatalogModes=BUILD;
