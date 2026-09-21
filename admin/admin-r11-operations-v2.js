const PAGE=(location.pathname.split('/').filter(Boolean).pop()||'').toLowerCase();
const CONFIG=Object.freeze({
  'relacionamento.html':{label:'Relacionamento',guard:['refreshRelationship','refreshAudit']},
  'atendimento.html':{label:'Atendimento',guard:['strategyRefresh','ruleSave','rulePublish','ruleArchive','testNewSession','testClearDiagnostics']},
  'inteligencia.html':{label:'Inteligência',guard:['siRefresh','siSave','siPublish','siArchive']},
  'aprendizados.html':{label:'Aprendizados',guard:['alRefresh','alApprove','alReject']}
});
const cfg=CONFIG[PAGE];
const cooldown=new WeakMap();
function ensureStyles(){if(document.querySelector('link[data-admin-r11-v2]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='./admin-r11-operations-v2.css?v=20260921-1';l.dataset.adminR11V2='';document.head.appendChild(l)}
function markStatus(){document.body.dataset.adminR11='1';document.querySelectorAll('[aria-live="polite"],.strategy-login-status,.ops-alert,.relationship-status').forEach(el=>{if(!el.getAttribute('role'))el.setAttribute('role','status')})}
function busyGuard(event){const button=event.target.closest('button');if(!button||!cfg?.guard.includes(button.id))return;const until=cooldown.get(button)||0;if(until>Date.now()||button.getAttribute('aria-busy')==='true'){event.preventDefault();event.stopImmediatePropagation();return}cooldown.set(button,Date.now()+900);button.setAttribute('aria-busy','true');button.classList.add('da-r11-busy');setTimeout(()=>{button.removeAttribute('aria-busy');button.classList.remove('da-r11-busy')},900)}
function enhanceDynamic(){if(PAGE!=='aprendizados.html')return;['alApprove','alReject'].forEach(id=>{const b=document.getElementById(id);if(b)b.dataset.r11Guard='human-review'})}
function init(){if(!cfg)return;ensureStyles();markStatus();document.addEventListener('click',busyGuard,true);enhanceDynamic();const root=document.querySelector('main,.al-shell,.si-shell,.strategy-shell,.relationship-main');if(root)new MutationObserver(enhanceDynamic).observe(root,{subtree:true,childList:true});import('./admin-context-nav-v2.js?v=20260920-2').catch(()=>{})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
