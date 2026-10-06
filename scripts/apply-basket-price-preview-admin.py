from pathlib import Path

p=Path('vitrine/admin/basket-mold-admin.js')
s=p.read_text(encoding='utf-8')

replacements=[]
replacements.append((
"""    public_composition_count:Number(e?.public_composition_count||2),\n    positions:(Array.isArray(e?.positions)?e.positions:[]).map(p=>({""",
"""    public_composition_count:Number(e?.public_composition_count||2),\n    price_preview:(Array.isArray(e?.price_preview)?e.price_preview:[]).map(r=>({composition_number:Number(r.composition_number||1),product_total:Number(r.product_total||0),hidden_adjustment:Number(r.hidden_adjustment||0),final_total:Number(r.final_total||0)})),\n    positions:(Array.isArray(e?.positions)?e.positions:[]).map(p=>({"""
))
replacements.append((
"""      options:(Array.isArray(p.options)?p.options:[]).map(o=>({product_id:o.product_id||o.id,name:o.name||'Produto',sku:o.sku||'',gtin:o.gtin||'',image_url:o.image_url||'',loose_sellable_stock:Number(o.loose_sellable_stock||0)}))""",
"""      options:(Array.isArray(p.options)?p.options:[]).map(o=>({product_id:o.product_id||o.id,name:o.name||'Produto',sku:o.sku||'',gtin:o.gtin||'',image_url:o.image_url||'',loose_sellable_stock:Number(o.loose_sellable_stock||0),effective_price:Number(o.effective_price??o.price??0)}))"""
))
replacements.append((
"""function selectedOptionHtml(o,pi,oi){\n  return'<div class=\"bm-selected\" data-mold-selected-product><img src=\"'+esc(o.image_url||'/img/sem-foto.svg')+'\" alt=\"\"><span><strong>'+esc(o.name||'Produto')+'</strong><small>'+esc([o.sku,o.gtin].filter(Boolean).join(' · '))+'</small></span><button type=\"button\" class=\"danger\" data-mold-remove-option=\"'+pi+'\" data-option-index=\"'+oi+'\">Remover</button></div>';\n}""",
"""function selectedOptionHtml(o,pi,oi){\n  return'<div class=\"bm-selected\" data-mold-selected-product><img src=\"'+esc(o.image_url||'/img/sem-foto.svg')+'\" alt=\"\"><span><strong>'+esc(o.name||'Produto')+'</strong><small>'+esc([o.sku,o.gtin].filter(Boolean).join(' · '))+'</small><small>'+money(o.effective_price||0)+' · estoque livre '+esc(qty(o.loose_sellable_stock))+'</small></span><button type=\"button\" class=\"danger\" data-mold-remove-option=\"'+pi+'\" data-option-index=\"'+oi+'\">Remover</button></div>';\n}"""
))
replacements.append((
"""function resultHtml(p,pi){\n  return'<button type=\"button\" class=\"bm-result\" data-mold-product-option=\"'+esc(p.id)+'\" data-position-index=\"'+pi+'\"><img src=\"'+esc(p.image_url||'/img/sem-foto.svg')+'\" alt=\"\"><span><strong>'+esc(p.name||'Produto')+'</strong><small>'+esc([p.sku,p.gtin,p.packaging].filter(Boolean).join(' · '))+'</small><small>Estoque livre: '+esc(qty(p.loose_sellable_stock))+'</small></span><span>Adicionar</span></button>';\n}""",
"""function resultHtml(p,pi){\n  return'<button type=\"button\" class=\"bm-result\" data-mold-product-option=\"'+esc(p.id)+'\" data-position-index=\"'+pi+'\"><img src=\"'+esc(p.image_url||'/img/sem-foto.svg')+'\" alt=\"\"><span><strong>'+esc(p.name||'Produto')+'</strong><small>'+esc([p.sku,p.gtin,p.packaging].filter(Boolean).join(' · '))+'</small><small>'+money(p.effective_price??p.price??0)+' · estoque livre '+esc(qty(p.loose_sellable_stock))+'</small></span><span>Adicionar</span></button>';\n}"""
))

for old,new in replacements:
    if old not in s:
        raise SystemExit('anchor not found; refusing admin transform: '+old[:80])
    s=s.replace(old,new,1)

