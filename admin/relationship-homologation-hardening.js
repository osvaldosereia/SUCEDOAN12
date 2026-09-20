// CM-1 Rodada 07 — progressive UX hardening only. No external actions.
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

const HUMAN_KEYS=new Set([
  'identity_resolved','marketing_brain_suggests','ai_cost_measured'
]);
const ORGANIC_KEYS=new Set(['product_view_event','opportunity_lifecycle']);

function enhanceStatus(){
  const status=$('#globalStatus');
  if(status){status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true')}
  const audit=$('#auditView');
  if(audit){audit.setAttribute('aria-live','polite');audit.setAttribute('aria-busy','false')}
}
function enhanceTabs(){
  const nav=$('#relationshipTabs');
  if(!nav)return;
  nav.setAttribute('role','tablist');
  $$('#relationshipTabs button[data-panel]').forEach(button=>{
    const name=button.dataset.panel;
    const panel=$(`[data-relationship-panel="${name}"]`);
    button.setAttribute('role','tab');
    button.setAttribute('aria-selected',button.classList.contains('active')?'true':'false');
    button.id=`relationship-tab-${name}`;
    if(panel){panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id)}
  });
  nav.addEventListener('click',()=>queueMicrotask(syncTabs));
}
function syncTabs(){
  $$('#relationshipTabs button[data-panel]').forEach(button=>button.setAttribute('aria-selected',button.classList.contains('active')?'true':'false'));
}
function classifyAcceptance(){
  const items=$$('#acceptanceView .acceptance-item');
  items.forEach(item=>{
    if(item.dataset.cm1Classified==='1')return;
    const number=Number(item.querySelector('.acceptance-number')?.textContent||0);
    const key={2:'identity_resolved',7:'product_view_event',13:'opportunity_lifecycle',15:'marketing_brain_suggests',18:'ai_cost_measured'}[number];
    if(!key)return;
    const target=item.querySelector('.acceptance-copy');
    if(!target)return;
    const kind=ORGANIC_KEYS.has(key)?'organic':HUMAN_KEYS.has(key)?'human':'technical';
    const labels={organic:['Evidência real','A capacidade está programada. Falta ocorrer evidência orgânica real; a tela não fabrica o evento.'],human:['Ação humana','A capacidade está programada. A próxima evidência depende de decisão ou gate humano.'],technical:['Programado','Capacidade técnica pronta e protegida pelos gates da homologação.']};
    const [title,copy]=labels[kind];
    const note=document.createElement('div');
    note.className=`cm1-next-step cm1-next-step-${kind}`;
    note.innerHTML=`<strong>${title}</strong><span>${copy}</span>`;
    target.appendChild(note);
    item.dataset.cm1Classified='1';
  });
}
function enhanceMeta(){
  const box=$('#metaView .meta-preflight-box');
  if(!box||box.querySelector('.cm1-safety-note'))return;
  const note=document.createElement('div');
  note.className='cm1-safety-note';
  note.innerHTML='<strong>Diagnóstico somente leitura</strong><span>“Verificar Meta agora” consulta evidências pelo Supabase. Não envia mensagens, não publica, não habilita outbound e não autoriza Meta Direct.</span>';
  box.prepend(note);
  const button=box.querySelector('[data-meta-diagnostics]');
  if(button){button.setAttribute('aria-describedby','cm1-meta-readonly-help');note.id='cm1-meta-readonly-help'}
}
function enhanceEmptyStates(){
  $$('.empty').forEach(el=>{if(!el.getAttribute('role'))el.setAttribute('role','status')});
}
function refreshEnhancements(){enhanceStatus();syncTabs();classifyAcceptance();enhanceMeta();enhanceEmptyStates()}

function init(){
  enhanceStatus();enhanceTabs();refreshEnhancements();
  import('./admin-context-nav-v2.js?v=20260920-2').catch(error=>console.warn('[admin-context-nav] navegação contextual indisponível; workspace preservado',error));
  const app=$('#relationshipApp');
  if(app){new MutationObserver(()=>refreshEnhancements()).observe(app,{subtree:true,childList:true})}
  const refresh=$('#refreshRelationship');
  if(refresh){refresh.addEventListener('click',()=>{refresh.setAttribute('aria-busy','true');setTimeout(()=>refresh.removeAttribute('aria-busy'),1500)})}
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
