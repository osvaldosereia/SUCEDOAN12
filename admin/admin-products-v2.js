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
function enhanceRows(){
  const rows=app?.querySelectorAll('[data-product-row]')||[];
  rows.forEach(row=>{
    if(row.dataset.productMobileV2==='1')return;
    row.dataset.productMobileV2='1';
    const cells=[...row.children];
    const labels=['Produto','Preço','Estoque','Categoria','Status','Ações'];
    cells.forEach((cell,index)=>{if(labels[index])cell.dataset.label=labels[index]});
    const save=row.querySelector('[data-save-product-row]');
    const edit=row.querySelector('[data-edit-product]');
    if(save)save.classList.add('da-product-primary-action');
    if(edit)edit.classList.add('da-product-secondary-action');
  });
}
function enhanceEditor(){
  const form=document.getElementById('productEditorForm');
  if(!form||form.dataset.productEditorV2==='1')return;
  form.dataset.productEditorV2='1';
  form.classList.add('da-product-editor-v2');
  const heading=form.querySelector('.editor-head h2');
  if(heading)heading.insertAdjacentHTML('afterend','<p class="da-product-editor-hint">Dados comerciais, identificação, estoque e vitrine em uma única ficha.</p>');
  const fields=[...form.querySelectorAll('.field')];
  fields.forEach(field=>{
    const input=field.querySelector('input,textarea');
    if(!input?.name)return;
    if(['name','gtin','sku','brand','packaging'].includes(input.name))field.dataset.productSection='identity';
    if(['price','cost','stock'].includes(input.name))field.dataset.productSection='commercial';
    if(['category','image_url','description_short'].includes(input.name))field.dataset.productSection='storefront';
  });
}
function mount(){
  if(!app||!productsActive())return;
  const form=app.querySelector('#productFilterForm');
  if(!form)return;
  const select=form.querySelector('select[name="status"]');
  if(select&&!form.querySelector('[data-product-views-v2]')&&!app.querySelector('[data-product-views-v2]')){
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
  enhanceRows();
  enhanceEditor();
}
let queued=false;
function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;mount()})}
if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
window.addEventListener('hashchange',schedule);
schedule();
