import {getMarketingObservability} from './marketing-api.js';

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let loaded=false;

function empty(message){return `<div class="empty-state">${esc(message)}</div>`}
function card(label,value,detail=''){return `<article class="summary-card"><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail?`<small>${esc(detail)}</small>`:''}</article>`}
function safePayload(response){
  const value=response?.observability||response?.data?.observability||response?.data||response;
  if(!value||value.ok!==true)throw new Error('Observabilidade indisponível.');
  const policy=value.policy||{};
  if(value.mode!=='observe_only'||policy.auto_action!==false||policy.auto_publish!==false||policy.auto_schedule!==false){
    throw new Error('Observabilidade recusada: política fail-closed não confirmada.');
  }
  return value;
}
function render(value){
  const mount=$('#marketingObservabilityView');if(!mount)return;
  const counts=value.counts||{},runtime=value.runtime||{},confidence=value.confidence||{};
  const confidenceLabel=confidence.status==='insufficient_data'?'Dados insuficientes':String(confidence.status||'Observação');
  const locked=runtime.enabled===false&&runtime.kill_switch===true&&runtime.publishing_enabled===false&&Number(runtime.max_daily_publications||0)===0;
  const claims=confidence.performance_claims_allowed===true;
  mount.innerHTML=`
    <div class="summary-grid">
      ${card('Saúde operacional',locked?'Segura':'Revisar',locked?'runtime fechado':'há gate divergente')}
      ${card('Confiança',confidenceLabel,claims?'claims permitidos':'sem conclusão de performance')}
      ${card('Publicações',Number(counts.published||0),`${Number(counts.publication_jobs||0)} job(s)`)}
      ${card('Touchpoints',Number(counts.touchpoints||0),`mínimo ${Number(confidence.minimum_touchpoints||5)}`)}
    </div>
    <div class="settings-grid">
      <div class="setting-card"><span>Kill switch</span><strong>${runtime.kill_switch===true?'Ativo':'Inativo'}</strong></div>
      <div class="setting-card"><span>Publicação externa</span><strong>${runtime.publishing_enabled===true?'Ligada':'Bloqueada'}</strong></div>
      <div class="setting-card"><span>Agendamentos vencidos</span><strong>${Number(counts.stale_scheduled||0)}</strong></div>
      <div class="setting-card"><span>Efeitos externos</span><strong>${Number(counts.external_side_effect_events||0)}</strong></div>
    </div>
    <p class="muted">Somente leitura · determinístico · sem IA · sem autoação · sem autopublicação · sem autoagendamento.</p>`;
}
async function load(){
  const mount=$('#marketingObservabilityView');if(!mount)return;
  mount.innerHTML=empty('Carregando saúde operacional…');
  try{render(safePayload(await getMarketingObservability()));loaded=true;}
  catch(error){mount.innerHTML=empty(error?.message||'Não foi possível carregar a observabilidade.');}
}
function maybeLoad(){
  const app=$('#marketingApp');
  if(!app||app.hidden||loaded)return;
  load();
}
const observer=new MutationObserver(maybeLoad);
const app=$('#marketingApp');if(app)observer.observe(app,{attributes:true,attributeFilter:['hidden']});
$('#refreshMarketing')?.addEventListener('click',()=>{loaded=false;setTimeout(maybeLoad,0)});
maybeLoad();
