import {attendanceAuthorizedFetch,attendanceJsonApi} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';

const TEMPLATE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-templates-v1';
const ADMIN_PUBLIC_KEY=['sb','publishable','tFXHtH0HCXZepVtwgKElIg','DxS76Gu8'].join('_');
const CHANNELS=['0975','1018'];

let accountsByChannel={};
let templates=[];
let templatesLoaded=false;
let activeChannel='0975';
let currentRoot=null;
let busy=false;
let pendingTemplateLoads=[];
let syncButtonResetTimer=null;
let audienceModulePromise=null;
let lifecycleModulePromise=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const channelByPhone=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.endsWith('0975')?'0975':digits.endsWith('1018')?'1018':null};
const templateBody=components=>String((Array.isArray(components)?components:[]).find(item=>String(item?.type||'').toUpperCase()==='BODY')?.text||'');
const templateHeader=components=>String((Array.isArray(components)?components:[]).find(item=>String(item?.type||'').toUpperCase()==='HEADER')?.text||'');
const templateFooter=components=>String((Array.isArray(components)?components:[]).find(item=>String(item?.type||'').toUpperCase()==='FOOTER')?.text||'');
const templateButtons=components=>((Array.isArray(components)?components:[]).find(item=>String(item?.type||'').toUpperCase()==='BUTTONS')?.buttons||[]);
const rejectedReason=item=>String(item?.metadata?.rejected_reason||'').trim();
const fmtDate=value=>{const date=new Date(value||0);return Number.isNaN(date.getTime())?'—':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};

function notify(text,tone='neutral'){
  const node=currentRoot?.querySelector?.('[data-template-center-status]');
  if(!node)return;
  node.textContent=text;
  node.dataset.tone=tone;
}

function setSyncButtonState(state='idle',channel=activeChannel){
  const button=currentRoot?.querySelector?.('[data-template-sync]');
  if(!button)return;
  if(syncButtonResetTimer){clearTimeout(syncButtonResetTimer);syncButtonResetTimer=null}
  const normalized=['queued','syncing','success','error'].includes(String(state))?String(state):'idle';
  const working=normalized==='queued'||normalized==='syncing';
  button.setAttribute('data-sync-state',normalized);
  button.setAttribute('aria-busy',working?'true':'false');
  button.disabled=working;
  button.textContent=normalized==='queued'?'Aguardando sincronização…':normalized==='syncing'?`Sincronizando ${channel}…`:normalized==='success'?'Sincronizado ✓':normalized==='error'?'Erro ao sincronizar':'Sincronizar';
  if(normalized==='success'||normalized==='error'){
    const delay=normalized==='success'?1800:2600;
    syncButtonResetTimer=setTimeout(()=>{if(String(channel)===String(activeChannel))setSyncButtonState('idle',channel)},delay);
  }
}

async function adminGet(baseUrl,params={}){
  const url=new URL(baseUrl);
  for(const [key,value] of Object.entries(params))if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value));
  const response=await attendanceAuthorizedFetch(url,{method:'GET',headers:{apikey:ADMIN_PUBLIC_KEY},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false)throw new Error(data?.error||`templates_${response.status}`);
  return data;
}

