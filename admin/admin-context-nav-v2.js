import {buildAdminNavigation} from './navigation-contract.js';

const MODULE_BY_PAGE=Object.freeze({
  'relacionamento.html':'relationship',
  'atendimento.html':'service',
  'inteligencia.html':'serviceIntelligence',
  'aprendizados.html':'learning'
});

function ensureStyles(){
  if(document.querySelector('link[data-admin-context-nav-v2]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./admin-context-nav-v2.css?v=20260920-2';
  link.dataset.adminContextNavV2='';
  document.head.appendChild(link);
}

function currentModule(){
  if(document.body?.dataset.adminModule)return document.body.dataset.adminModule;
  const page=location.pathname.split('/').filter(Boolean).pop()||'';
  return MODULE_BY_PAGE[page]||'';
}

function ensureRoot(){
  const existing=document.querySelector('[data-admin-context-nav]');
  if(existing)return existing;
  const host=document.querySelector('.strategy-topbar,.relationship-main .relationship-head,.si-topbar,.al-topbar');
  if(!host)return null;
  const root=document.createElement('div');
  root.className='da-context-nav-host';
  root.dataset.adminContextNav='';
  host.appendChild(root);
  return root;
}

export function mountAdminContextNav(){
  const root=ensureRoot();
  if(!root||root.dataset.adminContextNavMounted==='1')return false;
  ensureStyles();
  const current=currentModule();
  const {groups}=buildAdminNavigation();
  const links=groups.flatMap(group=>group.modules)
    .filter(item=>item.href&&item.id!==current)
    .map(item=>`<a href="${item.href}"${item.external?' target="_blank" rel="noopener"':''}>${item.label}</a>`)
    .join('');
  root.innerHTML=`<details class="da-context-nav"><summary aria-label="Abrir navegação do Admin">Admin</summary><nav aria-label="Navegação do Admin">${links}</nav></details>`;
  root.dataset.adminContextNavMounted='1';
  return true;
}

function init(){mountAdminContextNav()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
