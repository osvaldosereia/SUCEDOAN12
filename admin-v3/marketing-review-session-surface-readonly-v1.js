(function(){
'use strict';
if(window.DAMarketingReviewSessionSurfaceReadonlyV1)return;

const SCHEMA='marketing-review-session-surface-v1';
const SESSION_SCHEMA='marketing-review-session-v1';
const ALLOWED_STATUS=new Set(['current','superseded','stale']);
const text=value=>String(value??'').trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
const isSha=value=>/^[a-f0-9]{64}$/i.test(text(value));

function getSessionApi(){
  const api=window.DAMarketingQuickEditReviewSessionReadonlyV1;
  if(!api||typeof api.getSessionStatus!=='function')throw new Error('review_session_api_unavailable');
  return api;
}

function validateSession(session){
  if(!session||typeof session!=='object'||Array.isArray(session))throw new Error('review_session_required');
  if(session.schema_version!==SESSION_SCHEMA)throw new Error('review_session_schema_invalid');
  if(session.preview_only!==true||session.mutations_allowed!==false||session.network_allowed!==false||session.external_side_effect!==false||session.provider_call_allowed!==false||session.storage_write_allowed!==false||session.filesystem_write_allowed!==false)throw new Error('review_session_unsafe');
  if(!text(session.asset_id))throw new Error('review_session_asset_required');
  if(!Number.isInteger(Number(session.revision))||Number(session.revision)<1)throw new Error('review_session_revision_invalid');
  if(!isSha(session.package_sha256))throw new Error('review_session_hash_invalid');
  if(!text(session.idempotency_key))throw new Error('review_session_idempotency_invalid');
  if(!text(session.session_token).startsWith('marketing-review-session-v1:'))throw new Error('review_session_token_invalid');
  return session;
}

function safeStatus(session,status,reason=''){
  return Object.freeze({
    schema_version:SCHEMA,
    asset_id:text(session.asset_id),
    revision:Number(session.revision),
    status,
    reason:text(reason),
    preview_only:true,
    mutations_allowed:false,
    network_allowed:false,
    external_side_effect:false,
    provider_call_allowed:false,
    storage_write_allowed:false,
    filesystem_write_allowed:false,
  });
}

function getStatus(session){
  const safe=validateSession(session);
  const lifecycle=getSessionApi().getSessionStatus(safe)||{};
  const status=text(lifecycle.status);
  if(!ALLOWED_STATUS.has(status))return safeStatus(safe,'stale','invalid_status');
  return safeStatus(safe,status,lifecycle.reason);
}

function renderStatusHtml(session){
  const state=getStatus(session);
  return `<section class="panel"><div class="panel-head"><div><div class="eyebrow">Marketing · revisão privada</div><h2>Sessão de revisão</h2></div><span class="marketing-pill off">${esc(state.status)}</span></div><div class="marketing-grid"><article class="marketing-card"><small>Asset</small><strong>${esc(state.asset_id)}</strong></article><article class="marketing-card"><small>Revisão</small><strong>${esc(state.revision)}</strong></article><article class="marketing-card"><small>Estado</small><strong>${esc(state.status)}</strong>${state.reason?`<div>${esc(state.reason)}</div>`:''}</article></div><p class="marketing-note">Superfície efêmera e somente leitura. Nenhum conteúdo bruto, hash completo, mídia, persistência, rede ou ação de publicação é exposto.</p></section>`;
}

function resolveRoot(rootOrId){
  const root=typeof rootOrId==='string'?document.getElementById(rootOrId):rootOrId;
  if(!root)throw new Error('review_session_mount_required');
  return root;
}

function mountCurrent(rootOrId,session){
  const root=resolveRoot(rootOrId);
  const initial=getStatus(session);
  if(initial.status!=='current')throw new Error(`review_session_not_current:${initial.status}`);

  // Revalidar imediatamente antes da mutação evita montar uma sessão que tenha
  // sido superseded/stale entre a primeira checagem e o write no DOM.
  const confirmed=getStatus(session);
  if(confirmed.status!=='current')throw new Error(`review_session_not_current:${confirmed.status}`);

  root.innerHTML=renderStatusHtml(session);
  return confirmed;
}

window.DAMarketingReviewSessionSurfaceReadonlyV1=Object.freeze({
  schema_version:SCHEMA,
  getStatus,
  renderStatusHtml,
  mountCurrent,
});
})();
