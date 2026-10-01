from pathlib import Path

html = Path('vitrine/admin/index.html').read_text(encoding='utf-8')
required = [
    'ADMIN_SIDEBAR_NAV_V7',
    'id="adminNavToggle"',
    'id="adminNavBackdrop"',
    'class="tabs admin-nav"',
    'admin-nav-open',
    'aria-controls="adminNav"',
]
missing = [token for token in required if token not in html]
assert not missing, 'missing sidebar nav contract: ' + ', '.join(missing)
assert '@media(min-width:761px)' in html
assert '@media(max-width:760px)' in html
print('ADMIN_SIDEBAR_NAV_V7_OK')
