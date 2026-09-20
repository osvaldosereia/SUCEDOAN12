const app=document.getElementById('app');
const VIEWS=Object.freeze([
  {status:'',label:'Todos'},
  {status:'active',label:'Ativos'},
  {status:'no-stock',label:'Sem estoque'},
  {status:'offer',label:'Ofertas'},
  {status:'featured',label:'Destaques'},
  {status:'inactive',label:'Inativos'}
]);
function productsActive(){return location.hash==='#products'}
function mount(){
  if(!app||!productsActive())return;
  const form=app.querySelector('#productFilterForm');
  if(!form||form.querySelector('[data-product-views-v2]'))return;
  const select=form.querySelector('select[name="status"]');
  if(!select)return;
  const views=document.createElement('div');
  views.className='da-product-views';
  views.dataset.productViewsV2='';
  views.setAttribute('aria-label','Visualizações rápidas de produtos');
  views.innerHTML=VIEWS.map(view=>`<button type="button" class="da-product-view${select.value===view.status?' is-active':''}" data-product-status="${view.status}" aria-pressed="${select.value===view.status?'true':'false'}">${view.label}</button>`).join('');
  form.insertAdjacentElement('afterend',views);
  views.addEventListener('click',event=>{
    const button=event.target.closest('[data-product-status]');
    if(!button)return;
    select.value=button.dataset.productStatus;
    form.requestSubmit();
  });
}
let queued=false;
function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;mount()})}
if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:false});
window.addEventListener('hashchange',schedule);
schedule();
