import {CONFIG} from './runtime-config.js';
import {authenticateCustomerOsWithPin,getCustomerOsSession,clearCustomerOsSession} from './customer-os-auth.js';
import {getMarketingOverview,getMarketingMetrics,getMarketingWorkflow,getMarketingEditorialPlan,getMarketingTrackingPreview,getMarketingLearning,getMarketingDailyPlanPreview,getMarketingShortlist,getMarketingCustomerOpportunities,getMarketingStrategyBriefs,observeMarketingOpportunity,suggestMarketingOpportunity,createDeterministicMarketingDraft,planMarketingCampaignAssets,updateMarketingCampaignDraft,renderMarketingPreview,getMarketingMediaUrl,queueMarketingLightVideo,submitMarketingAssetReview,approveMarketingAsset,rejectMarketingAsset,prepareMarketingPublication,saveMarketingAssetEdit,forkMarketingAsset,getWhatsAppTemplateLibrary,getWhatsAppTemplateVersions,validateWhatsAppTemplateDraft,saveWhatsAppTemplateDraft,createAiWhatsAppTemplateDraft,getMarketingPublicationPreflight,verifyMarketingChannel,publishMarketingJob,getMarketingManualShareManifest,getMarketingConnectionOverview,saveMarketingProviderConfig,startMarketingOAuth,exchangeMarketingOAuth,completeMarketingOAuth,disconnectMarketingProvider} from './marketing-api.js';

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
  return (state.overview?.media||[]).filter(m=>m.asset_id===assetId&&m.role!=='output').sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));
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


function templateIssueLabel(v){
  return ({
    meta_policy_registry_not_yet_verified:'Política Meta ainda não verificada no registro',
    marketing_template_requires_consent_and_customer_protection:'Marketing depende de consentimento e Customer Protection',
    many_variables_review_recommended:'Muitas variáveis: revisar manualmente',
    template_key_invalid:'Chave interna inválida',
    body_required:'Texto obrigatório',
    body_exceeds_local_limit:'Texto acima do limite local',
    category_invalid:'Categoria inválida',
    language_code_invalid:'Código de idioma inválido',
    media_kind_invalid:'Tipo de mídia inválido',
    buttons_must_be_array:'Botões precisam estar em lista JSON',
    variable_syntax_invalid:'Sintaxe de variável inválida',
    variable_sequence_has_gap:'Variáveis precisam seguir sequência {{1}}, {{2}}…'
  })[String(v||'')]||String(v||'').replace(/_/g,' ');
}

function parseTemplateButtons(form){
  const raw=String(new FormData(form).get('buttons_json')||'[]').trim()||'[]';
  let buttons;
  try{buttons=JSON.parse(raw)}catch{throw new Error('O campo Botões precisa ser um JSON válido.')}
  if(!Array.isArray(buttons))throw new Error('O campo Botões precisa ser uma lista JSON.');
  return buttons;
}

function templateFormPayload(){
  const form=$('#templateDraftForm');
  const data=new FormData(form);
  return {
    template_key:String(data.get('template_key')||'').trim().toLowerCase(),
    meta_template_name:String(data.get('meta_template_name')||'').trim(),
    category:String(data.get('category')||'UTILITY').trim(),
    language_code:String(data.get('language_code')||'pt_BR').trim(),
    purpose:String(data.get('purpose')||'').trim(),
    body_text:String(data.get('body_text')||'').trim(),
    media_kind:String(data.get('media_kind')||'none').trim(),
    media_url:String(data.get('media_url')||'').trim(),
    buttons:parseTemplateButtons(form),
    strategy_brief_id:String(data.get('strategy_brief_id')||'').trim()||null,
    creative_asset_id:String(data.get('creative_asset_id')||'').trim()||null,
    notes:String(data.get('notes')||'').trim(),
    change_note:String(data.get('change_note')||'').trim()
  };
}

function resetTemplateDraftForm(){
  const form=$('#templateDraftForm');if(!form)return;
  form.reset();
  form.elements.language_code.value='pt_BR';
  form.elements.category.value='UTILITY';
  form.elements.media_kind.value='none';
  form.elements.buttons_json.value='[]';
  form.elements.template_key.readOnly=false;
  form.elements.editing_key.value='';
  $('#templateDraftStatus').textContent='';
}

