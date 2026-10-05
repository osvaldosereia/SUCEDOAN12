from pathlib import Path

path=Path('vitrine/admin/index.html')
s=path.read_text(encoding='utf-8')

# 1) Após criar o modelo comercial, abrir o fluxo guiado em vez do draft legado.
old_create="""      if(model.kit_template_id){await openBasketKitAdmin(model.kit_template_id);startBasketKitLotDraft(null)}"""
new_create="""      if(model.basket_id&&window.DonaAntoniaBasketGuided?.open){window.DonaAntoniaBasketGuided.open(model.basket_id,{mode:'lot',commercial:model})}
      else if(model.kit_template_id){await openBasketKitAdmin(model.kit_template_id);startBasketKitLotDraft(null)}"""
if old_create not in s and 'window.DonaAntoniaBasketGuided.open(model.basket_id' not in s:
    raise SystemExit('anchor createBasketCommercial not found')
if old_create in s:
    s=s.replace(old_create,new_create,1)

# 2) Editar modelo e Novo lote passam pelo editor guiado; fallback preserva editor antigo.
old_edit="""    host.querySelectorAll('[data-commercial-edit]').forEach(b=>b.onclick=()=>openBasketCommercialEditor(find(b.dataset.commercialEdit),'edit'));
    host.querySelectorAll('[data-commercial-new]').forEach(b=>b.onclick=()=>openBasketCommercialEditor(find(b.dataset.commercialNew),'new'));"""
new_edit="""    host.querySelectorAll('[data-commercial-edit]').forEach(b=>b.onclick=()=>{const m=find(b.dataset.commercialEdit);if(window.DonaAntoniaBasketGuided?.open)window.DonaAntoniaBasketGuided.open(m?.commercial_id,{mode:'model',commercial:m});else openBasketCommercialEditor(m,'edit')});
    host.querySelectorAll('[data-commercial-new]').forEach(b=>b.onclick=()=>{const m=find(b.dataset.commercialNew);if(window.DonaAntoniaBasketGuided?.open)window.DonaAntoniaBasketGuided.open(m?.commercial_id,{mode:'lot',commercial:m});else openBasketCommercialEditor(m,'new')});"""
if old_edit not in s and "data-commercial-new]').forEach(b=>b.onclick=()=>{const m=find(b.dataset.commercialNew);if(window.DonaAntoniaBasketGuided" not in s:
    raise SystemExit('anchor paintBasketCommercialModels not found')
if old_edit in s:
    s=s.replace(old_edit,new_edit,1)

# 3) Expor somente o necessário do IIFE atual e carregar o módulo externo após ele.
script_tag='<script src="/vitrine/admin/basket-guided-builder.js?v=guided-v1"></script>'
if 'window.DonaAntoniaGuidedBridge' not in s:
    marker='\n})();\n</script>'
    idx=s.rfind(marker)
    if idx<0:
        raise SystemExit('final admin IIFE anchor not found')
    bridge="""
  window.DonaAntoniaGuidedBridge={
    token:adminStepUp,
    operator:requireOperator,
    toast,
    refresh:renderBaskets,
    legacyApi:api,
    openCommercialEditor:openBasketCommercialEditor,
    openKitAdmin:openBasketKitAdmin,
    startLegacyDraft:startBasketKitLotDraft
  };"""
    s=s[:idx]+bridge+s[idx:]
if script_tag not in s:
    marker='\n</script>'
    idx=s.rfind(marker)
    if idx<0:
        raise SystemExit('final script close anchor not found')
    end=idx+len(marker)
    s=s[:end]+'\n'+script_tag+s[end:]

path.write_text(s,encoding='utf-8')

# 4) O resumo é uma etapa visível, não apenas um bloco visual sem título.
module_path=Path('vitrine/admin/basket-guided-builder.js')
module=module_path.read_text(encoding='utf-8')
css_anchor='.bg-summary{position:sticky;'
if '.bg-summary-title{' not in module:
    if css_anchor not in module:
        raise SystemExit('guided summary css anchor not found')
    module=module.replace(css_anchor,'.bg-summary-title{display:block;margin:0 0 7px;font-size:12px;font-weight:900}.bg-summary{position:sticky;',1)
html_anchor='function renderSummary(){const s=summaryData();return \'<div class="bg-summary"><div class="bg-summary-grid">\'+'
if '<strong class="bg-summary-title">Resumo</strong>' not in module:
    if html_anchor not in module:
        raise SystemExit('guided summary html anchor not found')
    module=module.replace(html_anchor,'function renderSummary(){const s=summaryData();return \'<div class="bg-summary"><strong class="bg-summary-title">Resumo</strong><div class="bg-summary-grid">\' +',1)
module_path.write_text(module,encoding='utf-8')

print('basket guided admin UI patch applied')
