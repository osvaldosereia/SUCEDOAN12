import {CONFIG} from './runtime-config.js';

const $=id=>document.getElementById(id);
const AUTH_KEY='da_admin_auth';
const state={triage:{bad_images:[],unprocessed:[],problems:[],pending:[],ignored:[]},stats:{},current:null,selectedBadImages:new Set()};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR')};
const money=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'USD',minimumFractionDigits:4,maximumFractionDigits:4});
const toast=(m,k='')=>{const n=document.createElement('div');n.className=`toast ${k}`.trim();n.textContent=m;$('toastRegion').append(n);setTimeout(()=>n.remove(),k==='error'?5000:2800)};
const getSession=()=>{try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}};
const saveSession=s=>localStorage.setItem(AUTH_KEY,JSON.stringify(s));

function authError(message='Sua sessão expirou. Entre novamente.',code='admin_session_invalid'){return Object.assign(new Error(message),{code})}
function decodeExp(token){try{return Number(JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp||0)}catch{return 0}}
async function refreshSession(){
  const s=getSession();
  if(!s?.refresh_token){localStorage.removeItem(AUTH_KEY);throw authError('Sessão do Admin necessária.','admin_session_required')}
  const r=await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token}),cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d?.access_token){localStorage.removeItem(AUTH_KEY);throw authError()}
  saveSession({...s,...d});
  return {...s,...d};
}
async function session(){let s=getSession();if(!s?.access_token)return null;if(decodeExp(s.access_token)*1000<Date.now()+60000)s=await refreshSession();return s}
function friendly(code){return({admin_session_required:'Sessão do Admin necessária.',admin_session_invalid:'Sua sessão expirou.',invalid_source_url:'A URL da foto de origem não é permitida.',current_image_not_allowed:'A foto atual não está em uma origem confiável para reutilização automática.',source_required:'Este produto ainda não tem uma foto de origem utilizável.',product_processing:'Este produto está sendo processado agora. Aguarde terminar antes de aprovar manualmente.',job_processing:'A tarefa deste produto está sendo processada agora. Aguarde terminar antes de aprovar manualmente.',product_not_found:'Produto não encontrado.',product_inactive:'Este produto não está ativo e não pode gerar imagem.',product_ignored:'Este produto está ignorado pela automação.',invalid_product_id:'Produto inválido.',invalid_product_ids:'Selecione pelo menos uma imagem válida.',invalid_bulk_filter:'Filtro em massa inválido.',manual_prompt_required:'Escreva a orientação para a geração individual.',manual_review_not_required:'Este produto não está na fila de imagens ruins.',manual_action_required:'Para gerar individualmente, use o botão “Gerar outra” e escreva a orientação.',candidate_required:'Não existe uma imagem gerada disponível para aprovar.'}[code]||code||'Falha na automação.')}
async function call(action,payload={},retry=true){
  let s=await session();
  if(!s)throw authError('Sessão do Admin necessária.','admin_session_required');
  const r=await fetch(`${CONFIG.supabaseUrl}/functions/v1/admin-product-images-v1`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,Authorization:`Bearer ${s.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(r.status===401&&retry&&s.refresh_token){await refreshSession();return call(action,payload,false)}
  if(!r.ok||d.ok===false){
    if(r.status===401||d.error==='admin_session_invalid'||d.error==='admin_session_required')localStorage.removeItem(AUTH_KEY);
    throw Object.assign(new Error(d.detail||friendly(d.error)),{code:d.error||'request_failed'});
  }
  return d;
}
async function unlock(pin){
  const a=await fetch(`${CONFIG.supabaseUrl}/functions/v1/admin-pin-auth-v1`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({pin}),cache:'no-store'}),issued=await a.json().catch(()=>({}));
  if(!a.ok||!issued?.token_hash)throw new Error(issued?.retry_after_seconds?'Muitas tentativas. Tente novamente depois.':'Código inválido.');
  const v=await fetch(`${CONFIG.supabaseUrl}/auth/v1/verify`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({type:issued.verification_type||'magiclink',token_hash:issued.token_hash}),cache:'no-store'}),s=await v.json().catch(()=>({}));
  if(!v.ok||!s?.access_token)throw new Error('Não consegui abrir a sessão do Admin.');
  saveSession(s);
}

const safeUrl=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'?u.toString():''}catch{return ''}};
const statusLabel=s=>({completed:'Aprovada',rejected:'Rejeitada',source_rejected:'Fonte rejeitada',processing:'Processando',pending:'Na fila',partial:'Parcial',error:'Erro',needs_reprocess:'Reprocessar'}[s]||s||'Nunca processada');
function diagnosis(p){
  const status=String(p.image_ai_status||''),manual=String(p.image_ai_manual_review_reason||''),raw=String(p.image_ai_error||p.image_ai_validation?.critical_issue||manual||'');
  if(p.image_ai_ignored)return{title:'Ignorada manualmente',text:'Este produto está fora da automação. Restaure quando quiser processá-lo novamente.'};
  if(p.image_ai_manual_review_required)return{title:'Imagem classificada para revisão',text:manual||raw||'A automação encontrou risco visual nesta fonte ou no resultado. Você pode aprovar a candidata ou orientar uma nova geração.'};
  if(!status)return{title:'Nunca entrou na automação',text:p.image_source_url?'Já existe uma origem cadastrada; pode ser enviado ao lote.':'Ainda não existe uma origem verificada.'};
  if(status==='pending')return{title:'Aguardando processamento',text:raw?'Está na fila. Motivo anterior: '+raw:'Está na fila e será capturado pelo próximo ciclo.'};
  if(/trusted_source_missing|source_required/i.test(raw))return{title:'Sem foto original confiável',text:'Use a foto atual como origem ou informe outra referência.'};
  if(/source_http_404/i.test(raw))return{title:'Foto de origem não encontrada',text:'O arquivo original não existe mais nesse endereço.'};
  if(/validation|fidelity|label|packaging|same_product|critical/i.test(raw)||['rejected','needs_reprocess'].includes(status))return{title:'A geração alterou o produto',text:'A validação bloqueou a imagem; ela permanece para revisão sem substituir o catálogo.'};
  if(status==='source_rejected')return{title:'Fonte rejeitada',text:'A automação não conseguiu confirmar uma fonte limpa.'};
  if(status==='error')return{title:'Erro técnico',text:'Veja o erro e tente novamente.'};
  return{title:statusLabel(status),text:raw||'Revise a origem e tente novamente.'};
}
function renderResult(p){
  const status=String(p.image_ai_status||''),url=safeUrl(p.image_ai_url||p.image_url),validation=p.image_ai_validation||{},f=Number(validation.fidelity_score||0),badge=status==='completed'?'ok':status.includes('rejected')||status==='error'?'off':'warn',canResolve=!!p.image_ai_manual_review_required||['rejected','source_rejected','error','needs_reprocess'].includes(status);
  return `<article class="image-result"><div class="image-result-media">${url?`<img src="${esc(url)}" alt="" loading="lazy">`:'<span class="muted">Sem imagem</span>'}</div><div class="image-result-body"><strong>${esc(p.name)}</strong><div class="result-meta"><span class="badge ${badge}">${esc(statusLabel(status))}</span>${f?`<span class="badge">Fidelidade ${(f*100).toFixed(0)}%</span>`:''}</div>${p.image_ai_manual_review_required?`<div class="result-error">Revisão: ${esc(p.image_ai_manual_review_reason||'imagem ruim')}</div>`:''}${p.image_ai_error?`<div class="result-error">${esc(p.image_ai_error)}</div>`:''}<div class="muted">${date(p.image_ai_processed_at||p.updated_at)}</div><div class="result-actions">${url?`<a href="${esc(url)}" target="_blank" rel="noopener">Ver</a>`:''}${canResolve?`<button type="button" data-open-repair="${esc(p.id)}">Resolver</button>`:''}</div></div></article>`;
}
function renderBatch(b){return `<div class="batch-row"><div><strong>${esc(statusLabel(b.status))}</strong><div class="muted">${date(b.created_at)} · ${esc(b.quality||'')}</div></div><span>${Number(b.accepted_count||0)} aprov.</span><span>${Number(b.failed_count||0)} falhas</span><span>${money(b.generation_cost_usd)}</span></div>`}
function eligibleBadImage(p){return !!p&&p.is_active!==false&&p.image_ai_ignored!==true&&p.image_ai_manual_review_required===true&&String(p.image_ai_status||'')!=='processing'&&!!safeUrl(p.image_ai_url)}
function renderIssue(p,key){
  const d=diagnosis(p),status=p.image_ai_ignored?'ignored':String(p.image_ai_status||''),url=safeUrl(p.image_ai_url||p.image_source_url||p.image_url),badge=p.image_ai_manual_review_required?'off':status==='pending'?'warn':status==='ignored'?'off':status?'off':'warn',id=esc(p.id),selectable=key==='bad_images'&&eligibleBadImage(p),selected=state.selectedBadImages.has(String(p.id));
  const selector=key==='bad_images'?`<label class="issue-select ${selectable?'':'disabled'}" title="${selectable?'Selecionar para aprovação':'Esta imagem não pode ser aprovada em massa agora'}"><input type="checkbox" data-bulk-select="${id}" ${selected?'checked':''} ${selectable?'':'disabled'} aria-label="Selecionar ${esc(p.name)}"></label>`:'';
  return `<article class="issue-row"><div class="issue-media">${url?`<img class="issue-thumb" src="${esc(url)}" alt="" loading="lazy" data-open-repair="${id}" title="Abrir revisão">`:'<div class="issue-thumb"></div>'}${selector}</div><div class="issue-main"><strong>${esc(p.name)}</strong><div class="muted">${p.gtin?`EAN ${esc(p.gtin)}`:p.sku?`SKU ${esc(p.sku)}`:'Sem EAN/SKU'} · <span class="badge ${badge}">${esc(p.image_ai_manual_review_required?'Imagem ruim':p.image_ai_ignored?'Ignorada':statusLabel(status))}</span></div></div><div class="issue-diagnosis"><strong>${esc(d.title)}</strong><span>${esc(d.text)}</span>${p.image_ai_error?`<div class="issue-error">${esc(p.image_ai_error)}</div>`:''}</div><div class="issue-actions"><button type="button" class="${p.image_ai_ignored?'restore':''}" data-open-repair="${id}">${p.image_ai_ignored?'Restaurar':'Resolver'}</button></div></article>`;
}
function setBusy(on){$('automationArea')?.classList.toggle('busy',on)}
function allTriage(){return [...state.triage.bad_images,...state.triage.unprocessed,...state.triage.problems,...state.triage.pending,...state.triage.ignored]}
function findProduct(id){return allTriage().find(p=>String(p.id)===String(id))||null}
function updateBulkSelectionUi(rows=state.triage.bad_images||[]){
  const eligible=rows.filter(eligibleBadImage),eligibleIds=new Set(eligible.map(p=>String(p.id)));
  for(const id of [...state.selectedBadImages])if(!eligibleIds.has(id))state.selectedBadImages.delete(id);
  const count=state.selectedBadImages.size,allSelected=eligible.length>0&&eligible.every(p=>state.selectedBadImages.has(String(p.id)));
  $('selectedBadImagesCount').textContent=`${count} selecionada${count===1?'':'s'}`;
  $('bulkApproveSelected').disabled=count===0;
  $('selectAllBadImages').disabled=eligible.length===0;
  $('selectAllBadImages').textContent=allSelected?'Limpar seleção':'Selecionar todas';
}
function renderIssues(){
  const key=$('issueFilter').value||'bad_images',rows=state.triage[key]||[],totals={bad_images:state.stats.bad_images||0,unprocessed:state.stats.not_processed||0,problems:state.stats.problems||0,pending:state.stats.pending||0,ignored:state.stats.ignored||0},badMode=key==='bad_images';
  $('issueCountLabel').textContent=`${Number(totals[key]||0)} produto(s)`;
  $('badImageBulkActions').classList.toggle('hidden',!badMode);
  $('otherBulkActions').classList.toggle('hidden',key!=='unprocessed');
  $('issueRows').innerHTML=rows.map(p=>renderIssue(p,key)).join('')||'<div class="empty">Nenhum produto neste grupo.</div>';
  updateBulkSelectionUi(badMode?rows:[]);
}
function setCompareImage(id,url){const img=$(id);img.src=url||'../img/logoantonia5.png';img.dataset.hasImage=url?'true':'false'}
function openRepair(product){
  state.current=product;
  const d=diagnosis(product),source=safeUrl(product.image_source_url||product.image_original_url||product.image_url),generated=safeUrl(product.image_ai_url||product.image_url);
  $('repairTitle').textContent=product.name||'Produto';
  $('repairMeta').textContent=product.gtin?`EAN ${product.gtin}`:product.sku?`SKU ${product.sku}`:'';
  $('repairDiagnosis').textContent=`${d.title}: ${d.text}`;$('repairRawError').textContent=product.image_ai_error||'';
  setCompareImage('repairSourceImage',source);setCompareImage('repairGeneratedImage',generated);
  $('repairSourceUrl').value=product.image_source_url||'';$('repairNote').value=product.image_ai_admin_note||'';$('repairManualPrompt').value=product.image_ai_manual_prompt||'';
  $('ignoreProduct').classList.toggle('hidden',!!product.image_ai_ignored);$('restoreProduct').classList.toggle('hidden',!product.image_ai_ignored);$('retryOnly').classList.toggle('hidden',!!product.image_ai_ignored);$('saveSourceRetry').classList.toggle('hidden',!!product.image_ai_ignored);$('generateIndividualManual').classList.toggle('hidden',!!product.image_ai_ignored||!product.image_ai_manual_review_required);$('approveGeneratedManual').classList.toggle('hidden',!!product.image_ai_ignored||!product.image_ai_manual_review_required||!safeUrl(product.image_ai_url));$('useCurrentSource').classList.toggle('hidden',!!product.image_ai_ignored||!safeUrl(product.image_url));
  $('repairDialog').showModal();
}
function closeRepair(){$('repairDialog').close();state.current=null}
function openZoom(url,label){if(!url)return;$('imageZoomImage').src=url;$('imageZoomLabel').textContent=label||'Imagem';$('imageZoomDialog').showModal()}
function closeZoom(){$('imageZoomDialog').close();$('imageZoomImage').removeAttribute('src')}

async function load(){
  setBusy(true);
  try{
    const d=await call('status'),c=d.control||{},s=d.stats||{};state.stats=s;state.triage={...state.triage,...(d.triage||{})};
    $('unlockPanel').classList.add('hidden');$('automationArea').classList.remove('hidden');
    $('statCompleted').textContent=s.completed||0;$('statBadImages').textContent=s.bad_images||0;$('statNotProcessed').textContent=s.not_processed||0;$('statProblems').textContent=s.problems||0;$('statRejected').textContent=s.rejected||0;$('statProcessing').textContent=s.processing||s.jobs_processing||0;$('statPending').textContent=s.pending||s.jobs_pending||0;$('statIgnored').textContent=s.ignored||0;
    $('intervalSelect').value=String(c.interval_minutes||3);$('automationBadge').textContent=c.enabled&&c.cron_active?'Ativa':'Pausada';$('automationBadge').className=`badge ${c.enabled&&c.cron_active?'ok':'off'}`;$('automationSummary').textContent=c.enabled?`Controle legado configurado para ${c.interval_minutes} minuto(s). O processamento atual usa o drain Grid18 V2.`:'O processamento Grid18 V2 pode ser acionado por “Rodar agora” e pelo drain atual.';$('automationToggle').textContent=c.enabled?'Pausar':'Ativar';$('automationToggle').className=c.enabled?'danger':'primary';$('automationToggle').dataset.enabled=String(!!c.enabled);
    $('recentResults').innerHTML=(d.results||[]).map(renderResult).join('')||'<div class="empty">Nenhum resultado ainda.</div>';$('recentBatches').innerHTML=(d.batches||[]).map(renderBatch).join('')||'<div class="empty">Nenhum lote ainda.</div>';renderIssues();
  }catch(e){if(e.code==='admin_session_required'||e.code==='admin_session_invalid'){$('automationArea').classList.add('hidden');$('unlockPanel').classList.remove('hidden')}else toast(e.message,'error')}finally{setBusy(false)}
}
async function requeueCurrent(){const p=state.current;if(!p)return;await call('requeue_product',{product_id:p.id,mode:'batch'});toast('Produto devolvido ao lote de 18.','success');closeRepair();await load()}

$('refreshData').addEventListener('click',load);
$('runNow').addEventListener('click',async()=>{setBusy(true);try{const d=await call('run_now');toast(d.dispatch?.dispatched===false?'Nada pronto para processar.':'Execução Grid18 V2 disparada.','success');await load()}catch(e){toast(e.message,'error')}finally{setBusy(false)}});
$('saveFrequency').addEventListener('click',async()=>{try{const enabled=$('automationToggle').dataset.enabled==='true';await call('configure',{enabled,interval_minutes:Number($('intervalSelect').value)});toast('Intervalo salvo.','success');await load()}catch(e){toast(e.message,'error')}});
$('automationToggle').addEventListener('click',async()=>{try{const enabled=$('automationToggle').dataset.enabled!=='true';await call('configure',{enabled,interval_minutes:Number($('intervalSelect').value)});toast(enabled?'Controle ativado.':'Controle pausado.','success');await load()}catch(e){toast(e.message,'error')}});
$('issueFilter').addEventListener('change',()=>{state.selectedBadImages.clear();renderIssues()});
$('issueRows').addEventListener('change',e=>{const c=e.target.closest('[data-bulk-select]');if(!c)return;const id=String(c.dataset.bulkSelect||'');if(c.checked)state.selectedBadImages.add(id);else state.selectedBadImages.delete(id);updateBulkSelectionUi()});
$('issueRows').addEventListener('click',e=>{const b=e.target.closest('[data-open-repair]');if(b){const p=findProduct(b.dataset.openRepair);if(p)openRepair(p)}});
$('selectAllBadImages').addEventListener('click',()=>{const eligible=(state.triage.bad_images||[]).filter(eligibleBadImage),all=eligible.length>0&&eligible.every(p=>state.selectedBadImages.has(String(p.id)));if(all)state.selectedBadImages.clear();else for(const p of eligible)state.selectedBadImages.add(String(p.id));renderIssues()});
$('bulkApproveSelected').addEventListener('click',async()=>{const ids=[...state.selectedBadImages];if(!ids.length)return;setBusy(true);try{const d=await call('bulk_approve_manual',{product_ids:ids});toast(`${Number(d.approved||0)} imagem(ns) aprovada(s)${d.skipped?` · ${d.skipped} ignorada(s)`:''}.`,'success');state.selectedBadImages.clear();await load()}catch(e){toast(e.message,'error')}finally{setBusy(false)}});
$('recentResults').addEventListener('click',e=>{const b=e.target.closest('[data-open-repair]');if(b){const p=findProduct(b.dataset.openRepair);if(p)openRepair(p);else toast('Abra o produto pela seção de revisão.','error')}});
$('bulkUnprocessed').addEventListener('click',async()=>{if(!confirm('Enviar até 50 produtos nunca processados para o próximo lote?'))return;setBusy(true);try{const d=await call('bulk_retry',{filter:'unprocessed',mode:'batch'});toast(`${d.queued} enviados ao lote${d.skipped?` · ${d.skipped} ignorados`:''}.`,'success');await load()}catch(e){toast(e.message,'error')}finally{setBusy(false)}});

$('repairClose').addEventListener('click',closeRepair);$('repairDialog').addEventListener('click',e=>{if(e.target===$('repairDialog'))closeRepair()});
document.addEventListener('click',e=>{const trigger=e.target.closest('[data-zoom-image]');if(!trigger)return;const image=$(trigger.dataset.zoomImage);if(image?.dataset.hasImage==='true')openZoom(image.src,trigger.dataset.zoomLabel)});
$('imageZoomClose').addEventListener('click',closeZoom);$('imageZoomDialog').addEventListener('click',e=>{if(e.target===$('imageZoomDialog'))closeZoom()});
$('approveGeneratedManual').addEventListener('click',async()=>{const p=state.current;if(!p)return;if(!confirm('Aprovar esta imagem gerada como está e retirar o produto da lista de imagens ruins?'))return;try{await call('approve_manual',{product_id:p.id,note:$('repairNote').value});toast('Imagem aprovada manualmente.','success');closeRepair();await load()}catch(e){toast(e.message,'error')}});
$('generateIndividualManual').addEventListener('click',async()=>{const p=state.current;if(!p)return;const manual_prompt=$('repairManualPrompt').value.trim();if(!manual_prompt){toast('Escreva a orientação para a geração individual.','error');return}if(!confirm('Gerar outra imagem individualmente em qualidade média usando sua orientação? Esta opção custa mais que o lote de 18.'))return;try{await call('generate_manual',{product_id:p.id,manual_prompt});toast('Nova geração individual solicitada.','success');closeRepair();await load()}catch(e){toast(e.message,'error')}});
$('useCurrentSource').addEventListener('click',async()=>{const p=state.current;if(!p)return;if(!confirm('Usar a foto atual do catálogo como origem e reenviar ao lote?'))return;try{await call('use_current_image_as_source',{product_id:p.id,note:$('repairNote').value,mode:'batch'});toast('Foto atual definida como origem e produto reenviado ao lote.','success');closeRepair();await load()}catch(e){toast(e.message,'error')}});
$('saveNote').addEventListener('click',async()=>{const p=state.current;if(!p)return;try{await call('save_note',{product_id:p.id,note:$('repairNote').value});toast('Observação salva.','success');p.image_ai_admin_note=$('repairNote').value}catch(e){toast(e.message,'error')}});
$('retryOnly').addEventListener('click',async()=>{try{await requeueCurrent()}catch(e){toast(e.message,'error')}});
$('saveSourceRetry').addEventListener('click',async()=>{const p=state.current;if(!p)return;const source=$('repairSourceUrl').value.trim();if(!source){toast('Informe a URL da foto original.','error');return}try{await call('replace_source',{product_id:p.id,source_url:source,note:$('repairNote').value,mode:'batch'});toast('Nova origem salva e produto reenviado ao lote.','success');closeRepair();await load()}catch(e){toast(e.message,'error')}});
$('ignoreProduct').addEventListener('click',async()=>{const p=state.current;if(!p||!confirm('Retirar este produto da automação até você restaurá-lo?'))return;try{await call('ignore_product',{product_id:p.id,note:$('repairNote').value});toast('Produto ignorado pela automação.','success');closeRepair();await load()}catch(e){toast(e.message,'error')}});
$('restoreProduct').addEventListener('click',async()=>{const p=state.current;if(!p)return;try{await call('restore_product',{product_id:p.id,mode:'batch'});toast('Produto restaurado e reenviado ao lote.','success');closeRepair();await load()}catch(e){toast(e.message,'error')}});

$('unlockForm').addEventListener('submit',async e=>{e.preventDefault();const pin=String($('pinInput').value||'').replace(/\D/g,'').slice(0,6);if(pin.length!==6){$('unlockStatus').textContent='Digite os 6 números.';return}try{$('unlockStatus').textContent='Abrindo…';await unlock(pin);$('unlockStatus').textContent='';await load()}catch(err){$('unlockStatus').textContent=err.message}});
$('pinInput').addEventListener('input',e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,6));
load();