function editTemplateDraft(key){
  const lib=state.templateLibrary||{};
  const t=(lib.templates||[]).find(x=>x.template_key===key);if(!t)return;
  const form=$('#templateDraftForm');
  form.elements.editing_key.value=t.template_key||'';
  form.elements.template_key.value=t.template_key||'';
  form.elements.template_key.readOnly=true;
  form.elements.meta_template_name.value=t.meta_template_name||'';
  form.elements.category.value=t.category||'UTILITY';
  form.elements.language_code.value=t.language_code||'pt_BR';
  form.elements.purpose.value=t.purpose||'';
  form.elements.body_text.value=t.body_text||'';
  form.elements.media_kind.value=t.media_kind||'none';
  form.elements.media_url.value=t.media_url||'';
  form.elements.strategy_brief_id.value=t.strategy_brief_id||'';
  form.elements.creative_asset_id.value=t.creative_asset_id||'';
  form.elements.buttons_json.value=JSON.stringify(Array.isArray(t.buttons)?t.buttons:[],null,2);
  form.elements.notes.value=t.notes||'';
  form.elements.change_note.value='';
  $('#templateDraftStatus').textContent=`Editando ${t.template_key} · versão atual ${t.current_version||1}. Salvar mudança cria nova versão quando necessário.`;
  form.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderTemplateAssistant(){
  const lib=state.templateLibrary||{};
  const summary=lib.summary||{};
  const policy=lib.policy||{};
  const templates=lib.templates||[];
  const form=$('#templateDraftForm');
  if(!form)return;
  const gate=$('#templateAiGate');
  if(gate)gate.textContent=policy.ai_enabled===true?'IA de rascunho habilitada':'IA bloqueada · custo zero';
  const aiButton=$('#createAiTemplateDraft');
  if(aiButton){
    aiButton.disabled=policy.ai_enabled!==true;
    aiButton.title=policy.ai_enabled===true?'Criar rascunho com IA governada':'Gate de IA fechado: nenhuma chamada paga será feita';
  }
  const summaryMount=$('#templateSummaryCards');
  if(summaryMount)summaryMount.innerHTML=[
    ['Templates',summary.templates||0,'biblioteca local'],
    ['DRAFT',summary.drafts||0,'sem submissão'],
    ['Com aviso',summary.warnings||0,'revisão local'],
    ['IA usada',summary.ai_generated||0,'rascunhos']
  ].map(x=>`<article class="summary-card"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong><small>${esc(x[2])}</small></article>`).join('');

  const briefSelect=form.elements.strategy_brief_id;
  const assetSelect=form.elements.creative_asset_id;
  const briefValue=briefSelect.value,assetValue=assetSelect.value;
  briefSelect.innerHTML='<option value="">Sem brief associado</option>'+((lib.strategy_briefs||[]).map(b=>`<option value="${esc(b.id)}">${esc(b.strategy_key||'estratégia')} · ${esc(b.mode||'brief')} · ${Math.round(Number(b.confidence||0)*100)}%</option>`).join(''));
  assetSelect.innerHTML='<option value="">Sem peça associada</option>'+((lib.creative_assets||[]).map(a=>`<option value="${esc(a.id)}">${esc(a.title||'Peça')} · ${esc(a.media_kind||'mídia')} · ${esc(a.status||'')}</option>`).join(''));
  if([...briefSelect.options].some(o=>o.value===briefValue))briefSelect.value=briefValue;
  if([...assetSelect.options].some(o=>o.value===assetValue))assetSelect.value=assetValue;

  const mount=$('#whatsappTemplateList');
  if(!templates.length){mount.innerHTML=empty('Nenhum template local cadastrado.');return}
  mount.innerHTML=`<div class="template-library">${templates.map(t=>{
    const report=t.validation_report||{};
    const warnings=Array.isArray(report.warnings)?report.warnings:[];
    const errors=Array.isArray(report.errors)?report.errors:[];
    const vars=t.variable_schema?.positions||[];
    return `<article class="template-card" data-template-key="${esc(t.template_key)}">
      <div class="template-card-head">
        <div><span class="status-chip">${esc(t.local_status||'draft')}</span><h3>${esc(t.template_key)}</h3><p>${esc(t.purpose||'Sem finalidade')}</p></div>
        <div class="template-card-actions"><button class="secondary" type="button" data-template-action="edit">Editar</button><button class="secondary" type="button" data-template-action="versions">Versões</button></div>
      </div>
      <div class="template-card-meta"><span>${esc(t.category||'UTILITY')}</span><span>${esc(t.language_code||'pt_BR')}</span><span>v${esc(t.current_version||1)}</span><span>Meta: ${esc(t.meta_status||'not_submitted')}</span><span>Variáveis: ${esc(vars.length)}</span></div>
      <pre class="template-body-preview">${esc(t.body_text||'')}</pre>
      <div class="template-validation ${esc(t.validation_status||'pending')}">
        <strong>Validação local: ${esc(t.validation_status||'pending')}</strong>
        ${warnings.map(x=>`<span>${esc(templateIssueLabel(x))}</span>`).join('')}
        ${errors.map(x=>`<span class="error">${esc(templateIssueLabel(x))}</span>`).join('')}
      </div>
      <div class="template-version-slot" data-template-version-slot hidden></div>
    </article>`;
  }).join('')}</div>`;
}

async function refreshTemplateLibrary(){
  state.templateLibrary=await getWhatsAppTemplateLibrary();
  renderTemplateAssistant();
}

const manualShareCache=new Map();
function channelAccount(channel){return (state.overview?.channel_accounts||[]).find(a=>a.channel===channel)||null}
function publishGateOpen(){const r=state.overview?.runtime||{};return r.publishing_enabled===true&&r.kill_switch!==true&&['canary','live'].includes(r.execution_mode)}
function channelGateOpen(channel){const r=state.overview?.runtime||{};const key=({instagram_feed:'instagram_feed_publish_enabled',instagram_story:'instagram_story_publish_enabled',instagram_reel:'instagram_reel_publish_enabled',instagram_carousel:'instagram_carousel_publish_enabled',facebook_post:'facebook_post_publish_enabled',facebook_reel:'facebook_reel_publish_enabled',pinterest_pin:'pinterest_publish_enabled'})[channel];return Boolean(key&&r[key]===true&&publishGateOpen())}
function publicationActionHtml(job){
  const manual=job.manual_confirmation_required===true||['whatsapp_status','facebook_story'].includes(job.channel);
  const account=channelAccount(job.channel);
  if(job.status==='published')return '<span class="status-chip ok">Publicado</span>';
  if(job.status==='review_required')return '<button class="secondary" type="button" disabled>Revisão necessária</button>';
  if(manual){const prepared=manualShareCache.has(job.id);const label=prepared?'Compartilhar agora':(job.channel==='whatsapp_status'?'Preparar Status':'Preparar Story');return `<button class="primary" type="button" data-publish-action="${prepared?'manual-share-now':'manual-share-prepare'}" data-job-id="${esc(job.id)}">${label}</button>`;}
  if(account?.status!=='verified'){if(account&&['configured','error'].includes(account.status))return `<button class="secondary" type="button" data-publish-action="verify-channel" data-job-id="${esc(job.id)}" data-channel-account-id="${esc(account.id)}">Verificar conexão</button>`;return '<button class="secondary" type="button" disabled>Credencial pendente</button>';}
  return `<button class="primary" type="button" data-publish-action="publish-now" data-job-id="${esc(job.id)}" ${channelGateOpen(job.channel)?'':'disabled'}>${channelGateOpen(job.channel)?'Publicar agora':'Gate desligado'}</button>`;
}
function renderPublicationJobs(){
  const jobs=state.overview?.jobs||[],mount=$('#jobsList');if(!mount)return;
  if(!jobs.length){mount.innerHTML=empty('Nenhuma publicação preparada.');return}
  mount.innerHTML=`<div class="publication-stack">${jobs.map(j=>{const account=channelAccount(j.channel);const detail=[j.scheduled_for?dt(j.scheduled_for):'Sem agendamento',`canal ${account?.status||'desconectado'}`,j.last_error?`erro: ${j.last_error}`:''].filter(Boolean).join(' · ');return `<article class="publication-card"><div><strong>${esc(channelLabel(j.channel))} · ${esc(j.content_type)}</strong><small>${esc(detail)}</small></div><span class="status-chip">${esc(j.status)}</span><div class="publication-actions">${publicationActionHtml(j)}</div><p class="publication-message muted" data-publication-message="${esc(j.id)}"></p></article>`;}).join('')}</div>`;
}
function round7ChannelMode(a){return ['whatsapp_status','facebook_story'].includes(a.channel)?'manual':'direct'}
function round7ChannelStatusText(a){if(round7ChannelMode(a)==='manual')return 'Manual no celular';if(a.status==='verified')return 'Conexão verificada';if(a.status==='configured')return 'Pronta para verificar';if(a.status==='error')return 'Verificação com erro';return 'Credencial pendente'}
function round8ProviderReady(provider){
  const c=state.connections?.connection||{},p=c?.[provider]||{};
  return p.app_id_set===true&&p.app_secret_set===true&&(provider!=='meta'||/^v\d+\.\d+$/.test(String(p.graph_version||'')));
}
function renderOAuthCandidates(){
  const sel=state.oauthSelection;if(!sel)return '';
  const title=sel.provider==='meta'?'Escolha a Página da Dona Antônia':'Escolha o board do Pinterest';
  const cards=(sel.candidates||[]).map(c=>`<button class="oauth-choice" type="button" data-oauth-choice="${esc(c.id)}"><strong>${esc(c.name||c.id)}</strong><span>${sel.provider==='meta'?(c.instagram?.username?'Instagram @'+esc(c.instagram.username):'Sem Instagram profissional vinculado'):esc(c.privacy||'board')}</span></button>`).join('');
  return `<section class="oauth-choice-panel"><div><span class="eyebrow">Conexão autorizada</span><h3>${title}</h3><p>A credencial já está segura no backend temporário. Escolha qual conta deve ser usada pelo Marketing.</p></div><div class="oauth-choice-grid">${cards||'<div class="empty-state">Nenhuma conta elegível encontrada.</div>'}</div><p class="oauth-selection-message muted" data-oauth-selection-message></p></section>`;
}
function renderRound8ConnectionManager(){
  const mount=$('#channelAccountsView');if(!mount)return;
  const c=state.connections?.connection||{},owner=state.overview?.user?.role==='owner',meta=c.meta||{},pin=c.pinterest||{},channels=c.channels||state.overview?.channel_accounts||[];
  const providerCard=(provider,label,p,description)=>{
    const ready=round8ProviderReady(provider),connected=channels.some(a=>a.provider===provider&&a.status==='verified');
    const graph=provider==='meta'?String(p.graph_version||''):'';
    const missing=[p.app_id_set!==true?'App ID':null,p.app_secret_set!==true?'App Secret':null,provider==='meta'&&!/^v\d+\.\d+$/.test(graph)?'Graph version':null].filter(Boolean);
    return `<article class="provider-connect-card ${connected?'verified':ready?'ready':'pending'}">
      <div class="provider-connect-head"><div><span class="eyebrow">${esc(provider==='meta'?'Meta':'Pinterest')}</span><h3>${esc(label)}</h3></div><span class="status-chip">${connected?'conectado':ready?'pronto':'configuração incompleta'}</span></div>
      <p>${esc(description)}</p>
      <div class="provider-config-status"><span>App ID: ${p.app_id_set?'salvo':'faltando'}</span><span>Secret: ${p.app_secret_set?'Vault ✓':'faltando'}</span>${provider==='meta'? `<span>Graph: ${esc(graph||'faltando')}</span>`:''}</div>
      ${owner&&!ready?`<form class="provider-config-form" data-provider-config="${provider}">
        <label>App ID<input name="app_id" autocomplete="off" required placeholder="${provider==='meta'?'ID do app Meta':'ID do app Pinterest'}"></label>
        ${provider==='meta'? `<label>Graph API<input name="graph_version" value="${esc(graph)}" pattern="v[0-9]+\\.[0-9]+" required></label>`:''}
        <label class="wide">App Secret<input name="app_secret" type="password" autocomplete="new-password" ${p.app_secret_set?'':'required'} placeholder="${p.app_secret_set?'Já existe no Vault — deixe vazio para manter':'Cole o App Secret'}"></label>
        <button class="secondary" type="submit">Salvar configuração</button><p class="muted" data-provider-config-message></p>
      </form>`:''}
      <div class="provider-connect-actions">${owner&&ready?`<button class="primary" type="button" data-provider-oauth="${provider}">${connected?'Reconectar':'Conectar'} ${esc(provider==='meta'?'Meta':'Pinterest')}</button>`:''}${owner&&connected?`<button class="secondary" type="button" data-provider-disconnect="${provider}">Desconectar</button>`:''}${missing.length?`<small>Falta: ${esc(missing.join(' · '))}</small>`:''}</div>
      <p class="provider-connect-message muted" data-provider-message="${provider}"></p>
    </article>`;
  };
  const metaDesc='Uma autorização configura Facebook e Instagram juntos. O sistema descobre suas Pages e o Instagram profissional vinculado.';
  const pinDesc='Autoriza o Pinterest, lista seus boards e salva access/refresh token no Vault.';
  const channelCards=channels.map(a=>{const manual=['whatsapp_status','facebook_story'].includes(a.channel),verified=a.status==='verified',name=a.identity_name||a.external_account_id||'';return `<article class="channel-connection-card ${verified?'verified':manual?'manual':'pending'}"><div class="channel-connection-head"><div><strong>${esc(channelLabel(a.channel))}</strong><small>${esc(a.provider)}${name?' · '+esc(name):''}</small></div><span class="status-chip">${esc(manual?'manual':a.status||'disconnected')}</span></div><p>${manual?(a.channel==='whatsapp_status'?'Status continua com confirmação no celular.':'Story do Facebook continua com compartilhamento manual/cross-share.'):(verified?'Identidade e credencial verificadas. Gate de publicação continua separado.':'Aguardando conexão ou verificação.')}</p></article>`;}).join('');
  mount.innerHTML=`<div class="provider-connect-grid">${providerCard('meta','Facebook + Instagram',meta,metaDesc)}${providerCard('pinterest','Pinterest',pin,pinDesc)}</div>${renderOAuthCandidates()}<div class="channel-connection-grid">${channelCards}</div><div class="oauth-security-note"><strong>Segurança</strong><span>Tokens ficam no Supabase Vault. O navegador recebe apenas code/state durante OAuth; publicação continua bloqueada pelos gates da Rodada 7.</span></div>`;
}

async function prepareManualSharePublication(jobId){
  const manifest=await getMarketingManualShareManifest(jobId),items=manifest.items||[];if(!items.length)throw new Error('Mídia não disponível para compartilhar.');
  const files=[];for(const item of items){const res=await fetch(item.url,{cache:'no-store'});if(!res.ok)throw new Error('Não foi possível preparar a mídia.');const blob=await res.blob();files.push(new File([blob],item.filename||'dona-antonia',{type:item.mime_type||blob.type||'application/octet-stream'}));}
  manualShareCache.set(jobId,{manifest,files,preparedAt:Date.now()});return 'Mídia pronta. Toque em “Compartilhar agora”.';
}
function sharePreparedPublication(jobId){
  const prepared=manualShareCache.get(jobId);if(!prepared||Date.now()-prepared.preparedAt>8*60*1000){manualShareCache.delete(jobId);throw new Error('A preparação expirou. Prepare novamente.');}
  const payload={files:prepared.files,text:prepared.manifest.caption||''};
  if(navigator.share&&(!navigator.canShare||navigator.canShare(payload)))return navigator.share(payload).then(()=> 'Compartilhamento aberto pelo sistema. Confirme WhatsApp > Meu status ou o Story desejado.');
  const first=prepared.manifest.items?.[0]?.url;if(first)window.open(first,'_blank','noopener');return Promise.resolve('O navegador não compartilha arquivos diretamente. A mídia foi aberta para envio manual.');
}

function renderEditorialPlan(){
  const mount=$('#editorialPlanSummary');if(!mount)return;
  const plan=state.editorialPlan?.plan;
  if(!plan){mount.innerHTML=empty('Plano editorial ainda não carregado.');return}
  const s=plan.summary||{},items=Array.isArray(plan.suggestions)?plan.suggestions:[];
  const cards=`<div class="summary-grid"><article class="summary-card"><span>Agendadas</span><strong>${Number(s.scheduled||0)}</strong><small>já definidas</small></article><article class="summary-card"><span>Sem horário</span><strong>${Number(s.unscheduled_approved||0)}</strong><small>aprovadas</small></article><article class="summary-card"><span>Conflitos</span><strong>${Number(s.schedule_conflicts||0)}</strong><small>intervalo menor que 90 min</small></article><article class="summary-card"><span>Automático</span><strong>OFF</strong><small>somente sugestão</small></article></div>`;
  const list=items.length?`<div class="data-list">${items.slice(0,20).map(i=>row(i.title||channelLabel(i.channel),`${channelLabel(i.channel)} · ${i.recommendation_reason==='already_scheduled'?'já agendado':'distribuição operacional'}`,i.status||'approved',dt(i.recommended_for))).join('')}</div>`:empty('Nenhuma peça aprovada aguardando agenda.');
  mount.innerHTML=cards+list;
}

function renderLearningEngine(){
  const mount=$('#learningEngineView');if(!mount)return;
  const learning=state.learning?.learning;
  if(!learning){mount.innerHTML=empty('Learning Engine ainda sem leitura.');return}
  const evidence=learning.evidence||{},channels=Array.isArray(learning.channels)?learning.channels:[];
  const status=learning.status==='observational'?'OBSERVE':'DADOS INSUFICIENTES';
  const channelHtml=channels.length?`<div class="settings-grid">${channels.map(c=>`<div class="setting-card"><span>${esc(channelLabel(c.channel))}</span><strong>${Number(c.publications||0)} publicação(ões)</strong><small>${Number(c.clicks||0)} cliques · ${Number(c.conversations||0)} conversas · ${Number(c.orders||0)} pedidos · ${esc(c.evidence||'insufficient')}</small></div>`).join('')}</div>`:empty('Ainda não há publicações/touchpoints suficientes para aprender.');
  mount.innerHTML=`<div class="section-title learning-title"><div><span class="marketing-eyebrow">LEARNING ENGINE V1</span><h3>Aprendizado determinístico</h3><p>Somente evidência observada; sem IA e sem otimização automática.</p></div><span class="phase-pill">${status}</span></div><p class="muted">Amostra: ${Number(evidence.publications||0)} publicação(ões) e ${Number(evidence.touchpoints||0)} touchpoint(s). Mínimo para observação: ${Number(evidence.minimum_publications||3)} publicações + ${Number(evidence.minimum_touchpoints||5)} touchpoints.</p>${channelHtml}`;
}

function renderDailyPlanPreview(){
  const mount=$('#dailyPlanPreview');if(!mount)return;
  const p=state.dailyPlan?.preview;
  if(!p){mount.innerHTML=empty('Simulação diária ainda não carregada.');return}
  const products=Array.isArray(p.candidate_products)?p.candidate_products:[];
  const labels={NO_ACTION:'Sem ação necessária',REVIEW_EXISTING_DRAFTS:'Revisar rascunhos existentes',REVIEW_SHORTLIST:'Revisar shortlist'};
  const productsHtml=products.length?`<div class="brain-products"><span>Candidatos determinísticos</span>${products.map(x=>`<b>${esc(x.name||'Produto')}</b>`).join('')}</div>`:'<div class="brain-empty">Nenhum produto elegível hoje.</div>';
  mount.innerHTML=`<div class="daily-preview-grid"><div><span>Próximo passo interno</span><strong>${esc(labels[p.recommended_internal_step]||p.recommended_internal_step||'—')}</strong></div><div><span>Campanhas DRAFT</span><strong>${Number(p.draft_campaigns||0)}</strong></div><div><span>Runtime</span><strong>${esc(p.runtime_mode||'off')}</strong></div><div><span>Publicação</span><strong>${p.publishing_enabled===true?'Ligada':'Bloqueada'}</strong></div></div>${productsHtml}<p class="muted">Preview only: não cria campanha, não prepara jobs, não agenda e não publica.</p>`;
}

function render(){
  const o=state.overview||{},r=o.runtime||{},m=state.metrics?.metrics?.counts||{},meta=r.metadata||{};
  const reviewAssets=(o.assets||[]).filter(a=>a.status==='review').length;
  $('#summaryCards').innerHTML=[['Campanhas',(o.campaigns||[]).length,'cadastradas'],['Conteúdos',m.assets_created||(o.assets||[]).length,'últimos 30 dias'],['Aguardando revisão',reviewAssets,'peças'],['Custo registrado',moneyCents(m.actual_cost_cents||0),'últimos 30 dias']].map(x=>`<article class="summary-card"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong><small>${esc(x[2])}</small></article>`).join('');
  const locked=o.safety?.external_actions_locked!==false;$('#safetyBadge').textContent=locked?'Publicação bloqueada · seguro':'Publicação habilitada';$('#safetyBadge').className=`safety-badge ${locked?'safe':'warn'}`;
  $('#runtimeSummary').innerHTML=`<div><div class="rule"><span>Publicação externa</span><strong class="${r.publishing_enabled?'danger':'ok'}">${r.publishing_enabled?'Ligada':'Desligada'}</strong></div><div class="rule"><span>Kill switch</span><strong class="ok">${r.kill_switch?'Ativo':'Inativo'}</strong></div><div class="rule"><span>Aprovação humana</span><strong>${r.require_approval===false?'Não':'Obrigatória'}</strong></div><div class="rule"><span>Imagem IA</span><strong>${esc(meta.image_generation_quality||'low')} · ${Number(meta.image_variants_default||1)} variação</strong></div><div class="rule"><span>Vídeo V1</span><strong>${Number(meta.video_duration_seconds||10)}s · ${esc(meta.video_mode||'light_motion')}</strong></div><div class="rule"><span>IA de estratégia</span><strong class="ok">${meta.strategy_ai_enabled===true?'Habilitada':'Bloqueada'}</strong></div></div>`;
  renderAssets();
  renderCampaigns();
  renderRound8ConnectionManager();
  renderPublicationJobs();
  renderEditorialPlan();
  renderLearningEngine();
  renderDailyPlanPreview();
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
    const [overview,metrics,workflow,shortlist,customerOpportunities,briefPayload,templateLibrary,connections,editorialPlan,learning,dailyPlan]=await Promise.all([
      getMarketingOverview(),getMarketingMetrics(30),getMarketingWorkflow(),getMarketingShortlist(),
      getMarketingCustomerOpportunities(40),getMarketingStrategyBriefs(null,60),getWhatsAppTemplateLibrary(),getMarketingConnectionOverview(),
      getMarketingEditorialPlan(14).catch(()=>null),getMarketingLearning(90).catch(()=>null),getMarketingDailyPlanPreview().catch(()=>null)
    ]);
    state={overview,metrics,workflow,shortlist,customerOpportunities,strategyBriefs:briefPayload.items||[],templateLibrary,connections,editorialPlan,learning,dailyPlan,previewUrls:state.previewUrls||{},oauthSelection:state.oauthSelection||null,pendingOAuthProvider:state.pendingOAuthProvider||null};
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
  const templateButton=e.target.closest('.template-card button[data-template-action]');
  if(templateButton){
    const card=templateButton.closest('.template-card');
    const key=card?.dataset.templateKey;
    if(!key)return;
    if(templateButton.dataset.templateAction==='edit'){editTemplateDraft(key);return}
    if(templateButton.dataset.templateAction==='versions'){
      const slot=card.querySelector('[data-template-version-slot]');
      if(!slot)return;
      if(!slot.hidden){slot.hidden=true;return}
      slot.hidden=false;slot.innerHTML='<div class="muted">Carregando versões…</div>';
      try{
        const result=await getWhatsAppTemplateVersions(key);
        const versions=result.versions||[];
        slot.innerHTML=versions.length?`<div class="template-version-list">${versions.map(v=>`<div><strong>v${esc(v.version)}</strong><span>${esc(v.validation_status||'pending')} · ${esc(v.source_kind||'manual')}</span><small>${dt(v.updated_at||v.created_at)}${v.change_note?' · '+esc(v.change_note):''}</small></div>`).join('')}</div>`:empty('Sem histórico de versões.');
      }catch(err){slot.innerHTML=`<div class="empty-state">${esc(err.message||'Falha ao carregar versões.')}</div>`}
      return;
    }
  }
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

document.addEventListener('click',async e=>{
  const button=e.target.closest('button[data-publish-action][data-job-id]');
  if(!button)return;
  const jobId=button.dataset.jobId,action=button.dataset.publishAction;
  const message=document.querySelector(`[data-publication-message="${CSS.escape(jobId)}"]`);
  button.disabled=true;
  try{
    if(action==='manual-share-prepare'){if(message)message.textContent='Preparando mídia segura…';const result=await prepareManualSharePublication(jobId);button.dataset.publishAction='manual-share-now';button.textContent='Compartilhar agora';if(message)message.textContent=result;return}
    if(action==='manual-share-now'){if(message)message.textContent='Abrindo compartilhamento nativo…';const result=await sharePreparedPublication(jobId);if(message)message.textContent=result;return}
    if(action==='verify-channel'){if(message)message.textContent='Verificando credencial e conta…';const accountId=button.dataset.channelAccountId;if(!accountId)throw new Error('Conta do canal não encontrada.');await verifyMarketingChannel(accountId);if(message)message.textContent='Conexão verificada.';await load();return}
    if(action==='publish-now'){if(message)message.textContent='Executando preflight…';const pre=await getMarketingPublicationPreflight(jobId);if(pre.result?.eligible_for_external_publish!==true)throw new Error('Publicação bloqueada pelos gates de segurança.');if(message)message.textContent='Publicando pelo conector oficial…';await publishMarketingJob(jobId);if(message)message.textContent='Publicado pelo conector oficial.';await load();return}
  }catch(err){if(message)message.textContent=err.message||'Não foi possível concluir.';}finally{button.disabled=false}
});

document.addEventListener('click',async e=>{
  const button=e.target.closest('button[data-channel-action][data-channel-account-id]');if(!button)return;
  if(button.dataset.channelAction!=='verify-channel')return;
  const accountId=button.dataset.channelAccountId,message=document.querySelector(`[data-channel-message="${CSS.escape(accountId)}"]`);
  button.disabled=true;
  try{if(message)message.textContent='Verificando credencial e identidade da conta…';await verifyMarketingChannel(accountId);if(message)message.textContent='Conexão verificada.';await load()}
  catch(err){if(message)message.textContent=err.message||'Não foi possível verificar a conexão.'}
  finally{button.disabled=false}
});

let marketingOAuthPopup=null;
async function beginMarketingOAuth(provider,button){
  if(marketingOAuthPopup&&!marketingOAuthPopup.closed)marketingOAuthPopup.close();
  marketingOAuthPopup=window.open('about:blank','donaAntoniaMarketingOAuth','popup=yes,width=640,height=760');
  if(!marketingOAuthPopup)throw new Error('O navegador bloqueou a janela de conexão. Libere pop-ups para o Admin.');
  marketingOAuthPopup.document.write('<p style="font-family:system-ui;padding:24px">Preparando conexão segura…</p>');
  try{const result=await startMarketingOAuth(provider);state.pendingOAuthProvider=provider;marketingOAuthPopup.location.href=result.authorization_url;}
  catch(err){marketingOAuthPopup.close();marketingOAuthPopup=null;throw err}
}
window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.data?.type!=='marketing-oauth-callback')return;
  const provider=state.pendingOAuthProvider;if(!provider)return;
  const message=document.querySelector(`[data-provider-message="${CSS.escape(provider)}"]`);
  if(event.data?.error){if(message)message.textContent=event.data.error_description||event.data.error;return}
  if(message)message.textContent='Autorização recebida. Descobrindo contas…';
  try{
    const result=await exchangeMarketingOAuth({provider,code:event.data.code,state:event.data.state});
    state.oauthSelection={provider,session_id:result.session_id,candidates:result.candidates||[]};
    if(result.auto_select&&result.candidates?.length===1){
      if(message)message.textContent='Uma conta encontrada. Concluindo conexão…';
      await completeMarketingOAuth({session_id:result.session_id,selection_id:result.candidates[0].id});
      state.oauthSelection=null;state.pendingOAuthProvider=null;await load();
    }else{renderRound8ConnectionManager();if(message)message.textContent='Escolha a conta correta abaixo.'}
  }catch(err){if(message)message.textContent=err.message||'Falha ao concluir OAuth.'}
});

