import {CONFIG} from './runtime-config.js';
import {adminNavigationModel} from './navigation-contract.js';

const PAGE_MODULE=Object.freeze({
  '/admin/relacionamento.html':'relationship',
  '/admin/inteligencia.html':'serviceIntelligence',
  '/admin/aprendizados.html':'learning',
  '/video/':'video',
  '/video/index.html':'video',
  '/contagem/':'stockCount',
  '/contagem/index.html':'stockCount'
});

function absoluteHref(item){
  const route=item?.route;
  if(!route)return null;
  if(route.type==='hash')return `/admin/#${route.value}`;
  if(route.type==='page'||route.type==='external'){
    try{return new URL(route.value,'https://donaantonia.com.br/admin/').pathname+new URL(route.value,'https://donaantonia.com.br/admin/').search}
    catch{return null}
  }
  return null;
}

function activeModule(){
  return document.body?.dataset.adminModule||PAGE_MODULE[location.pathname]||'';
}

function navMarkup(){
  const groups=adminNavigationModel({adminConfig:window.DA_ADMIN_CONFIG||{},runtimeConfig:CONFIG,search:location.search});
  const current=activeModule();
  return groups.map(group=>{
    const links=group.modules.map(item=>{
      const href=absoluteHref(item);
      if(!href)return '';
      const active=item.id===current;
      const external=item.route.type==='external';
      return `<a class="da-global-nav-link${active?' is-active':''}" data-admin-module="${item.id}" href="${href}"${active?' aria-current="page"':''}${external?' target="_blank" rel="noopener"':''}><span>${item.label}</span>${external?'<span aria-hidden="true">↗</span>':''}</a>`;
    }).filter(Boolean).join('');
    return links?`<section class="da-global-nav-group"><h2>${group.label}</h2><div>${links}</div></section>`:'';
  }).join('');
}

function workspaceRoot(){
  return document.querySelector('[data-admin-workspace]')||
    document.querySelector('.relationship-shell,.si-page,.al-page,main.page,main.shell,.validity-main,.basket-main,.ops-cadastro main,.ops-kits .app');
}

function markLocalHeaders(root){
  const candidates=[
    document.querySelector('body > header.topbar'),
    document.querySelector('body > header.ops-topbar'),
    root?.querySelector(':scope > header.ops-topbar')
  ];
  candidates.filter(Boolean).forEach(header=>header.classList.add('da-local-module-header'));
}

function cloneOperationalNav(){
  const source=document.querySelector('.ops-app-nav');
  if(!source)return null;
  const nav=source.cloneNode(true);
  nav.classList.add('da-ops-secondary-nav');
  nav.removeAttribute('aria-current');
  nav.querySelectorAll('[aria-current]').forEach(node=>node.removeAttribute('aria-current'));
  return nav;
}

function setMenu(open){
  const aside=document.getElementById('globalAdminSidebar');
  const backdrop=document.getElementById('globalAdminBackdrop');
  const button=document.getElementById('globalAdminMenuButton');
  if(!aside||!backdrop||!button)return;
  aside.classList.toggle('open',open);
  backdrop.classList.toggle('hidden',!open);
  button.setAttribute('aria-expanded',String(open));
  document.body.classList.toggle('da-global-menu-open',open);
}

function mount(){
  if(document.documentElement.dataset.adminGlobalShell==='v3')return;
  const root=workspaceRoot();
  if(!root)return;
  markLocalHeaders(root);
  const operationalNav=cloneOperationalNav();

  const header=document.createElement('header');
  header.className='da-global-topbar';
  header.innerHTML=`
    <button id="globalAdminMenuButton" class="da-global-menu-button" type="button" aria-label="Abrir menu do Admin" aria-controls="globalAdminSidebar" aria-expanded="false">☰</button>
    <a class="da-global-brand" href="/admin/#dashboard"><img src="/img/logoantonia5.png" alt="" width="42" height="42"><span><strong>Dona Antônia</strong><b>Admin</b></span></a>
    <a class="da-global-buy-link" href="/comprar/" target="_blank" rel="noopener">Abrir Comprar</a>`;

  const layout=document.createElement('div');
  layout.className='da-global-admin-layout';
  const sidebar=document.createElement('aside');
  sidebar.id='globalAdminSidebar';
  sidebar.className='da-global-sidebar';
  sidebar.setAttribute('aria-label','Menu principal do Admin');
  sidebar.innerHTML=`<nav class="da-global-nav" aria-label="Módulos do Admin">${navMarkup()}</nav>`;
  const backdrop=document.createElement('div');
  backdrop.id='globalAdminBackdrop';
  backdrop.className='da-global-backdrop hidden';
  backdrop.setAttribute('aria-hidden','true');
  const content=document.createElement('main');
  content.className='da-global-admin-content';
  content.setAttribute('data-admin-global-content','');
  root.parentNode.insertBefore(header,root);
  root.parentNode.insertBefore(layout,root);
  layout.append(sidebar,backdrop,content);
  if(operationalNav)content.appendChild(operationalNav);
  content.appendChild(root);

  document.documentElement.dataset.adminGlobalShell='v3';
  document.body.classList.add('da-global-shell-v3');

  document.getElementById('globalAdminMenuButton')?.addEventListener('click',()=>setMenu(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click',()=>setMenu(false));
  sidebar.addEventListener('click',event=>{if(event.target.closest('a'))setMenu(false)});
  addEventListener('keydown',event=>{if(event.key==='Escape')setMenu(false)});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
