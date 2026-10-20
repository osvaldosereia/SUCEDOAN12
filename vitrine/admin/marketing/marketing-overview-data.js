import {attendanceAuthorizedFetch} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';

const CAMPAIGN_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-marketing-campaigns-v1';
const TEMPLATE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-templates-v1';
const AUDIENCE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-marketing-audiences-v1';
const ADMIN_PUBLIC_KEY=['sb','publishable','tFXHtH0HCXZepVtwgKElIg','DxS76Gu8'].join('_');
const CAMPAIGN_STATUSES=['draft','ready_for_review','approved','scheduled','running','paused','completed','failed','cancelled'];
const TEMPLATE_STATUSES=['APPROVED','PENDING','REJECTED','PAUSED','DISABLED','FLAGGED'];
const CAMPAIGN_LABELS={draft:'Rascunho',ready_for_review:'Em revisão',approved:'Aprovada',scheduled:'Agendada',running:'Em execução',paused:'Pausada',completed:'Concluída',failed:'Falhou',cancelled:'Cancelada'};
const TEMPLATE_LABELS={APPROVED:'Aprovado',PENDING:'Pendente',REJECTED:'Rejeitado',PAUSED:'Pausado',DISABLED:'Desativado',FLAGGED:'Sinalizado'};
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

async function get(base,action,params={}){
  const url=new URL(base);url.searchParams.set('action',action);for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));
  const response=await attendanceAuthorizedFetch(url,{method:'GET',headers:{apikey:ADMIN_PUBLIC_KEY},cache:'no-store'});const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false)throw new Error(data?.error||`overview_${response.status}`);return data;
}
function tally(items,key,allowed){const counts=Object.fromEntries(allowed.map(status=>[status,0]));for(const item of items||[]){const value=String(item?.[key]||'');const status=allowed.find(candidate=>candidate.toUpperCase()===value.toUpperCase());if(status)counts[status]+=1}return counts}
function section(title,description,counts,labels,available=true){return `<section class="marketing-overview-stats-card"><h3>${title}</h3><p>${description}</p><div>${Object.entries(labels).map(([key,label])=>`<span><strong>${available?Number(counts?.[key]||0):'—'}</strong> ${label}</span>`).join('')}</div></section>`}
function states(items,statusKey,labels,channel){return section(`Templates Meta · ${channel}`,'Status informado pela Meta',tally(items,statusKey,TEMPLATE_STATUSES),labels,Array.isArray(items))}
function render(host,data){
  const campaignCounts=tally(data.campaigns,'status',CAMPAIGN_STATUSES),repurchase=data.repurchase?.counts||{},runtimeItems=Array.isArray(data.runtime?.items)?data.runtime.items:[];
  const active=runtimeItems.filter(item=>item.campaigns_enabled===true&&item.send_enabled===true&&item.outbound_provider==='meta'&&['canary','live'].includes(item.mode));
  const runtimeLabel=data.runtime?'Runtime '+(active.length?'habilitado em '+active.map(item=>item.channel).join(', '):'pausado'): 'Runtime indisponível';
  const cadenceCounts={ready:Number(repurchase.ready||0),scheduled:Number(repurchase.scheduled||0),sent:Number(repurchase.sent||0),blocked:Number((repurchase.blocked_opt_out||0)+(repurchase.not_eligible||0))};
  host.innerHTML=`<div class="marketing-overview-stats-grid">${section('Campanhas',runtimeLabel,campaignCounts,CAMPAIGN_LABELS,Array.isArray(data.campaigns))}${states(data.templates0975,'status',TEMPLATE_LABELS,'0975')}${states(data.templates1018,'status',TEMPLATE_LABELS,'1018')}${section('Reposição mensal','Cadência registrada; automação mensal não é acionada por esta tela.',cadenceCounts,{ready:'Prontas',scheduled:'Previstas',sent:'Enviadas',blocked:'Bloqueadas'},Boolean(data.repurchase))}</div>`;
}

async function loadOverviewData(dashboard){
  const host=dashboard?.querySelector?.('[data-marketing-overview-stats]');if(!host)return;
  host.innerHTML='<div class="marketing-overview-stats-loading" role="status">Carregando estados de campanhas, templates e reposição…</div>';
  const requests=await Promise.allSettled([
    get(CAMPAIGN_API,'list'),get(CAMPAIGN_API,'runtime_status'),get(TEMPLATE_API,'list',{channel:'0975'}),get(TEMPLATE_API,'list',{channel:'1018'}),get(AUDIENCE_API,'repurchase_state',{limit:1})
  ]);
  if(!dashboard.isConnected)return;
  const value=(index,key)=>requests[index].status==='fulfilled'?requests[index].value[key]:null;
  const data={campaigns:value(0,'items'),runtime:requests[1].status==='fulfilled'?requests[1].value:null,templates0975:value(2,'items'),templates1018:value(3,'items'),repurchase:requests[4].status==='fulfilled'?requests[4].value:null};
  render(host,data);
  const failures=requests.map((item,index)=>item.status==='rejected'?index:-1).filter(index=>index>=0);
  if(failures.length)host.dataset.partial='true';else delete host.dataset.partial;
}

window.DAMarketingOverviewData={loadOverviewData};
export {loadOverviewData,render,tally};
