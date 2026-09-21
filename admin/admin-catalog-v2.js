// Admin Geral R5 — additive Categories + Storefront UX.
// No network/storage: this layer only enriches DOM rendered by app.js.
const APP_ID='app';
let lastRoute='';

function text(value){return String(value??'').trim()}
function number(value){const n=Number(value);return Number.isFinite(n)?n:0}

function enhanceCategories(app){
  if(location.hash!=='#categories')return;
  app.querySelectorAll('[data-category-row]').forEach(row=>{
    if(row.dataset.r5Enhanced==='1')return;
    row.dataset.r5Enhanced='1';
    row.classList.add('da-category-card');
    const countText=row.querySelector('.muted')?.textContent||'';
    const productCount=number(countText.match(/\d+/)?.[0]);
    row.dataset.productCount=String(productCount);
    const info=document.createElement('p');
    info.className='da-category-impact';
    info.textContent=productCount
      ? `${productCount} produto${productCount===1?'':'s'} usa${productCount===1?'':'m'} esta categoria. Renomear pode alterar a classificação desses produtos.`
      : 'Sem produtos vinculados no levantamento atual.';
    const main=row.firstElementChild;
    main?.appendChild(info);
  });

  const form=app.querySelector('#newCategoryForm');
  if(form&&!form.querySelector('.da-form-help')){
    const help=document.createElement('p');
    help.className='da-form-help';
    help.textContent='A ordem define prioridade visual. “Visível” publica a categoria na vitrine e “Início” a coloca entre os atalhos principais.';
    form.appendChild(help);
  }
}

function storefrontSummary(app){
  const categories=[...app.querySelectorAll('[data-storefront-category]')];
  if(!categories.length)return;
  const visible=categories.filter(row=>row.querySelector('[data-visible]')?.checked).length;
  const home=categories.filter(row=>row.querySelector('[data-home]')?.checked).length;
  const products=app.querySelectorAll('[data-featured-product]').length;
  const baskets=app.querySelectorAll('[data-feature-basket]:checked').length;
  const summary=app.querySelector('[data-r5-storefront-summary]');
  if(summary)summary.innerHTML=`<strong>${visible}</strong><span>categorias visíveis</span><strong>${home}</strong><span>no início</span><strong>${products}</strong><span>produtos em destaque</span><strong>${baskets}</strong><span>cestas em destaque</span>`;
}

function enhanceStorefront(app){
  if(location.hash!=='#storefront')return;
  const firstPanel=app.querySelector('.panel');
  if(firstPanel&&!app.querySelector('[data-r5-storefront-summary]')){
    const overview=document.createElement('section');
    overview.className='da-storefront-overview';
    overview.setAttribute('aria-label','Resumo da configuração da vitrine');
    overview.innerHTML='<div class="da-storefront-summary" data-r5-storefront-summary></div><p>As alterações abaixo só entram em vigor ao usar <strong>Salvar vitrine</strong>. Produtos e cestas em destaque são salvos como conjuntos completos.</p>';
    firstPanel.before(overview);
  }
  app.querySelectorAll('[data-storefront-category]').forEach(row=>{
    row.classList.add('da-storefront-category-card');
    const order=row.querySelector('[data-order]');
    if(order&&!order.dataset.r5Help){
      order.dataset.r5Help='1';
      order.min='0';
      order.inputMode='numeric';
      order.title='Menores números aparecem primeiro';
    }
  });
  const save=app.querySelector('[data-save-storefront]');
  if(save){save.classList.add('da-storefront-save');save.setAttribute('aria-describedby','r5-storefront-save-help')}
  const head=app.querySelector('.page-head');
  if(head&&!app.querySelector('#r5-storefront-save-help')){
    const help=document.createElement('p');
    help.id='r5-storefront-save-help';
    help.className='da-save-help';
    help.textContent='Revise visibilidade, início, ordem e destaques antes de salvar.';
    head.appendChild(help);
  }
  storefrontSummary(app);
}

function enhance(){
  const app=document.getElementById(APP_ID);if(!app)return;
  const route=location.hash||'#dashboard';
  if(route!==lastRoute)lastRoute=route;
  enhanceCategories(app);
  enhanceStorefront(app);
}

// Rename is a real write. Add an impact confirmation before the legacy prompt/RPC.
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-rename-category]');
  if(!button)return;
  const row=button.closest('[data-category-row]');
  const count=number(row?.dataset.productCount);
  const name=text(button.dataset.renameCategory);
  const message=count
    ? `Renomear “${name}” pode atualizar a categoria de ${count} produto${count===1?'':'s'} vinculado${count===1?'':'s'}. Deseja continuar para informar o novo nome?`
    : `Renomear “${name}” altera a categoria na vitrine. Deseja continuar para informar o novo nome?`;
  if(!window.confirm(message)){
    event.preventDefault();
    event.stopImmediatePropagation();
  }
},true);

document.addEventListener('change',event=>{
  if(!event.target.closest('#app'))return;
  if(location.hash==='#storefront')storefrontSummary(document.getElementById(APP_ID));
});

document.addEventListener('click',event=>{
  if(!event.target.closest('#app'))return;
  if(location.hash==='#storefront')queueMicrotask(()=>storefrontSummary(document.getElementById(APP_ID)));
});

const observer=new MutationObserver(()=>queueMicrotask(enhance));
const app=document.getElementById(APP_ID);
if(app){observer.observe(app,{childList:true,subtree:true});enhance()}
window.addEventListener('hashchange',()=>queueMicrotask(enhance));
