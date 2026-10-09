import {attendanceAuthorizedFetch} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';

const API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-marketing-template-lifecycle-v1';
const ADMIN_PUBLIC_KEY=['sb','publishable','tFXHtH0HCXZepVtwgKElIg','DxS76Gu8'].join('_');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmtDate=value=>{if(!value)return 'Nunca usado';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};

async function request(action,{method='GET',body=null,params={}}={}){
  const url=new URL(API);url.searchParams.set('action',action);
  for(const [key,value] of Object.entries(params))if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value));
  const options={method,headers:{apikey:ADMIN_PUBLIC_KEY},cache:'no-store'};
  if(body!==null){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body)}
  const response=await attendanceAuthorizedFetch(url,options);const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`template_lifecycle_${response.status}`);error.payload=data;throw error}
  return data;
}
const post=(action,body)=>request(action,{method:'POST',body});

function lifecycleLabel(item){
  if(item?.protected)return 'Protegido';
  const status=String(item?.lifecycle_status||'');
  if(status==='deletion_candidate')return 'Candidato à exclusão';
  if(status==='delete_approved')return 'Exclusão aprovada';
  if(status==='deleted_meta')return 'Excluído da Meta';
  if(status==='in_use')return 'Em uso';
  return 'Ativo';
}
function statusTone(item){
  if(item?.protected)return 'ok';
  const status=String(item?.lifecycle_status||'');
  if(status==='deletion_candidate'||status==='delete_approved')return 'warn';
  if(status==='deleted_meta')return 'neutral';
  return status==='in_use'?'ok':'neutral';
}
function createDialog(){
  const dialog=document.createElement('dialog');
  dialog.className='marketing-template-dialog marketing-template-lifecycle-dialog';
  dialog.innerHTML='<div data-template-lifecycle-content></div>';
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.appendChild(dialog);dialog.showModal();return dialog;
}
function actionMarkup(item){
  const protect=`<button type="button" data-lifecycle-protect="${esc(item.template_id)}" data-protected="${item.protected?'true':'false'}">${item.protected?'Desproteger':'Proteger'}</button>`;
  if(item.lifecycle_status==='deletion_candidate')return `${protect}<button type="button" class="danger" data-lifecycle-delete="${esc(item.template_id)}">Excluir da Meta</button>`;
  if(item.lifecycle_status==='delete_approved')return `${protect}<button type="button" class="danger" data-lifecycle-delete="${esc(item.template_id)}">Tentar excluir da Meta</button>`;
  return protect;
}
function rowMarkup(item,focusTemplateId){
  const focused=String(item.template_id)===String(focusTemplateId||'');
  return `<article class="marketing-template-row ${focused?'is-focused':''}" data-lifecycle-row="${esc(item.template_id)}">
    <div class="marketing-template-main"><strong>${esc(item.name||'Template')}</strong><small>${esc(item.language||'pt_BR')} · MARKETING</small><em>${esc(item.reason||'')}</em></div>
    <div><span class="marketing-template-pill ${statusTone(item)}">${esc(lifecycleLabel(item))}</span></div>
    <div><small>Último uso</small><strong>${esc(fmtDate(item.last_used_at))}</strong></div>
    <div><small>Elegível para limpeza</small><strong>${esc(item.candidate_after?fmtDate(item.candidate_after):'—')}</strong></div>
    <div class="marketing-template-actions">${actionMarkup(item)}</div>
  </article>`;
}
function render(dialog,data,{focusTemplateId=null,statusText='' }={}){
  const host=dialog.querySelector('[data-template-lifecycle-content]');if(!host)return;
  const items=Array.isArray(data?.items)?data.items:[];
  const candidates=items.filter(item=>item.lifecycle_status==='deletion_candidate'||item.lifecycle_status==='delete_approved');
  const protectedItems=items.filter(item=>item.protected===true);
  const visible=[...candidates,...protectedItems,...items.filter(item=>!candidates.includes(item)&&!protectedItems.includes(item)&&String(item.template_id)===String(focusTemplateId||''))];
  host.innerHTML=`<div class="marketing-template-dialog-head"><div><span>Gestão segura</span><h3>Revisar limpeza</h3><p>Templates de Marketing sem uso por 60 dias podem ser sugeridos. Nada é excluído automaticamente.</p></div><button type="button" data-lifecycle-close>Fechar</button></div>
    <div class="marketing-template-status" data-lifecycle-status>${esc(statusText||`${Number(data?.candidate_count||0)} candidato(s) à exclusão · ${protectedItems.length} protegido(s).`)}</div>
    <div class="marketing-template-list" data-lifecycle-list>${visible.length?visible.map(item=>rowMarkup(item,focusTemplateId)).join(''):'<div class="marketing-template-empty">Nenhum template precisa de limpeza agora.</div>'}</div>
    <div class="marketing-template-detail"><p><strong>Regra:</strong> candidato somente se for MARKETING, não estiver Protegido, não tiver campanha/estratégia dependente e estiver há pelo menos 60 dias sem uso.</p><p>O histórico local é preservado mesmo depois de Excluir da Meta.</p></div>`;
  host.querySelector('[data-lifecycle-close]')?.addEventListener('click',()=>dialog.close());
}

