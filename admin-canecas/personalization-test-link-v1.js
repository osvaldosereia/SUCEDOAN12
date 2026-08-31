import { text } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD='20260831-admin-canecas-personalization-test-link-v1.1';
const $=(s,r=document)=>r.querySelector(s);

function install(productKey){
  const root=$('#drawerContent');
  const actions=$('.drawer-actions',root);
  if(!root||!actions||!productKey||$('#cfPersonalizationTestLink',actions))return;
  const link=document.createElement('a');
  link.id='cfPersonalizationTestLink';
  link.className='secondary';
  link.target='_blank';
  link.rel='noopener';
  link.textContent='Testar personalização';
  link.title='Salve o cadastro antes de abrir o teste para usar a configuração atual.';
  const url=new URL('../loja-integrada/personalizar/index-v4.html',location.href);
  url.searchParams.set('model',productKey);
  link.href=url.href;
  const first=actions.firstElementChild;
  if(first)actions.insertBefore(link,first);else actions.appendChild(link);
}

window.addEventListener('admin-canecas:drawer',event=>{
  const detail=event.detail||{};
  if(detail.kind!=='mug'||!detail.id)return;
  install(text(detail.id));
});

document.documentElement.dataset.cfPersonalizationTestLink=BUILD;
