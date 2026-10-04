from pathlib import Path

PATH = Path("vitrine/admin/index.html")
MARKER = "PURCHASE_XML_EDIT_NAME_V1"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def replace_after(text: str, anchor: str, old: str, new: str, label: str) -> str:
    anchor_pos = text.find(anchor)
    if anchor_pos < 0:
        raise RuntimeError(f"{label}: anchor not found")
    old_pos = text.find(old, anchor_pos)
    if old_pos < 0:
        raise RuntimeError(f"{label}: target not found after anchor")
    if old_pos - anchor_pos > 4000:
        raise RuntimeError(f"{label}: target is too far from anchor ({old_pos - anchor_pos} chars)")
    return text[:old_pos] + new + text[old_pos + len(old):]


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

payload_old = "      await purchaseApi('apply_item_update',{item_id:itemId,conversion_factor:factor,sale_price:sale,update_cost:updateCost,update_sale_price:updateSale,operator_name:operator});\n"
payload_new = "      await purchaseApi('apply_item_update',{item_id:itemId,proposed_name:proposedName,conversion_factor:factor,sale_price:sale,update_cost:updateCost,update_sale_price:updateSale,operator_name:operator});\n"
html = replace_after(
    html,
    "    const proposedName=String(card.querySelector('[data-catalog-product-name]')?.value||'').trim();\n",
    payload_old,
    payload_new,
    "send proposed product name",
)

PATH.write_text(html, encoding="utf-8")
print(f"{PATH}: editable XML product name patch applied")
