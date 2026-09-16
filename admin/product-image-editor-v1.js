import {CONFIG} from './runtime-config.js';

const editorBody=document.getElementById('editorBody');
const toastRegion=document.getElementById('toastRegion');
const AUTH_KEY='da_admin_auth';
const ENDPOINT='admin-product-image-editor-v1';
const MAX_FILE_BYTES=8_000_000;
const ALLOWED_TYPES=new Set(['image/png','image/jpeg','image/webp']);
const mounted=new WeakSet();

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const getSession=()=>{try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}};
const saveSession=session=>localStorage.setItem(AUTH_KEY,JSON.stringify(session));
const decodeExp=token=>{try{return Number(JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp||0)}catch{return 0}};
const toast=(message,kind='')=>{
  if(!toastRegion)return;
  const node=document.createElement('div');
  node.className=`toast ${kind}`.trim();
  node.textContent=message;
  toastRegion.appendChild(node);
  setTimeout(()=>node.remove(),kind==='error'?6000:3200);
};

async function refreshSession(){
  const current=getSession();
  if(!current?.refresh_token)throw new Error('Sessão do Admin necessária.');
  const response=await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{
    method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({refresh_token:current.refresh_token}),cache:'no-store'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.access_token){localStorage.removeItem(AUTH_KEY);throw new Error('Sua sessão expirou. Entre novamente no Admin.');}
  const next={...current,...data};saveSession(next);return next;
}
async function session(){let current=getSession();if(!current?.access_token)return null;if(decodeExp(current.access_token)*1000<Date.now()+60000)current=await refreshSession();return current}

function errorLabel(code,detail){
  const labels={
    product_inactive:'Ative o produto antes de gerar uma nova imagem.',product_processing:'Este produto já está gerando uma imagem.',job_processing:'Este produto já está gerando uma imagem.',
    source_required:'Este produto ainda não possui uma imagem que possa ser usada como referência.',file_required:'Selecione uma imagem.',invalid_image_type:'Use PNG, JPG ou WEBP.',invalid_image_size:'A imagem deve ter no máximo 8 MB.',
    admin_session_required:'Sessão do Admin necessária.',admin_session_invalid:'Sua sessão expirou.',admin_forbidden:'Seu usuário não tem permissão para esta ação.',version_not_found:'A versão selecionada não foi encontrada.'
  };
  return labels[code]||detail||code||'Não foi possível concluir a ação.';
}

