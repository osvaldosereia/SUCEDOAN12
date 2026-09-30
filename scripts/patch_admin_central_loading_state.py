from pathlib import Path

p = Path('vitrine/admin/index.html')
s = p.read_text(encoding='utf-8')

replacements = [
    (
        "opsSummary:null,opsAttention:[],opsShadow:null,opsPrintQueue:null,opsPapoAi:null,opsTimeline:[]",
        "opsSummary:null,opsAttention:null,opsShadow:null,opsPrintQueue:null,opsPapoAi:null,opsTimeline:[]"
    ),
    (
        "  function renderOpsAttention(){\n    const items=Array.isArray(state.opsAttention)?state.opsAttention:[];",
        "  function renderOpsAttention(){\n    if(state.opsAttention===null)return '<section class=\"panel\" style=\"margin-bottom:14px\"><div class=\"loading\">Carregando pendências…</div></section>';\n    const items=Array.isArray(state.opsAttention)?state.opsAttention:[];"
    ),
    (
        "  function renderOps2Summary(){\n    const s=state.opsSummary||{};",
        "  function renderOps2Summary(){\n    if(state.opsSummary===null)return '<section class=\"panel\" style=\"margin-bottom:14px\"><div class=\"loading\">Carregando indicadores operacionais…</div></section>';\n    const s=state.opsSummary||{};"
    ),
    (
        "  function renderPapoAiBridgePanel(){\n    const p=state.opsPapoAi||{};",
        "  function renderPapoAiBridgePanel(){\n    if(state.opsPapoAi===null)return '<section class=\"panel\" style=\"margin-bottom:14px\"><div class=\"loading\">Carregando PapoAI / WhatsApp…</div></section>';\n    const p=state.opsPapoAi||{};"
    ),
    (
        "      host.insertAdjacentHTML('beforeend','<div class=\"loading\" id=\"todayDeferredLoading\">Carregando indicadores complementares…</div>');\n",
        ""
    ),
]

for old, new in replacements:
    if old not in s:
        raise SystemExit('expected source not found: '+old[:120])
    s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print('patched central loading states')
