import {CONFIG} from './runtime-config.js';
import {authenticateCustomerOsWithPin,getCustomerOsSession,clearCustomerOsSession} from './customer-os-auth.js';
import {getMarketingOverview,getMarketingMetrics,getMarketingWorkflow,getMarketingShortlist,createDeterministicMarketingDraft,planMarketingCampaignAssets,updateMarketingCampaignDraft,renderMarketingPreview,getMarketingMediaUrl,queueMarketingLightVideo} from './marketing-api.js';

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const moneyCents=v=>(Number(v||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dt=v=>v?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'—';
const safeUrl=v=>{try{const u=new URL(String(v||''));return /^https?:$/.test(u.protocol)?u.href:''}catch{return ''}};
let state={};

const empty=m=>`<div class="empty-state">${esc(m)}</div>`;
const row=(a,b,c,d='')=>`<div class="data-row"><div><strong>${esc(a)}</strong><small>${esc(b||'')}</small></div><div>${esc(d)}</div><div><span class="status-chip">${esc(c||'—')}</span></div></div>`;

function roleLabel(role){
  return ({
    feed_square:'Post quadrado',
    story_status:'Story + Status',
    pinterest_pin:'Pinterest',
    instagram_carousel:'Carrossel',
    reel_light_10s:'Reel leve 10s'
  })[role]||role||'Conteúdo';
}

function renderOpportunities(){
  const items=state.shortlist?.items||[];
  const meta=state.overview?.runtime?.metadata||{};
  const gate=$('#strategyGate');
  gate.textContent=meta.strategy_ai_enabled===true?'IA estratégica habilitada':'IA estratégica bloqueada · custo zero';
  const readiness=state.shortlist?.readiness||{};
  if(readiness.total_products!=null){
    $('#opportunityStatus').textContent=`${Number(readiness.marketing_ready||0)} produtos prontos para marketing · ${Number(readiness.blocked||0)} bloqueados por dados/política · readiness médio ${Number(readiness.avg_readiness_score||0).toFixed(0)}%`;
  }
  if(!items.length){$('#opportunityList').innerHTML=empty('Nenhum produto elegível encontrado.');return}
  $('#opportunityList').innerHTML=`<div class="opportunity-grid">${items.slice(0,8).map(p=>{
    const img=safeUrl(p.image_url);
    const offer=Boolean(p.is_offer)&&Number(p.effective_price)<Number(p.price);
    return `<article class="opportunity-card">
      <div class="opportunity-image">${img?`<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</div>
      <div class="opportunity-body">
        <h3>${esc(p.name)}</h3>
        <div class="opportunity-meta">${esc([p.brand,p.category,p.subcategory].filter(Boolean).join(' · '))}</div>
        <div class="opportunity-price">${offer?`<span class="old-price">${esc(brl(p.price))}</span>`:''}<strong>${esc(brl(p.effective_price))}</strong></div>
        <div class="opportunity-foot"><span>Estoque ${esc(p.stock)}</span><span>Readiness ${esc(p.readiness_score||'—')}%</span><span class="score-pill">score ${esc(p.score)}</span></div>
      </div>
    </article>`;
  }).join('')}</div>`;
}

function assetMedia(assetId){
  return (state.overview?.media||[]).filter(m=>m.asset_id===assetId).sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));
}
function assetRenderJobs(assetId){
  return (state.overview?.render_jobs||[]).filter(j=>j.asset_id===assetId).sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
}
function assetPreviewHtml(asset){
  const media=assetMedia(asset.id);
  const jobs=assetRenderJobs(asset.id);
  const role=asset.edit_spec?.content_role||'';
  const images=media.filter(m=>String(m.mime_type||'').startsWith('image/'));
  const videos=media.filter(m=>m.mime_type==='video/mp4');
  const latestJob=jobs[0]||null;
  const mp4Ready=videos.length>0||asset.output_spec?.mp4_ready===true;
  const posterReady=images.some(m=>m.role==='poster');
  const mediaText=media.length?`${media.length} mídia(s) de prévia`:'Prévia ainda não gerada';
  let actions='';
  if(asset.media_kind==='video'){
    if(!posterReady){
      actions=`<button class="secondary" type="button" data-action="render-preview" data-asset-id="${esc(asset.id)}">Gerar poster</button>`;
    }else if(mp4Ready){
      actions=`<button class="secondary" type="button" data-action="show-preview" data-asset-id="${esc(asset.id)}">Ver Reel 10s</button>`;
    }else if(latestJob&&['queued','processing'].includes(latestJob.status)){
      actions=`<button class="secondary" type="button" disabled>${latestJob.status==='processing'?'Gerando MP4…':'MP4 na fila'}</button><button class="secondary" type="button" data-action="show-preview" data-asset-id="${esc(asset.id)}">Ver poster</button>`;
    }else{
      actions=`<button class="primary" type="button" data-action="queue-light-video" data-asset-id="${esc(asset.id)}">Colocar MP4 10s na fila</button><button class="secondary" type="button" data-action="show-preview" data-asset-id="${esc(asset.id)}">Ver poster</button>`;
    }
  }else{
    actions=`<button class="secondary" type="button" data-action="${media.length?'show-preview':'render-preview'}" data-asset-id="${esc(asset.id)}">${media.length?'Ver prévia':'Gerar prévia'}</button>`;
  }
  return `<article class="asset-card" data-asset-id="${esc(asset.id)}">
    <div class="asset-card-head"><div><span class="status-chip">${esc(asset.status)}</span><h3>${esc(asset.title)}</h3><p>${esc(roleLabel(role))} · ${esc(asset.media_kind)} · no_ai</p></div>
      <div class="asset-card-actions">${actions}</div>
    </div>
    <div class="asset-safe-line"><span>${esc(mediaText)}</span><span>IA: não</span><span>Publicação: não</span>${asset.media_kind==='video'?`<span>MP4: ${mp4Ready?'pronto':latestJob?.status||'não gerado'}</span>`:''}</div>
    <div class="asset-preview-slot" data-preview-slot="${esc(asset.id)}"></div>
  </article>`;
}
function renderAssets(){
  const assets=state.overview?.assets||[];
  const html=assets.length?`<div class="asset-grid">${assets.map(assetPreviewHtml).join('')}</div>`:empty('Nenhum conteúdo criado ainda.');
  $('#assetsList').innerHTML=html;
  $('#recentAssets').innerHTML=assets.length?`<div class="data-list">${assets.slice(0,8).map(a=>row(a.title,`${roleLabel(a.edit_spec?.content_role)} · ${a.media_kind} · v${a.version}`,a.status,dt(a.updated_at))).join('')}</div>`:empty('Nenhum conteúdo criado ainda.');
}
async function showAssetPreview(assetId){
  const slot=document.querySelector(`[data-preview-slot="${CSS.escape(assetId)}"]`);
  if(!slot)return;
  const media=assetMedia(assetId);
  if(!media.length){slot.innerHTML=empty('Nenhuma mídia de prévia disponível.');return}
  slot.innerHTML='<div class="muted">Abrindo prévia segura…</div>';
  try{
    const signed=await Promise.all(media.slice(0,8).map(m=>getMarketingMediaUrl(m.id,600)));
    slot.innerHTML=`<div class="asset-preview-gallery">${signed.map((x,i)=>{
      const m=media[i]||{};
      const caption=`${m.role||'preview'}${m.duration_ms?' · '+Math.round(m.duration_ms/1000)+'s':''}`;
      if(m.mime_type==='video/mp4'){
        return `<figure class="video-preview"><video src="${esc(x.signed_url)}" controls playsinline preload="metadata"></video><figcaption>${esc(caption)}</figcaption></figure>`;
      }
      return `<figure><img src="${esc(x.signed_url)}" alt="Prévia ${i+1}" loading="lazy"><figcaption>${esc(caption)}</figcaption></figure>`;
    }).join('')}</div>`;
  }catch(err){slot.innerHTML=`<div class="empty-state">${esc(err.message||'Falha ao abrir prévia.')}</div>`}
}
async function renderAssetPreview(assetId,button){
  const slot=document.querySelector(`[data-preview-slot="${CSS.escape(assetId)}"]`);
  if(button)button.disabled=true;
  if(slot)slot.innerHTML='<div class="muted">Renderizando sem IA…</div>';
  try{
    const result=await renderMarketingPreview(assetId);
    if(slot)slot.innerHTML=`<div class="muted">Prévia gerada: ${Number(result.outputs?.length||0)} arquivo(s). Atualizando…</div>`;
    const previous=state;
    const [overview,metrics,workflow,shortlist]=await Promise.all([getMarketingOverview(),getMarketingMetrics(30),getMarketingWorkflow(),getMarketingShortlist()]);
    state={overview,metrics,workflow,shortlist,previewUrls:previous.previewUrls||{}};
    render();
    await showAssetPreview(assetId);
  }catch(err){if(slot)slot.innerHTML=`<div class="empty-state">${esc(err.message||'Falha ao gerar prévia.')}</div>`}finally{if(button)button.disabled=false}
}

function renderCampaigns(){
  const campaigns=state.overview?.campaigns||[];
  const assets=state.overview?.assets||[];
  if(!campaigns.length){$('#campaignsList').innerHTML=empty('Nenhuma campanha cadastrada ainda.');return}
  $('#campaignsList').innerHTML=`<div class="campaign-stack">${campaigns.map(c=>{
    const campaignAssets=assets.filter(a=>a.campaign_id===c.id);
    const hook=c.content_policy?.hook||'';
    const cta=c.content_policy?.cta||'';
    return `<article class="campaign-card" data-campaign-id="${esc(c.id)}">
      <div class="campaign-card-head">
        <div><span class="status-chip">${esc(c.status)}</span><h3>${esc(c.name)}</h3><p>${esc(c.objective||'Sem objetivo definido.')}</p></div>
        <div class="campaign-actions">
          <button class="secondary" type="button" data-action="toggle-edit">Editar</button>
          <button class="primary" type="button" data-action="plan-assets">${campaignAssets.length>=5?'Revisar peças':'Gerar 5 peças DRAFT'}</button>
        </div>
      </div>
      <div class="campaign-meta">
        <span>${campaignAssets.length}/5 peças</span><span>IA: ${esc(c.ai_policy?.strategy_mode||'deterministic')}</span><span>Imagem: ${esc(c.ai_policy?.image_quality||'low')}</span><span>Vídeo: ${Number(c.ai_policy?.light_motion_duration_seconds||10)}s</span>
      </div>
      <div class="campaign-pieces">${campaignAssets.length?campaignAssets.map(a=>`<span class="piece-chip">${esc(roleLabel(a.edit_spec?.content_role))} · ${esc(a.status)}</span>`).join(''):'<span class="muted">Nenhuma peça criada ainda.</span>'}</div>
      <form class="campaign-edit" hidden>
        <label>Nome<input name="name" maxlength="120" value="${esc(c.name)}"></label>
        <label>Objetivo<textarea name="objective" maxlength="240">${esc(c.objective||'')}</textarea></label>
        <label>Hook<textarea name="hook" maxlength="220">${esc(hook)}</textarea></label>
        <label>CTA<textarea name="cta" maxlength="180">${esc(cta)}</textarea></label>
        <div class="campaign-edit-actions"><button type="button" class="secondary" data-action="cancel-edit">Cancelar</button><button type="submit" class="primary">Salvar rascunho</button></div>
        <p class="campaign-message muted"></p>
      </form>
    </article>`;
  }).join('')}</div>`;
}

function render(){
  const o=state.overview||{},r=o.runtime||{},m=state.metrics?.metrics?.counts||{},meta=r.metadata||{};
  $('#summaryCards').innerHTML=[['Campanhas',(o.campaigns||[]).length,'cadastradas'],['Conteúdos',m.assets_created||(o.assets||[]).length,'últimos 30 dias'],['Aguardando revisão',m.review_required||0,'publicações'],['Custo registrado',moneyCents(m.actual_cost_cents||0),'últimos 30 dias']].map(x=>`<article class="summary-card"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong><small>${esc(x[2])}</small></article>`).join('');
  const locked=o.safety?.external_actions_locked!==false;$('#safetyBadge').textContent=locked?'Publicação bloqueada · seguro':'Publicação habilitada';$('#safetyBadge').className=`safety-badge ${locked?'safe':'warn'}`;
  $('#runtimeSummary').innerHTML=`<div><div class="rule"><span>Publicação externa</span><strong class="${r.publishing_enabled?'danger':'ok'}">${r.publishing_enabled?'Ligada':'Desligada'}</strong></div><div class="rule"><span>Kill switch</span><strong class="ok">${r.kill_switch?'Ativo':'Inativo'}</strong></div><div class="rule"><span>Aprovação humana</span><strong>${r.require_approval===false?'Não':'Obrigatória'}</strong></div><div class="rule"><span>Imagem IA</span><strong>${esc(meta.image_generation_quality||'low')} · ${Number(meta.image_variants_default||1)} variação</strong></div><div class="rule"><span>Vídeo V1</span><strong>${Number(meta.video_duration_seconds||10)}s · ${esc(meta.video_mode||'light_motion')}</strong></div><div class="rule"><span>IA de estratégia</span><strong class="ok">${meta.strategy_ai_enabled===true?'Habilitada':'Bloqueada'}</strong></div></div>`;
  renderAssets();
  renderCampaigns();
  const jobs=o.jobs||[];$('#jobsList').innerHTML=jobs.length?`<div class="data-list">${jobs.map(j=>row(`${j.channel} · ${j.content_type}`,j.scheduled_for?dt(j.scheduled_for):'Sem agendamento',j.status,j.manual_confirmation_required?'confirmação manual':'')).join('')}</div>`:empty('Nenhuma publicação preparada.');
  const templates=o.templates||[];$('#templatesList').innerHTML=templates.length?`<div class="data-list">${templates.map(t=>row(t.name,`${t.media_kind} · v${t.version}`,t.status,t.template_key)).join('')}</div>`:empty('Nenhum modelo ativo.');
  const cal=state.workflow?.calendar||[];$('#calendarList').innerHTML=cal.length?`<div class="data-list">${cal.slice(0,80).map(i=>row(i.title||i.channel||'Conteúdo',i.scheduled_for?dt(i.scheduled_for):'',i.status||'planejado',i.channel||'')).join('')}</div>`:empty('Agenda vazia.');
  $('#resultsView').innerHTML=`<div class="summary-grid"><article class="summary-card"><span>Cliques atribuídos</span><strong>${Number(m.attribution_clicks||0)}</strong></article><article class="summary-card"><span>Conversas</span><strong>${Number(m.attribution_conversations||0)}</strong></article><article class="summary-card"><span>Pedidos</span><strong>${Number(m.attribution_orders||0)}</strong></article><article class="summary-card"><span>Render OK</span><strong>${Number(m.render_success_rate_percent||0).toFixed(0)}%</strong></article></div>`;
  const settings=[['Modo',r.execution_mode||'off'],['Publicações/dia',r.max_daily_publications||0],['Imagens IA/dia',r.max_daily_ai_image_generations||0],['Vídeo IA/dia',`${r.max_daily_ai_video_seconds||0}s`],['Orçamento IA/dia',moneyCents(r.max_daily_ai_cost_cents||0)],['Imagem padrão',meta.image_generation_quality||'low'],['Variações',meta.image_variants_default||1],['Vídeo inicial',`${meta.video_duration_seconds||10}s · ${meta.video_mode||'light_motion'}`],['Marketing Brain',meta.strategy_model||'gpt-5.6-luna'],['Chamadas estratégicas/dia',meta.strategy_max_daily_calls||0],['Candidatos enviados à IA',meta.strategy_max_candidates||18],['Escalonamento de modelo',meta.strategy_auto_escalation===true?'Ligado':'Desligado']];
  $('#settingsView').innerHTML=`<div class="settings-grid">${settings.map(x=>`<div class="setting-card"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong></div>`).join('')}</div><p class="muted">A estratégia paga permanece bloqueada. A shortlist e os rascunhos econômicos usam somente SQL/código.</p>`;
  renderOpportunities();
}

async function load(){
  try{
    const [overview,metrics,workflow,shortlist]=await Promise.all([getMarketingOverview(),getMarketingMetrics(30),getMarketingWorkflow(),getMarketingShortlist()]);
    state={overview,metrics,workflow,shortlist,previewUrls:state.previewUrls||{}};render();$('#authGate').hidden=true;$('#marketingApp').hidden=false;
  }catch(e){$('#authStatus').textContent=e.message||'Falha ao carregar.'}
}
async function refreshOpportunities(){
  $('#opportunityStatus').textContent='Analisando produtos elegíveis…';
  try{state.shortlist=await getMarketingShortlist();renderOpportunities();$('#opportunityStatus').textContent='Análise atualizada sem uso de IA.'}catch(e){$('#opportunityStatus').textContent=e.message||'Falha ao analisar.'}
}
async function createDraft(){
  const button=$('#createDeterministicDraft');button.disabled=true;$('#opportunityStatus').textContent='Criando rascunho sem IA…';
  try{
    await createDeterministicMarketingDraft();
    $('#opportunityStatus').textContent='Rascunho criado com segurança. Nenhuma publicação foi feita.';
    await load();
    document.querySelector('[data-tab="campaigns"]')?.click();
  }catch(e){$('#opportunityStatus').textContent=e.message||'Não foi possível criar o rascunho.'}finally{button.disabled=false}
}

document.addEventListener('click',async e=>{
  const button=e.target.closest('button[data-asset-id][data-action]');
  if(!button)return;
  const action=button.dataset.action,assetId=button.dataset.assetId;
  if(action==='render-preview'){await renderAssetPreview(assetId,button)}
  if(action==='show-preview'){await showAssetPreview(assetId)}
  if(action==='queue-light-video'){
    button.disabled=true;
    const slot=document.querySelector(`[data-preview-slot="${CSS.escape(assetId)}"]`);
    if(slot)slot.innerHTML='<div class="muted">Colocando MP4 de 10s na fila…</div>';
    try{
      await queueMarketingLightVideo(assetId);
      if(slot)slot.innerHTML='<div class="muted">MP4 na fila de homologação. Nenhuma publicação foi feita.</div>';
      await load();
      document.querySelector('[data-tab="content"]')?.click();
    }catch(err){
      if(slot)slot.innerHTML=`<div class="empty-state">${esc(err.message||'Falha ao colocar vídeo na fila.')}</div>`;
    }finally{button.disabled=false}
  }
});

$('#campaignsList').addEventListener('click',async e=>{
  const button=e.target.closest('button[data-action]');
  if(!button)return;
  const card=button.closest('.campaign-card'); if(!card)return;
  const id=card.dataset.campaignId; const form=card.querySelector('.campaign-edit'); const message=card.querySelector('.campaign-message');
  if(button.dataset.action==='toggle-edit'){form.hidden=!form.hidden;return}
  if(button.dataset.action==='cancel-edit'){form.hidden=true;return}
  if(button.dataset.action==='plan-assets'){
    button.disabled=true;message.textContent='Montando peças DRAFT sem IA…';
    try{
      const result=await planMarketingCampaignAssets(id);
      message.textContent=`Plano pronto: ${Number(result.created?.length||0)} criada(s), ${Number(result.reused?.length||0)} reutilizada(s). Zero render e zero publicação.`;
      await load(); document.querySelector('[data-tab="campaigns"]')?.click();
    }catch(err){message.textContent=err.message||'Falha ao montar peças.'}finally{button.disabled=false}
  }
});

$('#campaignsList').addEventListener('submit',async e=>{
  const form=e.target.closest('.campaign-edit'); if(!form)return; e.preventDefault();
  const card=form.closest('.campaign-card'); const id=card.dataset.campaignId; const message=form.querySelector('.campaign-message');
  const submit=form.querySelector('button[type="submit"]'); submit.disabled=true; message.textContent='Salvando…';
  try{
    const data=new FormData(form);
    await updateMarketingCampaignDraft({campaign_id:id,name:data.get('name'),objective:data.get('objective'),hook:data.get('hook'),cta:data.get('cta')});
    message.textContent='Rascunho atualizado.'; await load(); document.querySelector('[data-tab="campaigns"]')?.click();
  }catch(err){message.textContent=err.message||'Falha ao salvar.'}finally{submit.disabled=false}
});

$('#pinForm').addEventListener('submit',async e=>{e.preventDefault();try{$('#authStatus').textContent='Validando…';await authenticateCustomerOsWithPin($('#pinInput').value.trim());$('#pinInput').value='';$('#authStatus').textContent='';await load()}catch(err){clearCustomerOsSession();$('#authStatus').textContent=err.message||'PIN inválido.'}});
$('#refreshMarketing').addEventListener('click',load);
$('#refreshOpportunities').addEventListener('click',refreshOpportunities);
$('#createDeterministicDraft').addEventListener('click',createDraft);
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==b.dataset.tab)}));
$('#menuButton')?.addEventListener('click',()=>{$('#sidebar')?.classList.toggle('open');$('#sidebarBackdrop')?.classList.toggle('hidden')});$('#sidebarBackdrop')?.addEventListener('click',()=>{$('#sidebar')?.classList.remove('open');$('#sidebarBackdrop')?.classList.add('hidden')});
if(!CONFIG.marketingUiEnabled)document.body.innerHTML='<main class="content"><div class="empty-state">Marketing ainda não está liberado.</div></main>';else if(getCustomerOsSession())load();
