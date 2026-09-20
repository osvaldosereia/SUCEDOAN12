import {CONFIG} from './runtime-config.js';
import {adminNavigationModel,adminHref} from './navigation-contract.js';

const legacyMountIds=Object.freeze({commercial:'commercialTruthNav',logistics:'logisticsNav',financial:'financialAdminNav',automations:'automationBuilderNav'});
const hashModule=()=>String(location.hash||'#dashboard').replace(/^#/,'')||'dashboard';

function navItem(item){
  const href=adminHref(item);
  const active=item.route.type==='hash'&&hashModule()===item.route.value;
  const attrs=`class="da-shell-link${active?' is-active':''}" data-admin-module="${item.id}"${active?' aria-current="page"':''}`;
  if(item.route.type==='hash')return `<a ${attrs} href="${href}" data-route="${item.route.value}">${item.label}</a>`;
  if(item.route.type==='external')return `<a ${attrs} href="${href}" target="_blank" rel="noopener">${item.label}<span class="da-shell-external" aria-hidden="true">↗</span></a>`;
  if(item.route.type==='page')return `<a ${attrs} href="${href}">${item.label}</a>`;
  if(item.route.type==='mount')return `<button ${attrs} id="${legacyMountIds[item.id]||''}" type="button" data-admin-mount="${item.route.value}">${item.label}</button>`;
  return '';
}

function model(){
  return adminNavigationModel({adminConfig:window.DA_ADMIN_CONFIG||{},runtimeConfig:CONFIG,search:location.search});
}

function renderNavigation(){
  const host=document.getElementById('adminShellNavigation');
  if(!host)return;
  host.innerHTML=model().map(group=>`<section class="da-shell-group" data-admin-group="${group.id}"><h2>${group.label}</h2><div>${group.modules.map(navItem).join('')}</div></section>`).join('');
}

function setExpanded(open){
  const sidebar=document.getElementById('sidebar');
  const backdrop=document.getElementById('sidebarBackdrop');
  const trigger=document.getElementById('menuButton');
  if(!sidebar||!backdrop||!trigger)return;
  sidebar.classList.toggle('open',open);
  backdrop.classList.toggle('hidden',!open);
  trigger.setAttribute('aria-expanded',String(open));
  document.body.classList.toggle('da-shell-menu-open',open);
}

function syncActive(){
  const current=hashModule();
  document.querySelectorAll('#adminShellNavigation [data-admin-module]').forEach(node=>{
    const active=node.dataset.route===current;
    node.classList.toggle('is-active',active);
    if(active)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');
  });
}

function bind(){
  const trigger=document.getElementById('menuButton');
  const backdrop=document.getElementById('sidebarBackdrop');
  trigger?.addEventListener('click',()=>setExpanded(!document.getElementById('sidebar')?.classList.contains('open')));
  backdrop?.addEventListener('click',()=>setExpanded(false));
  document.getElementById('adminShellNavigation')?.addEventListener('click',event=>{
    const item=event.target.closest('[data-admin-module]');
    if(!item)return;
    if(item.matches('a[data-route]'))setExpanded(false);
  });
  addEventListener('hashchange',()=>{syncActive();setExpanded(false)});
  addEventListener('keydown',event=>{if(event.key==='Escape')setExpanded(false)});
}

export function initAdminShell(){
  renderNavigation();
  syncActive();
  bind();
  document.documentElement.dataset.adminShell='v2';
}

initAdminShell();