async function imageApi(action,payload={},retry=true){
  let current=await session();
  if(!current)throw new Error('Sessão do Admin necessária.');
  const isForm=payload instanceof FormData;
  const body=isForm?payload:JSON.stringify({action,...payload});
  if(isForm&&!payload.has('action'))payload.set('action',action);
  const headers={apikey:CONFIG.supabasePublishableKey,Authorization:`Bearer ${current.access_token}`};
  if(!isForm)headers['Content-Type']='application/json';
  const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${ENDPOINT}`,{method:'POST',headers,body,cache:'no-store'});
  if(response.status===401&&retry&&current.refresh_token){await refreshSession();return imageApi(action,payload,false)}
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw new Error(errorLabel(data.error,data.detail));
  return data;
}

function validateFile(file){
  if(!file)throw new Error('Selecione uma imagem.');
  if(!ALLOWED_TYPES.has(file.type))throw new Error('Use PNG, JPG ou WEBP.');
  if(file.size<1||file.size>MAX_FILE_BYTES)throw new Error('A imagem deve ter no máximo 8 MB.');
  return file;
}

function dateLabel(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR')}
function sourceLabel(value){return ({manual_upload:'Upload manual',before_manual_replace:'Imagem anterior',before_generation:'Antes da geração',generation_source_upload:'Referência enviada',before_restore:'Antes da restauração',restore:'Restaurada'})[value]||'Versão anterior'}

function historyMarkup(versions=[]){
  if(!versions.length)return '<div class="product-image-history-empty">Nenhuma versão anterior registrada ainda.</div>';
  return versions.map(item=>`<article class="product-image-history-item">
    <img src="${esc(item.image_url)}" alt="" loading="lazy" decoding="async">
    <div><strong>${esc(sourceLabel(item.source_type))}</strong><span>${esc(dateLabel(item.created_at))}</span></div>
    <button class="secondary" type="button" data-product-image-restore="${esc(item.id)}">Restaurar</button>
  </article>`).join('');
}

async function refreshHistory(panel,productId){
  const history=panel.querySelector('[data-product-image-history]');
  if(history)history.innerHTML='<div class="product-image-history-empty">Carregando histórico…</div>';
  try{
    const data=await imageApi('history',{product_id:productId});
    if(history)history.innerHTML=historyMarkup(data.versions||[]);
    const current=data.product?.image_url||'';
    const preview=panel.querySelector('[data-product-image-preview]');
    if(current&&preview){preview.src=current;preview.hidden=false}
    return data;
  }catch(error){if(history)history.innerHTML=`<div class="product-image-history-empty">${esc(error.message)}</div>`;throw error}
}

function setBusy(panel,busy,message=''){
  panel.classList.toggle('is-busy',busy);
  panel.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=busy);
  const status=panel.querySelector('[data-product-image-status]');
  if(status)status.textContent=message;
}

async function pollGeneration(panel,form,previousUrl){
  const productId=form.dataset.productId;
  const status=panel.querySelector('[data-product-image-status]');
  for(let attempt=0;attempt<24;attempt++){
    await new Promise(resolve=>setTimeout(resolve,5000));
    let data;
    try{data=await imageApi('history',{product_id:productId})}catch{continue}
    const product=data.product||{};
    if(product.image_ai_status==='completed'&&product.image_url&&product.image_url!==previousUrl){
      form.elements.image_url.value=product.image_url;
      const preview=panel.querySelector('[data-product-image-preview]');preview.src=product.image_url;preview.hidden=false;
      const history=panel.querySelector('[data-product-image-history]');if(history)history.innerHTML=historyMarkup(data.versions||[]);
      if(status)status.textContent='Nova imagem gerada e aplicada pela mesma automação da Imagens IA.';
      toast('Nova imagem gerada.','success');
      return;
    }
    if(['rejected','source_rejected','error'].includes(String(product.image_ai_status||''))){if(status)status.textContent='A geração terminou com revisão necessária. Veja a aba Imagens IA.';return}
  }
  if(status)status.textContent='A geração continua na fila. Você pode fechar o produto e acompanhar pela aba Imagens IA.';
}

function panelMarkup(currentUrl){
  return `<section class="product-image-editor wide" data-product-image-editor>
    <div class="product-image-editor-head"><div><h3>Imagem do produto</h3><p>Troque a imagem ou gere novamente usando a mesma automação da aba Imagens IA.</p></div></div>
    <div class="product-image-current">
      <div class="product-image-preview-wrap">${currentUrl?`<img data-product-image-preview src="${esc(currentUrl)}" alt="Imagem atual do produto">`:'<img data-product-image-preview hidden alt="Imagem atual do produto">'}<span>Imagem atual</span></div>
      <div class="product-image-controls">
        <label class="field"><span>Nova imagem / referência</span><input data-product-image-upload type="file" accept="image/png,image/jpeg,image/webp"></label>
        <label class="field"><span>Orientação opcional para a IA</span><textarea data-product-image-prompt rows="3" placeholder="Ex.: manter o produto inteiro, corrigir recorte e padronizar o fundo."></textarea></label>
        <div class="product-image-actions">
          <button class="secondary" type="button" data-product-image-replace>Usar nova imagem</button>
          <button class="primary" type="button" data-product-image-generate-current>Gerar novamente</button>
          <button class="secondary" type="button" data-product-image-generate-upload>Gerar com esta imagem</button>
        </div>
        <div class="product-image-status" data-product-image-status aria-live="polite"></div>
      </div>
    </div>
    <div class="product-image-history-block"><h4>Versões anteriores</h4><div class="product-image-history" data-product-image-history></div></div>
  </section>`;
}

async function mountImageEditor(form){
  if(mounted.has(form))return;mounted.add(form);
  const imageField=form.elements.image_url?.closest('.field');
  const holder=document.createElement('div');holder.innerHTML=panelMarkup(form.elements.image_url?.value||'');
  const panel=holder.firstElementChild;
  (imageField||form.querySelector('.form-grid')?.lastElementChild)?.after(panel);
  const productId=form.dataset.productId;
  refreshHistory(panel,productId).catch(()=>{});

  const fileInput=panel.querySelector('[data-product-image-upload]');
  let objectUrl='';
  fileInput?.addEventListener('change',()=>{
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=''}
    const file=fileInput.files?.[0];if(!file)return;
    try{validateFile(file);objectUrl=URL.createObjectURL(file);const preview=panel.querySelector('[data-product-image-preview]');preview.src=objectUrl;preview.hidden=false}catch(error){toast(error.message,'error');fileInput.value=''}
  });

  panel.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    const prompt=panel.querySelector('[data-product-image-prompt]')?.value||'';
    const before=form.elements.image_url?.value||'';
    try{
      if(button.matches('[data-product-image-replace]')){
        const file=validateFile(fileInput.files?.[0]);const body=new FormData();body.set('action','upload_replace');body.set('product_id',productId);body.set('file',file);
        setBusy(panel,true,'Enviando nova imagem…');const data=await imageApi('upload_replace',body);form.elements.image_url.value=data.image_url||'';
        const preview=panel.querySelector('[data-product-image-preview]');preview.src=data.image_url;preview.hidden=false;fileInput.value='';toast('Imagem do produto atualizada.','success');await refreshHistory(panel,productId);setBusy(panel,false,'Imagem atualizada.');return;
      }
      if(button.matches('[data-product-image-generate-current]')){
        setBusy(panel,true,'Enviando para a mesma geração individual da Imagens IA…');await imageApi('generate_current',{product_id:productId,prompt});setBusy(panel,false,'Geração iniciada. Acompanhando resultado…');pollGeneration(panel,form,before);return;
      }
      if(button.matches('[data-product-image-generate-upload]')){
        const file=validateFile(fileInput.files?.[0]);const body=new FormData();body.set('action','upload_generate');body.set('product_id',productId);body.set('prompt',prompt);body.set('file',file);
        setBusy(panel,true,'Enviando a referência e iniciando a geração…');await imageApi('upload_generate',body);setBusy(panel,false,'Geração iniciada com a nova referência. Acompanhando resultado…');pollGeneration(panel,form,before);return;
      }
      if(button.matches('[data-product-image-restore]')){
        if(!confirm('Restaurar esta imagem como imagem atual do produto?'))return;
        setBusy(panel,true,'Restaurando imagem…');const data=await imageApi('restore',{product_id:productId,version_id:button.dataset.productImageRestore});form.elements.image_url.value=data.image_url||'';
        const preview=panel.querySelector('[data-product-image-preview]');preview.src=data.image_url;preview.hidden=false;toast('Imagem anterior restaurada.','success');await refreshHistory(panel,productId);setBusy(panel,false,'Imagem restaurada.');
      }
    }catch(error){setBusy(panel,false,'');toast(error.message,'error')}
  });
}

const observer=new MutationObserver(()=>editorBody?.querySelectorAll('#productInlineEditorForm').forEach(mountImageEditor));
if(editorBody){observer.observe(editorBody,{childList:true,subtree:true});editorBody.querySelectorAll('#productInlineEditorForm').forEach(mountImageEditor)}
