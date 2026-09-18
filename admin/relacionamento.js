import {CONFIG} from './runtime-config.js';
import {authenticateCustomerOsWithPin,getCustomerOsSession,clearCustomerOsSession} from './customer-os-auth.js';
import {getRelationshipOverview,getRelationshipAudit} from './relationship-api.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const n=v=>Number(v||0).toLocaleString('pt-BR');
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct=v=>`${Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;
const dt=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(d)};
const empty=m=>`<div class="empty">${esc(m)}</div>`;
let state={overview:null,audit:null};

function canaryAllowed(){
  if(CONFIG.relationshipUiEnabled===true)return true;
  if(CONFIG.relationshipCanaryEnabled!==true)return false;
  const params=new URLSearchParams(location.search);
  return params.get(CONFIG.relationshipCanaryParam)===CONFIG.relationshipCanaryValue;
}
function metric(label,value){
  return `<div class="metric-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}
function chip(value,tone=''){
  return `<span class="status-chip ${esc(tone)}">${esc(value||'—')}</span>`;
}
function table(headers,rows){
  if(!rows.length)return empty('Sem dados para exibir.');
  return `<div class="data-table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function safeJson(v){
  try{return JSON.stringify(v??{},null,2)}catch{return '{}'}
}
function toneForStatus(v){
  const s=String(v||'').toLowerCase();
  if(['granted','active','valid','matched','approved','ready','temporary_active'].includes(s))return 'good';
  if(['warning','pending','suggested','draft','unknown','observe','suppressed'].includes(s))return 'warn';
  if(['error','invalid','rejected','denied','revoked','conflict','blocked'].includes(s))return 'bad';
  return '';
}

function renderOverview(){
  const data=state.overview||{},s=data.summary||{};
  const profile=s.customer_profile||{},segments=s.segments?.segments||{},opp=s.opportunities||{},products=s.products||{},templates=s.templates||{},quality=s.quality||{},meta=s.meta||{},adapter=s.provider_adapters||{};
  const metaAccount=(meta.accounts||[])[0]||{};
  $('#overviewCards').innerHTML=[
    ['Clientes',profile.customer_count||0,'base conhecida'],
    ['Compraram',profile.with_purchase_history||0,'histórico de compra'],
    ['Oportunidades',opp.active_total||0,`${opp.actionable||0} liberadas`],
    ['Produtos prontos',products.marketing_ready||0,`${products.blocked||0} bloqueados`],
    ['Recorrentes',profile.recurring||0,'perfil comercial'],
    ['Marketing permitido',segments.marketing_permitido||0,'consent + proteção'],
    ['Templates',templates.templates||0,`${templates.ready_for_submit||0} ready`],
    ['Pendências identidade',quality.identity?.pending_reviews||0,'revisão manual']
  ].map(x=>`<article class="summary-card"><span>${esc(x[0])}</span><strong>${esc(n(x[1]))}</strong><small>${esc(x[2])}</small></article>`).join('');

  $('#overviewCustomers').innerHTML='<div class="metric-list">'+[
    ['Base total',n(profile.customer_count)],
    ['Com histórico de compra',n(profile.with_purchase_history)],
    ['Recorrentes',n(profile.recurring)],
    ['Inativos',n(segments.inativo||0)],
    ['Ticket/qualidade média',`${pct(profile.average_data_quality_score||0)} de qualidade`],
    ['Perfis 75%+',n(profile.profiles_75_plus)]
  ].map(x=>metric(x[0],x[1])).join('')+'</div>';

  $('#overviewProtection').innerHTML='<div class="metric-list">'+[
    ['Marketing liberado',n(segments.marketing_permitido||0)],
    ['Marketing bloqueado',n(segments.marketing_nao_permitido||0)],
    ['Consentimentos concedidos',n(quality.consent?.marketing_granted||0)],
    ['Negados/revogados',n(quality.consent?.marketing_denied||0)],
    ['Supressões ativas',n(quality.consent?.suppressed_customers||0)],
    ['Atendimentos com problema',n(segments.atendimento_problema||0)]
  ].map(x=>metric(x[0],x[1])).join('')+'</div>';

  $('#overviewMarketing').innerHTML='<div class="metric-list">'+[
    ['Oportunidades detectadas',n(opp.active_total)],
    ['Ações liberadas',n(opp.actionable)],
    ['Suprimidas pelos guardrails',n(opp.suppressed)],
    ['Produtos marketing-ready',n(products.marketing_ready)],
    ['Readiness médio',pct(products.avg_readiness_score)],
    ['Briefs do Marketing Brain',n(s.marketing_brain?.briefs||0)]
  ].map(x=>metric(x[0],x[1])).join('')+'</div>';

  const a=(adapter.adapters||[])[0]||{};
  $('#overviewIntegrations').innerHTML='<div class="metric-list">'+[
    ['Provider atual',metaAccount.capabilities?.provider_current||a.provider_key||'—'],
    ['Meta Direct pronto',metaAccount.capabilities?.meta_direct_ready?'Sim':'Não'],
    ['Outbound Meta',metaAccount.outbound_enabled?'Ligado':'Desligado'],
    ['Estado da fundação',metaAccount.readiness_state||'—'],
    ['Adapter PapoAI',a.status||'—'],
    ['Erros Meta não resolvidos',n(quality.integration?.unresolved_meta_errors||0)]
  ].map(x=>metric(x[0],x[1])).join('')+'</div>';
}

function renderCustomers(){
  const rows=(state.overview?.customers||[]).map(c=>`<tr>
    <td><strong>${esc(c.name||'Cliente sem nome')}</strong><br><small>${esc(c.primary_whatsapp_e164||'')}</small></td>
    <td>${n(c.order_count)}</td><td>${brl(c.lifetime_value)}</td><td>${brl(c.average_ticket)}</td>
    <td>${esc(c.recent_engagement||'—')}</td><td>${pct(c.profile_completeness)}</td><td>${dt(c.last_order_at)}</td>
  </tr>`);
  $('#customersView').innerHTML=table(['Cliente','Pedidos','LTV','Ticket médio','Engajamento','Perfil','Última compra'],rows);
}
function renderSegments(){
  const seg=state.overview?.summary?.segments?.segments||{};
  const entries=Object.entries(seg).sort((a,b)=>Number(b[1])-Number(a[1]));
  $('#segmentsView').innerHTML=entries.length?`<div class="segment-grid">${entries.map(([k,v])=>`<article class="segment-card"><span>${esc(k.replaceAll('_',' '))}</span><strong>${esc(n(v))}</strong></article>`).join('')}</div>`:empty('Nenhum segmento calculado.');
}
function renderOpportunities(){
  const rows=(state.overview?.opportunities||[]).map(o=>`<tr>
    <td><strong>${esc(o.title||o.strategy_key)}</strong><br><small>${esc(o.customer?.name||'Cliente')}</small></td>
    <td>${esc(o.strategy_key)}</td><td>${pct(Number(o.confidence||0)*100)}</td>
    <td>${chip(o.status,toneForStatus(o.status))}</td><td>${esc((o.exclusions||[]).join(', ')||'—')}</td><td>${dt(o.last_evaluated_at)}</td>
  </tr>`);
  $('#opportunitiesView').innerHTML=table(['Oportunidade','Estratégia','Confiança','Status','Guardrails','Avaliada em'],rows);
}
function renderProducts(){
  const ready=state.overview?.products?.ready||[],blocked=state.overview?.products?.blocked||[];
  const readyRows=ready.slice(0,20).map(p=>`<tr><td><strong>${esc(p.name)}</strong><br><small>${esc([p.brand,p.category].filter(Boolean).join(' · '))}</small></td><td>${n(p.stock)}</td><td>${brl(p.effective_price)}</td><td>${n(p.known_purchase_count)}</td><td>${pct(p.readiness_score)}</td></tr>`);
  const blockedRows=blocked.slice(0,20).map(p=>`<tr><td><strong>${esc(p.name)}</strong><br><small>${esc([p.brand,p.category].filter(Boolean).join(' · '))}</small></td><td>${n(p.stock)}</td><td>${pct(p.readiness_score)}</td><td>${esc((p.exclusion_reasons||[]).join(', '))}</td></tr>`);
  $('#productsView').innerHTML=`<h3>Prontos para marketing</h3>${table(['Produto','Estoque','Preço','Compras conhecidas','Readiness'],readyRows)}<h3 style="margin-top:20px">Bloqueados</h3>${table(['Produto','Estoque','Readiness','Motivos'],blockedRows)}`;
}
function renderBrands(){
  const items=state.overview?.summary?.brands?.items||[];
  $('#brandsView').innerHTML=items.length?`<div class="card-grid">${items.map(b=>`<article class="mini-card"><h3>${esc(b.brand)}</h3><p>${n(b.product_count)} produto(s) · ${n(b.known_purchase_count)} compra(s) conhecidas</p><div class="mini-meta"><span>${n(b.marketing_ready)} ready</span><span>${n(b.blocked)} bloqueados</span><span>${pct(b.avg_readiness)} readiness</span><span>${n(b.offers_ready)} ofertas</span></div></article>`).join('')}</div>`:empty('Sem agregação de marcas.');
}
function renderBrain(){
  const rows=(state.overview?.marketing_briefs||[]).map(b=>`<tr><td><strong>${esc(b.strategy_key)}</strong></td><td>${esc(b.mode)}</td><td>${chip(b.status,toneForStatus(b.status))}</td><td>${b.ai_used?'Sim':'Não'}</td><td>${esc(b.model_used||'—')}</td><td>${pct(Number(b.confidence||0)*100)}</td><td>${dt(b.updated_at)}</td></tr>`);
  $('#brainView').innerHTML=rows.length?table(['Estratégia','Modo','Status','IA','Modelo','Confiança','Atualização'],rows):empty('Nenhum brief gerado ainda. O modo OBSERVE continua disponível sem custo de IA.');
}
function renderTemplates(){
  const rows=(state.overview?.templates||[]).map(t=>`<tr><td><strong>${esc(t.template_key)}</strong><br><small>${esc(t.purpose||'')}</small></td><td>${esc(t.category)}</td><td>v${n(t.current_version)}</td><td>${chip(t.local_status,toneForStatus(t.local_status))}</td><td>${chip(t.validation_status,toneForStatus(t.validation_status))}</td><td>${esc(t.meta_status||'—')}</td><td>${t.ai_generated?'Sim':'Não'}</td></tr>`);
  $('#templatesView').innerHTML=table(['Template','Categoria','Versão','Local','Validação','Meta','IA'],rows);
}
function renderMeta(){
  const m=state.overview?.summary?.meta||{},a=(m.accounts||[])[0]||{},p=state.overview?.summary?.provider_adapters||{},adapter=(p.adapters||[])[0]||{};
  $('#metaView').innerHTML=`<div class="quality-grid">
    <div class="quality-box"><h3>Conta WhatsApp</h3><div class="metric-list">${[
      ['Nome',a.display_name||'—'],['Telefone',a.phone_e164||'—'],['Readiness',a.readiness_state||'—'],['Provider',a.capabilities?.provider_current||'—'],['Meta Direct',a.capabilities?.meta_direct_ready?'Pronto':'Não pronto'],['Outbound',a.outbound_enabled?'Ligado':'Desligado']
    ].map(x=>metric(x[0],x[1])).join('')}</div></div>
    <div class="quality-box"><h3>Política e templates</h3><div class="metric-list">${[
      ['Políticas ativas',n(m.policy_registry?.active||0)],['Políticas p/ revisão',n(m.policy_registry?.needs_review||0)],['Templates',n(a.template_count||0)],['Aprovados Meta',n(a.approved_templates||0)],['Pendentes',n(a.pending_templates||0)],['Erros abertos',n(m.unresolved_errors||0)]
    ].map(x=>metric(x[0],x[1])).join('')}</div></div>
    <div class="quality-box"><h3>Adapter temporário</h3><div class="metric-list">${[
      ['Provider',adapter.provider_key||'—'],['Status',adapter.status||'—'],['Inbound',adapter.inbound_mode||'—'],['Outbound',adapter.outbound_mode||'—'],['Leitura tags',adapter.tag_read_state||'—'],['Escrita tags',adapter.tag_write_state||'—']
    ].map(x=>metric(x[0],x[1])).join('')}</div></div>
  </div>`;
}
function renderQuality(){
  const q=state.overview?.summary?.quality||{};
  const cards=[
    ['Clientes',[['Total',q.customers?.total],['Perfil <50%',q.customers?.profile_below_50],['Qualidade <50%',q.customers?.data_quality_below_50],['Sem compras',q.customers?.without_purchase_history]]],
    ['Identidade',[['Revisões pendentes',q.identity?.pending_reviews],['Conflitos',q.identity?.conflicts],['Sem match 30d',q.identity?.unmatched_30d]]],
    ['Consentimento',[['Marketing concedido',q.consent?.marketing_granted],['Negado/revogado',q.consent?.marketing_denied],['Supressões',q.consent?.suppressed_customers]]],
    ['Produtos',[['Ready',q.products?.ready],['Bloqueados',q.products?.blocked],['Sem imagem',q.products?.missing_image],['Sem estoque',q.products?.out_of_stock],['Sem custo',q.products?.missing_cost]]],
    ['Integrações',[['Erros Meta',q.integration?.unresolved_meta_errors],['Erros adapter 7d',q.integration?.provider_adapter_errors],['Eventos provider 24h',q.integration?.provider_events_24h]]]
  ];
  $('#qualityView').innerHTML=`<div class="quality-grid">${cards.map(([title,items])=>`<article class="quality-box"><h3>${esc(title)}</h3><div class="metric-list">${items.map(x=>metric(x[0],n(x[1]))).join('')}</div></article>`).join('')}</div>`;
}
function renderAudit(){
  const a=state.audit;
  if(!a){$('#auditView').innerHTML=empty('Abra esta aba para carregar a auditoria recente.');return}
  const items=[
    ...(a.actions||[]).map(x=>({at:x.created_at,title:`IA Action · ${x.action_key}`,status:x.status,data:{channel:x.channel,side_effect_performed:x.side_effect_performed,estimated_cost_brl:x.estimated_cost_brl,actual_cost_brl:x.actual_cost_brl,decision:x.decision}})),
    ...(a.marketing_events||[]).map(x=>({at:x.created_at,title:`Marketing · ${x.event_type}`,status:x.external_side_effect?'external':'internal',data:x.data})),
    ...(a.provider_events||[]).map(x=>({at:x.received_at,title:`Provider · ${x.provider_key}`,status:x.processing_status,data:x.context})),
    ...(a.meta_errors||[]).map(x=>({at:x.occurred_at,title:`Meta · ${x.operation}`,status:x.severity||'error',data:{code:x.provider_error_code,message:x.message,retryable:x.retryable,resolved_at:x.resolved_at}}))
  ].sort((x,y)=>String(y.at||'').localeCompare(String(x.at||''))).slice(0,100);
  $('#auditView').innerHTML=items.length?`<div class="audit-stack">${items.map(i=>`<article class="audit-item"><div class="audit-item-head"><div><strong>${esc(i.title)}</strong> ${chip(i.status,toneForStatus(i.status))}</div><small>${dt(i.at)}</small></div><pre>${esc(safeJson(i.data))}</pre></article>`).join('')}</div>`:empty('Nenhum registro recente.');
}
function renderAll(){
  renderOverview();renderCustomers();renderSegments();renderOpportunities();renderProducts();renderBrands();renderBrain();renderTemplates();renderMeta();renderQuality();renderAudit();
}

async function loadOverview(){
  $('#globalStatus').textContent='Atualizando visão consolidada…';
  try{
    state.overview=await getRelationshipOverview();
    renderAll();
    $('#globalStatus').textContent=`Atualizado ${new Intl.DateTimeFormat('pt-BR',{timeStyle:'short'}).format(new Date())} · leitura segura · zero ação externa.`;
  }catch(err){
    $('#globalStatus').textContent=err.message||'Falha ao carregar.';
    if(err.status===401){$('#relationshipApp').hidden=true;$('#authGate').hidden=false}
  }
}
async function loadAudit(){
  $('#auditView').innerHTML=empty('Carregando auditoria…');
  try{state.audit=await getRelationshipAudit(80);renderAudit()}catch(err){$('#auditView').innerHTML=empty(err.message||'Falha ao carregar auditoria.')}
}
function selectPanel(name){
  $$('#relationshipTabs button').forEach(b=>b.classList.toggle('active',b.dataset.panel===name));
  $$('[data-relationship-panel]').forEach(p=>p.hidden=p.dataset.relationshipPanel!==name);
  if(name==='audit'&&!state.audit)loadAudit();
  if(innerWidth<801){$('#relationshipSidebar').classList.remove('open');$('#relationshipBackdrop').classList.add('hidden')}
}

$('#relationshipTabs').addEventListener('click',e=>{const b=e.target.closest('button[data-panel]');if(b)selectPanel(b.dataset.panel)});
$('#refreshRelationship').addEventListener('click',loadOverview);
$('#refreshAudit').addEventListener('click',loadAudit);
$('#pinForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const status=$('#authStatus');
  try{
    status.textContent='Validando sessão segura…';
    await authenticateCustomerOsWithPin($('#pinInput').value.trim());
    $('#pinInput').value='';
    status.textContent='';
    $('#authGate').hidden=true;
    $('#relationshipApp').hidden=false;
    await loadOverview();
  }catch(err){
    clearCustomerOsSession();
    status.textContent=err.message||'PIN inválido.';
  }
});
$('#menuButton').addEventListener('click',()=>{$('#relationshipSidebar').classList.toggle('open');$('#relationshipBackdrop').classList.toggle('hidden')});
$('#relationshipBackdrop').addEventListener('click',()=>{$('#relationshipSidebar').classList.remove('open');$('#relationshipBackdrop').classList.add('hidden')});

if(!canaryAllowed()){
  $('#featureGate').hidden=false;
}else if(getCustomerOsSession()){
  $('#relationshipApp').hidden=false;
  loadOverview();
}else{
  $('#authGate').hidden=false;
}
