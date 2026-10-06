import {attendanceAuthorizedFetch,attendanceJsonApi} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';

const CAMPAIGN_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-marketing-campaigns-v1';
const REPORT_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-marketing-campaign-report-v1';
const ADMIN_PUBLIC_KEY=['sb','publishable','tFXHtH0HCXZepVtwgKElIg','DxS76Gu8'].join('_');
const CSS_URL='/vitrine/admin/marketing/campaign-list-simple.css?v=marketing-campaign-list-v2';
const STATUS_LABELS={draft:'Rascunho',ready_for_review:'Em revisão',approved:'Aprovada',scheduled:'Agendada',running:'Em execução',paused:'Pausada',completed:'Concluída',failed:'Falhou',cancelled:'Cancelada'};
let observerStarted=false,refreshing=false,reportModulePromise=null,summaryObserver=null;
const summaryCache=new Map();
const summaryLoading=new Map();

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmtDate=value=>{if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
const channelByPhone=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.endsWith('0975')?'0975':digits.endsWith('1018')?'1018':'—'};
function ensureCss(){if(document.querySelector('link[data-da-marketing-campaign-list-simple]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href=CSS_URL;link.dataset.daMarketingCampaignListSimple='1';document.head.appendChild(link)}
function loadReportModule(){if(!reportModulePromise)reportModulePromise=import('/vitrine/admin/marketing/campaign-report.js?v=marketing-campaign-report-v1');return reportModulePromise}
async function openReport(campaignId){const module=await loadReportModule();return module.openCampaignReport(campaignId)}
async function apiGet(action,params={}){const url=new URL(CAMPAIGN_API);url.searchParams.set('action',action);for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));const response=await attendanceAuthorizedFetch(url,{method:'GET',headers:{apikey:ADMIN_PUBLIC_KEY},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok||data?.ok===false)throw new Error(data?.error||`campaign_${response.status}`);return data}
async function reportSummary(campaignId){const key=String(campaignId||'');if(summaryCache.has(key))return summaryCache.get(key);if(summaryLoading.has(key))return summaryLoading.get(key);const promise=(async()=>{const url=new URL(REPORT_API);url.searchParams.set('campaign_id',key);const response=await attendanceAuthorizedFetch(url,{method:'GET',headers:{apikey:ADMIN_PUBLIC_KEY},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok||data?.ok===false)throw new Error(data?.error||`campaign_report_${response.status}`);const summary={sent:Number(data?.summary?.sent||0),total:Number(data?.summary?.total||0)};summaryCache.set(key,summary);return summary})().finally(()=>summaryLoading.delete(key));summaryLoading.set(key,promise);return promise}

async function loadRecentCampaigns(limit=3){
  const data=await apiGet('list');
  const safeLimit=Math.max(1,Math.min(5,Number(limit)||3));
  const items=Array.isArray(data.items)?data.items:[];
  return items.slice(0,safeLimit).map(item=>({
    id:String(item.id||''),
    name:String(item.name||'Campanha'),
    status:String(item.status||''),
    status_label:STATUS_LABELS[item.status]||String(item.status||'—'),
    date:item.scheduled_for||item.started_at||item.updated_at||item.created_at||null
  }));
}

function filterToolbar(){return `<div class="marketing-simple-campaign-toolbar"><label><span>Pesquisar</span><input type="search" data-simple-campaign-search placeholder="Nome da campanha"></label><label><span>Situação</span><select data-simple-campaign-status><option value="">Todas</option>${Object.entries(STATUS_LABELS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label><span>Canal</span><select data-simple-campaign-channel><option value="">Todos</option><option value="0975">0975</option><option value="1018">1018</option></select></label></div>`}
function tableShell(){return `${filterToolbar()}<div class="marketing-simple-campaign-table-wrap"><table class="marketing-simple-campaign-table"><thead><tr><th>Nome</th><th>Status</th><th>Enviadas</th><th>Destinatários</th><th>Data</th><th>Editar</th></tr></thead><tbody data-simple-campaign-rows></tbody></table></div>`}

function updateSummaryCells(row,summary){if(!row?.isConnected)return;const sent=row.querySelector('[data-simple-sent-count]'),total=row.querySelector('[data-simple-recipient-count]');if(sent)sent.textContent=Number(summary?.sent||0).toLocaleString('pt-BR');if(total)total.textContent=Number(summary?.total||0).toLocaleString('pt-BR')}
async function loadRowSummary(row){const id=String(row?.dataset?.simpleCampaignId||'');if(!id||row.dataset.summaryLoaded==='1')return;row.dataset.summaryLoaded='1';if(summaryCache.has(id)){updateSummaryCells(row,summaryCache.get(id));return}try{const summary=await reportSummary(id);updateSummaryCells(row,summary)}catch{if(row.isConnected){row.querySelectorAll('[data-simple-sent-count],[data-simple-recipient-count]').forEach(cell=>{cell.textContent='—';cell.title='Resumo indisponível'})}}}
function loadVisibleSummaries(shell){summaryObserver?.disconnect();const rows=[...shell.querySelectorAll('[data-simple-campaign-id]')];if(!rows.length)return;if(typeof IntersectionObserver!=='function'){rows.slice(0,12).forEach(row=>loadRowSummary(row));return}summaryObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;summaryObserver?.unobserve(entry.target);loadRowSummary(entry.target)}},{root:null,rootMargin:'160px 0px',threshold:0.01});rows.forEach(row=>summaryObserver.observe(row))}

