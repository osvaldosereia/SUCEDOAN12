from pathlib import Path

path = Path('vitrine/admin/atendimento/attendance.css')
css = path.read_text(encoding='utf-8')

replacements = {
    ".attendance-shell{min-height:100%;display:grid;grid-template-columns:var(--rail) minmax(0,1fr)}": ".attendance-shell{height:100vh;height:100dvh;min-height:0;overflow:hidden;display:grid;grid-template-columns:var(--rail) minmax(0,1fr)}",
    ".native-rail{position:sticky;top:0;height:100vh;": ".native-rail{position:sticky;top:0;height:100%;",
    ".attendance-page{min-width:0;min-height:100vh;padding:14px 16px 18px}": ".attendance-page{min-width:0;height:100%;min-height:0;overflow:hidden;padding:14px 16px 18px;display:flex;flex-direction:column}",
    ".page-topbar{height:58px;display:flex;": ".page-topbar{height:58px;flex:0 0 58px;display:flex;",
    ".attendance-workspace{height:calc(100vh - 90px);min-height:650px;display:grid;": ".attendance-workspace{height:auto;min-height:0;flex:1 1 auto;display:grid;",
    ".queue-column{min-width:0;border-right:1px solid var(--line);": ".queue-column{min-width:0;min-height:0;border-right:1px solid var(--line);",
    ".context-pane{min-width:0;border-left:1px solid var(--line);": ".context-pane{min-width:0;min-height:0;border-left:1px solid var(--line);",
}

for old, new in replacements.items():
    if old not in css:
        raise SystemExit(f'expected CSS fragment not found: {old}')
    css = css.replace(old, new, 1)

if 'min-height:650px' in css:
    raise SystemExit('fixed desktop min-height survived patch')

path.write_text(css, encoding='utf-8')
print('attendance viewport layout patched')
