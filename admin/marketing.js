import {CONFIG} from './runtime-config.js';
import {authenticateCustomerOsWithPin,getCustomerOsSession,clearCustomerOsSession} from './customer-os-auth.js';
import {getMarketingOverview,getMarketingMetrics,getMarketingWorkflow,getMarketingShortlist,getMarketingCustomerOpportunities,getMarketingStrategyBriefs,observeMarketingOpportunity,suggestMarketingOpportunity,createDeterministicMarketingDraft,planMarketingCampaignAssets,updateMarketingCampaignDraft,renderMarketingPreview,getMarketingMediaUrl,queueMarketingLightVideo,submitMarketingAssetReview,approveMarketingAsset,rejectMarketingAsset,prepareMarketingPublication,saveMarketingAssetEdit,forkMarketingAsset} from './marketing-api.js';

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

function channelLabel(channel){
  return ({
    instagram_feed:'Instagram Feed',
    instagram_story:'Instagram Story',
    instagram_reel:'Instagram Reel',
    instagram_carousel:'Instagram Carrossel',
    facebook_post:'Facebook Post',
    facebook_story:'Facebook Story',
    facebook_reel:'Facebook Reel',
    pinterest_pin:'Pinterest',
    whatsapp_status:'WhatsApp Status',
    google_business_post:'Google'
  })[channel]||channel||'Canal';
}

function humanOpportunityReason(v){
  return ({
    marketing_not_allowed:'Marketing não permitido',
    high_marketing_pressure:'Pressão de marketing alta',
    very_low_profile_completeness:'Perfil comercial insuficiente'
  })[String(v||'')]||String(v||'').replace(/_/g,' ');
}

function renderBriefPreview(brief){
  if(!brief)return '';
  const products=Array.isArray(brief.product)?brief.product:[];
  return `<div class="brain-brief">
    <div class="brain-brief-grid">
      <div><span>Objetivo</span><strong>${esc(brief.objective||'—')}</strong></div>
      <div><span>Público</span><strong>${esc(brief.audience||'—')}</strong></div>
      <div><span>Insight</span><strong>${esc(brief.insight||'—')}</strong></div>
      <div><span>Ângulo</span><strong>${esc(brief.angle||'—')}</strong></div>
      <div><span>Proposta</span><strong>${esc(brief.proposal||'—')}</strong></div>
      <div><span>Oferta</span><strong>${esc(brief.offer||'—')}</strong></div>
      <div><span>Formato</span><strong>${esc(brief.format||'—')}</strong></div>
      <div><span>CTA futuro</span><strong>${esc(brief.cta||'—')}</strong></div>
    </div>
    ${products.length?`<div class="brain-products"><span>Produtos candidatos</span>${products.map(p=>`<b>${esc(p.name||'Produto')}</b>`).join('')}</div>`:''}
    <div class="brain-brief-foot"><span>Confiança ${Math.round(Number(brief.confidence||0)*100)}%</span><span>Sem campanha</span><span>Sem envio</span></div>
  </div>`;
}