function renderRows(shell,items,accountChannels,legacyCards){
  const search=String(shell.querySelector('[data-simple-campaign-search]')?.value||'').trim().toLowerCase();
  const status=String(shell.querySelector('[data-simple-campaign-status]')?.value||'');
  const channel=String(shell.querySelector('[data-simple-campaign-channel]')?.value||'');
  const filtered=items.filter(item=>{const itemChannel=accountChannels.get(String(item.whatsapp_account_id))||'—';return (!search||String(item.name||'').toLowerCase().includes(search))&&(!status||item.status===status)&&(!channel||itemChannel===channel)});
  const tbody=shell.querySelector('[data-simple-campaign-rows]');
  tbody.innerHTML=filtered.length?filtered.map(item=>{const itemChannel=accountChannels.get(String(item.whatsapp_account_id))||'—';const date=item.scheduled_for||item.started_at||item.updated_at||item.created_at;const cached=summaryCache.get(String(item.id));return `<tr data-simple-campaign-id="${esc(item.id)}"><td><strong>${esc(item.name||'Campanha')}</strong><small>${esc(item.template_name_snapshot||'Template')} · ${esc(itemChannel)}</small></td><td><span class="marketing-campaign-state state-${esc(item.status)}">${esc(STATUS_LABELS[item.status]||item.status||'—')}</span></td><td><strong data-simple-sent-count>${cached?Number(cached.sent||0).toLocaleString('pt-BR'):'…'}</strong></td><td><strong data-simple-recipient-count>${cached?Number(cached.total||0).toLocaleString('pt-BR'):'…'}</strong></td><td>${esc(fmtDate(date))}</td><td><div class="marketing-simple-campaign-actions"><button type="button" data-campaign-open-simple="${esc(item.id)}">Editar</button><button type="button" class="secondary" data-campaign-report="${esc(item.id)}">Relatório</button></div></td></tr>`}).join(''):'<tr><td colspan="6" class="marketing-simple-empty-row">Nenhuma campanha encontrada.</td></tr>';
  tbody.querySelectorAll('[data-campaign-open-simple]').forEach(button=>button.addEventListener('click',()=>legacyCards.get(String(button.dataset.campaignOpenSimple))?.click()));
  tbody.querySelectorAll('[data-campaign-report]').forEach(button=>button.addEventListener('click',()=>openReport(String(button.dataset.campaignReport||'')).catch(error=>console.warn('marketing-campaign-report',String(error?.message||error).slice(0,160)))));
  loadVisibleSummaries(shell);
}

async function buildSimpleList(center,legacyHost){
  if(refreshing)return;refreshing=true;ensureCss();
  try{
    const [campaignData,accountData]=await Promise.all([apiGet('list'),attendanceJsonApi('accounts',{},'GET')]);
    if(!legacyHost.isConnected)return;
    const items=Array.isArray(campaignData.items)?campaignData.items:[];
    const accounts=Array.isArray(accountData.items)?accountData.items:[];
    const accountChannels=new Map(accounts.map(account=>[String(account.id),channelByPhone(account.phone_e164)]));
    const legacyCards=new Map([...legacyHost.querySelectorAll('[data-campaign-open]')].map(card=>[String(card.dataset.campaignOpen),card]));
    let shell=center.querySelector('[data-simple-campaign-list]');
    if(!shell){shell=document.createElement('div');shell.className='marketing-simple-campaign-list';shell.dataset.simpleCampaignList='1';legacyHost.before(shell);shell.innerHTML=tableShell();shell.querySelectorAll('input,select').forEach(control=>control.addEventListener(control.tagName==='INPUT'?'input':'change',()=>renderRows(shell,items,accountChannels,legacyCards)))}
    renderRows(shell,items,accountChannels,legacyCards);legacyHost.hidden=true;
  }catch(error){console.warn('marketing-campaign-list-simple',String(error?.message||error).slice(0,180))}
  finally{refreshing=false}
}

function enhanceCampaignList(root=document.querySelector('#content')){const center=root?.querySelector?.('.marketing-campaign-center');const legacyHost=center?.querySelector?.('[data-campaign-list]');if(!center||!legacyHost||legacyHost.classList.contains('marketing-campaign-loading'))return;buildSimpleList(center,legacyHost)}
function observe(){if(observerStarted)return;observerStarted=true;const observer=new MutationObserver(()=>queueMicrotask(()=>enhanceCampaignList()));observer.observe(document.documentElement,{subtree:true,childList:true});enhanceCampaignList()}
observe();
window.DAMarketingCampaignListSimple={enhanceCampaignList,loadRecentCampaigns,loadVisibleSummaries};
export {enhanceCampaignList,loadRecentCampaigns,loadVisibleSummaries};