async function adminPost(baseUrl,action,body){
  const url=new URL(baseUrl);
  url.searchParams.set('action',action);
  const response=await attendanceAuthorizedFetch(url,{method:'POST',headers:{apikey:ADMIN_PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`templates_${response.status}`);error.payload=data;throw error}
  return data;
}

async function ensureAccounts(){
  if(Object.keys(accountsByChannel).length)return accountsByChannel;
  const data=await attendanceJsonApi('accounts',{},'GET');
  const next={};
  for(const account of data.items||[]){const channel=channelByPhone(account.phone_e164);if(channel)next[channel]=account}
  accountsByChannel=next;
  return next;
}

function overviewButton(){return document.querySelector('[data-tab="marketing"]')}
function marketingNavHtml(active='overview'){
  const button=(key,label)=>`<button type="button" class="${key===active?'active':''}" data-marketing-view="${key}">${label}</button>`;
  return `${button('overview','Visão geral')}${button('templates','Templates Meta')}${button('audiences','Públicos')}${button('consents','Consentimentos')}<span class="marketing-campaign-gate">Campanhas desligadas</span>`;
}
function loadAudienceModule(){
  if(!audienceModulePromise)audienceModulePromise=import('/vitrine/admin/marketing/audience-center.js?v=marketing-audience-v1');
  return audienceModulePromise;
}
function loadTemplateLifecycleModule(){
  if(window.DAMarketingTemplateLifecycle?.openTemplateLifecycle)return Promise.resolve(window.DAMarketingTemplateLifecycle);
  if(!lifecycleModulePromise)lifecycleModulePromise=import('/vitrine/admin/marketing/template-lifecycle-panel.js?v=marketing-template-lifecycle-v1');
  return lifecycleModulePromise;
}
async function openTemplateLifecycle(options={}){
  const module=await loadTemplateLifecycleModule();
  return module.openTemplateLifecycle(options);
}
async function lifecycleOptions(focusTemplateId=null){
  const accounts=await ensureAccounts();
  return {accountId:accounts[activeChannel]?.id||null,focusTemplateId};
}
async function openAudienceSection(view,root){
  const module=await loadAudienceModule();
  if(view==='audiences')return module.mountAudienceView(root);
  return module.mountConsentView(root);
}
function bindMarketingNav(root){
  root.querySelector('[data-marketing-view="overview"]')?.addEventListener('click',()=>overviewButton()?.click());
  root.querySelector('[data-marketing-view="templates"]')?.addEventListener('click',()=>mountTemplateView(root));
  root.querySelector('[data-marketing-view="audiences"]')?.addEventListener('click',()=>openAudienceSection('audiences',root).catch(error=>console.warn('marketing-audience-load',String(error?.message||error).slice(0,160))));
  root.querySelector('[data-marketing-view="consents"]')?.addEventListener('click',()=>openAudienceSection('consents',root).catch(error=>console.warn('marketing-consents-load',String(error?.message||error).slice(0,160))));
}

function injectSubviewNav(){
  const root=document.querySelector('#content');
  if(!root||root.querySelector('[data-marketing-subnav]'))return;
  const heading=root.querySelector('.page-head h1');
  if(String(heading?.textContent||'').trim()!=='Marketing')return;
  const nav=document.createElement('div');
  nav.className='marketing-template-subnav';
  nav.dataset.marketingSubnav='1';
  nav.innerHTML=marketingNavHtml('overview');
  root.querySelector('.page-head')?.after(nav);
  bindMarketingNav(nav);
}

function renderFilters(root){
  return `<div class="marketing-template-toolbar">
    <label><span>Canal</span><select data-template-channel>${CHANNELS.map(channel=>`<option value="${channel}" ${channel===activeChannel?'selected':''}>${channel}</option>`).join('')}</select></label>
    <label><span>Buscar</span><input data-template-filter="search" placeholder="Nome do template"></label>
    <label><span>Status</span><select data-template-filter="status"><option value="">Todos</option><option>APPROVED</option><option>PENDING</option><option>REJECTED</option><option>PAUSED</option><option>DISABLED</option><option>FLAGGED</option></select></label>
    <label><span>Categoria</span><select data-template-filter="category"><option value="">Todas</option><option>MARKETING</option><option>UTILITY</option><option>AUTHENTICATION</option></select></label>
    <label><span>Idioma</span><input data-template-filter="language" placeholder="pt_BR"></label>
  </div>`;
}

function filteredTemplates(root){
  const search=String(root.querySelector('[data-template-filter="search"]')?.value||'').trim().toLowerCase();
  const status=String(root.querySelector('[data-template-filter="status"]')?.value||'').trim().toUpperCase();
  const category=String(root.querySelector('[data-template-filter="category"]')?.value||'').trim().toUpperCase();
  const language=String(root.querySelector('[data-template-filter="language"]')?.value||'').trim().toLowerCase();
  return templates.filter(item=>{
    if(search&&!String(item.name||'').toLowerCase().includes(search))return false;
    if(status&&String(item.status||'').toUpperCase()!==status)return false;
    if(category&&String(item.category||'').toUpperCase()!==category)return false;
    if(language&&!String(item.language||'').toLowerCase().includes(language))return false;
    return true;
  });
}

function statusClass(status){const value=String(status||'').toUpperCase();return value==='APPROVED'?'ok':['REJECTED','DISABLED'].includes(value)?'danger':['PENDING','PAUSED','FLAGGED'].includes(value)?'warn':'neutral'}

function renderList(root){
  const list=root.querySelector('[data-template-list]');
  if(!list)return;
  const items=filteredTemplates(root);
  if(!templatesLoaded){list.innerHTML='<div class="marketing-template-empty">Abra esta área para carregar os templates.</div>';return}
  if(!items.length){list.innerHTML='<div class="marketing-template-empty">Nenhum template encontrado com estes filtros.</div>';return}
  list.innerHTML=items.map(item=>{
    const reason=rejectedReason(item);
    return `<article class="marketing-template-row" data-template-id="${esc(item.id)}">
      <div class="marketing-template-main"><strong>${esc(item.name||'Template')}</strong><small>${esc(item.language||'—')} · ${esc(item.category||'—')}</small>${reason?`<em>Motivo: ${esc(reason)}</em>`:''}</div>
      <div><span class="marketing-template-pill ${statusClass(item.status)}">${esc(item.status||'UNKNOWN')}</span></div>
      <div><small>Qualidade</small><strong>${esc(item.quality_rating||'—')}</strong></div>
      <div><small>Última sincronização</small><strong>${esc(fmtDate(item.last_synced_at))}</strong></div>
      <div class="marketing-template-actions"><button type="button" data-template-detail="${esc(item.id)}">Detalhes</button><button type="button" data-template-edit="${esc(item.id)}" ${item.meta_template_id?'':'disabled'}>Editar</button><button type="button" class="danger" data-template-delete="${esc(item.id)}">Excluir</button></div>
    </article>`;
  }).join('');
  list.querySelectorAll('[data-template-detail]').forEach(button=>button.addEventListener('click',()=>openDetail(button.dataset.templateDetail)));
  list.querySelectorAll('[data-template-edit]').forEach(button=>button.addEventListener('click',()=>openBuilder('edit',button.dataset.templateEdit)));
  list.querySelectorAll('[data-template-delete]').forEach(button=>button.addEventListener('click',()=>removeTemplate(button.dataset.templateDelete)));
}

function enqueueTemplateLoad(request){
  const requestedChannel=String(request?.channel||activeChannel);
  const existing=pendingTemplateLoads.find(item=>item.channel===requestedChannel);
  if(existing){existing.sync=Boolean(existing.sync||request?.sync);return}
  pendingTemplateLoads.push({channel:requestedChannel,sync:Boolean(request?.sync)});
}

function drainPendingTemplateLoad(){
  if(busy||!pendingTemplateLoads.length)return;
  const next=pendingTemplateLoads.shift();
  queueMicrotask(()=>loadTemplates(next).catch(()=>{}));
}

async function loadTemplates({sync=false,channel=activeChannel}={}){
  const requestedChannel=String(channel||activeChannel);
  if(busy){
    enqueueTemplateLoad({sync,channel:requestedChannel});
    if(requestedChannel===activeChannel){
      if(sync)setSyncButtonState('queued',requestedChannel);
      notify(sync?`Sincronização do ${requestedChannel} aguardando o carregamento atual…`:`Carregamento do ${requestedChannel} aguardando o carregamento atual…`);
    }
    return;
  }
  busy=true;
  const root=currentRoot;
  try{
    if(requestedChannel===activeChannel){
      if(sync)setSyncButtonState('syncing',requestedChannel);
      notify(sync?`Sincronizando templates do ${requestedChannel}…`:`Carregando templates do ${requestedChannel}…`);
    }
    const accounts=await ensureAccounts(),account=accounts[requestedChannel];
    if(!account?.id)throw new Error('account_not_found');
    const data=await adminGet(TEMPLATE_API,{action:sync?'sync':'list',account_id:account.id});
    if(requestedChannel!==activeChannel)return;
    templates=Array.isArray(data.items)?data.items:[];
    templatesLoaded=true;
    renderList(root);
    if(sync)setSyncButtonState('success',requestedChannel);
    notify(sync?`${templates.length} template${templates.length===1?'':'s'} sincronizado${templates.length===1?'':'s'} com a Meta no canal ${requestedChannel}.`:`${templates.length} template${templates.length===1?'':'s'} no canal ${requestedChannel}.`,'success');
  }catch(error){
    if(requestedChannel===activeChannel){
      if(sync)setSyncButtonState('error',requestedChannel);
      templates=[];templatesLoaded=true;renderList(root);notify(sync?`Falha ao sincronizar o canal ${requestedChannel}: ${String(error?.message||error)}`:`Não foi possível carregar os templates: ${String(error?.message||error)}`,'error');
    }
  }finally{busy=false;drainPendingTemplateLoad()}
}

function previewHtml(draft){
  const body=esc(draft.body||'Digite o texto principal do template.').replace(/\n/g,'<br>');
  const buttons=[draft.urlText,draft.quickReplies].flatMap(value=>Array.isArray(value)?value:[value]).filter(Boolean);
  return `<div class="marketing-template-preview-card">${draft.header?`<strong>${esc(draft.header)}</strong>`:''}<p>${body}</p>${draft.footer?`<small>${esc(draft.footer)}</small>`:''}${buttons.length?`<div class="marketing-template-preview-buttons">${buttons.map(value=>`<span>${esc(value)}</span>`).join('')}</div>`:''}</div>`;
}

function draftFromForm(form){
  const name=String(form.querySelector('[name="name"]')?.value||'').trim();
  const language=String(form.querySelector('[name="language"]')?.value||'pt_BR').trim();
  const category=String(form.querySelector('[name="category"]')?.value||'MARKETING').trim();
  const header=String(form.querySelector('[name="header"]')?.value||'').trim();
  const body=String(form.querySelector('[name="body"]')?.value||'').trim();
  const footer=String(form.querySelector('[name="footer"]')?.value||'').trim();
  const urlText=String(form.querySelector('[name="url_text"]')?.value||'').trim();
  const url=String(form.querySelector('[name="url"]')?.value||'').trim();
  const quickReplies=String(form.querySelector('[name="quick_replies"]')?.value||'').split('\n').map(value=>value.trim()).filter(Boolean).slice(0,5);
  const exampleValues=String(form.querySelector('[name="body_examples"]')?.value||'').split('|').map(value=>value.trim()).filter(Boolean);
  const components=[];
  if(header)components.push({type:'HEADER',format:'TEXT',text:header});
  const bodyComponent={type:'BODY',text:body};
  const placeholders=[...body.matchAll(/\{\{(\d+)\}\}/g)].map(match=>Number(match[1])).filter(Number.isFinite);
  if(placeholders.length&&exampleValues.length)bodyComponent.example={body_text:[exampleValues]};
  components.push(bodyComponent);
  if(footer)components.push({type:'FOOTER',text:footer});
  const buttons=[];
  if(urlText&&url)buttons.push({type:'URL',text:urlText,url});
  for(const text of quickReplies)buttons.push({type:'QUICK_REPLY',text});
  if(buttons.length)components.push({type:'BUTTONS',buttons});
  return {draft:{name,language,category,components},view:{header,body,footer,urlText,quickReplies}};
}

function openDialog(title,content){
  const dialog=document.createElement('dialog');
  dialog.className='marketing-template-dialog';
  dialog.innerHTML=`<div class="marketing-template-dialog-head"><strong>${esc(title)}</strong><button type="button" data-close aria-label="Fechar">×</button></div><div class="marketing-template-dialog-body">${content}</div>`;
  document.body.appendChild(dialog);
  dialog.querySelector('[data-close]')?.addEventListener('click',()=>{dialog.close();dialog.remove()});
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.showModal();
  return dialog;
}

function builderMarkup(item,mode){
  const components=Array.isArray(item?.components)?item.components:[];
  const buttons=templateButtons(components),urlButton=buttons.find(button=>String(button?.type||'').toUpperCase()==='URL'),quickReplies=buttons.filter(button=>String(button?.type||'').toUpperCase()==='QUICK_REPLY');
  return `<form data-template-builder data-mode="${mode}" data-template-id="${esc(item?.id||'')}">
    <div class="marketing-template-form-grid">
      <label><span>Canal</span><select name="channel" ${mode==='edit'?'disabled':''}>${CHANNELS.map(channel=>`<option value="${channel}" ${channel===activeChannel?'selected':''}>${channel}</option>`).join('')}</select></label>
      <label><span>Nome</span><input name="name" maxlength="512" value="${esc(item?.name||'')}" required ${mode==='edit'?'readonly':''}></label>
      <label><span>Idioma</span><input name="language" value="${esc(item?.language||'pt_BR')}" required></label>
      <label><span>Categoria</span><select name="category"><option value="MARKETING" ${String(item?.category||'MARKETING').toUpperCase()==='MARKETING'?'selected':''}>MARKETING</option><option value="UTILITY" ${String(item?.category||'').toUpperCase()==='UTILITY'?'selected':''}>UTILITY</option></select></label>
      <label class="wide"><span>Cabeçalho de texto (opcional)</span><input name="header" maxlength="60" value="${esc(templateHeader(components))}"></label>
      <label class="wide"><span>Corpo</span><textarea name="body" maxlength="1024" required>${esc(templateBody(components))}</textarea></label>
      <label class="wide"><span>Exemplos das variáveis do corpo</span><input name="body_examples" placeholder="Maria | Outubro" value=""></label>
      <label class="wide"><span>Rodapé (opcional)</span><input name="footer" maxlength="60" value="${esc(templateFooter(components))}"></label>
      <label><span>Texto do botão URL</span><input name="url_text" maxlength="25" value="${esc(urlButton?.text||'')}"></label>
      <label><span>URL HTTPS</span><input name="url" type="url" value="${esc(urlButton?.url||'')}"></label>
      <label class="wide"><span>Quick replies (uma por linha)</span><textarea name="quick_replies" maxlength="300">${esc(quickReplies.map(button=>button.text).join('\n'))}</textarea></label>
    </div>
    <div class="marketing-template-preview"><strong>Prévia</strong><div data-template-preview></div></div>
    <div class="marketing-template-dialog-actions"><span data-template-form-status></span><button type="button" data-cancel>Cancelar</button><button type="submit" class="primary">${mode==='edit'?'Salvar alterações':'Criar template'}</button></div>
  </form>`;
}

function openBuilder(mode='create',id=null){
  const item=mode==='edit'?templates.find(row=>String(row.id)===String(id)):null;
  if(mode==='edit'&&!item)return;
  const dialog=openDialog(mode==='edit'?`Editar ${item.name}`:'Criar template',builderMarkup(item,mode));
  const form=dialog.querySelector('[data-template-builder]');
  const updatePreview=()=>{const {view}=draftFromForm(form);form.querySelector('[data-template-preview]').innerHTML=previewHtml(view)};
  form.addEventListener('input',updatePreview);updatePreview();
  form.querySelector('[data-cancel]')?.addEventListener('click',()=>dialog.close());
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const status=form.querySelector('[data-template-form-status]');
    try{
      busy=true;if(status)status.textContent='Salvando…';
      const {draft}=draftFromForm(form);
      if(mode==='create'){
        const channel=String(form.querySelector('[name="channel"]')?.value||activeChannel),accounts=await ensureAccounts(),account=accounts[channel];
        if(!account?.id)throw new Error('account_not_found');
        const data=await adminPost(TEMPLATE_API,'create',{account_id:account.id,draft});
        activeChannel=channel;templates=Array.isArray(data.items)?data.items:templates;
      }else{
        const data=await adminPost(TEMPLATE_API,'edit',{template_id:item.id,draft});
        templates=Array.isArray(data.items)?data.items:templates;
      }
      templatesLoaded=true;dialog.close();renderList(currentRoot);notify('Template salvo e sincronização solicitada.','success');
    }catch(error){if(status)status.textContent=`Erro: ${String(error?.message||error)}`}
    finally{busy=false;drainPendingTemplateLoad()}
  });
}