function renderCustomerOpportunities(){
  const payload=state.customerOpportunities||{};
  const items=payload.items||[];
  const summary=payload.summary||{};
  const policy=payload.policy||{};
  const briefs=state.strategyBriefs||[];
  const briefMap=new Map(briefs.map(b=>[String(b.opportunity_id),b]));
  const gate=$('#opportunityBrainGate');
  if(gate)gate.textContent=policy.opportunity_suggest_enabled===true?'OBSERVE + SUGGEST':'OBSERVE · SUGGEST bloqueado';
  const status=$('#customerOpportunityStatus');
  if(status)status.textContent=`${Number(summary.active_total||0)} oportunidade(s) detectadas · ${Number(summary.actionable||0)} liberada(s) · ${Number(summary.suppressed||0)} bloqueada(s) pelos guardrails`;
  const mount=$('#customerOpportunityList');
  if(!mount)return;
  if(!items.length){mount.innerHTML=empty('Nenhuma oportunidade de cliente detectada.');return}
  mount.innerHTML=`<div class="customer-opportunity-stack">${items.slice(0,40).map(o=>{
    const exclusions=Array.isArray(o.exclusions)?o.exclusions:[];
    const products=Array.isArray(o.product_candidates)?o.product_candidates:[];
    const brief=briefMap.get(String(o.id));
    const suppressed=o.status==='suppressed';
    const customerName=o.customer?.name||'Cliente';
    return `<article class="customer-opportunity-card ${suppressed?'suppressed':'suggested'}" data-opportunity-id="${esc(o.id)}">
      <div class="customer-opportunity-head">
        <div><span class="status-chip">${suppressed?'Bloqueada':'Disponível'}</span><h3>${esc(o.title||o.strategy_key)}</h3><p>${esc(customerName)} · confiança ${Math.round(Number(o.confidence||0)*100)}%</p></div>
        <div class="customer-opportunity-actions">
          <button class="secondary" type="button" data-action="observe-opportunity">Gerar brief OBSERVE</button>
          <button class="secondary" type="button" data-action="suggest-opportunity" ${policy.opportunity_suggest_enabled===true&&!suppressed?'':'disabled'}>SUGGEST com IA</button>
        </div>
      </div>
      <div class="customer-opportunity-meta">
        <span>${esc(o.strategy_key)}</span>
        <span>${products.length} produto(s) candidato(s)</span>
        ${exclusions.map(x=>`<span class="guardrail-chip">${esc(humanOpportunityReason(x))}</span>`).join('')}
      </div>
      ${brief?renderBriefPreview(brief.brief):'<div class="brain-empty">Ainda sem brief. OBSERVE usa somente regras e custa zero de IA.</div>'}
      <p class="customer-opportunity-message muted"></p>
    </article>`;
  }).join('')}</div>`;
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
function assetPublicationJobs(assetId){
  return (state.overview?.jobs||[]).filter(j=>j.asset_id===assetId).sort((a,b)=>String(a.channel||'').localeCompare(String(b.channel||'')));
}
function assetReadyForReview(asset,media){
  if(asset.media_kind==='video')return media.some(m=>m.mime_type==='video/mp4');
  if(asset.media_kind==='carousel')return media.filter(m=>String(m.mime_type||'').startsWith('image/')&&m.role==='preview').length>=2;
  return media.some(m=>String(m.mime_type||'').startsWith('image/')&&m.role==='preview');
}
function assetPreviewHtml(asset){
  const media=assetMedia(asset.id);
  const jobs=assetRenderJobs(asset.id);
  const publicationJobs=assetPublicationJobs(asset.id);
  const role=asset.edit_spec?.content_role||'';
  const images=media.filter(m=>String(m.mime_type||'').startsWith('image/'));
  const videos=media.filter(m=>m.mime_type==='video/mp4');
  const latestJob=jobs[0]||null;
  const mp4Ready=videos.length>0||asset.output_spec?.mp4_ready===true;
  const posterReady=images.some(m=>m.role==='poster');
  const ready=assetReadyForReview(asset,media);
  const owner=state.overview?.user?.role==='owner';
  const mediaText=media.length?`${media.length} mídia(s) pronta(s)`:'Mídia ainda não gerada';
  const reviewNote=asset.approval_note||'';
  let mediaActions='';
  if(asset.media_kind==='video'){
    if(!posterReady){
      mediaActions=`<button class="secondary" type="button" data-action="render-preview" data-asset-id="${esc(asset.id)}">Gerar poster</button>`;
    }else if(mp4Ready){
      mediaActions=`<button class="secondary" type="button" data-action="show-preview" data-asset-id="${esc(asset.id)}">Ver Reel 10s</button>`;
    }else if(latestJob&&['queued','processing'].includes(latestJob.status)){
      mediaActions=`<button class="secondary" type="button" disabled>${latestJob.status==='processing'?'Gerando MP4…':'MP4 na fila'}</button><button class="secondary" type="button" data-action="show-preview" data-asset-id="${esc(asset.id)}">Ver poster</button>`;
    }else{
      mediaActions=`<button class="primary" type="button" data-action="queue-light-video" data-asset-id="${esc(asset.id)}">Gerar MP4 10s</button><button class="secondary" type="button" data-action="show-preview" data-asset-id="${esc(asset.id)}">Ver poster</button>`;
    }
  }else{
    mediaActions=`<button class="secondary" type="button" data-action="${media.length?'show-preview':'render-preview'}" data-asset-id="${esc(asset.id)}">${media.length?'Ver prévia':'Gerar prévia'}</button>`;
  }

  let workflowActions='';
  if(['draft','rendered'].includes(asset.status)){
    workflowActions=`
      <button class="secondary" type="button" data-action="toggle-asset-edit" data-asset-id="${esc(asset.id)}">Editar</button>
      ${media.length?`<button class="secondary" type="button" data-action="render-preview" data-asset-id="${esc(asset.id)}">Gerar novamente</button>`:''}
      <button class="primary" type="button" data-action="submit-review" data-asset-id="${esc(asset.id)}" ${ready?'':'disabled'}>Enviar para revisão</button>`;
  }else if(asset.status==='review'){
    workflowActions=`
      <button class="secondary" type="button" data-action="toggle-asset-edit" data-asset-id="${esc(asset.id)}">Editar antes de aprovar</button>
      ${owner?`<button class="approve-button" type="button" data-action="approve-asset" data-asset-id="${esc(asset.id)}">Aprovar</button><button class="reject-button" type="button" data-action="reject-asset" data-asset-id="${esc(asset.id)}">Reprovar</button>`:''}`;
  }else if(asset.status==='approved'){
    workflowActions=`${owner?`<button class="secondary" type="button" data-action="prepare-publication" data-asset-id="${esc(asset.id)}">Atualizar canais</button>`:''}<button class="secondary" type="button" data-action="fork-asset" data-asset-id="${esc(asset.id)}">Nova versão</button>`;
  }

  const channels=publicationJobs.length
    ?`<div class="prepared-channels"><strong>Preparado para</strong>${publicationJobs.map(j=>`<span class="channel-chip ${j.manual_confirmation_required?'manual':''}">${esc(channelLabel(j.channel))} · ${esc(j.status)}</span>`).join('')}</div>`
    :'';
  const editSpec=asset.edit_spec||{};
  return `<article class="asset-card status-${esc(asset.status)}" data-asset-id="${esc(asset.id)}">
    <div class="asset-card-head">
      <div><span class="status-chip">${esc(asset.status)}</span><h3>${esc(asset.title)}</h3><p>${esc(roleLabel(role))} · ${esc(asset.media_kind)} · ${esc(asset.generation_mode||'no_ai')}</p></div>
      <div class="asset-card-actions">${mediaActions}</div>
    </div>
    <div class="asset-safe-line">
      <span>${esc(mediaText)}</span><span>IA: ${asset.generation_mode==='no_ai'?'não':'configurada'}</span>
      <span>Publicação externa: bloqueada</span>
      ${asset.media_kind==='video'?`<span>MP4: ${mp4Ready?'pronto':latestJob?.status||'não gerado'}</span>`:''}
    </div>
    ${channels}
    ${reviewNote?`<div class="asset-review-note"><strong>Última observação</strong><span>${esc(reviewNote)}</span></div>`:''}
    <div class="asset-workflow-actions">${workflowActions}</div>
    ${asset.status==='review'&&owner?`<div class="review-note-row"><input type="text" maxlength="1000" data-review-note placeholder="Observação para aprovação ou motivo da reprovação"></div>`:''}
    <form class="asset-edit-form" data-asset-edit-id="${esc(asset.id)}" hidden>
      <label>Título<input name="title" maxlength="180" value="${esc(asset.title)}"></label>
      <label>Chamada principal<textarea name="headline" maxlength="220">${esc(editSpec.headline||'')}</textarea></label>
      <label>CTA<textarea name="cta" maxlength="180">${esc(editSpec.cta||'')}</textarea></label>
      <label class="wide">Motivo da alteração<input name="change_note" maxlength="1000" placeholder="Ex.: ajustar chamada e CTA"></label>
      <div class="asset-edit-actions wide"><button type="button" class="secondary" data-action="cancel-asset-edit" data-asset-id="${esc(asset.id)}">Cancelar</button><button type="submit" class="primary">Salvar alteração</button></div>
      <p class="asset-edit-message muted wide"></p>
    </form>
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
          <button class="secondary" type="button" data-action="plan-assets">${campaignAssets.length>=5?'Revisar plano':'Gerar 5 peças DRAFT'}</button>
          ${campaignAssets.length?`<button class="primary" type="button" data-action="render-campaign">Gerar mídias</button>`:''}
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

function renderChannelAccounts(){
  const mount=$('#channelAccountsView');if(!mount)return;
  const accounts=state.overview?.channel_accounts||[];
  const metaAccounts=state.overview?.meta_control_plane?.accounts||[];
  const metaWhatsApp=metaAccounts.find(a=>a.channel==='whatsapp')||null;
  if(!accounts.length){mount.innerHTML=empty('Nenhum canal cadastrado.');return}
  mount.innerHTML=`<div class="channel-grid">${accounts.map(a=>{
    const connected=['configured','verified'].includes(a.status);
    const isWhatsApp=a.channel==='whatsapp_status';
    let detail='Conexão necessária antes de publicar.';
    if(a.channel==='pinterest_pin')detail='OAuth do Pinterest ainda não conectado.';
    if(isWhatsApp&&metaWhatsApp){
      detail=metaWhatsApp.channel_status==='active'
        ?'Atendimento WhatsApp ativo; publicação em Status permanece manual.'
        :'WhatsApp detectado, mas ainda sem readiness para Status.';
    }
    const statusText=connected?(a.status==='verified'?'Verificado':'Configurado'):'Não conectado';
    const ready=connected&&(!isWhatsApp||a.capabilities?.manual_confirmation_required===true);
    return `<article class="channel-card ${connected?'connected':'disconnected'}">
      <div class="channel-card-head"><strong>${esc(channelLabel(a.channel))}</strong><span class="channel-state">${esc(statusText)}</span></div>
      <p>${esc(detail)}</p>
      <div class="channel-card-meta">
        <span>${esc(a.provider)}</span>
        <span>${esc(a.capabilities?.media||'mídia')}</span>
        ${isWhatsApp?'<span>manual</span>':''}
      </div>
      <small>${ready?'Pronto para preparação governada':'Bloqueado até concluir conexão/homologação'}</small>
    </article>`;
  }).join('')}</div>
  <div class="meta-readiness-note">
    <strong>Meta Control Plane</strong>
    <span>${metaWhatsApp?esc(`WhatsApp: ${metaWhatsApp.provider_state||'—'} · readiness ${metaWhatsApp.readiness_state||'—'}`):'Nenhuma conta Meta direta homologada para publicação.'}</span>
  </div>`;
}

function render(){
  const o=state.overview||{},r=o.runtime||{},m=state.metrics?.metrics?.counts||{},meta=r.metadata||{};
  const reviewAssets=(o.assets||[]).filter(a=>a.status==='review').length;
  $('#summaryCards').innerHTML=[['Campanhas',(o.campaigns||[]).length,'cadastradas'],['Conteúdos',m.assets_created||(o.assets||[]).length,'últimos 30 dias'],['Aguardando revisão',reviewAssets,'peças'],['Custo registrado',moneyCents(m.actual_cost_cents||0),'últimos 30 dias']].map(x=>`<article class="summary-card"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong><small>${esc(x[2])}</small></article>`).join('');
  const locked=o.safety?.external_actions_locked!==false;$('#safetyBadge').textContent=locked?'Publicação bloqueada · seguro':'Publicação habilitada';$('#safetyBadge').className=`safety-badge ${locked?'safe':'warn'}`;
  $('#runtimeSummary').innerHTML=`<div><div class="rule"><span>Publicação externa</span><strong class="${r.publishing_enabled?'danger':'ok'}">${r.publishing_enabled?'Ligada':'Desligada'}</strong></div><div class="rule"><span>Kill switch</span><strong class="ok">${r.kill_switch?'Ativo':'Inativo'}</strong></div><div class="rule"><span>Aprovação humana</span><strong>${r.require_approval===false?'Não':'Obrigatória'}</strong></div><div class="rule"><span>Imagem IA</span><strong>${esc(meta.image_generation_quality||'low')} · ${Number(meta.image_variants_default||1)} variação</strong></div><div class="rule"><span>Vídeo V1</span><strong>${Number(meta.video_duration_seconds||10)}s · ${esc(meta.video_mode||'light_motion')}</strong></div><div class="rule"><span>IA de estratégia</span><strong class="ok">${meta.strategy_ai_enabled===true?'Habilitada':'Bloqueada'}</strong></div></div>`;
  renderAssets();
  renderCampaigns();
  renderChannelAccounts();
  const jobs=o.jobs||[];$('#jobsList').innerHTML=jobs.length?`<div class="data-list">${jobs.map(j=>row(`${channelLabel(j.channel)} · ${j.content_type}`,j.scheduled_for?dt(j.scheduled_for):'Sem agendamento',j.status,j.manual_confirmation_required?'confirmação manual':'')).join('')}</div>`:empty('Nenhuma publicação preparada.');
  const templates=o.templates||[];$('#templatesList').innerHTML=templates.length?`<div class="data-list">${templates.map(t=>row(t.name,`${t.media_kind} · v${t.version}`,t.status,t.template_key)).join('')}</div>`:empty('Nenhum modelo ativo.');
  const cal=state.workflow?.calendar||[];$('#calendarList').innerHTML=cal.length?`<div class="data-list">${cal.slice(0,80).map(i=>row(i.title||i.channel||'Conteúdo',i.scheduled_for?dt(i.scheduled_for):'',i.status||'planejado',i.channel||'')).join('')}</div>`:empty('Agenda vazia.');
  $('#resultsView').innerHTML=`<div class="summary-grid"><article class="summary-card"><span>Cliques atribuídos</span><strong>${Number(m.attribution_clicks||0)}</strong></article><article class="summary-card"><span>Conversas</span><strong>${Number(m.attribution_conversations||0)}</strong></article><article class="summary-card"><span>Pedidos</span><strong>${Number(m.attribution_orders||0)}</strong></article><article class="summary-card"><span>Render OK</span><strong>${Number(m.render_success_rate_percent||0).toFixed(0)}%</strong></article></div>`;
  const settings=[['Modo',r.execution_mode||'off'],['Publicações/dia',r.max_daily_publications||0],['Imagens IA/dia',r.max_daily_ai_image_generations||0],['Vídeo IA/dia',`${r.max_daily_ai_video_seconds||0}s`],['Orçamento IA/dia',moneyCents(r.max_daily_ai_cost_cents||0)],['Imagem padrão',meta.image_generation_quality||'low'],['Variações',meta.image_variants_default||1],['Vídeo inicial',`${meta.video_duration_seconds||10}s · ${meta.video_mode||'light_motion'}`],['Marketing Brain',meta.strategy_model||'gpt-5.6-luna'],['Chamadas estratégicas/dia',meta.strategy_max_daily_calls||0],['Candidatos enviados à IA',meta.strategy_max_candidates||18],['Escalonamento de modelo',meta.strategy_auto_escalation===true?'Ligado':'Desligado']];
  $('#settingsView').innerHTML=`<div class="settings-grid">${settings.map(x=>`<div class="setting-card"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong></div>`).join('')}</div><p class="muted">A estratégia paga permanece bloqueada. A shortlist e os rascunhos econômicos usam somente SQL/código.</p>`;
  renderOpportunities();
  renderCustomerOpportunities();
}

async function load(){
  try{
    const [overview,metrics,workflow,shortlist,customerOpportunities,briefPayload]=await Promise.all([
      getMarketingOverview(),getMarketingMetrics(30),getMarketingWorkflow(),getMarketingShortlist(),
      getMarketingCustomerOpportunities(40),getMarketingStrategyBriefs(null,60)
    ]);
    state={overview,metrics,workflow,shortlist,customerOpportunities,strategyBriefs:briefPayload.items||[],previewUrls:state.previewUrls||{}};
    render();$('#authGate').hidden=true;$('#marketingApp').hidden=false;
  }catch(e){$('#authStatus').textContent=e.message||'Falha ao carregar.'}
}
async function refreshOpportunities(){
  $('#opportunityStatus').textContent='Analisando produtos elegíveis…';
  try{state.shortlist=await getMarketingShortlist();renderOpportunities();$('#opportunityStatus').textContent='Análise atualizada sem uso de IA.'}catch(e){$('#opportunityStatus').textContent=e.message||'Falha ao analisar.'}
}
async function refreshCustomerOpportunities(){
  const status=$('#customerOpportunityStatus');
  if(status)status.textContent='Atualizando oportunidades e briefs…';
  try{
    const [opportunities,briefPayload]=await Promise.all([getMarketingCustomerOpportunities(40),getMarketingStrategyBriefs(null,60)]);
    state.customerOpportunities=opportunities;
    state.strategyBriefs=briefPayload.items||[];
    renderCustomerOpportunities();
  }catch(e){if(status)status.textContent=e.message||'Falha ao atualizar oportunidades.'}
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
  const opportunityButton=e.target.closest('.customer-opportunity-card button[data-action]');
  if(opportunityButton){
    const card=opportunityButton.closest('.customer-opportunity-card');
    const opportunityId=card?.dataset.opportunityId;
    const message=card?.querySelector('.customer-opportunity-message');
    if(!opportunityId)return;
    opportunityButton.disabled=true;
    try{
      if(opportunityButton.dataset.action==='observe-opportunity'){
        if(message)message.textContent='Montando brief determinístico…';
        await observeMarketingOpportunity(opportunityId);
        if(message)message.textContent='Brief OBSERVE salvo. Zero IA e zero ação externa.';
      }
      if(opportunityButton.dataset.action==='suggest-opportunity'){
        if(message)message.textContent='Solicitando SUGGEST governado…';
        await suggestMarketingOpportunity(opportunityId);
        if(message)message.textContent='Sugestão salva. Nenhuma campanha ou mensagem foi criada.';
      }
      const briefPayload=await getMarketingStrategyBriefs(null,60);
      state.strategyBriefs=briefPayload.items||[];
      renderCustomerOpportunities();
    }catch(err){
      if(message)message.textContent=err.message||'Não foi possível concluir.';
    }finally{opportunityButton.disabled=false}
    return;
  }
  const button=e.target.closest('button[data-asset-id][data-action]');
  if(!button)return;
  const action=button.dataset.action,assetId=button.dataset.assetId;
  if(action==='render-preview'){await renderAssetPreview(assetId,button);return}
  if(action==='show-preview'){await showAssetPreview(assetId);return}
  if(action==='toggle-asset-edit'){
    const form=button.closest('.asset-card')?.querySelector('.asset-edit-form');if(form)form.hidden=!form.hidden;return;
  }
  if(action==='cancel-asset-edit'){
    const form=button.closest('.asset-card')?.querySelector('.asset-edit-form');if(form)form.hidden=true;return;
  }
  if(action==='submit-review'){
    button.disabled=true;
    try{await submitMarketingAssetReview(assetId);await load();document.querySelector('[data-tab="content"]')?.click()}
    catch(err){alert(err.message||'Não foi possível enviar para revisão.')}finally{button.disabled=false}
    return;
  }
  if(action==='approve-asset'){
    button.disabled=true;
    const note=button.closest('.asset-card')?.querySelector('[data-review-note]')?.value||'';
    try{await approveMarketingAsset(assetId,note);await load();document.querySelector('[data-tab="content"]')?.click()}
    catch(err){alert(err.message||'Não foi possível aprovar a peça.')}finally{button.disabled=false}
    return;
  }
  if(action==='reject-asset'){
    const input=button.closest('.asset-card')?.querySelector('[data-review-note]');
    const note=String(input?.value||'').trim();
    if(!note){if(input){input.focus();input.placeholder='Informe o motivo da reprovação';}return}
    button.disabled=true;
    try{await rejectMarketingAsset(assetId,note);await load();document.querySelector('[data-tab="content"]')?.click()}
    catch(err){alert(err.message||'Não foi possível reprovar a peça.')}finally{button.disabled=false}
    return;
  }
  if(action==='prepare-publication'){
    button.disabled=true;
    try{await prepareMarketingPublication(assetId);await load();document.querySelector('[data-tab="content"]')?.click()}
    catch(err){alert(err.message||'Não foi possível preparar os canais.')}finally{button.disabled=false}
    return;
  }
  if(action==='fork-asset'){
    button.disabled=true;
    try{const result=await forkMarketingAsset(assetId,'Nova versão criada pelo Admin');await load();document.querySelector('[data-tab="content"]')?.click()}
    catch(err){alert(err.message||'Não foi possível criar nova versão.')}finally{button.disabled=false}
    return;
  }
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
    return;
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
  if(button.dataset.action==='render-campaign'){
    const campaignAssets=(state.overview?.assets||[]).filter(a=>a.campaign_id===id&&!['approved','archived'].includes(a.status));
    if(!campaignAssets.length){message.textContent='Não há peças editáveis para gerar.';return}
    button.disabled=true;
    try{
      let done=0;
      for(const asset of campaignAssets){
        message.textContent=`Gerando ${done+1}/${campaignAssets.length}: ${asset.title}…`;
        await renderMarketingPreview(asset.id);
        if(asset.media_kind==='video'){
          try{await queueMarketingLightVideo(asset.id)}catch(err){
            if(!['light_video_queue_blocked'].includes(err.code))throw err;
          }
        }
        done++;
      }
      message.textContent=`${done} peça(s) gerada(s). Nenhuma publicação externa foi feita.`;
      await load();document.querySelector('[data-tab="content"]')?.click();
    }catch(err){message.textContent=err.message||'Falha ao gerar mídias.'}finally{button.disabled=false}
  }
});

document.addEventListener('submit',async e=>{
  const form=e.target.closest('.asset-edit-form');if(!form)return;
  e.preventDefault();
  const assetId=form.dataset.assetEditId;
  const asset=(state.overview?.assets||[]).find(a=>a.id===assetId);
  if(!asset)return;
  const submit=form.querySelector('button[type="submit"]');
  const message=form.querySelector('.asset-edit-message');
  const data=new FormData(form);
  const editSpec=structuredClone(asset.edit_spec||{});
  const headline=String(data.get('headline')||'').trim();
  const cta=String(data.get('cta')||'').trim();
  editSpec.headline=headline;
  editSpec.cta=cta;
  if(Array.isArray(editSpec.slide_plan)){
    editSpec.slide_plan=editSpec.slide_plan.map(slide=>{
      if(slide?.type==='cover')return {...slide,headline};
      if(slide?.type==='cta')return {...slide,cta};
      return slide;
    });
  }
  submit.disabled=true;if(message)message.textContent='Salvando e invalidando a prévia anterior…';
  try{
    await saveMarketingAssetEdit({
      asset_id:assetId,
      title:String(data.get('title')||asset.title).trim(),
      generation_mode:asset.generation_mode||'no_ai',
      source_refs:asset.source_refs||[],
      edit_spec:editSpec,
      render_spec:asset.render_spec||{},
      change_note:String(data.get('change_note')||'').trim()||'Alteração pelo Admin'
    });
    if(message)message.textContent='Alteração salva. Gere uma nova prévia antes de enviar para revisão.';
    await load();document.querySelector('[data-tab="content"]')?.click();
  }catch(err){if(message)message.textContent=err.message||'Falha ao salvar alteração.'}finally{submit.disabled=false}
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
$('#refreshCustomerOpportunities')?.addEventListener('click',refreshCustomerOpportunities);
$('#createDeterministicDraft').addEventListener('click',createDraft);
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==b.dataset.tab)}));
$('#menuButton')?.addEventListener('click',()=>{$('#sidebar')?.classList.toggle('open');$('#sidebarBackdrop')?.classList.toggle('hidden')});$('#sidebarBackdrop')?.addEventListener('click',()=>{$('#sidebar')?.classList.remove('open');$('#sidebarBackdrop')?.classList.add('hidden')});
if(!CONFIG.marketingUiEnabled)document.body.innerHTML='<main class="content"><div class="empty-state">Marketing ainda não está liberado.</div></main>';else if(getCustomerOsSession())load();
