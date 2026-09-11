(function(){
'use strict';
if(window.DAMarketingReadinessReadonlyV1)return;window.DAMarketingReadinessReadonlyV1=true;
const C=window.DA_ADMIN_V3_CONFIG||{},AUTH_KEY='da_admin_v3_auth';
let root=null,state={days:30,overview:null,metrics:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
function auth(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}}
async function call(action,payload={}){const a=auth();if(!a?.access_token)throw new Error('Faça login.');const r=await fetch(`${C.supabaseUrl}/functions/v1/${C.marketingInsightsEdgeFunction||'admin-marketing-insights-v1'}`,{method:'POST',headers:{apikey:C.supabasePublishableKey,Authorization:`Bearer ${a.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});const d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.detail||d.error||`Erro ${r.status}`);if(d.external_side_effect!==false)throw new Error('Contrato recusado: leitura sem garantia de side effect zero.');return d}
const channels=[
  ['Status WhatsApp','whatsapp_status_publish_enabled','manual_confirm'],
  ['Stories Instagram','instagram_story_publish_enabled','official_api_planned'],
  ['Stories Facebook','facebook_story_publish_enabled','official_api_planned'],
  ['Carrossel Instagram','instagram_carousel_publish_enabled','official_api_planned'],
  ['Pinterest','pinterest_publish_enabled','official_api_planned'],
  ['Google Perfil da Empresa','google_business_publish_enabled','official_api_planned']
];
const gate=v=>v===true?'ON':'OFF';
function metricCards(){const m=state.metrics?.metrics?.counts||{};const rows=[['Conteúdos',m.assets_created||0],['Aprovados',m.assets_approved||0],['Publicações na fila',m.publication_jobs||0],['Agendados',m.scheduled_jobs||0],['Revisão necessária',m.review_required||0],['Render jobs',m.render_jobs||0],['Falhas de render',m.render_failed||0],['Efeitos externos',m.external_side_effects||0]];return rows.map(([k,v])=>`<article class="marketing-card"><small>${esc(k)}</small><strong>${esc(v)}</strong></article>`).join('')}
function channelCards(){const r=state.overview?.runtime||{};return channels.map(([label,key,path])=>`<article class="marketing-card"><small>${esc(label)}</small><strong>${gate(r[key])}</strong><div>${esc(path)}</div></article>`).join('')}
function globalStatus(){const r=state.overview?.runtime||{};const safe=r.enabled===false&&r.execution_mode==='off'&&r.canary_percent===0&&r.kill_switch===true&&r.publishing_enabled===false;return safe?'OFF · kill switch ON · canary 0%':'REVISAR · runtime não está integralmente fechado'}
function render(){if(!root)return;root.querySelector('#mrrGlobal').textContent=globalStatus();root.querySelector('#mrrChannels').innerHTML=channelCards();root.querySelector('#mrrMetrics').innerHTML=metricCards();root.querySelectorAll('[data-mrr-days]').forEach(b=>b.classList.toggle('active',Number(b.dataset.mrrDays)===state.days))}
async function load(){const [overview,metrics]=await Promise.all([call('overview'),call('metrics',{days:state.days})]);state.overview=overview;state.metrics=metrics;render()}
async function setDays(days){if(![7,30,90].includes(days))return;state.days=days;await load()}
function mount(){root=document.getElementById('marketingReadinessReadonlyMount');if(!root)return false;root.innerHTML=`<section class="panel"><div class="panel-head"><div><div class="eyebrow">Readiness seguro</div><h2>Métricas e publicadores oficiais</h2></div><span id="mrrGlobal" class="marketing-pill off">OFF</span></div><p>Somente observabilidade. Nenhuma ação de publicar, aprovar, agendar, executar ou reenfileirar existe nesta superfície.</p><div id="mrrChannels" class="marketing-grid"></div></section><section class="panel"><div class="panel-head"><div><div class="eyebrow">Métricas internas</div><h2>7 / 30 / 90 dias</h2></div><div><button type="button" data-mrr-days="7">7 dias</button><button type="button" data-mrr-days="30" class="active">30 dias</button><button type="button" data-mrr-days="90">90 dias</button></div></div><div id="mrrMetrics" class="marketing-grid"></div></section>`;root.querySelectorAll('[data-mrr-days]').forEach(b=>b.onclick=()=>setDays(Number(b.dataset.mrrDays)).catch(showError));load().catch(showError);return true}
function showError(err){if(!root)return;root.innerHTML=`<section class="panel"><h2>Readiness indisponível</h2><p>${esc(err?.message||err)}</p></section>`}
function boot(){mount()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
