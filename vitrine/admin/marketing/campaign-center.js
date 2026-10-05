import {attendanceAuthorizedFetch,attendanceJsonApi} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';

const CAMPAIGN_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-marketing-campaigns-v1';
const ADMIN_PUBLIC_KEY=['sb','publishable','tFXHtH0HCXZepVtwgKElIg','DxS76Gu8'].join('_');
const CSS_URL='/vitrine/admin/marketing/campaign-center.css?v=marketing-campaign-v2';
const PREFILL_KEY='da_marketing_campaign_prefill_v1';
const STATUS_LABELS={draft:'Rascunho',ready_for_review:'Pronta para revisão',approved:'Aprovada',scheduled:'Agendada',running:'Em execução',paused:'Pausada',completed:'Concluída',failed:'Falhou',cancelled:'Cancelada'};
const EXECUTION_STATUSES=new Set(['approved','scheduled','running','paused','completed','failed','cancelled']);
let activeRoot=null;
let campaigns=[];
let accounts=[];
let busy=false;
let editorFilters={};
let editorTemplates=[];
let currentCampaign=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmtDate=value=>{if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
const localDateTimeValue=value=>{if(!value)return '';const date=new Date(value);if(Number.isNaN(date.getTime()))return '';const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,16)};
const channelByPhone=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.endsWith('0975')?'0975':digits.endsWith('1018')?'1018':'Outro'};
const objectLike=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);

