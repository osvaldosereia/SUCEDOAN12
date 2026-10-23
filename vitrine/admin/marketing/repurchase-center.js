import {attendanceAuthorizedFetch} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';
import {repurchaseCampaignCustomerIds} from './marketing-repurchase-campaign-audience-v1.mjs';

const API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-marketing-audiences-v1';
const ADMIN_PUBLIC_KEY=['sb','publishable','tFXHtH0HCXZepVtwgKElIg','DxS76Gu8'].join('_');
const PAGE_SIZE=50;
const STATUS_LABELS={no_purchase:'Sem compra',blocked_opt_out:'Sem consentimento',not_eligible:'Não elegível',sent:'Enviada',scheduled:'Prevista',ready:'Pronta para revisão'};
let rootActive=null,items=[],total=0,offset=0,hasMore=false,busy=false,counts={};

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmtDate=value=>{if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('pt-BR')};
const channelOf=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.endsWith('0975')?'0975':digits.endsWith('1018')?'1018':'—'};
const STATUS_KEYS=Object.keys(STATUS_LABELS);

async function api(action,{method='GET',params={},body=null}={}){
  const url=new URL(API);url.searchParams.set('action',action);
  for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));
  const options={method,headers:{apikey:ADMIN_PUBLIC_KEY},cache:'no-store'};
  if(body!==null){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body)}
  const response=await attendanceAuthorizedFetch(url,options);const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`repurchase_${response.status}`);error.payload=data;throw error}
  return data;
}

