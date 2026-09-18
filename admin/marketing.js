import {CONFIG} from './runtime-config.js';
import {authenticateCustomerOsWithPin,getCustomerOsSession,clearCustomerOsSession} from './customer-os-auth.js';
import {getMarketingOverview,getMarketingMetrics,getMarketingWorkflow,getMarketingShortlist,createDeterministicMarketingDraft} from './marketing-api.js';

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const moneyCents=v=>(Number(v||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dt=v=>v?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'—';
const safeUrl=v=>{try{const u=new URL(String(v||''));return /^https?:$/.test(u.protocol)?u.href:''}catch{return ''}};
let state={};

const empty=m=>`<div class="empty-state">${esc(m)}</div>`;
const row=(a,b,c,d='')=>`<div class="data-row"><div><strong>${esc(a)}</strong><small>${esc(b||'')}</small></div><div>${esc(d)}</div><div><span class="status-chip">${esc(c||'—')}</span></div></div>`;

function renderOpportunities(){
  const items=state.shortlist?.items||[];
  const meta=state.overview?.runtime?.metadata||{};
  const gate=$('#strategyGate');
  gate.textContent=meta.strategy_ai_enabled===true?'IA estratégica habilitada':'IA estratégica bloqueada · custo zero';
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
        <div class="opportunity-foot"><span>Estoque ${esc(p.stock)}</span><span class="score-pill">score ${esc(p.score)}</span></div>
      </div>
    </article>`;
  }).join('')}</div>`;
}

function render(){
  const o=state.overview||{},r=o.runtime||{},m=state.metrics?.metrics?.counts||{},meta=r.metadata||{};
  $('#summaryCards').innerHTML=[['Campanhas',(o.campaigns||[]).length,'cadastradas'],['Conteúdos',m.assets_created||(o.assets||[]).length,'últimos 30 dias'],['Aguardando revisão',m.review_required||0,'publicações'],['Custo registrado',moneyCents(m.actual_cost_cents||0),'últimos 30 dias']].map(x=>`<article class="summary-card"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong><small>${esc(x[2])}</small></article>`).join('');
  const locked=o.safety?.external_actions_locked!==false;$('#safetyBadge').textContent=locked?'Publicação bloqueada · seguro':'Publicação habilitada';$('#safetyBadge').className=`safety-badge ${locked?'safe':'warn'}`;
  $('#runtimeSummary').innerHTML=`<div><div class="rule"><span>Publicação externa</span><strong class="${r.publishing_enabled?'danger':'ok'}">${r.publishing_enabled?'Ligada':'Desligada'}</strong></div><div class="rule"><span>Kill switch</span><strong class="ok">${r.kill_switch?'Ativo':'Inativo'}</strong></div><div class="rule"><span>Aprovação humana</span><strong>${r.require_approval===false?'Não':'Obrigatória'}</strong></div><div class="rule"><span>Imagem IA</span><strong>${esc(meta.image_generation_quality||'low')} · ${Number(meta.image_variants_default||1)} variação</strong></div><div class="rule"><span>Vídeo V1</span><strong>${Number(meta.video_duration_seconds||10)}s · ${esc(meta.video_mode||'light_motion')}</strong></div><div class="rule"><span>IA de estratégia</span><strong class="ok">${meta.strategy_ai_enabled===true?'Habilitada':'Bloqueada'}</strong></div></div>`;
  const assets=o.assets||[];const assetsHtml=assets.length?`<div class="data-list">${assets.map(a=>row(a.title,`${a.media_kind} · v${a.version}`,a.status,dt(a.updated_at))).join('')}</div>`:empty('Nenhum conteúdo criado ainda.');$('#assetsList').innerHTML=assetsHtml;$('#recentAssets').innerHTML=assetsHtml;
  const campaigns=o.campaigns||[];$('#campaignsList').innerHTML=campaigns.length?`<div class="data-list">${campaigns.map(c=>row(c.name,c.objective||'Sem objetivo',c.status,`máx. ${moneyCents(c.max_cost_cents)}`)).join('')}</div>`:empty('Nenhuma campanha cadastrada ainda.');
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
    state={overview,metrics,workflow,shortlist};render();$('#authGate').hidden=true;$('#marketingApp').hidden=false;
  }catch(e){$('#authStatus').textContent=e.message||'Falha ao carregar.'}
}
async function refreshOpportunities(){
  $('#opportunityStatus').textContent='Analisando produtos elegíveis…';
  try{state.shortlist=await getMarketingShortlist();renderOpportunities();$('#opportunityStatus').textContent='Análise atualizada sem uso de IA.'}catch(e){$('#opportunityStatus').textContent=e.message||'Falha ao analisar.'}
}
async function createDraft(){
  const button=$('#createDeterministicDraft');button.disabled=true;$('#opportunityStatus').textContent='Criando rascunho sem IA…';
  try{
    const result=await createDeterministicMarketingDraft();
    $('#opportunityStatus').textContent='Rascunho criado com segurança. Nenhuma publicação foi feita.';
    await load();
    document.querySelector('[data-tab="campaigns"]')?.click();
  }catch(e){$('#opportunityStatus').textContent=e.message||'Não foi possível criar o rascunho.'}finally{button.disabled=false}
}

$('#pinForm').addEventListener('submit',async e=>{e.preventDefault();try{$('#authStatus').textContent='Validando…';await authenticateCustomerOsWithPin($('#pinInput').value.trim());$('#pinInput').value='';$('#authStatus').textContent='';await load()}catch(err){clearCustomerOsSession();$('#authStatus').textContent=err.message||'PIN inválido.'}});
$('#refreshMarketing').addEventListener('click',load);
$('#refreshOpportunities').addEventListener('click',refreshOpportunities);
$('#createDeterministicDraft').addEventListener('click',createDraft);
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==b.dataset.tab)}));
$('#menuButton')?.addEventListener('click',()=>{$('#sidebar')?.classList.toggle('open');$('#sidebarBackdrop')?.classList.toggle('hidden')});$('#sidebarBackdrop')?.addEventListener('click',()=>{$('#sidebar')?.classList.remove('open');$('#sidebarBackdrop')?.classList.add('hidden')});
if(!CONFIG.marketingUiEnabled)document.body.innerHTML='<main class="content"><div class="empty-state">Marketing ainda não está liberado.</div></main>';else if(getCustomerOsSession())load();
