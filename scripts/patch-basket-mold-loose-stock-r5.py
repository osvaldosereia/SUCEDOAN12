from pathlib import Path

p=Path('supabase/functions/storefront-v2/index.ts')
s=p.read_text(encoding='utf-8')

old='''  const [sq,oq,lq]=await Promise.all([\n    db.from("ops2_sellable_stock_v1").select("product_id,effective_sellable_stock,is_active").in("product_id",ids),\n    db.from("vitrine_stock_reservations").select("product_id,quantity,status,expires_at").in("product_id",ids).in("status",["reserved","allocated"]),\n    db.from("basket_lot_component_reservations").select("product_id,quantity_reserved,status").in("product_id",ids).in("status",["reserved","active"])\n  ]);if(sq.error)throw sq.error;if(oq.error)throw oq.error;if(lq.error)throw lq.error;\n  const reservedOrders=new Map<string,number>(),reservedLots=new Map<string,number>(),now=Date.now();\n  for(const r of oq.data||[]){if(r.expires_at&&new Date(r.expires_at).getTime()<=now)continue;const id=String(r.product_id);reservedOrders.set(id,(reservedOrders.get(id)||0)+Number(r.quantity||0))}\n  for(const r of lq.data||[]){const id=String(r.product_id);reservedLots.set(id,(reservedLots.get(id)||0)+Number(r.quantity_reserved||0))}\n  for(const r of sq.data||[]){const id=String(r.product_id);out.set(id,Math.max(0,Number(r.effective_sellable_stock||0)-(reservedOrders.get(id)||0)-(reservedLots.get(id)||0)))}'''
new='''  const [sq,oq]=await Promise.all([\n    db.from("ops2_loose_sellable_stock_v1").select("product_id,loose_sellable_stock,is_active").in("product_id",ids),\n    db.from("vitrine_stock_reservations").select("product_id,quantity,status,expires_at").in("product_id",ids).in("status",["reserved","allocated"])\n  ]);if(sq.error)throw sq.error;if(oq.error)throw oq.error;\n  const reservedOrders=new Map<string,number>(),now=Date.now();\n  for(const r of oq.data||[]){if(r.expires_at&&new Date(r.expires_at).getTime()<=now)continue;const id=String(r.product_id);reservedOrders.set(id,(reservedOrders.get(id)||0)+Number(r.quantity||0))}\n  for(const r of sq.data||[]){const id=String(r.product_id);out.set(id,Math.max(0,Number(r.loose_sellable_stock||0)-(reservedOrders.get(id)||0)))}'''
if old not in s:
    if new not in s:
        raise SystemExit('anchor_missing:mold_available_stock')
else:
    s=s.replace(old,new,1)

old_errors='''["insufficient_stock","product_unavailable","basket_unavailable","basket_product_unavailable","basket_lot_unavailable","basket_lot_insufficient","basket_component_not_in_lot","basket_kit_lot_unavailable","basket_kit_lot_insufficient","basket_component_not_in_selected_kit"].includes(e)'''
new_errors='''["insufficient_stock","product_unavailable","basket_unavailable","basket_product_unavailable","basket_lot_unavailable","basket_lot_insufficient","basket_component_not_in_lot","basket_kit_lot_unavailable","basket_kit_lot_insufficient","basket_component_not_in_selected_kit","basket_mold_unavailable","basket_mold_not_configured","basket_mold_component_invalid","basket_mold_option_invalid","basket_mold_composition_invalid"].includes(e)'''
if old_errors in s:
    s=s.replace(old_errors,new_errors,1)
elif new_errors not in s:
    raise SystemExit('anchor_missing:mold_error_status')

p.write_text(s,encoding='utf-8')

for html_path in [Path('index.html'),Path('vitrine/index.html')]:
    h=html_path.read_text(encoding='utf-8')
    old_change="""Object.assign(item,{product_id:alt.product_id,name:alt.name,sku:alt.sku,gtin:alt.gtin,image_url:alt.image_url||'',packaging:alt.packaging||'',stock_quantity:stockNumber(alt.stock_quantity)});await quoteMoldBasket();paintMoldBasketSheet()}"""
    new_change="""const previous={...item};Object.assign(item,{product_id:alt.product_id,name:alt.name,sku:alt.sku,gtin:alt.gtin,image_url:alt.image_url||'',packaging:alt.packaging||'',stock_quantity:stockNumber(alt.stock_quantity)});const ok=await quoteMoldBasket();if(!ok)Object.assign(item,previous);paintMoldBasketSheet()}"""
    if old_change in h:
        h=h.replace(old_change,new_change,1)
    elif new_change not in h:
        raise SystemExit(f'anchor_missing:mold_quote_rollback:{html_path}')

    old_result="""if($('#basketActionTotal'))$('#basketActionTotal').textContent=money(d.total_cents)}catch(e){toast(e?.message==='basket_mold_option_invalid'?'Essa variação não está disponível nesta cesta.':'O estoque dessa variação mudou. Escolha outra opção.')}}"""
    new_result="""if($('#basketActionTotal'))$('#basketActionTotal').textContent=money(d.total_cents);return true}catch(e){toast(e?.message==='basket_mold_option_invalid'?'Essa variação não está disponível nesta cesta.':'O estoque dessa variação mudou. Escolha outra opção.');return false}}"""
    if old_result in h:
        h=h.replace(old_result,new_result,1)
    elif new_result not in h:
        raise SystemExit(f'anchor_missing:mold_quote_result:{html_path}')
    html_path.write_text(h,encoding='utf-8')

print('R5 mold loose-stock alignment and quote rollback applied')