function openDetail(id){
  const item=templates.find(row=>String(row.id)===String(id));if(!item)return;
  const reason=rejectedReason(item);
  openDialog(item.name,`<div class="marketing-template-detail"><p><strong>Categoria:</strong> ${esc(item.category||'—')}</p><p><strong>Status:</strong> ${esc(item.status||'—')}</p><p><strong>Qualidade:</strong> ${esc(item.quality_rating||'—')}</p><p><strong>Idioma:</strong> ${esc(item.language||'—')}</p><p><strong>Última sincronização:</strong> ${esc(fmtDate(item.last_synced_at))}</p>${reason?`<p><strong>Motivo da rejeição:</strong> ${esc(reason)}</p>`:''}<div class="marketing-template-preview"><strong>Prévia</strong>${previewHtml({header:templateHeader(item.components),body:templateBody(item.components),footer:templateFooter(item.components),quickReplies:templateButtons(item.components).map(button=>button.text).filter(Boolean)})}</div></div>`);
}

async function removeTemplate(id){
  const item=templates.find(row=>String(row.id)===String(id));if(!item||busy)return;
  if(String(item.category||'').toUpperCase()==='MARKETING'){
    const options=await lifecycleOptions(item.id);
    return openTemplateLifecycle(options);
  }
  if(!confirm(`Excluir o template "${item.name}" da Meta? Esta ação não envia mensagens, mas altera a WABA.`))return;
  try{busy=true;notify(`Excluindo ${item.name}…`);const data=await adminPost(TEMPLATE_API,'delete',{template_id:item.id});templates=Array.isArray(data.items)?data.items:templates.filter(row=>row.id!==item.id);templatesLoaded=true;renderList(currentRoot);notify('Template excluído e cache sincronizado.','success')}
  catch(error){notify(`Não foi possível excluir: ${String(error?.message||error)}`,'error')}
  finally{busy=false;drainPendingTemplateLoad()}
}

