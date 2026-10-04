from pathlib import Path


def replace_exact(text: str, old: str, new: str, label: str, count: int = 1) -> str:
    found = text.count(old)
    if found != count:
        raise SystemExit(f"{label}: expected {count} anchor(s), found {found}")
    return text.replace(old, new)


# Vitrine Admin ---------------------------------------------------------------
p = Path("vitrine/admin/index.html")
s = p.read_text()

s = replace_exact(
    s,
    "      notes:resumeDraft?(source.notes||''):'',\n      items",
    "      notes:resumeDraft?(source.notes||''):'',\n"
    "      public_name:String(source?.public_name||d.kit?.basket?.name||''),\n"
    "      sale_price:Number(source?.sale_price_override??d.kit?.basket?.base_price??0),\n"
    "      items",
    "admin draft commercial defaults",
)

s = replace_exact(
    s,
    "      '<div id=\"kitLotWarning\" class=\"basket-warning\" hidden></div>'+",
    "      (d.kit.kind==='food'?'<div class=\"basket-composer-summary\" style=\"margin-top:10px\">'+\n"
    "        '<label><span>Nome no site</span><input class=\"basket-inline-input\" id=\"kitLotPublicName\" maxlength=\"120\" value=\"'+esc(draft.public_name||'')+'\" placeholder=\"Nome que o cliente verá\"><small>Este é o nome público deste lote.</small></label>'+\n"
    "        '<label><span>Valor da cesta</span><input class=\"basket-inline-input\" id=\"kitLotSalePrice\" inputmode=\"decimal\" type=\"number\" min=\"0\" max=\"9999999\" step=\"0.01\" value=\"'+esc(Number(draft.sale_price||0).toFixed(2))+'\"><small>A diferença para a soma dos produtos fica como valor oculto e permanece na personalização.</small></label>'+\n"
    "        '<div class=\"basket-kpi\"><small>Regra comercial</small><strong>Preço fixado</strong><span class=\"sub\">trocas alteram só os produtos; o ajuste oculto é preservado</span></div></div>':'')+\n"
    "      '<div id=\"kitLotWarning\" class=\"basket-warning\" hidden></div>'+",
    "admin commercial fields markup",
)

s = replace_exact(
    s,
    "    $('#kitLotNotes').oninput=e=>draft.notes=e.currentTarget.value;",
    "    $('#kitLotNotes').oninput=e=>draft.notes=e.currentTarget.value;\n"
    "    if($('#kitLotPublicName'))$('#kitLotPublicName').oninput=e=>draft.public_name=e.currentTarget.value;\n"
    "    if($('#kitLotSalePrice'))$('#kitLotSalePrice').oninput=e=>draft.sale_price=Number(e.currentTarget.value);",
    "admin commercial field handlers",
)

s = replace_exact(
    s,
    "    if(activateAfter&&draft.quantity>basketKitLotDraftCapacity()){toast('Falta estoque para confirmar a montagem.');return}\n"
    "    if(!/^[A-Z]{2}[0-9]$/.test(String(draft.short_code||''))){toast('Escolha o código do lote.');return}",
    "    if(activateAfter&&draft.quantity>basketKitLotDraftCapacity()){toast('Falta estoque para confirmar a montagem.');return}\n"
    "    if(d.kit.kind==='food'&&(!String(draft.public_name||'').trim()||!Number.isFinite(Number(draft.sale_price))||Number(draft.sale_price)<0)){toast('Informe o nome no site e o valor da cesta.');return}\n"
    "    if(!/^[A-Z]{2}[0-9]$/.test(String(draft.short_code||''))){toast('Escolha o código do lote.');return}",
    "admin commercial validation",
)

s = replace_exact(
    s,
    "        duplicated_from_lot_id:draft.source_lot_id||null,operator:op,notes:draft.notes||'',\n"
    "        items:draft.items.map",
    "        duplicated_from_lot_id:draft.source_lot_id||null,operator:op,notes:draft.notes||'',\n"
    "        public_name:d.kit.kind==='food'?String(draft.public_name||'').trim():null,sale_price:d.kit.kind==='food'?Number(draft.sale_price):null,\n"
    "        items:draft.items.map",
    "admin commercial save payload",
)

p.write_text(s)

# Admin Edge gateway ----------------------------------------------------------
p = Path("supabase/functions/admin-products-live-v1/index.ts")
s = p.read_text()
s = replace_exact(s, 'db.rpc("create_basket_kit_lot_v1",{', 'db.rpc("create_basket_kit_lot_v2",{', "create lot rpc")
s = replace_exact(s, 'db.rpc("save_basket_kit_lot_draft_v1",{', 'db.rpc("save_basket_kit_lot_draft_v2",{', "draft save rpc")
s = replace_exact(
    s,
    'p_duplicated_from_lot_id:id(p?.duplicated_from_lot_id)||null',
    'p_duplicated_from_lot_id:id(p?.duplicated_from_lot_id)||null,\n'
    '    p_public_name:tx(p?.public_name,120)||null,p_sale_price:p?.sale_price==null?null:Number(p.sale_price)',
    "edge commercial params",
    count=2,
)
p.write_text(s)

# Storefront -----------------------------------------------------------------
p = Path("supabase/functions/storefront-v2/index.ts")
s = p.read_text()
s = replace_exact(
    s,
    'id:b.id,name:b.name,display_price_cents:cents(b.base_price),image_url:images.get(a.food_lot_id+":"+(a.hygiene_lot_id||""))||b.image_url||"",',
    'id:b.id,name:a.food_public_name||b.name,display_price_cents:cents(a.food_sale_price_override??b.base_price),image_url:images.get(a.food_lot_id+":"+(a.hygiene_lot_id||""))||b.image_url||"",',
    "split home commercial fields",
)
s = replace_exact(
    s,
    'return {basket:{id:b.id,name:b.name,display_price_cents:cents(b.base_price),image_url:await basketLotImage(a.food_lot_id,a.hygiene_lot_id||null,b.image_url),',
    'return {basket:{id:b.id,name:a.food_public_name||b.name,display_price_cents:cents(a.food_sale_price_override??b.base_price),image_url:await basketLotImage(a.food_lot_id,a.hygiene_lot_id||null,b.image_url),',
    "split detail commercial fields",
)
s = replace_exact(
    s,
    '.select("basket_id,lot_id,lot_code,quantity_available,built_at,sale_price_override");',
    '.select("basket_id,lot_id,lot_code,quantity_available,built_at,sale_price_override,public_name");',
    "legacy lot commercial select",
)
s = replace_exact(
    s,
    'id:b.id,name:b.name,display_price_cents:cents(lot.sale_price_override??b.base_price),image_url:images.get(lot.lot_id+":")||b.image_url||"",',
    'id:b.id,name:lot.public_name||b.name,display_price_cents:cents(lot.sale_price_override??b.base_price),image_url:images.get(lot.lot_id+":")||b.image_url||"",',
    "legacy home public name",
)
s = replace_exact(
    s,
    'return {basket:{id:b.id,name:b.name,display_price_cents:cents(lot.sale_price_override??b.base_price),image_url:await basketLotImage(lot.lot_id,null,b.image_url),',
    'return {basket:{id:b.id,name:lot.public_name||b.name,display_price_cents:cents(lot.sale_price_override??b.base_price),image_url:await basketLotImage(lot.lot_id,null,b.image_url),',
    "legacy detail public name",
)
p.write_text(s)

print("basket lot commercial fields patch applied")
