import {CONFIG} from './runtime-config.js';

const editorBody=document.getElementById('editorBody');
const dialog=document.getElementById('editorDialog');
const toastRegion=document.getElementById('toastRegion');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function toast(message,kind=''){
  if(!toastRegion)return;
  const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;toastRegion.appendChild(node);setTimeout(()=>node.remove(),kind==='error'?5200:2600);
}

async function call(functionName,action,payload={}){
  const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${functionName}`,{
    method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({action,...payload}),cache:'no-store',credentials:'omit'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw new Error(data.detail||data.error||`Erro ${response.status}`);
  return data;
}
const productApi=(action,payload)=>call('admin-simple-v2',action,payload);
const gondolaApi=(action,payload)=>call('admin-gondolas-v1',action,payload);

function optionMarkup(g,currentName){
  const selected=String(g.gondola_code||'')===String(currentName||'');
  const disabled=!g.active&&!selected;
  return `<option value="${esc(g.id)}" ${selected?'selected':''} ${disabled?'disabled':''}>${esc(g.gondola_code)}${g.active?'':' (desativada)'}</option>`;
}

async function enhance(form){
  if(!form||form.dataset.gondolaEnhanced==='1')return;
  form.dataset.gondolaEnhanced='1';
  form.dataset.gondolaReady='0';
  const submit=form.querySelector('button[type="submit"]');
  if(submit)submit.disabled=true;
  try{
    const productId=form.dataset.productId;
    const [productData,gondolaData]=await Promise.all([productApi('product',{id:productId}),gondolaApi('list_gondolas')]);
    if(!document.body.contains(form))return;
    const p=productData.product||{},rows=gondolaData.gondolas||[];
    const field=document.createElement('label');
    field.className='field';
    field.innerHTML=`<span>Gôndola</span><select name="gondola_id"><option value="">Sem gôndola</option>${rows.map(g=>optionMarkup(g,p.gondola)).join('')}</select>`;
    const anchor=form.querySelector('input[name="validity_date"]')?.closest('label')||form.querySelector('.form-grid .field:last-of-type');
    if(anchor)anchor.insertAdjacentElement('afterend',field);else form.querySelector('.form-grid')?.appendChild(field);
    form.dataset.gondolaReady='1';
  }catch(error){toast(`Não foi possível carregar as gôndolas: ${error.message}`,'error')}
  finally{if(submit&&document.body.contains(form))submit.disabled=false}
}

function buildPatch(form){
  const data=Object.fromEntries(new FormData(form).entries());
  const offer=form.elements.is_offer.checked;
  const rawOffer=String(data.offer_price??'').trim();
  const offerPrice=rawOffer===''?null:Number(rawOffer);
  if(offer&&(offerPrice===null||!Number.isFinite(offerPrice)||offerPrice<0))throw new Error('Informe o preço da oferta.');
  return {
    name:data.name,sku:data.sku,gtin:data.gtin,ncm:data.ncm,
    price:data.price,offer_price:offerPrice,cost:data.cost,stock:data.stock,
    category:data.category,subcategory:data.subcategory,brand:data.brand,packaging:data.packaging,
    validity_date:data.validity_date||null,sort_order:data.sort_order,image_url:data.image_url,
    description_short:data.description_short,description_long:data.description_long,
    is_active:form.elements.is_active.checked,physically_verified:form.elements.physically_verified.checked,is_offer:offer
  };
}

editorBody?.addEventListener('submit',async event=>{
  const form=event.target.closest('#productInlineEditorForm');
  if(!form||form.dataset.gondolaReady!=='1')return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
  try{
    const patch=buildPatch(form);
    await productApi('update_product',{id:form.dataset.productId,patch});
    await gondolaApi('set_product_gondola',{product_id:form.dataset.productId,gondola_id:form.elements.gondola_id.value||null});
    if(dialog?.open)dialog.close();
    if(editorBody)editorBody.innerHTML='';
    toast('Produto salvo.','success');
    setTimeout(()=>document.querySelector('[data-inline-refresh]')?.click(),0);
  }catch(error){toast(error.message,'error');if(submit)submit.disabled=false}
},true);

const observer=new MutationObserver(()=>{
  const form=editorBody?.querySelector('#productInlineEditorForm');
  if(form)enhance(form);
});
if(editorBody)observer.observe(editorBody,{childList:true,subtree:true});
const initial=editorBody?.querySelector('#productInlineEditorForm');if(initial)enhance(initial);
