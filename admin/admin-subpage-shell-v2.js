import {CONFIG} from './runtime-config.js';
import {adminNavigationModel} from './navigation-contract.js';

const currentPath=()=>location.pathname.split('/').pop()||'index.html';
const pageHref=value=>String(value||'').startsWith('./')?value:`./${String(value||'').replace(/^\.\//,'')}`;

function hrefFor(item){
  if(item.route.type==='hash')return `./#${item.route.value}`;
  if(item.route.type==='page')return pageHref(item.route.value);
  if(item.route.type==='external')return item.route.value;
  return null;
}

function isCurrent(item){
  if(item.route.type!=='page')return false;
  return String(item.route.value||'').split('/').pop()===currentPath();
}

function itemMarkup(item){
  const href=hrefFor(item);
  if(!href)return '';
  const active=isCurrent(item);
  const external=item.route.type==='external';
  return `<a class="da-shell-link${active?' is-active':''}" data-admin-module="${item.id}" href="${href}"${active?' aria-current="page"':''}${external?' target="_blank" rel="noopener"':''}>${item.label}${external?'<span class="da-shell-external" aria-hidden="true">↗</span>':''}</a>`;
}

function render(){
  const sidebar=document.getElementById('sidebar');
  if(!sidebar)return false;
  sidebar.classList.add('da-subpage-sidebar');
  let nav=sidebar.querySelector('#adminShellNavigation');
  if(!nav){nav=document.createElement('nav');nav.id='adminShellNavigation';sidebar.replaceChildren(nav)}
  const groups=adminNavigationModel({adminConfig:window.DA_ADMIN_CONFIG||{},runtimeConfig:CONFIG,search:location.search});
  nav.innerHTML=groups.map(group=>{
    const items=group.modules.map(itemMarkup).filter(Boolean).join('');
    return items?`<section class="da-shell-group" data-admin-group="${group.id}"><h2>${group.label}</h2><div>${items}</div></section>`:'';
  }).join('');
  return true;
}

function setExpanded(open){
  const sidebar=document.getElementById('sidebar');
  const trigger=document.getElementById('menuButton');
  if(!sidebar||!trigger)return;
  let backdrop=document.getElementById('sidebarBackdrop');
  if(!backdrop){backdrop=document.createElement('div');backdrop.id='sidebarBackdrop';backdrop.className='sidebar-backdrop hidden';sidebar.after(backdrop)}
  sidebar.classList.toggle('open',open);
  backdrop.classList.toggle('hidden',!open);
  trigger.setAttribute('aria-expanded',String(open));
  document.body.classList.toggle('da-shell-menu-open',open);
}

function bind(){
  const trigger=document.getElementById('menuButton');
  if(trigger){trigger.setAttribute('aria-controls','sidebar');trigger.setAttribute('aria-expanded','false');trigger.addEventListener('click',()=>setExpanded(!document.getElementById('sidebar')?.classList.contains('open')))}
  document.getElementById('sidebarBackdrop')?.addEventListener('click',()=>setExpanded(false));
  document.getElementById('adminShellNavigation')?.addEventListener('click',event=>{if(event.target.closest('a'))setExpanded(false)});
  addEventListener('keydown',event=>{if(event.key==='Escape')setExpanded(false)});
}

export function initAdminSubpageShell(){
  if(!render())return;
  bind();
  document.documentElement.dataset.adminShell='v2-subpage';
}

initAdminSubpageShell();
