from pathlib import Path

s = Path('vitrine/admin/index.html').read_text(encoding='utf-8')
required = [
    'ADMIN_SIDEBAR_VISUAL_V8',
    'nav-item-icon',
    'NAV_ITEM_ICONS',
    "'today':'⌂'",
    "'orders':'▤'",
    "'products':'□'",
    "'balance':'⌗'",
    'width:224px!important',
    'margin:0 20px 0 244px!important',
]
missing = [x for x in required if x not in s]
assert not missing, 'missing visual sidebar v8 tokens: ' + ', '.join(missing)
for tab in ['today','orders','separation','expedition','driver','closure','products','baskets','expiry','quotes','customers','marketing','purchases','balance','gondolas','more']:
    assert f"'{tab}':" in s, f'missing icon mapping for {tab}'
print('ADMIN_SIDEBAR_VISUAL_V8_OK')
