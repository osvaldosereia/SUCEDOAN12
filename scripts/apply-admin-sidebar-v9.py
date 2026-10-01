from pathlib import Path
import re

path = Path('vitrine/admin/index.html')
html = path.read_text(encoding='utf-8')


def remove_between(text, start_marker, end_marker):
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f'missing start marker: {start_marker}')
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f'missing end marker: {end_marker}')
    return text[:start] + text[end:]

# Remove the three competing navigation implementations completely.
html = remove_between(
    html,
    '    /* Admin Navigation V6.1 · desktop + mobile sem overflow horizontal */',
    '    /* PRODUCTS_MOBILE_DETAIL_V2 */',
)
html = remove_between(
    html,
    '    /* ADMIN_SIDEBAR_NAV_V7 */',
    '    /* ADMIN_SIDEBAR_VISUAL_V8 */',
)
start = html.find('    /* ADMIN_SIDEBAR_VISUAL_V8 */')
end = html.find('  </style>', start)
if start < 0 or end < 0:
    raise SystemExit('missing V8 block')
html = html[:start] + html[end:]

# One unrelated mobile product rule referenced the obsolete nav class.
html = html.replace('.top .wrap,.admin-nav{overflow:visible!important}', '.top .wrap{overflow:visible!important}')

sidebar_css = r'''
    /* ADMIN_SIDEBAR_V9 · única implementação de navegação do Admin */
    :root{--admin-sidebar-width:224px}
    .admin-nav-toggle{
      display:none;width:42px;height:42px;flex:0 0 42px;align-items:center;justify-content:center;
      border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);font-size:22px;font-weight:900
    }
    .admin-sidebar{
      background:#fff;border-right:1px solid var(--line);color:var(--ink);overscroll-behavior:contain
    }
    .admin-sidebar-section{padding:0 0 8px;margin:0 0 7px;border-bottom:1px solid #eef1ef}
    .admin-sidebar-section:last-child{border-bottom:0;margin-bottom:0}
    .admin-sidebar-title{
      min-height:25px;display:flex;align-items:center;padding:0 8px;color:#68736c;
      font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase
    }
    .admin-sidebar-section.active>.admin-sidebar-title{color:var(--brand2)}
    .admin-sidebar-list{display:grid;grid-template-columns:1fr;gap:2px}
    .admin-sidebar-item,.admin-sidebar-store{
      width:100%;min-width:0;min-height:38px;padding:5px 8px;display:flex;align-items:center;gap:9px;
      border:1px solid transparent;border-radius:9px;background:transparent;color:#3f4d44;
      font:inherit;font-size:13px;font-weight:750;line-height:1.2;text-align:left;text-decoration:none;cursor:pointer
    }
    .admin-sidebar-item:hover,.admin-sidebar-store:hover{background:var(--soft);color:var(--ink)}
    .admin-sidebar-item.active{
      background:#edf6f0;border-color:#d7e8dc;color:var(--brand2);font-weight:900;
      box-shadow:inset 3px 0 0 var(--brand)
    }
    .nav-item-icon{
      width:26px;height:26px;flex:0 0 26px;display:inline-flex;align-items:center;justify-content:center;
      border-radius:8px;background:#f2f5f3;color:#536159;font-size:14px;font-weight:900;line-height:1
    }
    .admin-sidebar-item.active .nav-item-icon{background:#fff;color:var(--brand2);box-shadow:0 0 0 1px #cfe1d5}
    .admin-sidebar-store{display:none;margin-top:4px}
    .admin-nav-backdrop{display:none}

    @media(min-width:761px){
      .top{position:sticky;top:0;z-index:60}
      .top-row.wrap{width:100%;max-width:none;padding-inline:18px}
      .admin-sidebar{
        position:fixed;left:0;top:60px;bottom:0;z-index:50;width:var(--admin-sidebar-width);
        padding:12px 10px 20px;overflow-x:hidden;overflow-y:auto;box-shadow:4px 0 18px rgba(16,35,23,.04)
      }
      #content.wrap{
        width:auto;max-width:none;margin:0 20px 0 calc(var(--admin-sidebar-width) + 20px);padding:18px 0 80px
      }
    }

    @media(max-width:760px){
      html,body{max-width:100%;overflow-x:hidden}
      .top{position:sticky;top:0;z-index:140}
      .top .top-row{
        display:grid;grid-template-columns:42px 48px minmax(0,1fr);grid-template-areas:'menu logo brand';
        align-items:center;gap:7px;min-height:56px;height:auto;padding:7px 10px
      }
      .admin-nav-toggle{display:inline-flex;grid-area:menu;position:relative;z-index:160}
      .admin-nav-toggle-glyph{font-size:22px;line-height:1}
      .top .logo{grid-area:logo;width:48px;height:32px}
      .top .brand{grid-area:brand;min-width:0}
      .top .brand strong{font-size:14px;line-height:1.15}
      .top .brand small{display:none}
      .top-row>.store-link,.top-row>.operator-badge{display:none}
      .admin-sidebar{
        position:fixed;left:0;top:0;bottom:0;z-index:130;width:min(88vw,320px);height:100dvh;
        padding:66px 10px max(24px,env(safe-area-inset-bottom));overflow-x:hidden;overflow-y:auto;
        box-shadow:18px 0 48px rgba(16,35,23,.18);transform:translateX(-104%);transition:transform .2s ease
      }
      body.admin-nav-open .admin-sidebar{transform:translateX(0)}
      body.admin-nav-open{overflow:hidden}
      body.admin-nav-open .admin-nav-toggle-glyph{font-size:0}
      body.admin-nav-open .admin-nav-toggle-glyph::after{content:'×';font-size:28px;line-height:1}
      .admin-sidebar-section{padding-bottom:9px;margin-bottom:9px}
      .admin-sidebar-title{font-size:10px;padding-left:8px}
      .admin-sidebar-item,.admin-sidebar-store{min-height:48px;padding:8px 9px;border-radius:11px;font-size:14px;gap:10px}
      .nav-item-icon{width:30px;height:30px;flex-basis:30px;border-radius:9px;font-size:15px}
      .admin-sidebar-store{display:flex}
      .admin-nav-backdrop{
        display:block;position:fixed;inset:0;z-index:120;border:0;padding:0;background:rgba(15,23,18,.42);
        opacity:0;pointer-events:none;transition:opacity .2s ease
      }
      body.admin-nav-open .admin-nav-backdrop{opacity:1;pointer-events:auto}
      #content.wrap{width:100%;max-width:100%;margin:0;padding:12px 10px 80px}
    }
'''
html = html.replace('  </style>', sidebar_css + '\n  </style>', 1)

