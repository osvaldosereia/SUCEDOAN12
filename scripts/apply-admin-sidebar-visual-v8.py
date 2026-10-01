from pathlib import Path

p = Path('vitrine/admin/index.html')
s = p.read_text(encoding='utf-8')

if 'ADMIN_SIDEBAR_VISUAL_V8' in s:
    raise SystemExit('visual v8 already applied')

css = r'''

    /* ADMIN_SIDEBAR_VISUAL_V8 */
    .admin-nav .nav-submenu .tab{gap:9px}
    .nav-item-icon{
      width:26px;height:26px;flex:0 0 26px;display:inline-flex;align-items:center;justify-content:center;
      border-radius:8px;background:#f2f5f3;color:#536159;font-size:14px;font-weight:900;line-height:1;
      transition:background .15s ease,color .15s ease,transform .15s ease
    }
    .admin-nav .nav-submenu .tab:hover .nav-item-icon{background:#e8eeea;color:var(--ink);transform:translateX(1px)}
    .admin-nav .nav-submenu .tab.active .nav-item-icon{background:#fff;color:var(--brand2);box-shadow:0 0 0 1px #cfe1d5}

    @media(min-width:761px){
      .admin-nav{width:224px!important;max-width:224px!important;padding:12px 10px 20px!important;gap:6px!important}
      .admin-nav .nav-group{padding:0 0 7px!important;margin:0 0 6px!important;border-bottom:1px solid #eef1ef}
      .admin-nav .nav-group:last-child{border-bottom:0;margin-bottom:0!important}
      .admin-nav .nav-group-toggle{min-height:24px!important;padding:0 8px!important;font-size:9.5px!important;letter-spacing:.08em!important}
      .admin-nav .nav-submenu{gap:2px!important;padding-top:1px!important}
      .admin-nav .nav-submenu .tab{min-height:36px!important;padding:5px 8px!important;border-radius:8px!important;font-size:12.5px!important;font-weight:760!important}
      .admin-nav .nav-submenu .tab.active{background:#edf6f0!important;border-color:#d7e8dc!important;box-shadow:inset 3px 0 0 var(--brand)!important;font-weight:900!important}
      .nav-item-icon{width:24px;height:24px;flex-basis:24px;border-radius:7px;font-size:13px}
      .nav-mobile-store-link{display:none!important}
      #content.wrap{margin:0 20px 0 244px!important;padding-top:18px!important}
    }

    @media(max-width:760px){
      .admin-nav{width:min(88vw,320px)!important;max-width:320px!important;padding-left:10px!important;padding-right:10px!important}
      .admin-nav .nav-group{padding-bottom:8px!important;margin-bottom:8px!important;border-bottom:1px solid #eef1ef}
      .admin-nav .nav-group:last-child{border-bottom:0}
      .admin-nav .nav-group-toggle{font-size:10px!important;letter-spacing:.08em!important;padding-left:8px!important}
      .admin-nav .nav-submenu .tab,.admin-nav .nav-mobile-store-link{min-height:48px!important;padding:8px 9px!important;border-radius:11px!important;font-size:14px!important;gap:10px!important}
      .nav-item-icon{width:30px;height:30px;flex-basis:30px;border-radius:9px;font-size:15px}
      .admin-nav .nav-submenu .tab.active{font-weight:900!important;background:#edf6f0!important}
      .nav-mobile-store-link::before{content:'↗';width:30px;height:30px;flex:0 0 30px;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;background:#f2f5f3;color:#536159;font-size:15px;font-weight:900}
    }
'''

style_anchor = '  </style>\n</head>'
if style_anchor not in s:
    raise SystemExit('style anchor not found')
s = s.replace(style_anchor, css + '\n  </style>\n</head>', 1)

js_anchor = "  expandSidebarGroups();\n\n  function setTab(tab){"
if js_anchor not in s:
    raise SystemExit('navigation js anchor not found')
js = r'''  expandSidebarGroups();
  const NAV_ITEM_ICONS={
    'today':'⌂','orders':'▤','separation':'✓','expedition':'↗','driver':'◆','closure':'◎',
    'products':'□','baskets':'◇','expiry':'◷','quotes':'$','customers':'♙','marketing':'◉',
    'purchases':'↓','balance':'⌗','gondolas':'▦','more':'⋯'
  };
  function decorateAdminNav(){
    document.querySelectorAll('.admin-nav [data-tab]').forEach(item=>{
      if(item.querySelector('.nav-item-icon'))return;
      const icon=document.createElement('span');
      icon.className='nav-item-icon';
      icon.setAttribute('aria-hidden','true');
      icon.textContent=NAV_ITEM_ICONS[item.dataset.tab]||'•';
      item.prepend(icon);
    });
  }
  decorateAdminNav();

  function setTab(tab){'''
s = s.replace(js_anchor, js, 1)

p.write_text(s, encoding='utf-8')
print('APPLIED_ADMIN_SIDEBAR_VISUAL_V8')