async function load(dialog,options={},statusText=''){
  const data=await request('list',{params:{account_id:options.accountId||null}});render(dialog,data,{focusTemplateId:options.focusTemplateId,statusText});bindActions(dialog,data,options);return data;
}
function bindActions(dialog,data,options){
  dialog.querySelectorAll('[data-lifecycle-protect]').forEach(button=>button.addEventListener('click',async()=>{
    if(button.disabled)return;button.disabled=true;
    try{
      const templateId=button.dataset.lifecycleProtect,currentlyProtected=button.dataset.protected==='true';
      await post('set_protected',{template_id:templateId,protected:!currentlyProtected});
      await load(dialog,options,!currentlyProtected?'Template marcado como Protegido.':'Proteção removida; regras de limpeza recalculadas.');
    }catch(error){await load(dialog,options,`Não foi possível alterar proteção: ${String(error?.message||error)}`)}
  }));
  dialog.querySelectorAll('[data-lifecycle-delete]').forEach(button=>button.addEventListener('click',async()=>{
    if(button.disabled)return;const templateId=button.dataset.lifecycleDelete;
    const item=(Array.isArray(data?.items)?data.items:[]).find(row=>String(row.template_id)===String(templateId));
    if(!item)return;
    if(!confirm(`Excluir o template "${item.name}" da Meta?\n\nO histórico continuará salvo na Dona Antônia. Esta ação só é permitida porque o template passou pelas regras de limpeza.`))return;
    button.disabled=true;
    try{
      await post('delete_meta',{template_id:templateId,confirm_delete:true});
      await load(dialog,options,'Template excluído da Meta. O histórico local foi preservado.');
    }catch(error){
      await load(dialog,options,`A exclusão foi bloqueada ou falhou: ${String(error?.message||error)}. Nenhum histórico foi apagado.`);
    }
  }));
}

async function openTemplateLifecycle(options={}){
  const dialog=createDialog();
  const host=dialog.querySelector('[data-template-lifecycle-content]');
  if(host)host.innerHTML='<div class="marketing-template-empty">Recalculando a fila de limpeza…</div>';
  try{await load(dialog,options)}catch(error){if(host)host.innerHTML=`<div class="marketing-template-dialog-head"><h3>Revisar limpeza</h3><button type="button" data-lifecycle-close>Fechar</button></div><div class="marketing-template-status" data-tone="error">Não foi possível carregar: ${esc(error?.message||error)}</div>`;host?.querySelector('[data-lifecycle-close]')?.addEventListener('click',()=>dialog.close())}
  return dialog;
}

window.DAMarketingTemplateLifecycle={openTemplateLifecycle};
export {openTemplateLifecycle};
