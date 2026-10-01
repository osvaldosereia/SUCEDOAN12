from pathlib import Path

p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')

marker='/* ADMIN_SIDEBAR_NAV_V7 */'
if marker in s:
    raise SystemExit('sidebar nav v7 already applied')

css=r'''
    /* ADMIN_SIDEBAR_NAV_V7 */
    .admin-nav-toggle{display:none;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:10px;width:42px;height:42px;align-items:center;justify-content:center;font-weight:900;flex:none}
    .admin-nav-toggle-glyph{font-size:22px;line-height:1}
    .admin-nav-backdrop{display:none}

    @media(min-width:761px){
      .top{position:sticky;top:0;z-index:50}
      .top-row.wrap{width:100%;max-width:none;padding-inline:18px}
      .admin-nav{
        position:fixed!important;
        left:0!important;
        top:64px!important;
        bottom:0!important;
        z-index:45!important;
        width:248px!important;
        max-width:248px!important;
        height:auto!important;
        margin:0!important;
        padding:14px 12px 24px!important;
        display:flex!important;
        flex-direction:column!important;
        align-items:stretch!important;
        flex-wrap:nowrap!important;
        gap:12px!important;
        overflow-x:hidden!important;
        overflow-y:auto!important;
        background:#fff!important;
        border-right:1px solid var(--line)!important;
        box-shadow:4px 0 18px rgba(16,35,23,.04)!important;
      }
      .admin-nav .nav-group{position:static!important;width:100%;min-width:0!important}
      .admin-nav .nav-group-toggle{
        width:100%!important;
        min-height:28px!important;
        padding:0 9px!important;
        justify-content:flex-start!important;
        border:0!important;
        background:transparent!important;
        color:var(--muted)!important;
        font-size:11px!important;
        font-weight:900!important;
        letter-spacing:.06em!important;
        text-transform:uppercase!important;
        pointer-events:none!important;
        box-shadow:none!important;
      }
      .admin-nav .nav-group.active>.nav-group-toggle{color:var(--brand)!important}
      .admin-nav .nav-chevron{display:none!important}
      html body .admin-nav .nav-submenu,
      html body .admin-nav .nav-submenu[hidden],
      html body .admin-nav .nav-submenu-right{
        position:static!important;
        inset:auto!important;
        width:100%!important;
        min-width:0!important;
        max-width:none!important;
        display:grid!important;
        grid-template-columns:1fr!important;
        gap:3px!important;
        padding:2px 0 0!important;
        border:0!important;
        border-radius:0!important;
        background:transparent!important;
        box-shadow:none!important;
        overflow:visible!important;
      }
      .admin-nav .nav-submenu .tab,
      .admin-nav .nav-mobile-store-link{
        width:100%!important;
        min-height:40px!important;
        padding:8px 11px!important;
        border:1px solid transparent!important;
        border-radius:9px!important;
        display:flex!important;
        justify-content:flex-start!important;
        align-items:center!important;
        background:transparent!important;
        color:#3f4d44!important;
        font-size:13px!important;
        font-weight:750!important;
        text-align:left!important;
        white-space:normal!important;
      }
      .admin-nav .nav-submenu .tab:hover,
      .admin-nav .nav-mobile-store-link:hover{background:var(--soft)!important;color:var(--ink)!important}
      .admin-nav .nav-submenu .tab.active{
        background:#eaf3ed!important;
        border-color:#cfe1d5!important;
        color:var(--brand2)!important;
        box-shadow:inset 3px 0 0 var(--brand)!important;
      }
      .nav-mobile-store-link{display:flex!important;margin-top:4px}
      #content.wrap{
        width:auto!important;
        max-width:none!important;
        margin:0 22px 0 270px!important;
        padding:18px 0 80px!important;
      }
    }

    @media(max-width:760px){
      .top{position:sticky;top:0;z-index:100!important}
      .top-row{
        display:grid!important;
        grid-template-columns:42px 48px minmax(0,1fr)!important;
        grid-template-areas:'menu logo brand'!important;
        gap:7px!important;
        min-height:56px!important;
        height:auto!important;
        padding:7px 10px!important;
      }
      .admin-nav-toggle{display:inline-flex!important;grid-area:menu;position:relative;z-index:140}
      .logo{grid-area:logo!important;width:48px!important;height:32px!important}
      .brand{grid-area:brand!important;min-width:0!important}
      .brand strong{font-size:14px!important;line-height:1.15!important}
      .brand small{display:none!important}
      .top-row>.store-link,.operator-badge{display:none!important}

      .admin-nav{
        position:fixed!important;
        top:0!important;
        bottom:0!important;
        left:0!important;
        z-index:125!important;
        width:min(86vw,310px)!important;
        max-width:310px!important;
        height:100dvh!important;
        margin:0!important;
        padding:64px 12px max(24px,env(safe-area-inset-bottom))!important;
        display:block!important;
        overflow-x:hidden!important;
        overflow-y:auto!important;
        background:#fff!important;
        border-right:1px solid var(--line)!important;
        box-shadow:18px 0 48px rgba(16,35,23,.18)!important;
        transform:translateX(-104%)!important;
        transition:transform .2s ease!important;
        overscroll-behavior:contain;
      }
      body.admin-nav-open .admin-nav{transform:translateX(0)!important}
      .admin-nav-backdrop{
        display:block!important;
        position:fixed;
        inset:0;
        z-index:115;
        border:0;
        padding:0;
        background:rgba(15,23,18,.42);
        opacity:0;
        pointer-events:none;
        transition:opacity .2s ease;
      }
      body.admin-nav-open .admin-nav-backdrop{opacity:1;pointer-events:auto}
      body.admin-nav-open{overflow:hidden!important}
      body.admin-nav-open .admin-nav-toggle-glyph{font-size:0}
      body.admin-nav-open .admin-nav-toggle-glyph::after{content:'×';font-size:28px;line-height:1}
      .admin-nav .nav-group{position:static!important;width:100%!important;margin:0 0 12px!important}
      .admin-nav .nav-group-toggle{
        width:100%!important;
        min-height:28px!important;
        padding:0 9px!important;
        justify-content:flex-start!important;
        border:0!important;
        background:transparent!important;
        color:var(--muted)!important;
        font-size:11px!important;
        font-weight:900!important;
        letter-spacing:.06em!important;
        text-transform:uppercase!important;
        pointer-events:none!important;
        box-shadow:none!important;
      }
      .admin-nav .nav-group.active>.nav-group-toggle{color:var(--brand)!important}
      .admin-nav .nav-chevron{display:none!important}
      html body .admin-nav .nav-submenu,
      html body .admin-nav .nav-submenu[hidden],
      html body .admin-nav .nav-submenu-right{
        position:static!important;
        inset:auto!important;
        width:100%!important;
        min-width:0!important;
        max-width:none!important;
        max-height:none!important;
        display:grid!important;
        grid-template-columns:1fr!important;
        gap:4px!important;
        padding:2px 0 0!important;
        border:0!important;
        border-radius:0!important;
        background:transparent!important;
        box-shadow:none!important;
        overflow:visible!important;
      }
      .admin-nav .nav-submenu .tab,
      .admin-nav .nav-mobile-store-link{
        width:100%!important;
        min-width:0!important;
        min-height:44px!important;
        padding:9px 11px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:flex-start!important;
        border:1px solid transparent!important;
        border-radius:10px!important;
        background:transparent!important;
        color:#344139!important;
        font-size:13px!important;
        font-weight:750!important;
        line-height:1.2!important;
        white-space:normal!important;
        text-align:left!important;
      }
      .admin-nav .nav-submenu .tab.active{
        background:#eaf3ed!important;
        border-color:#cfe1d5!important;
        color:var(--brand2)!important;
        box-shadow:inset 3px 0 0 var(--brand)!important;
      }
      .nav-mobile-store-link{display:flex!important;margin-top:4px}
      #content.wrap{width:100%!important;max-width:100%!important;margin:0!important;padding:12px 10px 80px!important}
    }
'''

