import { text } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { getMug } from './mug-store-v2.js?v=20260829-1';
import './personalization-correction-admin-v1.js?v=20260902-1';

const BUILD='20260902-admin-canecas-personalization-test-link-v1.3';
const STOREFRONT='https://canecafacil.com.br/';
const $=(s,r=document)=>r.querySelector(s);

function safeStoreUrl(value){
  const raw=text(value);
  if(!raw)return'';
  try{
    const url=new URL(raw,STOREFRONT);
    const host=url.hostname.toLowerCase().replace(/^www\./,'');
    return host==='canecafacil.com.br'?url.href:'';
  }catch{return'';}
}

function realProductUrl(product={}){
  const direct=safeStoreUrl(product?.loja_integrada?.url)||safeStoreUrl(product?.canecafacil_url);
  if(direct)return direct;
  const alias=text(product?.loja_integrada_alias||product?.loja_integrada?.alias);
  if(!alias)return'';
  return safeStoreUrl(new URL(alias.replace(/^\/+/,''),STOREFRONT).href);
}

function standaloneUrl(productKey){
  const url=new URL('../loja-integrada/personalizar/index-v4.html',location.href);
  url.searchParams.set('model',productKey);
  return url.href;
}

async function install(productKey){
  const root=$('#drawerContent');
  const actions=$('.drawer-actions',root);
  if(!root||!actions||!productKey||$('#cfPersonalizationTestLink',actions))return;

  const link=document.createElement('a');
  link.id='cfPersonalizationTestLink';
  link.className='secondary';
  link.target='_blank';
  link.rel='noopener';
  link.textContent='Preparando teste…';
  link.title='Salve o cadastro antes de abrir o teste para usar a configuração atual.';
  link.href=standaloneUrl(productKey);
  const first=actions.firstElementChild;
  if(first)actions.insertBefore(link,first);else actions.appendChild(link);

  try{
    const product=await getMug(productKey);
    if(!link.isConnected)return;
    const store=realProductUrl(product||{});
    if(store){
      const url=new URL(store);
      url.searchParams.set('cf_personalizador','teste');
      link.href=url.href;
      link.textContent='Testar no site';
      link.title='Abre esta caneca na Loja Integrada com o personalizador inline em modo de homologação.';
      link.dataset.cfTestMode='storefront';
      return;
    }
    link.textContent='Testar personalização';
    link.title='A caneca ainda não tem URL confirmada na Loja Integrada; abre a homologação V4 isolada.';
    link.dataset.cfTestMode='standalone';
  }catch(error){
    console.warn('[Admin Canecas] não foi possível preparar teste no site:',error?.message||error);
    if(link.isConnected){
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
