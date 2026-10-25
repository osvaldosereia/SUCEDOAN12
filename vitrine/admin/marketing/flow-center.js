import {attendanceAuthorizedFetch} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';

const FLOW_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-templates-v1';
const ADMIN_PUBLIC_KEY=['sb','publishable','tFXHtH0HCXZepVtwgKElIg','DxS76Gu8'].join('_');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let rootNode=null;
let flowItems=[];
let activeFlowId='';
let canManage=false;
let busy=false;
async function bounded(promise,ms=17000){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout_marketing_flow_api')),ms)})])}
  finally{clearTimeout(timer)}
}

function navHtml(active='flows'){
  const button=(key,label)=>'<button type="button" class="'+(key===active?'active':'')+'" data-marketing-view="'+key+'">'+label+'</button>';
  return button('overview','Visão geral')+button('templates','Templates Meta')+button('flows','Flows Meta')+button('audiences','Públicos')+button('consents','Consentimentos')+'<span class="marketing-campaign-gate">Campanhas desligadas</span>';
}
function bindNav(node){
  node.querySelector('[data-marketing-view="overview"]')?.addEventListener('click',()=>document.querySelector('[data-tab="marketing"]')?.click());
  node.querySelector('[data-marketing-view="templates"]')?.addEventListener('click',async()=>{const mod=await import('/vitrine/admin/marketing/template-center.js?v=marketing-flow-center-20261024');await mod.mountTemplateView?.(rootNode)});
  node.querySelector('[data-marketing-view="flows"]')?.addEventListener('click',()=>mountFlowView(rootNode));
  node.querySelector('[data-marketing-view="audiences"]')?.addEventListener('click',async()=>{const mod=await import('/vitrine/admin/marketing/audience-center.js?v=marketing-audience-v1');await mod.mountAudienceView?.(rootNode)});
  node.querySelector('[data-marketing-view="consents"]')?.addEventListener('click',async()=>{const mod=await import('/vitrine/admin/marketing/audience-center.js?v=marketing-audience-v1');await mod.mountConsentView?.(rootNode)});
}
async function apiGet(action,params={}){
  const url=new URL(FLOW_API);url.searchParams.set('action',action);
  for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));
  const response=await bounded(attendanceAuthorizedFetch(url,{method:'GET',headers:{apikey:ADMIN_PUBLIC_KEY},cache:'no-store'}));
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data?.error||'flow_request_failed');error.payload=data;throw error}
  return data;
}
async function apiPost(action,body={}){
  const url=new URL(FLOW_API);url.searchParams.set('action',action);
  const response=await bounded(attendanceAuthorizedFetch(url,{method:'POST',headers:{apikey:ADMIN_PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'}),45000);
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||'flow_request_failed');error.payload=data;throw error}
  return data;
}
function setStatus(message,tone='neutral'){
  const node=rootNode?.querySelector('[data-flow-status]');
  if(node){node.textContent=String(message||'');node.dataset.tone=tone}
}
function setBusy(value){
  busy=Boolean(value);
  const selected=flowItems.find(flow=>flow.id===activeFlowId);
  const isDraft=String(selected?.status||'').toUpperCase()==='DRAFT';
  rootNode?.querySelectorAll('[data-flow-action]').forEach(button=>{
    const action=button.dataset.flowAction;
    const ownerAction=['create','register-key','configure','publish','delete','send-canary'].includes(action);
    const draftAction=['configure','publish','delete','send-canary'].includes(action);
    button.disabled=busy||(ownerAction&&!canManage)||(draftAction&&!isDraft);
  });
  rootNode?.querySelectorAll('[data-flow-json]').forEach(input=>{input.disabled=busy||!canManage||!isDraft});
}
function formatValidation(errors){
  if(!Array.isArray(errors))return '<p class="flow-validation-unknown">A Meta ainda não forneceu relatório de validação.</p>';
  if(!errors.length)return '<p class="flow-validation-ok">Meta não reportou erros de validação.</p>';
  return '<ol class="flow-validation-errors">'+errors.map(item=>'<li><strong>'+esc(item.error_code||item.error_type||'Validação')+'</strong> '+esc(item.message)+(item.screen?' <small>tela '+esc(item.screen)+'</small>':'')+(item.line!==null&&item.line!==undefined?' <small>linha '+esc(item.line)+'</small>':'')+'</li>').join('')+'</ol>';
}
function renderReadiness(data){
  canManage=data?.can_manage===true;
  const checks=data?.checks||{};
  const labels={meta_token:'Token da Meta no servidor',graph_version:'Versão Graph configurada',account:'Conta comercial 1018',endpoint:'URL fixa do endpoint',private_key:'Chave privada cadastrada',public_key_registered:'Chave pública registrada na Meta',public_key_matches_private:'Chave pública corresponde à privada',meta_app_secret:'Segredo do app cadastrado'};
  const target=rootNode?.querySelector('[data-flow-readiness]');
  if(target)target.innerHTML='<div class="flow-readiness-grid">'+Object.entries(labels).map(([key,label])=>'<div class="flow-check '+(checks[key]?'is-ready':'is-missing')+'"><span aria-hidden="true">'+(checks[key]?'✓':'•')+'</span><strong>'+esc(label)+'</strong><em>'+(checks[key]?'Pronto':'Pendente')+'</em></div>').join('')+'</div><p class="flow-endpoint"><strong>Endpoint fixo:</strong> <code>'+esc(data?.flow_endpoint_url||'URL ainda não disponível')+'</code></p><p class="flow-role">'+(canManage?'Sessão com permissão para gerenciar Flows.':'Leitura disponível; ações de gestão exigem perfil proprietário.')+'</p>';
  setBusy(false);
}
function renderFlowList(){
  const target=rootNode?.querySelector('[data-flow-list]');
  if(!target)return;
  if(!flowItems.length){target.innerHTML='<p class="flow-empty">Nenhum Flow foi retornado para a conta 1018.</p>';return}
  target.innerHTML=flowItems.map(flow=>'<button type="button" class="flow-list-item '+(flow.id===activeFlowId?'active':'')+'" data-flow-id="'+esc(flow.id)+'"><span><strong>'+esc(flow.name||'Flow sem nome')+'</strong><small>ID '+esc(flow.id)+'</small></span><em>'+esc(flow.status||'UNKNOWN')+'</em><small>'+(!Array.isArray(flow.validation_errors)?'Validação pendente':flow.validation_errors.length?flow.validation_errors.length+' erro(s) Meta':'Sem erros reportados')+'</small></button>').join('');
  target.querySelectorAll('[data-flow-id]').forEach(button=>button.addEventListener('click',()=>loadFlowDetail(button.dataset.flowId)));
}
function renderFlowDetail(flow){
  activeFlowId=String(flow?.id||'');
  const isDraft=String(flow?.status||'').toUpperCase()==='DRAFT';
  const target=rootNode?.querySelector('[data-flow-detail]');
  if(!target)return;
  if(!flow){target.innerHTML='<p class="flow-empty">Selecione um Flow para ver o estado, os erros da Meta e as ações disponíveis.</p>';renderFlowList();return}
  target.innerHTML='<div class="flow-detail-head"><div><h3>'+esc(flow.name||'Flow')+'</h3><p>ID <code>'+esc(flow.id)+'</code> · Estado <strong>'+esc(flow.status||'UNKNOWN')+'</strong></p></div><span>'+esc(flow.health_status||'Saúde não informada')+'</span></div><p><strong>Endpoint:</strong> <code>'+esc(flow.endpoint_uri||'Não configurado')+'</code></p><h4>Relatório de validação da Meta</h4>'+formatValidation(flow.validation_errors)+'<div class="flow-actions"><label class="flow-upload">Enviar JSON e validar na Meta<input type="file" data-flow-json accept=\"application/json,.json\" '+(canManage&&isDraft?'':'disabled')+'></label><button type="button" data-flow-action="configure">Configurar endpoint</button><button type="button" data-flow-action="validate">Recarregar relatório da Meta</button><button type="button" data-flow-action="send-canary">Testar rascunho no 8360</button><button type="button" data-flow-action="publish" class="primary">Publicar Flow</button><button type="button" data-flow-action="delete" class="danger">Excluir rascunho</button></div><p class="flow-publish-note">Teste interno restrito ao 8360. O remetente é fixo na conta 1018 e o destino não pode ser alterado. A Meta só recebe o envio depois de validação limpa, endpoint e chaves prontos.</p><p class="flow-publish-note">A publicação é irreversível na Meta. O Vitrine Admin só libera essa ação quando o Flow está em rascunho, o relatório oficial está limpo, o endpoint corresponde à URL fixa e a chave e os segredos do endpoint estão prontos.</p>';
  renderFlowList();
  target.querySelector('[data-flow-json]')?.addEventListener('change',handleJsonUpload);
  target.querySelector('[data-flow-action="configure"]')?.addEventListener('click',()=>runAction('flow_configure_endpoint',{flow_id:activeFlowId},'Endpoint fixo configurado na Meta.'));
  target.querySelector('[data-flow-action="validate"]')?.addEventListener('click',()=>runAction('flow_validate',null,'Relatório da Meta atualizado.'));
  target.querySelector('[data-flow-action="send-canary"]')?.addEventListener('click',()=>sendCanaryActiveFlow());
  target.querySelector('[data-flow-action="publish"]')?.addEventListener('click',()=>publishActiveFlow());
  target.querySelector('[data-flow-action="delete"]')?.addEventListener('click',()=>deleteActiveFlow());
}
async function loadFlowDetail(id){
  if(!id)return;
  activeFlowId=String(id);
  setBusy(true);
  try{const data=await apiGet('flow_detail',{flow_id:activeFlowId});renderFlowDetail(data.flow);setStatus('Estado e relatório carregados da Meta.','success')}
  catch(error){setStatus('Não foi possível abrir o Flow: '+String(error.message||error),'error')}
  finally{setBusy(false)}
}
async function refreshAll(){
  setBusy(true);
  try{
    const readiness=await apiGet('flow_readiness');renderReadiness(readiness);
    const data=await apiGet('flow_list');flowItems=Array.isArray(data.items)?data.items:[];canManage=data.can_manage===true;renderFlowList();
    const selected=flowItems.find(flow=>flow.id===activeFlowId)||flowItems[0];
    if(selected)await loadFlowDetail(selected.id);else renderFlowDetail(null);
    setStatus(data.truncated?'A lista excede o limite de páginas consultadas e está incompleta.':'Conexão com a Meta carregada para a conta 1018.','success');
  }catch(error){setStatus('Não foi possível carregar Flows da Meta: '+String(error.message||error),'error')}
  finally{setBusy(false)}
}
async function runAction(action,body,message){
  if(busy)return;
  setBusy(true);
  try{
    let data;
    if(action==='flow_validate')data=await apiGet(action,{flow_id:activeFlowId});
    else data=await apiPost(action,body||{});
    if(data.flow){renderFlowDetail(data.flow)}
    else if(data.validation_errors!==undefined){const current=flowItems.find(flow=>flow.id===activeFlowId)||{};renderFlowDetail({...current,id:activeFlowId,validation_errors:data.validation_errors})}
    await refreshAll();
    setStatus(data.registered===false?'A Meta não confirmou a correspondência da chave pública.':message,data.registered===false?'error':'success');
  }catch(error){
    const details=error.payload?.details;
    if(Array.isArray(details)&&details.length)setStatus('A Meta bloqueou a ação: '+details.map(item=>item.message).join(' · '),'error');
    else setStatus('Ação não concluída: '+String(error.message||error),'error');
  }finally{setBusy(false)}
}
async function handleJsonUpload(event){
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>300000){setStatus('O arquivo excede o limite de 300 KB.','error');event.target.value='';return}
  setBusy(true);
  try{
    const json=JSON.parse(await file.text());
    const data=await apiPost('flow_upload_json',{flow_id:activeFlowId,flow_json:json});
    await refreshAll();
    if(Array.isArray(data.validation_errors)&&data.validation_errors.length)setStatus('JSON enviado. A Meta encontrou '+data.validation_errors.length+' erro(s); consulte o relatório abaixo.','error');
    else if(data.validation_available)setStatus('JSON enviado; a Meta não reportou erros de validação.','success');
    else setStatus('JSON enviado, mas a Meta ainda não forneceu relatório de validação.','neutral');
  }catch(error){setStatus('Não foi possível enviar o JSON: '+String(error.message||error),'error')}
  finally{setBusy(false);event.target.value=''}
}
async function publishActiveFlow(){
  if(!activeFlowId||busy)return;
  const accepted=window.confirm('Publicar este Flow na Meta? A publicação é irreversível e torna o Flow imutável.');
  if(accepted)await runAction('flow_publish',{flow_id:activeFlowId},'Flow publicado pela Meta.');
}
async function sendCanaryActiveFlow(){
  if(!activeFlowId||busy)return;
  const accepted=window.confirm('Enviar este rascunho somente ao número interno final 8360, usando a conta comercial 1018? Nenhum outro destino está disponível nesta homologação.');
  if(accepted)await runAction('flow_send_canary',{flow_id:activeFlowId},'A Meta aceitou o envio de teste do rascunho ao número interno 8360.');
}
async function deleteActiveFlow(){
  if(!activeFlowId||busy)return;
  const accepted=window.confirm('Excluir este rascunho da Meta?');
  if(accepted)await runAction('flow_delete',{flow_id:activeFlowId},'Rascunho excluído da Meta.');
}
async function createDraft(){
  if(busy||!canManage)return;
  const name=window.prompt('Nome do novo Flow rascunho:');
  if(!name?.trim())return;
  setBusy(true);
  try{const data=await apiPost('flow_create',{name:name.trim(),categories:['OTHER']});activeFlowId=data.flow?.id||'';await refreshAll();setStatus('Rascunho criado na conta Meta 1018. Envie o JSON para validar.','success')}
  catch(error){setStatus('Não foi possível criar o rascunho: '+String(error.message||error),'error')}
  finally{setBusy(false)}
}
async function registerKey(){
  if(!canManage||busy)return;
  if(!window.confirm('Registrar na Meta a chave pública derivada da chave privada mantida no servidor?'))return;
  await runAction('flow_register_key',{},'Chave pública registrada na Meta.');
}
function ensureStyles(){
  if(document.querySelector('link[data-da-marketing-template-center]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/vitrine/admin/marketing/template-center.css?v=meta-flow-center-v1';
  link.dataset.daMarketingTemplateCenter='1';
  document.head.appendChild(link);
}
export async function mountFlowView(root=document.querySelector('#content')){
  if(!root)return;
  ensureStyles();
  rootNode=root;flowItems=[];activeFlowId='';canManage=false;
  root.innerHTML='<div class="marketing-flow-center"><div class="page-head"><div><h1>Marketing</h1><p>Gestão dos WhatsApp Flows pela conexão Meta já configurada no Vitrine Admin.</p></div><span class="marketing-campaign-gate">Campanhas desligadas</span></div><div class="marketing-template-subnav" data-marketing-subnav>'+navHtml('flows')+'</div><section class="marketing-flow-head"><div><h2>Flows Meta · canal 1018</h2><p>Administre rascunhos, JSON, endpoint, chave, validação e publicação na conta comercial 1018.</p></div><div class="flow-toolbar"><button type="button" data-flow-action="refresh">Atualizar</button><button type="button" data-flow-action="register-key">Registrar chave pública</button><button type="button" data-flow-action="create" class="primary">Criar rascunho</button><a href="/vitrine/admin/whatsapp-lab/">Abrir laboratório interno 8360</a></div></section><section class="flow-readiness"><h3>Pré-requisitos</h3><div data-flow-readiness><p>Consultando configuração do servidor…</p></div></section><div class="marketing-flow-status" data-flow-status role="status">Carregando estado da Meta…</div><div class="flow-manager-layout"><section><div class="flow-section-title"><h3>Flows da conta 1018</h3><button type="button" data-flow-action="refresh">Atualizar lista</button></div><div class="flow-list" data-flow-list><p class="flow-empty">Carregando…</p></div></section><section class="flow-detail" data-flow-detail><p class="flow-empty">Selecione um Flow para consultar seu estado.</p></section></div></div>';
  const nav=root.querySelector('[data-marketing-subnav]');bindNav(nav);
  root.querySelectorAll('[data-flow-action="refresh"]').forEach(button=>button.addEventListener('click',refreshAll));
  root.querySelector('[data-flow-action="create"]')?.addEventListener('click',createDraft);
  root.querySelector('[data-flow-action="register-key"]')?.addEventListener('click',registerKey);
  await refreshAll();
}