style_anchor='  </style>'
assert style_anchor in s
s=s.replace(style_anchor,css+style_anchor,1)

old_top='''      <div class="top-row wrap">\n        <img class="logo" src="/img/logoantonia5.png" width="88" height="40" alt="Dona Antônia" fetchpriority="high">'''
new_top='''      <div class="top-row wrap">\n        <button class="admin-nav-toggle" id="adminNavToggle" type="button" aria-label="Abrir menu" aria-controls="adminNav" aria-expanded="false"><span class="admin-nav-toggle-glyph" aria-hidden="true">☰</span></button>\n        <img class="logo" src="/img/logoantonia5.png" width="88" height="40" alt="Dona Antônia" fetchpriority="high">'''
assert old_top in s
s=s.replace(old_top,new_top,1)

old_nav='<nav class="tabs wrap admin-nav" aria-label="Admin">'
new_nav='<nav class="tabs admin-nav" id="adminNav" aria-label="Admin">'
assert old_nav in s
s=s.replace(old_nav,new_nav,1)

old_close='''      </nav>\n    </header>\n    <main class="wrap" id="content"></main>'''
new_close='''      </nav>\n      <button class="admin-nav-backdrop" id="adminNavBackdrop" type="button" aria-label="Fechar menu" tabindex="-1"></button>\n    </header>\n    <main class="wrap" id="content"></main>'''
assert old_close in s
s=s.replace(old_close,new_close,1)

