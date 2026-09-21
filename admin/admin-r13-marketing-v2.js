// Admin Geral R13 — Marketing UX safety layer.
// UI-only by design: no fetch, storage, provider calls or persistence.
const BUSY_MS = 1400;
const ACTION_SELECTOR = [
  '#refreshMarketing','#refreshCustomerOpportunities','#refreshOpportunities',
  '#createDeterministicDraft','#validateTemplateDraft','#saveTemplateDraft',
  '#createAiTemplateDraft','[data-action="observe-opportunity"]',
  '[data-action="suggest-opportunity"]','[data-action="render-preview"]',
  '[data-action="queue-light-video"]','[data-action="submit-review"]',
  '[data-action="approve-asset"]','[data-action="reject-asset"]',
  '[data-action="prepare-publication"]','[data-action="publish-job"]',
  '[data-action="verify-channel"]','[data-action="disconnect-provider"]'
].join(',');

function ensureSafetyNotice(){
  const app=document.querySelector('#marketingApp');
  if(!app||document.querySelector('#r13MarketingSafety'))return;
  const notice=document.createElement('section');
  notice.id='r13MarketingSafety';
  notice.className='r13-marketing-safety';
  notice.setAttribute('role','status');
  notice.setAttribute('aria-live','polite');
  notice.innerHTML='<strong>Marketing protegido</strong><span>Criação e revisão podem ser preparadas aqui. Publicação externa, outbound e canary continuam dependentes dos gates reais do Marketing Admin.</span>';
  app.prepend(notice);
}

function markLiveRegions(){
  ['#authStatus','#customerOpportunityStatus','#opportunityStatus','#templateDraftStatus','#toastRegion'].forEach(selector=>{
    const el=document.querySelector(selector);
    if(el){ el.setAttribute('aria-live','polite'); el.setAttribute('aria-atomic','true'); }
  });
}

function guardAction(button){
  if(!button||button.disabled||button.dataset.r13Busy==='1')return;
  button.dataset.r13Busy='1';
  button.setAttribute('aria-busy','true');
  const original=button.textContent;
  if(original&&!/carregando|processando/i.test(original))button.dataset.r13Label=original;
  window.setTimeout(()=>{
    button.dataset.r13Busy='0';
    button.removeAttribute('aria-busy');
    if(button.dataset.r13Label&&button.textContent!==button.dataset.r13Label&&/aguarde|processando/i.test(button.textContent||''))button.textContent=button.dataset.r13Label;
  },BUSY_MS);
}

function wireBusyGuard(){
  document.addEventListener('click',event=>{
    const button=event.target.closest(ACTION_SELECTOR);
    if(!button)return;
    if(button.dataset.r13Busy==='1'){
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    guardAction(button);
  },true);
}

function enhanceTabs(){
  const tabs=document.querySelector('.marketing-tabs');
  if(!tabs)return;
  tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label','Áreas do Marketing');
  tabs.querySelectorAll('button[data-tab]').forEach(button=>{
    button.setAttribute('role','tab');
    button.setAttribute('aria-selected',button.classList.contains('active')?'true':'false');
  });
  const observer=new MutationObserver(()=>tabs.querySelectorAll('button[data-tab]').forEach(button=>button.setAttribute('aria-selected',button.classList.contains('active')?'true':'false')));
  tabs.querySelectorAll('button[data-tab]').forEach(button=>observer.observe(button,{attributes:true,attributeFilter:['class']}));
}

function boot(){
  document.documentElement.classList.add('admin-r13-marketing-v2');
  ensureSafetyNotice();
  markLiveRegions();
  enhanceTabs();
  wireBusyGuard();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