function ensureCss(){
  if(document.querySelector('link[data-da-marketing-campaign-center]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href=CSS_URL;link.dataset.daMarketingCampaignCenter='1';document.head.appendChild(link);
}

async function apiGet(action,params={}){
  const url=new URL(CAMPAIGN_API);url.searchParams.set('action',action);
  for(const [key,value] of Object.entries(params))if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value));
  const response=await attendanceAuthorizedFetch(url,{method:'GET',headers:{apikey:ADMIN_PUBLIC_KEY},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`campaign_${response.status}`);error.payload=data;throw error}
  return data;
}
async function apiPost(action,body){
  const url=new URL(CAMPAIGN_API);url.searchParams.set('action',action);
  const response=await attendanceAuthorizedFetch(url,{method:'POST',headers:{apikey:ADMIN_PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`campaign_${response.status}`);error.payload=data;throw error}
  return data;
}

function setBusy(button,on,label='Carregando…'){
  if(!button)return;button.disabled=on;button.setAttribute('aria-busy',on?'true':'false');
  if(on){button.dataset.idleLabel=button.dataset.idleLabel||button.textContent;button.textContent=label}
  else if(button.dataset.idleLabel)button.textContent=button.dataset.idleLabel;
}
function notice(root,text,tone='neutral'){const node=root?.querySelector?.('[data-campaign-status]');if(node){node.textContent=text;node.dataset.tone=tone}}

function navMarkup(){
  const item=(key,label)=>`<button type="button" class="${key==='campaigns'?'active':''}" data-marketing-view="${key}">${label}</button>`;
  return `<div class="marketing-template-subnav marketing-campaign-nav" data-marketing-subnav>${item('overview','Visão geral')}${item('templates','Templates Meta')}${item('audiences','Públicos')}${item('campaigns','Campanhas')}${item('consents','Consentimentos')}<span class="marketing-campaign-gate">Campanhas desligadas</span></div>`;
}
async function loadAudience(view,root){
  const module=window.DAMarketingAudienceCenter||await import('/vitrine/admin/marketing/audience-center.js?v=marketing-audience-v1');
  return view==='audiences'?module.mountAudienceView(root):module.mountConsentView(root);
}
function bindNav(root){
  root.querySelector('[data-marketing-view="overview"]')?.addEventListener('click',()=>document.querySelector('[data-tab="marketing"]')?.click());
  root.querySelector('[data-marketing-view="templates"]')?.addEventListener('click',()=>window.DAMarketingTemplateCenter?.mountTemplateView?.(root));
  root.querySelector('[data-marketing-view="audiences"]')?.addEventListener('click',()=>loadAudience('audiences',root));
  root.querySelector('[data-marketing-view="campaigns"]')?.addEventListener('click',()=>mountCampaignView(root));
  root.querySelector('[data-marketing-view="consents"]')?.addEventListener('click',()=>loadAudience('consents',root));
}

async function loadAccounts(){
  if(accounts.length)return accounts;
  const data=await attendanceJsonApi('accounts',{},'GET');
  accounts=(data.items||[]).filter(item=>item?.id&&['0975','1018'].includes(channelByPhone(item.phone_e164)));
  return accounts;
}
async function loadCampaigns(){const data=await apiGet('list');campaigns=Array.isArray(data.items)?data.items:[];return campaigns}
async function loadOptions(accountId){const data=await apiGet('options',{whatsapp_account_id:accountId});editorTemplates=Array.isArray(data.templates)?data.templates:[];return editorTemplates}

function campaignListHtml(){
  if(!campaigns.length)return '<div class="marketing-campaign-empty">Nenhuma campanha ainda.</div>';
  return `<div class="marketing-campaign-list">${campaigns.map(item=>`<button type="button" class="marketing-campaign-card" data-campaign-open="${esc(item.id)}"><span><strong>${esc(item.name||'Campanha')}</strong><small>${esc(item.template_name_snapshot||'Template')} · Revisão ${Number(item.revision||1)}</small></span><span class="marketing-campaign-state state-${esc(item.status)}">${esc(STATUS_LABELS[item.status]||item.status)}</span><small>${esc(item.scheduled_for?`Agendada: ${fmtDate(item.scheduled_for)}`:fmtDate(item.updated_at))}</small></button>`).join('')}</div>`;
}
function renderList(root){const host=root.querySelector('[data-campaign-list]');if(host)host.innerHTML=campaignListHtml();host?.querySelectorAll('[data-campaign-open]').forEach(button=>button.addEventListener('click',()=>openCampaign(root,button.dataset.campaignOpen)))}

function parsePrefill(explicit){
  if(explicit&&objectLike(explicit))return explicit;
  try{const raw=sessionStorage.getItem(PREFILL_KEY);if(!raw)return null;sessionStorage.removeItem(PREFILL_KEY);const value=JSON.parse(raw);return objectLike(value)?value:null}catch{return null}
}
function filterInput(name,label,type='text'){return `<label><span>${label}</span><input name="${name}" type="${type}"></label>`}
function filterFormHtml(){
  return `<div class="marketing-campaign-filters"><h4>Público</h4><p>Use os filtros comerciais. Para filtros avançados de etiquetas/produtos, monte primeiro em <b>Públicos</b> e use “Criar campanha com este público”.</p><div class="marketing-campaign-filter-grid">
    ${filterInput('city','Cidade')}${filterInput('neighborhood','Bairro')}${filterInput('brand','Marca')}${filterInput('category','Categoria')}
    ${filterInput('last_purchase_after','Comprou depois de','date')}${filterInput('last_purchase_before','Comprou antes de','date')}${filterInput('inactive_days','Sem comprar há X dias','number')}${filterInput('min_order_count','Mín. de compras','number')}${filterInput('max_order_count','Máx. de compras','number')}${filterInput('min_lifetime_value','Valor histórico mín.','number')}${filterInput('max_lifetime_value','Valor histórico máx.','number')}
  </div><div data-campaign-advanced-filter-note class="marketing-campaign-note"></div></div>`;
}
function collectVisibleFilters(form){
  const next={...editorFilters};
  for(const name of ['city','neighborhood','brand','category','last_purchase_after','last_purchase_before']){const value=String(form.elements[name]?.value||'').trim();if(value)next[name]=value;else delete next[name]}
  for(const name of ['inactive_days','min_order_count','max_order_count','min_lifetime_value','max_lifetime_value']){const raw=String(form.elements[name]?.value||'').trim();if(raw!=='')next[name]=Number(raw);else delete next[name]}
  return next;
}
function applyFiltersToForm(form,filters){
  editorFilters=objectLike(filters)?structuredClone(filters):{};
  for(const name of ['city','neighborhood','brand','category','last_purchase_after','last_purchase_before','inactive_days','min_order_count','max_order_count','min_lifetime_value','max_lifetime_value'])if(form.elements[name]&&editorFilters[name]!==undefined)form.elements[name].value=editorFilters[name];
  const advanced=Object.keys(editorFilters).filter(key=>!['city','neighborhood','brand','category','last_purchase_after','last_purchase_before','inactive_days','min_order_count','max_order_count','min_lifetime_value','max_lifetime_value'].includes(key));
  const node=form.querySelector('[data-campaign-advanced-filter-note]');if(node)node.textContent=advanced.length?`Filtros avançados preservados: ${advanced.join(', ')}.`:'';
}

function templateBody(template){return String((template?.components||[]).find(component=>String(component?.type||'').toUpperCase()==='BODY')?.text||'')}
function variableIndexes(template){return [...new Set([...templateBody(template).matchAll(/\{\{(\d+)\}\}/g)].map(match=>Number(match[1])).filter(Number.isInteger))].sort((a,b)=>a-b)}
function renderVariableInputs(form,values={}){
  const host=form.querySelector('[data-campaign-variables]');if(!host)return;
  const template=editorTemplates.find(item=>item.id===form.elements.template_id?.value);const indexes=variableIndexes(template);
  host.innerHTML=indexes.length?`<h4>Variáveis</h4><div class="marketing-campaign-variable-grid">${indexes.map(index=>`<label><span>{{${index}}}</span><input data-variable-index="${index}" value="${esc(values?.[index]??values?.[String(index)]??'')}"></label>`).join('')}</div>`:'<h4>Variáveis</h4><p class="marketing-campaign-note">Este template não possui variáveis no corpo.</p>';
  renderPreview(form);
}
function collectVariables(form){const values={};form.querySelectorAll('[data-variable-index]').forEach(input=>{const value=String(input.value||'').trim();if(value)values[input.dataset.variableIndex]=value});return values}
function renderPreview(form){
  const host=form.querySelector('[data-campaign-preview]');if(!host)return;
  const template=editorTemplates.find(item=>item.id===form.elements.template_id?.value);let body=templateBody(template)||'Selecione um template MARKETING aprovado.';const values=collectVariables(form);
  for(const [index,value] of Object.entries(values))body=body.replaceAll(`{{${index}}}`,value);
  host.innerHTML=`<h4>Prévia</h4><div class="marketing-campaign-preview-card"><strong>${esc(template?.name||'Template')}</strong><p>${esc(body).replace(/\n/g,'<br>')}</p></div>`;
}
function collectDeepLink(form){const slug=String(form.elements.deep_campaign?.value||'').trim(),category=String(form.elements.deep_category?.value||'').trim(),brand=String(form.elements.deep_brand?.value||'').trim();const value={};if(slug)value.campaign=slug;if(category)value.category=category;if(brand)value.brand=brand;return value}

function editorHtml(){
  return `<form class="marketing-campaign-editor" data-campaign-editor><div class="marketing-campaign-editor-head"><div><h3 data-campaign-editor-title>Novo rascunho</h3><p data-campaign-editor-meta>Revisão 1</p></div><span class="marketing-campaign-state state-draft" data-campaign-editor-state>Rascunho</span></div>
    <div class="marketing-campaign-grid"><label><span>Nome da campanha</span><input name="name" required maxlength="160"></label><label><span>Canal</span><select name="whatsapp_account_id" required></select></label><label class="wide"><span>Template</span><select name="template_id" required><option value="">Selecione o canal primeiro</option></select></label></div>
    ${filterFormHtml()}
    <section data-campaign-variables><h4>Variáveis</h4></section>
    <section class="marketing-campaign-deep"><h4>Deep link</h4><div class="marketing-campaign-grid"><label><span>Campanha/slug</span><input name="deep_campaign"></label><label><span>Categoria</span><input name="deep_category"></label><label><span>Marca</span><input name="deep_brand"></label></div></section>
    <section data-campaign-preview><h4>Prévia</h4></section>
    <section data-campaign-snapshot></section>
    <section data-campaign-summary><h4>Resumo</h4><p>Salve o rascunho para gerar um snapshot versionado do público.</p></section>
    <section data-campaign-execution class="marketing-campaign-execution" hidden></section>
    <div data-campaign-status class="marketing-campaign-status" role="status" aria-live="polite"></div>
    <div class="marketing-campaign-actions"><button type="button" data-campaign-close>Fechar</button><button type="submit" class="primary" data-campaign-save aria-busy="false">Salvar rascunho</button><button type="button" data-campaign-snapshot-button aria-busy="false" hidden>Gerar snapshot</button><button type="button" data-campaign-ready hidden>Pronta para revisão</button><button type="button" data-campaign-return-draft hidden>Voltar para rascunho</button><button type="button" data-campaign-approve hidden>Aprovar revisão</button><button type="button" data-campaign-internal-test hidden>Preparar teste interno</button></div>
    <p class="marketing-campaign-safety">Campanhas desligadas — Nenhuma mensagem será enviada nesta fase.</p>
  </form>`;
}

async function populateAccounts(form,selectedId=''){
  await loadAccounts();const select=form.elements.whatsapp_account_id;select.innerHTML='<option value="">Selecione</option>'+accounts.map(account=>`<option value="${esc(account.id)}">${esc(channelByPhone(account.phone_e164))} · ${esc(account.display_name||'WhatsApp')}</option>`).join('');if(selectedId)select.value=selectedId;
}
async function populateTemplates(form,accountId,selectedId='',variableValues={}){
  const select=form.elements.template_id;select.innerHTML='<option value="">Carregando templates…</option>';editorTemplates=[];
  if(!accountId){select.innerHTML='<option value="">Selecione o canal primeiro</option>';renderVariableInputs(form,{});return}
  try{await loadOptions(accountId);select.innerHTML='<option value="">Selecione</option>'+editorTemplates.map(item=>`<option value="${esc(item.id)}">${esc(item.name)} · ${esc(item.language)}</option>`).join('');if(selectedId)select.value=selectedId;renderVariableInputs(form,variableValues)}catch(error){select.innerHTML='<option value="">Falha ao carregar templates</option>';notice(form,`Não foi possível carregar templates: ${String(error?.message||error)}`,'error')}
}
function snapshotHtml(snapshot){
  if(!snapshot)return '<h4>Resumo</h4><p>Nenhum snapshot criado para esta revisão.</p>';
  return `<h4>Resumo</h4><div class="marketing-campaign-snapshot"><article><small>Clientes no público</small><strong>${Number(snapshot.found_count||0)}</strong></article><article><small>Verificações técnicas · aptos</small><strong>${Number(snapshot.eligible_count||0)}</strong></article><article><small>Com pendência técnica</small><strong>${Number(snapshot.excluded_count||0)}</strong></article><p>Versão do snapshot ${Number(snapshot.snapshot_version||1)} · Revisão ${Number(snapshot.campaign_revision||1)} · ${esc(fmtDate(snapshot.created_at))}</p></div>`;
}
function syncEditorState(form,campaign,snapshot){
  const status=campaign?.status||'draft',revision=Number(campaign?.revision||1);form.querySelector('[data-campaign-editor-title]').textContent=campaign?.name||'Novo rascunho';form.querySelector('[data-campaign-editor-meta]').textContent=`Revisão ${revision}`;const badge=form.querySelector('[data-campaign-editor-state]');badge.textContent=STATUS_LABELS[status]||status;badge.className=`marketing-campaign-state state-${status}`;
  const locked=status!=='draft';form.querySelectorAll('input,select').forEach(control=>control.disabled=locked);form.querySelector('[data-campaign-save]').hidden=locked;form.querySelector('[data-campaign-snapshot-button]').hidden=!campaign?.id||locked;form.querySelector('[data-campaign-ready]').hidden=!campaign?.id||locked||!snapshot;form.querySelector('[data-campaign-return-draft]').hidden=status!=='ready_for_review';form.querySelector('[data-campaign-approve]').hidden=status!=='ready_for_review';form.querySelector('[data-campaign-internal-test]').hidden=!campaign?.id;
  form.querySelector('[data-campaign-summary]').innerHTML=snapshotHtml(snapshot);
  if(snapshot&&campaign&&snapshot.campaign_revision!==campaign.revision){form.querySelector('[data-campaign-summary]').insertAdjacentHTML('afterbegin','<div class="marketing-campaign-warning">A campanha mudou. Gere um novo snapshot para esta revisão.</div>')}
}

function executionGateOpen(state){const runtime=state?.runtime||{};return runtime.campaigns_enabled===true&&runtime.send_enabled===true&&runtime.outbound_provider==='meta'&&['canary','live'].includes(runtime.mode)}
function progressCard(label,value,key){return `<article data-execution-count="${key}"><small>${label}</small><strong>${Number(value||0)}</strong></article>`}
function executionPanelHtml(state,campaign){
  const status=state?.status||campaign?.status||'approved',runtime=state?.runtime||{},counts=state?.counts||{},gateOpen=executionGateOpen(state),scheduled=state?.scheduled_for||campaign?.scheduled_for||'';
  const canSchedule=status==='approved',canPause=['scheduled','running'].includes(status),canResume=status==='paused',canCancel=['scheduled','running','paused'].includes(status);
  const gateLabel=gateOpen?(runtime.mode==='canary'?'Canário habilitado':'Campanhas habilitadas'):'Campanhas desligadas';
  const gateDetail=gateOpen?`Runtime ${esc(runtime.mode)} · envio controlado pelo backend.`:`Runtime ${esc(runtime.mode||'off')} · campaigns_enabled=${runtime.campaigns_enabled===true?'true':'false'}. Nenhuma mensagem pode iniciar.`;
  return `<div class="marketing-campaign-execution-head"><div><h4>Execução</h4><p>Status: <b>${esc(STATUS_LABELS[status]||status)}</b>${scheduled?` · ${esc(fmtDate(scheduled))}`:''}</p></div><span class="marketing-campaign-execution-gate ${gateOpen?'open':'closed'}">${esc(gateLabel)}</span></div>
    <p class="marketing-campaign-execution-gate-detail">${gateDetail}</p>
    <div class="marketing-campaign-execution-counts">${progressCard('Total',counts.total,'total')}${progressCard('Pendentes',counts.pending,'pending')}${progressCard('Pulados',counts.skipped,'skipped')}${progressCard('Aceitos',counts.accepted,'accepted')}${progressCard('Retry',counts.retry,'retry')}${progressCard('Incertos',counts.uncertain,'uncertain')}${progressCard('Falhas',counts.failed,'failed')}</div>
    <div class="marketing-campaign-execution-controls">
      ${canSchedule?`<label><span>Data e hora</span><input type="datetime-local" data-campaign-schedule-at value="${esc(localDateTimeValue(scheduled))}" ${gateOpen?'':'disabled'}></label><button type="button" data-campaign-schedule ${gateOpen?'':'disabled'}>Agendar</button><button type="button" class="primary" data-campaign-start-now ${gateOpen?'':'disabled'}>Enviar agora</button>`:''}
      ${canPause?'<button type="button" data-campaign-pause>Pausar</button>':''}
      ${canResume?`<button type="button" data-campaign-resume ${gateOpen?'':'disabled'}>Retomar</button>`:''}
      ${canCancel?'<button type="button" class="danger" data-campaign-cancel-execution>Cancelar execução</button>':''}
    </div>`;
}
async function runExecutionAction(root,form,action,body,question,busyLabel){
  if(!currentCampaign?.id||busy)return;if(question&&!confirm(question))return;const button=form.querySelector(`[data-campaign-${action.replaceAll('_','-')}]`);
  try{busy=true;setBusy(button,true,busyLabel);await apiPost(action,body);await loadCampaigns();renderList(root);await openCampaign(root,currentCampaign.id)}catch(error){notice(form,`Não foi possível executar a ação: ${String(error?.message||error)}`,'error')}finally{busy=false;setBusy(button,false)}
}
function bindExecutionActions(root,form,state){
  const gateOpen=executionGateOpen(state),campaignId=currentCampaign?.id,revision=currentCampaign?.revision;if(!campaignId)return;
  form.querySelector('[data-campaign-schedule]')?.addEventListener('click',()=>{if(!gateOpen)return;const value=form.querySelector('[data-campaign-schedule-at]')?.value;if(!value){notice(form,'Informe a data e hora do agendamento.','error');return}const date=new Date(value);if(Number.isNaN(date.getTime())){notice(form,'Data/hora inválida.','error');return}runExecutionAction(root,form,'schedule',{campaign_id:campaignId,expected_revision:revision,scheduled_for:date.toISOString()},'Confirmar o agendamento desta campanha?','Agendando…')});
  form.querySelector('[data-campaign-start-now]')?.addEventListener('click',()=>{if(!gateOpen)return;runExecutionAction(root,form,'start_now',{campaign_id:campaignId,expected_revision:revision},'Confirmar início desta campanha agora?','Iniciando…')});
  form.querySelector('[data-campaign-pause]')?.addEventListener('click',()=>runExecutionAction(root,form,'pause',{campaign_id:campaignId,reason:'admin_marketing_ui'},'Pausar a execução desta campanha?','Pausando…'));
  form.querySelector('[data-campaign-resume]')?.addEventListener('click',()=>{if(!gateOpen)return;runExecutionAction(root,form,'resume',{campaign_id:campaignId},'Retomar a execução desta campanha?','Retomando…')});
  form.querySelector('[data-campaign-cancel-execution]')?.addEventListener('click',()=>runExecutionAction(root,form,'cancel_execution',{campaign_id:campaignId,reason:'admin_marketing_ui'},'Cancelar esta execução? Destinatários ainda não enviados serão pulados.','Cancelando…'));
}
async function renderExecutionPanel(root,form,campaign){
  const host=form.querySelector('[data-campaign-execution]');if(!host)return;if(!campaign?.id||!EXECUTION_STATUSES.has(campaign.status)){host.hidden=true;host.innerHTML='';return}
  host.hidden=false;host.innerHTML='<div class="marketing-campaign-loading">Carregando estado de execução…</div>';
  try{const state=await apiGet('execution_status',{campaign_id:campaign.id});if(currentCampaign?.id!==campaign.id)return;host.innerHTML=executionPanelHtml(state,campaign);bindExecutionActions(root,form,state)}catch(error){host.innerHTML=`<div class="marketing-campaign-warning"><b>Execução ainda indisponível nesta implantação.</b><br>${esc(error?.message||error)}. Campanhas desligadas.</div>`}
}

async function openEditor(root,{detail=null,prefill=null}={}){
  const host=root.querySelector('[data-campaign-workspace]');if(!host)return;host.innerHTML=editorHtml();const form=host.querySelector('[data-campaign-editor]');currentCampaign=detail?.campaign||null;
  await populateAccounts(form,currentCampaign?.whatsapp_account_id||'');
  const filters=currentCampaign?.filters||prefill?.filters||{};applyFiltersToForm(form,filters);
  if(currentCampaign){form.elements.name.value=currentCampaign.name||'';form.elements.deep_campaign.value=currentCampaign.deep_link?.campaign||'';form.elements.deep_category.value=currentCampaign.deep_link?.category||'';form.elements.deep_brand.value=currentCampaign.deep_link?.brand||'';await populateTemplates(form,currentCampaign.whatsapp_account_id,currentCampaign.template_id,currentCampaign.variable_values||{})}
  else{const first=accounts[0]?.id||'';if(first){form.elements.whatsapp_account_id.value=first;await populateTemplates(form,first,'',{})}}
  syncEditorState(form,currentCampaign,detail?.snapshot||null);
  await renderExecutionPanel(root,form,currentCampaign);
  form.elements.whatsapp_account_id.addEventListener('change',()=>populateTemplates(form,form.elements.whatsapp_account_id.value,'',{}));
  form.elements.template_id.addEventListener('change',()=>renderVariableInputs(form,{}));
  form.addEventListener('input',event=>{if(event.target.matches('[data-variable-index], [name="template_id"]'))renderPreview(form)});
  form.querySelector('[data-campaign-close]').addEventListener('click',()=>{host.innerHTML='';currentCampaign=null});
  form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const button=form.querySelector('[data-campaign-save]');try{busy=true;setBusy(button,true,'Salvando…');const filters=collectVisibleFilters(form),variable_values=collectVariables(form),deep_link=collectDeepLink(form);let response;if(currentCampaign?.id){response=await apiPost('update_draft',{campaign_id:currentCampaign.id,expected_revision:currentCampaign.revision,patch:{name:String(form.elements.name.value||'').trim(),whatsapp_account_id:form.elements.whatsapp_account_id.value,template_id:form.elements.template_id.value,filters,variable_values,deep_link}})}else{response=await apiPost('create',{name:String(form.elements.name.value||'').trim(),whatsapp_account_id:form.elements.whatsapp_account_id.value,template_id:form.elements.template_id.value,filters,variable_values,deep_link,idempotency_key:`admin-${crypto.randomUUID()}`})}await loadCampaigns();renderList(root);const id=response.campaign_id||currentCampaign?.id;await openCampaign(root,id);notice(root,'Rascunho salvo.','success')}catch(error){notice(form,`Não foi possível salvar: ${String(error?.message||error)}`,'error')}finally{busy=false;setBusy(button,false)}});
  form.querySelector('[data-campaign-snapshot-button]').addEventListener('click',async()=>{if(!currentCampaign?.id||busy)return;const button=form.querySelector('[data-campaign-snapshot-button]');try{busy=true;setBusy(button,true,'Congelando público…');await apiPost('create_snapshot',{campaign_id:currentCampaign.id,expected_revision:currentCampaign.revision,idempotency_key:`admin:${currentCampaign.id}:r${currentCampaign.revision}`});await openCampaign(root,currentCampaign.id);notice(root,'Snapshot criado para esta revisão.','success')}catch(error){notice(form,`Falha ao gerar snapshot: ${String(error?.message||error)}`,'error')}finally{busy=false;setBusy(button,false)}});
  const transition=async(toStatus,question)=>{if(!currentCampaign?.id||busy||!confirm(question))return;try{busy=true;await apiPost('transition',{campaign_id:currentCampaign.id,expected_revision:currentCampaign.revision,to_status:toStatus,reason:'admin_marketing_ui'});await loadCampaigns();renderList(root);await openCampaign(root,currentCampaign.id)}catch(error){notice(form,`Não foi possível alterar o estado: ${String(error?.message||error)}`,'error')}finally{busy=false}};
  form.querySelector('[data-campaign-ready]').addEventListener('click',()=>transition('ready_for_review','Confirmar que este rascunho está pronto para revisão?'));
  form.querySelector('[data-campaign-return-draft]').addEventListener('click',()=>transition('draft','Voltar esta campanha para rascunho? Uma alteração relevante exigirá novo snapshot.'));
  form.querySelector('[data-campaign-approve]').addEventListener('click',()=>transition('approved','Aprovar administrativamente esta revisão? Campanhas continuam desligadas.'));
  form.querySelector('[data-campaign-internal-test]').addEventListener('click',async()=>{if(!currentCampaign?.id||busy)return;const button=form.querySelector('[data-campaign-internal-test]');try{busy=true;setBusy(button,true,'Preparando…');const result=await apiPost('prepare_internal_test',{campaign_id:currentCampaign.id,expected_revision:currentCampaign.revision});notice(form,`${result.message||'Nenhuma mensagem será enviada nesta fase.'} Canais internos: ${(result.canary_channels||[]).map(item=>item.channel).join(', ')||'—'}.`,'success')}catch(error){notice(form,`Falha ao preparar teste interno: ${String(error?.message||error)}`,'error')}finally{busy=false;setBusy(button,false)}});
}
async function openCampaign(root,id){try{const detail=await apiGet('detail',{campaign_id:id});await openEditor(root,{detail})}catch(error){notice(root,`Não foi possível abrir a campanha: ${String(error?.message||error)}`,'error')}}

