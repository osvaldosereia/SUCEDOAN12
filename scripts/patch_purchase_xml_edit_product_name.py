from pathlib import Path

PATH = Path("vitrine/admin/index.html")
MARKER = "PURCHASE_XML_EDIT_NAME_V1"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


html = PATH.read_text(encoding="utf-8")

if MARKER in html:
    print(f"{PATH}: {MARKER} already present; no patch needed")
    raise SystemExit(0)

html = replace_once(
    html,
    "  function purchaseCatalogCardHtml(x){\n",
    "  // PURCHASE_XML_EDIT_NAME_V1\n  function purchaseCatalogCardHtml(x){\n",
    "catalog marker",
)

html = replace_once(
    html,
    '''      (reason?'<div class="purchase-factor-hint warn-text" style="margin-bottom:8px">'+esc(reason)+'</div>':'')+
      '<div class="purchase-price-grid">'+
''',
    '''      (reason?'<div class="purchase-factor-hint warn-text" style="margin-bottom:8px">'+esc(reason)+'</div>':'')+
      '<div class="purchase-field" style="margin-bottom:8px"><label>Nome do produto</label><input type="text" maxlength="300" data-catalog-product-name value="'+esc(prod.name||x.description||'')+'"><div class="purchase-factor-hint">Você pode editar o nome antes de salvar.</div></div>'+
      '<div class="purchase-price-grid">'+
''',
    "editable product name field",
)

html = replace_once(
    html,
    "    const sale=Number(String(card.querySelector('[data-catalog-sale]')?.value||'').replace(',','.'));\n",
    "    const sale=Number(String(card.querySelector('[data-catalog-sale]')?.value||'').replace(',','.'));\n    const proposedName=String(card.querySelector('[data-catalog-product-name]')?.value||'').trim();\n",
    "read proposed product name",
)

html = replace_once(
    html,
    "    const updateCost=Boolean(card.querySelector('[data-catalog-update-cost]')?.checked),updateSale=Boolean(card.querySelector('[data-catalog-update-sale]')?.checked);\n    if(!Number.isFinite(factor)||factor<1){if(!quiet)toast('Informe a conversão para UN');return false}\n",
    "    const updateCost=Boolean(card.querySelector('[data-catalog-update-cost]')?.checked),updateSale=Boolean(card.querySelector('[data-catalog-update-sale]')?.checked);\n    if(!proposedName){if(!quiet)toast('Informe o nome do produto');return false}\n    if(!Number.isFinite(factor)||factor<1){if(!quiet)toast('Informe a conversão para UN');return false}\n",
    "validate proposed product name",
)

html = replace_once(
    html,
    "      await purchaseApi('apply_item_update',{item_id:itemId,conversion_factor:factor,sale_price:sale,update_cost:updateCost,update_sale_price:updateSale,operator_name:operator});\n",
    "      await purchaseApi('apply_item_update',{item_id:itemId,proposed_name:proposedName,conversion_factor:factor,sale_price:sale,update_cost:updateCost,update_sale_price:updateSale,operator_name:operator});\n",
    "send proposed product name",
)

PATH.write_text(html, encoding="utf-8")
print(f"{PATH}: editable XML product name patch applied")