anchor="""function editorHtml(){\n  const d=state.draft;if(!d)return'<div class=\"bm-empty\">Escolha uma cesta para configurar o molde.</div>';"""
insert="""function pricePreviewHtml(d){\n  const rows=Array.isArray(d?.price_preview)?d.price_preview:[];\n  if(!rows.length)return'<div class=\"bm-note\" data-mold-price-preview><strong>Produtos + Ajuste = Total</strong><br>Salve a composição para gerar a prévia de preço.</div>';\n  const adjustment=Number(d.hidden_adjustment||0);\n  return'<div class=\"bm-note\" data-mold-price-preview><strong>Produtos + Ajuste = Total</strong><div style=\"display:grid;gap:4px;margin-top:6px\">'+rows.map(r=>'<div><b>Tipo '+esc(r.composition_number)+'</b> · '+money(r.product_total)+' + '+money(adjustment)+' = <strong>'+money(Number(r.product_total||0)+adjustment)+'</strong></div>').join('')+'</div><small>O ajuste é fixo. Trocas de produto alteram somente a parcela dos produtos.</small></div>';\n}\nfunction paintPricePreview(){\n  const box=state.root?.querySelector('[data-mold-price-preview]');if(!box||!state.draft)return;\n  const input=state.root.querySelector('[data-mold-hidden-adjustment]'),adjustment=Number(input?.value||state.draft.hidden_adjustment||0);\n  const rows=Array.isArray(state.draft.price_preview)?state.draft.price_preview:[];\n  if(!rows.length)return;\n  box.innerHTML='<strong>Produtos + Ajuste = Total</strong><div style=\"display:grid;gap:4px;margin-top:6px\">'+rows.map(r=>'<div><b>Tipo '+esc(r.composition_number)+'</b> · '+money(r.product_total)+' + '+money(adjustment)+' = <strong>'+money(Number(r.product_total||0)+adjustment)+'</strong></div>').join('')+'</div><small>O ajuste é fixo. Trocas de produto alteram somente a parcela dos produtos.</small>';\n}\n\nfunction editorHtml(){\n  const d=state.draft;if(!d)return'<div class=\"bm-empty\">Escolha uma cesta para configurar o molde.</div>';"""
if anchor not in s: raise SystemExit('editor anchor not found')
s=s.replace(anchor,insert,1)

old="""<label><span>Valor oculto fixo (somado ao preço)</span><input data-mold-hidden-adjustment type=\"number\" step=\"0.01\" value=\"'+esc(Number(d.hidden_adjustment||0).toFixed(2))+'\"></label>"""
new="""<label><span>Ajuste fixo (somado aos produtos)</span><input data-mold-hidden-adjustment type=\"number\" step=\"0.01\" value=\"'+esc(Number(d.hidden_adjustment||0).toFixed(2))+'\"></label>"""
if old not in s: raise SystemExit('hidden label anchor not found')
s=s.replace(old,new,1)

old_note="""</select></label></div><div class=\"bm-note\">Cada posição representa o que precisa existir na cesta. Em cada posição, selecione todos os produtos que podem ser usados como variação. O valor oculto é fixo e permanece o mesmo entre as composições e futuras substituições do cliente.</div><div class=\"bm-head\">"""
new_note="""</select></label></div>'+pricePreviewHtml(d)+'<div class=\"bm-note\">Cada posição representa o que precisa existir na cesta. Em cada posição, selecione apenas produtos realmente equivalentes como variação. O ajuste é fixo e permanece o mesmo entre as composições e futuras substituições do cliente.</div><div class=\"bm-head\">"""
if old_note not in s: raise SystemExit('editor note anchor not found')
s=s.replace(old_note,new_note,1)

old_add="""  pos.options.push({product_id:p.id,name:p.name,sku:p.sku,gtin:p.gtin,image_url:p.image_url,loose_sellable_stock:p.loose_sellable_stock});"""
new_add="""  pos.options.push({product_id:p.id,name:p.name,sku:p.sku,gtin:p.gtin,image_url:p.image_url,loose_sellable_stock:p.loose_sellable_stock,effective_price:Number(p.effective_price??p.price??0)});"""
if old_add not in s: raise SystemExit('add option anchor not found')
s=s.replace(old_add,new_add,1)

old_render="""  bind();\n}"""
new_render="""  bind();\n  state.root.querySelector('[data-mold-hidden-adjustment]')?.addEventListener('input',paintPricePreview);\n}"""
if old_render not in s: raise SystemExit('render bind anchor not found')
s=s.replace(old_render,new_render,1)

p.write_text(s,encoding='utf-8')
print('basket mold price preview applied')
