import { text } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { getMug } from './mug-store-v2.js?v=20260829-1';
import './personalization-correction-admin-v1.js?v=20260902-1';

const BUILD='20260903-admin-canecas-personalization-test-link-v1.4';
const STOREFRONT='https://canecafacil.com.br/';
const $=(s,r=document)=>r.querySelector(s);

function liMeta(product={}){
  return product?.loja_integrada&&typeof product.loja_integrada==='object'?product.loja_integrada:{};
}

function cleanAlias(value){
  let alias=text(value);
  if(!alias)return'';
  try{alias=decodeURIComponent(alias);}catch{}
  alias=alias.replace(/^https?:\/\/[^/]+/i,'');
  alias=alias.split(/[?#]/,1)[0];
  alias=alias.replace(/^\/+|\/+$/g,'');
  alias=alias.replace(/^produto\//i,'');
  alias=alias.replace(/\.html$/i,'');
  return alias.replace(/^\/+|\/+$/g,'');
}

function aliasFromUrl(value){
  const raw=text(value);
  if(!raw)return'';
  try{
    const url=new URL(raw,STOREFRONT);
    const match=url.pathname.match(/^\/produto\/(.+?)(?:\.html)?\/?$/i);
    return cleanAlias(match?.[1]||'');
  }catch{return'';}
}

function realProductUrl(product={}){
  const li=liMeta(product);
  const raw=text(li.url||product?.canecafacil_url);
  const alias=aliasFromUrl(raw)||cleanAlias(li.alias||product?.loja_integrada_alias);
  const published=Boolean(text(li.produto_id)||raw);
  if(!published||!alias)return'';
  const url=new URL(`produto/${encodeURIComponent(alias)}.html`,STOREFRONT);
  return url.href;
}

function standaloneUrl(productKey){
  const url=new URL('../loja-integrada/personalizar/index-v4.html',location.href);
  url.searchParams.set('model',productKey);
  return url.href;
}

function findStoreLink(actions){
  return [...actions.querySelectorAll('a')].find(a=>text(a.textContent).toLowerCase()==='ver na loja')||null;
}

function syncStoreLink(actions,store){
  let link=findStoreLink(actions);
  if(!store){
    if(link)link.remove();
    return;
  }
  if(!link){
    link=document.createElement('a');
    link.className='secondary';
    link.target='_blank';
    link.rel='noopener';
    link.textContent='Ver na loja';
    actions.appendChild(link);
  }
  link.href=store;
  link.target='_blank';
  link.rel='noopener';
  link.title='Abre a página pública correta desta caneca no CanecaFácil.';
}

async function install(productKey){
  const root=$('#drawerContent');
  const actions=$('.drawer-actions',root);
  if(!root||!actions||!productKey)return;

  let link=$('#cfPersonalizationTestLink',actions);
  if(!link){
    link=document.createElement('a');
    link.id='cfPersonalizationTestLink';
    link.className='secondary';
    link.target='_blank';
    link.rel='noopener';
    link.textContent='Preparando teste…';
    link.title='Salve o cadastro antes de abrir o teste para usar a configuração atual.';
    link.href=standaloneUrl(productKey);
    const first=actions.firstElementChild;
    if(first)actions.insertBefore(link,first);else actions.appendChild(link);
  }

  try{
    const product=await getMug(productKey);
    if(!link.isConnected)return;
    const store=realProductUrl(product||{});
    syncStoreLink(actions,store);
    if(store){
      const url=new URL(store);
      url.searchParams.set('cf_personalizador','teste');
      link.href=url.href;
      link.textContent='Testar no site';
      link.title='Abre esta caneca na página pública correta com o personalizador em modo de teste.';
      link.dataset.cfTestMode='storefront';
      return;
    }
    link.href=standaloneUrl(productKey);
    link.textContent='Testar personalização';
    link.title='A caneca ainda não tem publicação confirmada na Loja Integrada; abre a homologação V4 isolada.';
    link.dataset.cfTestMode='standalone';
  }catch(error){
    console.warn('[Admin Canecas] não foi possível preparar os links da loja:',error?.message||error);
    if(link.isConnected){
      link.href=standaloneUrl(productKey);
      link.textContent='Testar personalização';
      link.dataset.cfTestMode='standalone';
    }
  }
}

window.addEventListener('admin-canecas:drawer',event=>{
  const detail=event.detail||{};
  if(detail.kind!=='mug'||!detail.id)return;
  install(text(detail.id));
});

document.documentElement.dataset.cfPersonalizationTestLink=BUILD;
window.__CANECAS_STOREFRONT_LINKS__=Object.freeze({BUILD,realProductUrl});