I = '<span class="nav-item-icon" aria-hidden="true">{}</span>'
sections = [
    ('Operação', [
        ('today','⌂','Central'),('orders','▤','Pedidos'),('separation','✓','Separação'),
        ('expedition','↗','Expedição'),('driver','◆','Entregador'),('closure','◎','Fechamento')]),
    ('Catálogo', [('products','□','Produtos'),('baskets','◇','Cestas'),('expiry','◷','Validades')]),
    ('Comercial', [('quotes','$','Orçamentos'),('customers','♙','Clientes'),('marketing','◉','Marketing')]),
    ('Estoque', [('purchases','↓','Compras/XML'),('balance','⌗','Balanço'),('gondolas','▦','Gôndolas')]),
    ('Sistema', [('more','⋯','Mais')]),
]
parts = ['      <nav class="admin-sidebar" id="adminNav" aria-label="Admin">']
for title, items in sections:
    parts.append('        <section class="admin-sidebar-section">')
    parts.append(f'          <div class="admin-sidebar-title">{title}</div>')
    parts.append('          <div class="admin-sidebar-list">')
    for tab, icon, label in items:
        parts.append(f'            <button class="admin-sidebar-item" data-tab="{tab}" type="button">{I.format(icon)}<span>{label}</span></button>')
    if title == 'Sistema':
        parts.append('            <a class="admin-sidebar-store" href="/vitrine/" target="_blank" rel="noopener"><span class="nav-item-icon" aria-hidden="true">↗</span><span>Abrir vitrine</span></a>')
    parts.append('          </div>')
    parts.append('        </section>')
parts.append('      </nav>')
parts.append('      <button class="admin-nav-backdrop" id="adminNavBackdrop" type="button" aria-label="Fechar menu" tabindex="-1"></button>')
new_nav = '\n'.join(parts)

nav_pattern = re.compile(
    r'\s*<nav class="tabs admin-nav" id="adminNav" aria-label="Admin">.*?</nav>\s*'
    r'<button class="admin-nav-backdrop" id="adminNavBackdrop".*?</button>\s*</header>',
    re.S,
)
replacement = '\n    </header>\n' + new_nav
html, count = nav_pattern.subn(replacement, html, count=1)
if count != 1:
    raise SystemExit(f'expected to replace one legacy nav DOM, got {count}')

nav_js = r'''
  const adminNavIsMobile=()=>window.matchMedia('(max-width:760px)').matches;
  function setAdminNavOpen(open){
    const shouldOpen=Boolean(open&&adminNavIsMobile());
    document.body.classList.toggle('admin-nav-open',shouldOpen);
    const toggle=$('#adminNavToggle');
    if(toggle){
      toggle.setAttribute('aria-expanded',shouldOpen?'true':'false');
      toggle.setAttribute('aria-label',shouldOpen?'Fechar menu':'Abrir menu');
    }
  }
  function closeNavMenus(){setAdminNavOpen(false)}
  function syncNavGroups(){
    document.querySelectorAll('.admin-sidebar-section').forEach(section=>{
      section.classList.toggle('active',Boolean(section.querySelector('[data-tab="'+state.tab+'"]')));
    });
    document.querySelectorAll('#adminNav [data-tab]').forEach(item=>{
      if(item.dataset.tab===state.tab)item.setAttribute('aria-current','page');
      else item.removeAttribute('aria-current');
    });
  }
  if($('#adminNavToggle'))$('#adminNavToggle').onclick=()=>setAdminNavOpen(!document.body.classList.contains('admin-nav-open'));
  if($('#adminNavBackdrop'))$('#adminNavBackdrop').onclick=()=>setAdminNavOpen(false);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')setAdminNavOpen(false)});
  window.addEventListener('resize',()=>{if(!adminNavIsMobile())setAdminNavOpen(false)});
'''
js_pattern = re.compile(
    r'\n  const adminNavIsMobile=.*?\n  decorateAdminNav\(\);\n',
    re.S,
)
html, count = js_pattern.subn('\n' + nav_js + '\n', html, count=1)
if count != 1:
    raise SystemExit(f'expected to replace one legacy nav JS block, got {count}')

# The new sidebar is structurally independent from the old tabs/dropdown system.
path.write_text(html, encoding='utf-8')
print('ADMIN_SIDEBAR_V9_REFACTOR_APPLIED')
