from pathlib import Path
import re

html = Path('vitrine/admin/index.html').read_text(encoding='utf-8')

assert 'ADMIN_SIDEBAR_V9' in html, 'missing v9 sidebar stylesheet marker'
assert 'Admin Navigation V6.1' not in html, 'legacy V6 navigation CSS still present'
assert 'ADMIN_SIDEBAR_NAV_V7' not in html, 'legacy V7 sidebar CSS still present'
assert 'ADMIN_SIDEBAR_VISUAL_V8' not in html, 'legacy V8 sidebar CSS still present'
assert '.admin-nav .nav-submenu[hidden]' not in html, 'legacy hidden/dropdown rule still present'
assert 'MOBILE_GLOBAL_GUARDS_V9' in html, 'mobile width guards were lost during refactor'
assert '#app,#content,main,.wrap,.panel,.page-head,.toolbar,.history-title,.dispatch-head' in html, 'global mobile min-width guard missing'

m = re.search(r'<nav[^>]*id="adminNav"[^>]*>(.*?)</nav>', html, re.S)
assert m, 'adminNav not found'
nav = m.group(0)
assert 'admin-sidebar' in nav, 'adminNav must use dedicated admin-sidebar class'
for forbidden in ('tabs admin-nav', 'nav-submenu', 'nav-group-toggle', ' hidden'):
    assert forbidden not in nav, f'legacy navigation token remains: {forbidden}'

expected = [
    'today','orders','separation','expedition','driver','closure',
    'products','baskets','expiry','quotes','customers','marketing',
    'purchases','balance','gondolas','more'
]
for tab in expected:
    assert nav.count(f'data-tab="{tab}"') == 1, f'missing/duplicate tab: {tab}'

assert nav.count('admin-sidebar-section') == 5, 'expected five sidebar sections'
assert nav.count('nav-item-icon') >= 16, 'icons must be explicit in markup, not injected by JS'
assert 'function expandSidebarGroups' not in html, 'legacy submenu expansion JS still present'
assert 'decorateAdminNav' not in html, 'legacy icon decoration JS still present'
assert 'setAdminNavOpen' in html, 'mobile drawer controller missing'

print('ADMIN_SIDEBAR_V9_CONTRACT_OK')
