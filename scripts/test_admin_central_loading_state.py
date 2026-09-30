from pathlib import Path

s = Path('vitrine/admin/index.html').read_text(encoding='utf-8')

checks = [
    "if(state.opsSummary===null)return '<section class=\"panel\" style=\"margin-bottom:14px\"><div class=\"loading\">Carregando indicadores operacionais…</div></section>';",
    "if(state.opsPapoAi===null)return '<section class=\"panel\" style=\"margin-bottom:14px\"><div class=\"loading\">Carregando PapoAI / WhatsApp…</div></section>';",
    "if(state.opsAttention===null)return '<section class=\"panel\" style=\"margin-bottom:14px\"><div class=\"loading\">Carregando pendências…</div></section>';",
    "opsAttention:null",
]
missing = [x for x in checks if x not in s]
if missing:
    raise SystemExit('central loading-state regression: missing '+repr(missing))
if 'id="todayDeferredLoading"' in s:
    raise SystemExit('obsolete deferred loading node still present')
print('central loading-state contract OK')