document.addEventListener('submit',async e=>{
  const form=e.target.closest('form[data-provider-config]');if(!form)return;
  e.preventDefault();const provider=form.dataset.providerConfig,data=new FormData(form),button=form.querySelector('button[type="submit"]'),message=form.querySelector('[data-provider-config-message]');
  button.disabled=true;if(message)message.textContent='Salvando no Vault…';
  try{
    const payload={provider,app_id:String(data.get('app_id')||'').trim(),app_secret:String(data.get('app_secret')||'').trim()};
    if(provider==='meta')payload.graph_version=String(data.get('graph_version')||'').trim();
    state.connections=await saveMarketingProviderConfig(payload);if(message)message.textContent='Configuração salva.';await load();
  }catch(err){if(message)message.textContent=err.message||'Não foi possível salvar.'}finally{button.disabled=false}
});

document.addEventListener('click',async e=>{
  const disconnectButton=e.target.closest('button[data-provider-disconnect]');
  if(disconnectButton){const provider=disconnectButton.dataset.providerDisconnect,message=document.querySelector(`[data-provider-message="${CSS.escape(provider)}"]`);disconnectButton.disabled=true;try{if(message)message.textContent='Removendo credencial local do Vault…';state.connections=await disconnectMarketingProvider(provider);state.oauthSelection=null;state.pendingOAuthProvider=null;await load();}catch(err){if(message)message.textContent=err.message||'Não foi possível desconectar.'}finally{disconnectButton.disabled=false}return}
  const oauthButton=e.target.closest('button[data-provider-oauth]');
  if(oauthButton){const provider=oauthButton.dataset.providerOauth,message=document.querySelector(`[data-provider-message="${CSS.escape(provider)}"]`);oauthButton.disabled=true;try{if(message)message.textContent='Abrindo autorização oficial…';await beginMarketingOAuth(provider,oauthButton)}catch(err){if(message)message.textContent=err.message||'Falha ao iniciar conexão.'}finally{oauthButton.disabled=false}return}
  const choice=e.target.closest('button[data-oauth-choice]');
  if(choice&&state.oauthSelection){const msg=document.querySelector('[data-oauth-selection-message]');choice.disabled=true;try{if(msg)msg.textContent='Salvando credencial no Vault e verificando canais…';await completeMarketingOAuth({session_id:state.oauthSelection.session_id,selection_id:choice.dataset.oauthChoice});state.oauthSelection=null;state.pendingOAuthProvider=null;await load();}catch(err){if(msg)msg.textContent=err.message||'Falha ao concluir conexão.'}finally{choice.disabled=false}return}
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

$('#templateDraftForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const status=$('#templateDraftStatus'),button=$('#saveTemplateDraft');
  button.disabled=true;status.textContent='Validando e salvando DRAFT…';
  try{
    const payload=templateFormPayload();
    const result=await saveWhatsAppTemplateDraft(payload);
    const version=result.version||result.template?.current_version||1;
    status.textContent=`DRAFT salvo como v${version}. Nenhuma submissão à Meta foi feita.`;
    await refreshTemplateLibrary();
    editTemplateDraft(payload.template_key);
  }catch(err){
    const validation=err.data?.validation;
    const issues=[...(validation?.errors||[]),...(validation?.warnings||[])].map(templateIssueLabel);
    status.textContent=issues.length?issues.join(' · '):(err.message||'Não foi possível salvar o template.');
  }finally{button.disabled=false}
});

$('#validateTemplateDraft')?.addEventListener('click',async()=>{
  const status=$('#templateDraftStatus'),button=$('#validateTemplateDraft');
  button.disabled=true;status.textContent='Validando estrutura local…';
  try{
    const result=await validateWhatsAppTemplateDraft(templateFormPayload());
    const v=result.validation||{};
    const issues=[...(v.errors||[]),...(v.warnings||[])].map(templateIssueLabel);
    status.textContent=`${v.valid?'Estrutura local válida':'Estrutura inválida'} · ${issues.length?issues.join(' · '):'sem avisos'} · nenhuma consulta/submissão à Meta.`;
  }catch(err){status.textContent=err.message||'Falha na validação.'}finally{button.disabled=false}
});

$('#resetTemplateDraft')?.addEventListener('click',resetTemplateDraftForm);

$('#createAiTemplateDraft')?.addEventListener('click',async()=>{
  const form=$('#templateDraftForm'),data=new FormData(form),status=$('#templateDraftStatus'),button=$('#createAiTemplateDraft');
  button.disabled=true;status.textContent='Gerando rascunho com IA governada…';
  try{
    const result=await createAiWhatsAppTemplateDraft({
      prompt:[String(data.get('purpose')||''),String(data.get('notes')||'')].filter(Boolean).join(' · '),
      category:String(data.get('category')||'UTILITY'),
      language_code:String(data.get('language_code')||'pt_BR'),
      strategy_brief_id:String(data.get('strategy_brief_id')||'')||null
    });
    status.textContent='Rascunho de IA salvo localmente. Revisão humana obrigatória; nenhum submit foi feito.';
    await refreshTemplateLibrary();
    if(result.template?.template_key)editTemplateDraft(result.template.template_key);
  }catch(err){status.textContent=err.message||'IA indisponível.'}
  finally{
    const enabled=state.templateLibrary?.policy?.ai_enabled===true;
    button.disabled=!enabled;
  }
});

$('#pinForm').addEventListener('submit',async e=>{e.preventDefault();try{$('#authStatus').textContent='Validando…';await authenticateCustomerOsWithPin($('#pinInput').value.trim());$('#pinInput').value='';$('#authStatus').textContent='';await load()}catch(err){clearCustomerOsSession();$('#authStatus').textContent=err.message||'PIN inválido.'}});
$('#refreshMarketing').addEventListener('click',load);
$('#refreshOpportunities').addEventListener('click',refreshOpportunities);
$('#refreshCustomerOpportunities')?.addEventListener('click',refreshCustomerOpportunities);
$('#createDeterministicDraft').addEventListener('click',createDraft);
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==b.dataset.tab)}));
$('#menuButton')?.addEventListener('click',()=>{$('#sidebar')?.classList.toggle('open');$('#sidebarBackdrop')?.classList.toggle('hidden')});$('#sidebarBackdrop')?.addEventListener('click',()=>{$('#sidebar')?.classList.remove('open');$('#sidebarBackdrop')?.classList.add('hidden')});
if(!CONFIG.marketingUiEnabled)document.body.innerHTML='<main class="content"><div class="empty-state">Marketing ainda não está liberado.</div></main>';else if(getCustomerOsSession())load();