async function openCleanupReview(){
  try{
    const options=await lifecycleOptions();
    await openTemplateLifecycle(options);
  }catch(error){notify(`Não foi possível abrir a revisão de limpeza: ${String(error?.message||error)}`,'error')}
}

function bindTemplateView(root){
  bindMarketingNav(root);
  root.querySelector('[data-marketing-view="templates"]')?.addEventListener('click',()=>{});
  root.querySelector('[data-template-channel]')?.addEventListener('change',event=>{activeChannel=String(event.target.value||'0975');setSyncButtonState('idle',activeChannel);templates=[];templatesLoaded=false;renderList(root);loadTemplates({channel:activeChannel}).catch(()=>{})});
  root.querySelector('[data-template-sync]')?.addEventListener('click',()=>loadTemplates({sync:true,channel:activeChannel}));
  root.querySelector('[data-template-cleanup]')?.addEventListener('click',openCleanupReview);
  root.querySelector('[data-template-create]')?.addEventListener('click',()=>openBuilder('create'));
  root.querySelectorAll('[data-template-filter]').forEach(input=>input.addEventListener(input.tagName==='INPUT'?'input':'change',()=>renderList(root)));
}

async function mountTemplateView(root=document.querySelector('#content')){
  if(!root)return;
  currentRoot=root;
  root.innerHTML=`<div class="marketing-template-center">
    <div class="page-head"><div><h1>Marketing</h1><p>Templates oficiais da Meta. Gestão separada de campanhas.</p></div><span class="marketing-campaign-gate">Campanhas desligadas</span></div>
    <div class="marketing-template-subnav" data-marketing-subnav>${marketingNavHtml('templates')}</div>
    <div class="marketing-template-head"><div><h2>Templates Meta</h2><p>Crie, revise e sincronize templates. Esta tela não dispara mensagens.</p></div><div class="marketing-template-head-actions"><button type="button" data-template-sync data-sync-state="idle" aria-busy="false">Sincronizar</button><button type="button" data-template-cleanup>Revisar limpeza</button><button type="button" class="primary" data-template-create>Criar template</button></div></div>
    ${renderFilters(root)}
    <div class="marketing-template-status" data-template-center-status>Carregando somente quando esta aba é aberta…</div>
    <div class="marketing-template-list" data-template-list></div>
  </div>`;
  bindTemplateView(root);
  templates=[];templatesLoaded=false;renderList(root);
  await loadTemplates({channel:activeChannel});
}

function mount(){injectSubviewNav()}

const observer=new MutationObserver(()=>injectSubviewNav());
observer.observe(document.documentElement,{subtree:true,childList:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();

window.DAMarketingTemplateCenter={mount,mountTemplateView};