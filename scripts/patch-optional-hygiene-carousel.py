from pathlib import Path

ADMIN=Path('vitrine/admin/index.html')
API=Path('supabase/functions/admin-products-live-v1/index.ts')
STOREFRONT=Path('supabase/functions/storefront-v2/index.ts')

def once(text,old,new,label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    return text.replace(old,new,1)

admin=ADMIN.read_text()

admin=once(
    admin,
    '.basket-lot-component-card{display:grid;grid-template-columns:48px minmax(190px,1fr) 84px 110px;gap:10px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:10px;background:#fff}',
    '.basket-lot-component-card{display:grid;grid-template-columns:48px minmax(0,1fr) 64px;gap:10px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:10px;background:#fff}',
    'lot card grid'
)
admin=once(
    admin,
    '.basket-lot-component-stock small{display:block;color:var(--muted);font-size:10px}',
    '.basket-lot-component-stock{grid-column:2/-1;display:flex;align-items:baseline;gap:8px;min-width:0}.basket-lot-component-stock small{display:block;color:var(--muted);font-size:10px}',
    'lot stock layout'
)
admin=once(admin,'style="flex:0 0 290px;width:290px"','style="flex:0 0 360px;width:360px"','lot card width')
admin=once(
    admin,
    "linked_hygiene_lot_id:source?.linked_hygiene_lot_id||d.default_hygiene_lot_id||d.hygiene_lots?.[0]?.id||null,",
    "linked_hygiene_lot_id:source?.linked_hygiene_lot_id||null,",
    'no automatic hygiene selection'
)
admin=once(
    admin,
    "(d.kit.kind==='food'&&d.kit?.basket?.uses_hygiene_kit?'<div class=\"basket-composer-summary\" style=\"margin-top:10px\"><label><span>Lote de Limpeza/Higiene</span><select id=\"kitLotHygieneLot\"><option value=\"\">Selecione o lote</option>'",
    "(d.kit.kind==='food'?'<div class=\"basket-composer-summary\" style=\"margin-top:10px\"><label><span>Lote de Limpeza/Higiene (opcional)</span><select id=\"kitLotHygieneLot\"><option value=\"\">Sem kit de Limpeza/Higiene</option>'",
    'optional hygiene selector'
)
admin=once(
    admin,
    "+'</select><small>Este lote de limpeza fica conectado a este lote de alimentos.</small></label><div class=\"basket-kpi\"><small>Vínculo físico</small><strong>Alimentos + Limpeza</strong><span class=\"sub\">a vitrine usará exatamente o lote de limpeza escolhido aqui</span></div></div>':'')+",
    "+'</select><small>Opcional. Escolha um lote somente quando esta cesta realmente tiver Limpeza/Higiene.</small></label><div class=\"basket-kpi\"><small>Vínculo físico</small><strong>Alimentos + Limpeza</strong><span class=\"sub\">se nenhum lote for escolhido, a cesta terá apenas o kit de alimentos</span></div></div>':'')+",
    'optional hygiene helper'
)
admin=once(
    admin,
    "    const requiresHygiene=state.basketKitDetail?.kit?.kind==='food'&&state.basketKitDetail?.kit?.basket?.uses_hygiene_kit===true;\n    const hygieneOk=!requiresHygiene||Boolean(draft.linked_hygiene_lot_id);\n    const valid=Number.isInteger(draft.quantity)&&draft.quantity>=1&&draft.quantity<=500&&draft.items.length>0&&draft.items.every(x=>Number.isInteger(x.quantity_per_kit)&&x.quantity_per_kit>=1&&x.quantity_per_kit<=100)&&hygieneOk;",
    "    const valid=Number.isInteger(draft.quantity)&&draft.quantity>=1&&draft.quantity<=500&&draft.items.length>0&&draft.items.every(x=>Number.isInteger(x.quantity_per_kit)&&x.quantity_per_kit>=1&&x.quantity_per_kit<=100);",
    'optional hygiene feedback validity'
)
admin=once(
    admin,
    "    warning.textContent=!hygieneOk?'Escolha qual lote de Limpeza/Higiene pertence a esta cesta.':!valid?'Informe de 1 a 500 kits e de 1 a 100 unidades por produto. A composição precisa ter pelo menos um produto.':over?'Estoque insuficiente para '+draft.quantity+' kits. Reduza a quantidade, troque os produtos ou salve como rascunho.':'';",
    "    warning.textContent=!valid?'Informe de 1 a 500 kits e de 1 a 100 unidades por produto. A composição precisa ter pelo menos um produto.':over?'Estoque insuficiente para '+draft.quantity+' kits. Reduza a quantidade, troque os produtos ou salve como rascunho.':'';",
    'remove required hygiene warning'
)
admin=once(
    admin,
    "    if(d.kit.kind==='food'&&d.kit?.basket?.uses_hygiene_kit===true&&!draft.linked_hygiene_lot_id){toast('Escolha o lote de Limpeza/Higiene desta cesta.');return}\n",
    '',
    'remove save hygiene requirement'
)
ADMIN.write_text(admin)

api=API.read_text()
api=once(
    api,
    '  if(kq.data.kind==="food"&&basket?.uses_hygiene_kit===true){',
    '  if(kq.data.kind==="food"){',
    'load hygiene lots for all food kits'
)
api=once(
    api,
    '  const missingSplit=(bq.data||[]).filter((b:any)=>{const a:any=av.get(String(b.id));return !a?.food_lot_id||(b.uses_hygiene_kit===true&&!a?.hygiene_lot_id)}).map((b:any)=>b.name);',
    '  const missingSplit=(bq.data||[]).filter((b:any)=>{const a:any=av.get(String(b.id));return !a?.food_lot_id||Number(a?.split_available||0)<=0}).map((b:any)=>b.name);',
    'split readiness per lot'
)
API.write_text(api)

store=STOREFRONT.read_text()
old='''    const foodLot=uid(payload?.food_lot_id),hygieneLot=uid(payload?.hygiene_lot_id);
    const {data:b,error:be}=await db.from("basket_templates").select("id,base_price,uses_hygiene_kit").eq("id",id).eq("is_active",true).eq("split_kits_enabled",true).maybeSingle();
    if(be)throw be;if(!b)return {error:"basket_not_found",status:404};if(!foodLot)return {error:"basket_food_lot_required",status:400};
    const {data:pricing,error:pe}=await db.from("basket_split_availability_v1").select("food_lot_id,hygiene_lot_id,food_sale_price_override").eq("basket_id",id).maybeSingle();
    if(pe)throw pe;if(!pricing||uid(pricing.food_lot_id)!==foodLot)return {error:"basket_food_lot_unavailable",status:409};
    if(b.uses_hygiene_kit&&uid(pricing.hygiene_lot_id)!==hygieneLot)return {error:"basket_hygiene_lot_unavailable",status:409};
    const food=await splitLotItems(foodLot,"food"),hygiene=b.uses_hygiene_kit?(hygieneLot?await splitLotItems(hygieneLot,"hygiene"):[]):[];
    if(b.uses_hygiene_kit&&!hygieneLot)return {error:"basket_hygiene_lot_required",status:400};
'''
new='''    const foodLot=uid(payload?.food_lot_id),hygieneLot=uid(payload?.hygiene_lot_id);
    const {data:b,error:be}=await db.from("basket_templates").select("id,base_price").eq("id",id).eq("is_active",true).eq("split_kits_enabled",true).maybeSingle();
    if(be)throw be;if(!b)return {error:"basket_not_found",status:404};if(!foodLot)return {error:"basket_food_lot_required",status:400};
    const {data:pricing,error:pe}=await db.from("basket_split_availability_v1").select("food_lot_id,hygiene_lot_id,food_sale_price_override,uses_hygiene_kit").eq("basket_id",id).maybeSingle();
    if(pe)throw pe;if(!pricing||uid(pricing.food_lot_id)!==foodLot)return {error:"basket_food_lot_unavailable",status:409};
    const usesHygiene=pricing?.uses_hygiene_kit===true,resolvedHygieneLot=usesHygiene?uid(pricing.hygiene_lot_id):"";
    if(usesHygiene&&hygieneLot&&resolvedHygieneLot!==hygieneLot)return {error:"basket_hygiene_lot_unavailable",status:409};
    const food=await splitLotItems(foodLot,"food"),hygiene=usesHygiene?(resolvedHygieneLot?await splitLotItems(resolvedHygieneLot,"hygiene"):[]):[];
'''
store=once(store,old,new,'storefront quote optional hygiene')
store=once(
    store,
    '    const foodChanged=groupChanged(selected,"food"),hygieneChanged=b.uses_hygiene_kit?groupChanged(selected,"hygiene"):false;',
    '    const foodChanged=groupChanged(selected,"food"),hygieneChanged=usesHygiene?groupChanged(selected,"hygiene"):false;',
    'storefront quote hygiene changed'
)
store=once(
    store,
    '      food_lot_id:foodLot,food_lot_code:payload?.food_lot_code||null,hygiene_lot_id:hygieneLot||null,hygiene_lot_code:payload?.hygiene_lot_code||null};',
    '      food_lot_id:foodLot,food_lot_code:payload?.food_lot_code||null,hygiene_lot_id:resolvedHygieneLot||null,hygiene_lot_code:payload?.hygiene_lot_code||null};',
    'storefront quote canonical hygiene result'
)
STOREFRONT.write_text(store)

print('optional hygiene + carousel patch applied')