async function mountCampaignView(root=document.querySelector('#content'),options={}){
  if(!root)return;ensureCss();activeRoot=root;const prefill=options.prefill||parsePrefill();
  root.innerHTML=`<div class="marketing-campaign-center"><div class="page-head"><div><h1>Marketing</h1><p>Crie, revise e acompanhe campanhas. O envio continua protegido por dois gates server-side.</p></div><span class="marketing-campaign-gate">Campanhas desligadas</span></div>${navMarkup()}<section class="marketing-campaign-section"><div class="marketing-campaign-section-head"><div><h2>Campanhas</h2><p>Rascunhos, snapshots, revisão, agendamento e execução controlada.</p></div><button type="button" class="primary" data-new-campaign>Novo rascunho</button></div><div data-campaign-status class="marketing-campaign-status" role="status" aria-live="polite"></div><div data-campaign-list class="marketing-campaign-loading">Carregando campanhas…</div><div data-campaign-workspace></div></section></div>`;
  bindNav(root);root.querySelector('[data-new-campaign]').addEventListener('click',()=>openEditor(root,{prefill:null}));
  try{await Promise.all([loadAccounts(),loadCampaigns()]);if(activeRoot!==root)return;renderList(root);if(prefill)await openEditor(root,{prefill})}catch(error){if(activeRoot===root)root.querySelector('[data-campaign-list]').innerHTML=`<div class="marketing-campaign-error">Não foi possível carregar: ${esc(error?.message||error)}</div>`}
}

ensureCss();
window.DAMarketingCampaignCenter={mountCampaignView};
export {mountCampaignView};