start=s.index('  function closeNavMenus(')
end=s.index('  function setTab(tab){',start)
js=r'''  const adminNavIsMobile=()=>window.matchMedia('(max-width:760px)').matches;
  function setAdminNavOpen(open){
    const shouldOpen=Boolean(open&&adminNavIsMobile());
    document.body.classList.toggle('admin-nav-open',shouldOpen);
    const toggle=$('#adminNavToggle');
    if(toggle){
      toggle.setAttribute('aria-expanded',shouldOpen?'true':'false');
      toggle.setAttribute('aria-label',shouldOpen?'Fechar menu':'Abrir menu');
    }
  }
  function expandSidebarGroups(){
    document.querySelectorAll('.nav-group').forEach(group=>{
      group.classList.remove('open');
      const toggle=group.querySelector('.nav-group-toggle');
      const menu=group.querySelector('.nav-submenu');
      if(toggle)toggle.setAttribute('aria-expanded','true');
      if(menu)menu.hidden=false;
    });
  }
  function closeNavMenus(){setAdminNavOpen(false)}
  function syncNavGroups(){
    document.querySelectorAll('.nav-group').forEach(group=>{
      const active=Boolean(group.querySelector('[data-tab="'+state.tab+'"]'));
      group.classList.toggle('active',active);
      const toggle=group.querySelector('.nav-group-toggle');
      const activeItem=group.querySelector('[data-tab="'+state.tab+'"]');
      if(toggle){
        const label=activeItem?.textContent?.trim()||'';
        toggle.title=active?('Seção atual: '+label):'Seção de navegação';
        toggle.setAttribute('aria-expanded','true');
      }
      const menu=group.querySelector('.nav-submenu');
      if(menu)menu.hidden=false;
    });
  }
  document.querySelectorAll('.nav-group-toggle').forEach(toggle=>{
    toggle.onclick=event=>event.preventDefault();
  });
  if($('#adminNavToggle'))$('#adminNavToggle').onclick=()=>setAdminNavOpen(!document.body.classList.contains('admin-nav-open'));
  if($('#adminNavBackdrop'))$('#adminNavBackdrop').onclick=()=>setAdminNavOpen(false);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')setAdminNavOpen(false)});
  window.addEventListener('resize',()=>{if(!adminNavIsMobile())setAdminNavOpen(false);expandSidebarGroups()});
  expandSidebarGroups();

'''
s=s[:start]+js+s[end:]

p.write_text(s,encoding='utf-8')
