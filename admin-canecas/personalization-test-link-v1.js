import { text } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD='20260831-admin-canecas-personalization-test-link-v1';
const $=(s,r=document)=>r.querySelector(s);

function install(productKey){
  const root=$('#drawerContent');
  const section=$('#cfPersonalizationConfig',root);
  if(!root||!section||!productKey||$('#cfPersonalizationTestLink',section))return;
  const actions=document.createElement('div');
  actions.className='mini-actions';
  actions.style.marginTop='10px';
  const link=document.createElement('a');
  link.id='cfPersonalizationTestLink';
  link.className='secondary';
  link.target='_blank';
  link.rel='noopener';
  link.textContent='Testar este modelo';
  const url=new URL('../loja-integrada/personalizar/index-v4.html',location.href);
  url.searchParams.set('model',productKey);
  link.href=url.href;
  const note=document.createElement('small');
  note.style.color='#6e756d';
  note.textContent='Salve a caneca antes de testar para usar a configuração atual.';
  actions.append(link,note);
  section.appendChild(actions);
}

window.addEventListener('admin-canecas:drawer',event=>{
  const detail=event.detail||{};
  if(detail.kind!=='mug'||!detail.id)return;
  queueMicrotask(()=>install(text(detail.id)));
});

document.documentElement.dataset.cfPersonalizationTestLink=BUILD;