function filters(){return {search:String(rootActive?.querySelector('[data-repurchase-search]')?.value||'').trim().toLowerCase(),status:String(rootActive?.querySelector('[data-repurchase-status]')?.value||''),channel:String(rootActive?.querySelector('[data-repurchase-channel]')?.value||''),from:String(rootActive?.querySelector('[data-repurchase-from]')?.value||''),to:String(rootActive?.querySelector('[data-repurchase-to]')?.value||'')}}
function visibleItems(){const f=filters();return items.filter(row=>{const channel=channelOf(row.send_channel_e164);if(f.status&&row.status!==f.status)return false;if(f.channel&&channel!==f.channel)return false;if(f.search&&!`${row.customer_name} ${row.last_purchase_order_number||''} ${row.phone_e164||''}`.toLowerCase().includes(f.search))return false;const due=String(row.due_at||'').slice(0,10);if(f.from&&due&&due<f.from)return false;if(f.to&&due&&due>f.to)return false;return true})}
function renderCounts(){const host=rootActive?.querySelector('[data-repurchase-counts]');if(!host)return;host.innerHTML=STATUS_KEYS.map(key=>`<article class="marketing-repurchase-kpi status-${key}"><small>${STATUS_LABELS[key]}</small><strong>${Number(counts[key]||0)}</strong></article>`).join('')}
function renderList(){
  const host=rootActive?.querySelector('[data-repurchase-list]');if(!host)return;
  const visible=visibleItems();
  rootActive.querySelector('[data-repurchase-results]').textContent=`${visible.length} registro(s) nesta página · ${total} no total`;
  host.innerHTML=visible.length?visible.map(row=>`<article class="marketing-repurchase-row"><div><strong>${esc(row.customer_name||'Cliente')}</strong><small>${esc(row.phone_e164||'Telefone não informado')} · Canal ${esc(channelOf(row.send_channel_e164))}</small></div><div><strong>${STATUS_LABELS[row.status]||esc(row.status)}</strong><small>${row.blocked_reason?esc(row.blocked_reason):row.marketing_opt_in?'Consentimento ativo':'Consentimento não ativo'}</small></div><div><strong>${esc(row.last_purchase_order_number||'Última compra')}</strong><small>Compra ${esc(fmtDate(row.last_purchase_at))} · Próxima revisão ${esc(fmtDate(row.due_at))}</small></div><div><strong>${esc(row.template_name||'Template não definido')}</strong><small>${row.last_sent_at?`Último envio ${esc(fmtDate(row.last_sent_at))}`:'Nenhum envio registrado'}</small></div></article>`).join(''):'<div class="marketing-repurchase-empty">Nenhum cliente encontrado com estes filtros.</div>';
  const loadMore=rootActive.querySelector('[data-repurchase-more]');loadMore.disabled=!hasMore;loadMore.textContent=hasMore?'Carregar mais':'Todos os registros carregados';
}
async function load(reset=false){
  if(busy)return;if(reset)offset=0;
  const status=rootActive?.querySelector('[data-repurchase-status]')?.value||'';
  const channel=rootActive?.querySelector('[data-repurchase-channel]')?.value||'';
  const note=rootActive?.querySelector('[data-repurchase-notice]');
  try{
    busy=true;if(note)note.textContent='Carregando estados de reposição…';
    const data=await api('repurchase_state',{params:{status,channel,limit:PAGE_SIZE,offset}});
    items=reset?data.items||[]:[...items,...(data.items||[])];total=Number(data.total||0);offset=Number(data.offset||0)+(data.items||[]).length;hasMore=data.has_more===true;counts=data.counts||{};
    renderCounts();renderList();if(note)note.textContent='Os estados vêm do histórico de compras e do consentimento registrado. Nenhuma mensagem é enviada por esta tela.';
  }catch(error){if(note)note.textContent=`Não foi possível carregar a reposição mensal: ${String(error?.message||error)}.`;const host=rootActive?.querySelector('[data-repurchase-list]');if(host&&!items.length)host.innerHTML='<div class="marketing-repurchase-empty">Tente atualizar os dados.</div>'}
  finally{busy=false}
}
async function recalculate(){
  if(busy)return;const rows=visibleItems().map(row=>row.customer_id).filter(Boolean);if(!rows.length)return;
  const button=rootActive.querySelector('[data-repurchase-recalc]'),note=rootActive.querySelector('[data-repurchase-notice]');
  try{busy=true;button.disabled=true;button.textContent='Recalculando…';if(note)note.textContent=`Atualizando cadência de ${rows.length} cliente(s)…`;await api('repurchase_recalc',{method:'POST',body:{customer_ids:rows}});busy=false;await load(true)}
  catch(error){if(note)note.textContent=`Não foi possível recalcular: ${String(error?.message||error)}.`}
  finally{busy=false;button.disabled=false;button.textContent='Recalcular exibidos'}
}
async function openCampaigns(){
  const customerIds=repurchaseCampaignCustomerIds(visibleItems());
  const note=rootActive?.querySelector('[data-repurchase-notice]');
  if(!customerIds.length){if(note)note.textContent='Nenhum cliente “Pronto” nesta página para levar à campanha.';return}
  try{return await (await import('/vitrine/admin/marketing/campaign-entry.js?v=marketing-campaign-entry-v9')).openCampaigns({filters:{customer_ids:customerIds}})}
  catch(error){if(note)note.textContent=`Não foi possível preparar o rascunho: ${String(error?.message||error)}.`}
}
function openView(root,view){if(view==='overview')return document.querySelector('[data-tab="marketing"]')?.click();if(view==='repurchase')return mountRepurchaseView(root);if(view==='post_sale')return import('/vitrine/admin/marketing/post-sale-center.js?v=marketing-post-sale-v2').then(module=>module.mountPostSaleView(root));if(view==='campaigns')return openCampaigns();if(view==='templates')return import('/vitrine/admin/marketing/template-center.js?v=marketing-image-bank-v1').then(module=>module.mountTemplateView(root));if(view==='strategy')return import('/vitrine/admin/marketing/strategy-center.js?v=marketing-strategy-v3').then(module=>module.mountStrategyView(root));if(view==='audiences')return import('/vitrine/admin/marketing/audience-center.js?v=marketing-audience-v1').then(module=>module.mountAudienceView(root));if(view==='consents')return import('/vitrine/admin/marketing/audience-center.js?v=marketing-audience-v1').then(module=>module.mountConsentView(root))}
function bind(root){root.querySelectorAll('[data-marketing-view]').forEach(button=>button.addEventListener('click',()=>openView(root,button.dataset.marketingView)));root.querySelectorAll('[data-repurchase-search],[data-repurchase-status],[data-repurchase-channel],[data-repurchase-from],[data-repurchase-to]').forEach(input=>input.addEventListener(input.type==='search'?'input':'change',()=>renderList()));root.querySelector('[data-repurchase-status]')?.addEventListener('change',()=>load(true));root.querySelector('[data-repurchase-channel]')?.addEventListener('change',()=>load(true));root.querySelector('[data-repurchase-reload]')?.addEventListener('click',()=>load(true));root.querySelector('[data-repurchase-recalc]')?.addEventListener('click',recalculate);root.querySelector('[data-repurchase-more]')?.addEventListener('click',()=>load(false));root.querySelector('[data-repurchase-open-campaigns]')?.addEventListener('click',()=>openCampaigns())}
function ensureCss(){if(document.querySelector('link[data-da-marketing-repurchase]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/vitrine/admin/marketing/repurchase-center.css?v=marketing-repurchase-v1';link.dataset.daMarketingRepurchase='1';document.head.appendChild(link)}
async function mountRepurchaseView(root=document.querySelector('#content')){
  if(!root)return;ensureCss();rootActive=root;items=[];total=0;offset=0;hasMore=false;counts={};
  const links=[['overview','Visão geral'],['post_sale','Pós-venda'],['repurchase','Reposição mensal'],['templates','Templates Meta'],['campaigns','Campanhas']].map(([key,label])=>`<button type="button" class="${key==='repurchase'?'active':''}" data-marketing-view="${key}">${label}</button>`).join('');
  root.innerHTML=`<div class="marketing-repurchase"><div class="page-head"><div><h1>Marketing</h1><p>Reposição baseada no intervalo real entre as compras.</p></div></div><div class="marketing-template-subnav" data-marketing-subnav>${links}<details class="marketing-admin-more"><summary>Mais</summary><div class="marketing-admin-more-menu"><button type="button" data-marketing-view="audiences">Públicos</button><button type="button" data-marketing-view="consents">Consentimentos</button><button type="button" data-marketing-view="strategy">Estratégia</button></div></details><span class="marketing-campaign-gate">Automação mensal desativada</span></div><section class="marketing-repurchase-section"><div class="marketing-repurchase-head"><div><h2>Reposição mensal</h2><p>Cadência estimada por cliente; o sistema mantém a lista para revisão e não inicia envios automáticos.</p></div><div class="marketing-repurchase-actions"><button type="button" data-repurchase-reload>Atualizar</button><button type="button" data-repurchase-recalc>Recalcular exibidos</button><button type="button" data-repurchase-open-campaigns>Preparar campanha manual</button></div></div><div class="marketing-repurchase-kpis" data-repurchase-counts></div><div class="marketing-repurchase-filters"><label><span>Buscar cliente, compra ou telefone</span><input type="search" data-repurchase-search placeholder="Nome, pedido ou telefone"></label><label><span>Status</span><select data-repurchase-status><option value="">Todos</option>${STATUS_KEYS.map(key=>`<option value="${key}">${STATUS_LABELS[key]}</option>`).join('')}</select></label><label><span>Canal</span><select data-repurchase-channel><option value="">Todos</option><option value="0975">0975</option><option value="1018">1018</option></select></label><label><span>Vencimento desde</span><input type="date" data-repurchase-from></label><label><span>Vencimento até</span><input type="date" data-repurchase-to></label></div><p class="marketing-repurchase-results" data-repurchase-results>Carregando…</p><p class="marketing-repurchase-notice" data-repurchase-notice role="status" aria-live="polite">Carregando…</p><div class="marketing-repurchase-list" data-repurchase-list></div><button type="button" data-repurchase-more disabled>Carregando…</button><p class="marketing-repurchase-campaign-note">“Preparar campanha manual” leva ao rascunho somente os clientes “Prontos” desta página (até 50). Revise o público; o envio continua manual em lotes de até 10.</p></section></div>`;
  bind(root);await load(true);
}

window.DAMarketingRepurchase={mountRepurchaseView};
export {mountRepurchaseView,visibleItems};
