from pathlib import Path

ADMIN=Path('vitrine/admin/index.html')
API=Path('supabase/functions/admin-products-live-v1/index.ts')


def once(text, old, new, label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    return text.replace(old,new,1)


def between(text,start_marker,end_marker,replacement,label):
    start=text.find(start_marker)
    if start<0: raise SystemExit(f'{label}: start marker missing')
    end=text.find(end_marker,start)
    if end<0: raise SystemExit(f'{label}: end marker missing')
    return text[:start]+replacement+text[end:]

admin=ADMIN.read_text()

lot_functions=r'''  function lotCompositionCards(items,qtyField='quantity_per_kit'){
    return '<div class="basket-lot-component-list" style="display:flex;gap:10px;min-width:max-content;padding:0 2px">'+(items||[]).map(x=>{
      const p=x.product||{},qty=Number(x?.[qtyField]??x?.quantity_per_basket??x?.quantity_per_kit??0);
      const code=[p.sku||'',p.gtin||'',p.packaging||''].filter(Boolean).join(' · ');
      const changed=x?.metadata?.is_changed===true||x?.metadata?.is_substitution===true||Boolean(x?.substitution_reason);
      const loose=Number(x?.loose_stock||0);
      return '<div class="basket-lot-component-card" style="flex:0 0 290px;width:290px">'+
        '<img loading="lazy" src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt="" onerror="this.onerror=null;this.src=\'/img/sem-foto.svg\'">'+
        '<div class="basket-lot-component-main"><strong>'+esc(p.name||'Produto')+(changed?' <span class="pill warn">alterado</span>':'')+'</strong><small>'+esc(code||'Sem código cadastrado')+'</small></div>'+
        '<div class="basket-lot-component-qty"><strong>'+esc(fmtQty(qty))+'×</strong><span>por kit</span></div>'+
        '<div class="basket-lot-component-stock '+(loose<=0?'zero':'')+'"><small>Estoque avulso</small><strong>'+esc(fmtQty(loose))+'</strong></div>'+
      '</div>';
    }).join('')+'</div>';
  }
  function kitLotRow(l){
    const code=l.short_code||l.lot_code||'—';
    const displayName=l.public_name||code;
    const isDraft=l.status==='draft';
    const canToggle=l.status==='ready'&&Number(l.quantity_available||0)>0;
    const linkedHygiene=(state.basketKitDetail?.hygiene_lots||[]).find(h=>String(h.id)===String(l.linked_hygiene_lot_id||''));
    return '<div class="basket-lot"><div class="basket-lot-head">'+
      '<div><strong style="font-size:16px">'+esc(displayName)+'</strong><small>Código físico '+esc(code)+' · '+(isDraft?'Rascunho salvo':esc(dateTime(l.built_at))+' · '+esc(l.built_by||'Operação'))+'</small>'+(linkedHygiene?'<small>Limpeza/Higiene: '+esc(linkedHygiene.public_name||linkedHygiene.short_code||linkedHygiene.lot_code||'lote')+' · '+esc(linkedHygiene.short_code||linkedHygiene.lot_code||'')+'</small>':'')+'</div>'+
      '<div><strong>'+(isDraft?esc(l.quantity_built):esc(l.quantity_available)+' / '+esc(l.quantity_built))+'</strong><small>'+(isDraft?'quantidade planejada':'disponível / montado')+'</small></div>'+
      '<div><span class="pill '+(l.status==='ready'?'':isDraft?'warn':'off')+'">'+esc(l.status==='ready'?'Disponível':l.status==='depleted'?'Esgotado':l.status==='cancelled'?'Cancelado':'Rascunho')+'</span></div>'+
      '<div><span class="pill '+(l.sale_enabled===true?'':'off')+'">'+(isDraft?'NÃO RESERVA ESTOQUE':l.sale_enabled===true?'ATIVO NO SITE':'FORA DO SITE')+'</span></div>'+
      '<div class="basket-row-actions">'+
        (isDraft?'<button class="primary" type="button" data-kit-lot-resume="'+esc(l.id)+'">Continuar editando</button><button class="text danger" type="button" data-kit-lot-draft-delete="'+esc(l.id)+'">Excluir rascunho</button>':
          (canToggle?'<button class="'+(l.sale_enabled===true?'secondary':'primary')+'" type="button" data-kit-lot-sale="'+esc(l.id)+'" data-enabled="'+(l.sale_enabled===true?'0':'1')+'">'+(l.sale_enabled===true?'Desativar no site':'Ativar no site')+'</button>':'')+
          '<button class="secondary" type="button" data-kit-lot-copy="'+esc(l.id)+'">Duplicar</button>'+
          '<button class="text danger" type="button" data-kit-lot-delete="'+esc(l.id)+'">Excluir lote</button>'
        )+
      '</div></div>'+
      '<div class="basket-lot-inline-strip" style="overflow-x:auto;overscroll-behavior-inline:contain;padding:0 12px 12px">'+
        lotCompositionCards(l.items||[],'quantity_per_kit')+
      '</div></div>';
  }
'''
admin=between(admin,"  function lotCompositionCards(items,qtyField='quantity_per_kit'){
","  function paintBasketKitAdmin(){
",lot_functions,'lot card/composition')

admin=admin.replace('    bindBasketLotImages(content);\n','',1)
admin=once(admin,
"    content.querySelectorAll('[data-kit-lot-cancel]').forEach(btn=>btn.onclick=()=>cancelBasketKitLot(btn.dataset.kitLotCancel));\n",
"    content.querySelectorAll('[data-kit-lot-delete]').forEach(btn=>btn.onclick=()=>deleteBasketKitLot(btn.dataset.kitLotDelete));\n",
'kit lot delete binding')

admin=once(admin,
"      sale_price:Number(source?.sale_price_override??d.kit?.basket?.base_price??0),\n      items\n",
"      sale_price:Number(source?.sale_price_override??d.kit?.basket?.base_price??0),\n      linked_hygiene_lot_id:source?.linked_hygiene_lot_id||d.default_hygiene_lot_id||d.hygiene_lots?.[0]?.id||null,\n      items\n",
'draft hygiene link')

commercial_anchor="""        '<div class=\"basket-kpi\"><small>Regra comercial</small><strong>Preço fixado</strong><span class=\"sub\">trocas alteram só os produtos; o ajuste oculto é preservado</span></div></div>':'')+\n      '<div id=\"kitLotWarning\" class=\"basket-warning\" hidden></div>'+\n"""
commercial_new="""        '<div class=\"basket-kpi\"><small>Regra comercial</small><strong>Preço fixado</strong><span class=\"sub\">trocas alteram só os produtos; o ajuste oculto é preservado</span></div></div>':'')+\n      (d.kit.kind==='food'&&d.kit?.basket?.uses_hygiene_kit?'<div class=\"basket-composer-summary\" style=\"margin-top:10px\"><label><span>Lote de Limpeza/Higiene</span><select id=\"kitLotHygieneLot\"><option value=\"\">Selecione o lote</option>'+(d.hygiene_lots||[]).map(h=>'<option value=\"'+esc(h.id)+'\" '+(String(h.id)===String(draft.linked_hygiene_lot_id||'')?'selected':'')+'>'+esc((h.public_name||h.short_code||h.lot_code||'Kit limpeza')+' · código '+(h.short_code||h.lot_code||'—')+' · '+fmtQty(h.quantity_available||0)+' disponível(is)')+'</option>').join('')+'</select><small>Este lote de limpeza fica conectado a este lote de alimentos.</small></label><div class=\"basket-kpi\"><small>Vínculo físico</small><strong>Alimentos + Limpeza</strong><span class=\"sub\">a vitrine usará exatamente o lote de limpeza escolhido aqui</span></div></div>':'')+\n      '<div id=\"kitLotWarning\" class=\"basket-warning\" hidden></div>'+\n"""
admin=once(admin,commercial_anchor,commercial_new,'hygiene selector')

admin=once(admin,
"    if($('#kitLotSalePrice'))$('#kitLotSalePrice').oninput=e=>draft.sale_price=Number(e.currentTarget.value);\n",
"    if($('#kitLotSalePrice'))$('#kitLotSalePrice').oninput=e=>draft.sale_price=Number(e.currentTarget.value);\n    if($('#kitLotHygieneLot'))$('#kitLotHygieneLot').onchange=e=>{draft.linked_hygiene_lot_id=e.currentTarget.value||null;updateBasketKitLotFeedback()};\n",
'hygiene selector binding')

admin=once(admin,
"    const valid=Number.isInteger(draft.quantity)&&draft.quantity>=1&&draft.quantity<=500&&draft.items.length>0&&draft.items.every(x=>Number.isInteger(x.quantity_per_kit)&&x.quantity_per_kit>=1&&x.quantity_per_kit<=100);\n",
"    const requiresHygiene=state.basketKitDetail?.kit?.kind==='food'&&state.basketKitDetail?.kit?.basket?.uses_hygiene_kit===true;\n    const hygieneOk=!requiresHygiene||Boolean(draft.linked_hygiene_lot_id);\n    const valid=Number.isInteger(draft.quantity)&&draft.quantity>=1&&draft.quantity<=500&&draft.items.length>0&&draft.items.every(x=>Number.isInteger(x.quantity_per_kit)&&x.quantity_per_kit>=1&&x.quantity_per_kit<=100)&&hygieneOk;\n",
'feedback hygiene validity')
admin=once(admin,
"    warning.textContent=!valid?'Informe de 1 a 500 kits e de 1 a 100 unidades por produto. A composição precisa ter pelo menos um produto.':over?'Estoque insuficiente para '+draft.quantity+' kits. Reduza a quantidade, troque os produtos ou salve como rascunho.':'';\n",
"    warning.textContent=!hygieneOk?'Escolha qual lote de Limpeza/Higiene pertence a esta cesta.':!valid?'Informe de 1 a 500 kits e de 1 a 100 unidades por produto. A composição precisa ter pelo menos um produto.':over?'Estoque insuficiente para '+draft.quantity+' kits. Reduza a quantidade, troque os produtos ou salve como rascunho.':'';\n",
'feedback hygiene warning')

admin=once(admin,
"    if(d.kit.kind==='food'&&(!String(draft.public_name||'').trim()||!Number.isFinite(Number(draft.sale_price))||Number(draft.sale_price)<0)){toast('Informe o nome no site e o valor da cesta.');return}\n",
"    if(d.kit.kind==='food'&&(!String(draft.public_name||'').trim()||!Number.isFinite(Number(draft.sale_price))||Number(draft.sale_price)<0)){toast('Informe o nome no site e o valor da cesta.');return}\n    if(d.kit.kind==='food'&&d.kit?.basket?.uses_hygiene_kit===true&&!draft.linked_hygiene_lot_id){toast('Escolha o lote de Limpeza/Higiene desta cesta.');return}\n",
'save hygiene validation')
admin=once(admin,
"        public_name:d.kit.kind==='food'?String(draft.public_name||'').trim():null,sale_price:d.kit.kind==='food'?Number(draft.sale_price):null,\n",
"        public_name:d.kit.kind==='food'?String(draft.public_name||'').trim():null,sale_price:d.kit.kind==='food'?Number(draft.sale_price):null,\n        linked_hygiene_lot_id:d.kit.kind==='food'?(draft.linked_hygiene_lot_id||null):null,\n",
'save hygiene payload')

insert_marker="    async function cancelBasketKitLot(lotId){\n"
delete_fn=r'''  async function deleteBasketKitLot(lotId){
    if(!confirm('Excluir este lote?\n\nSe ainda houver unidades montadas fisicamente, desmonte-as antes. Ao excluir, os produtos deixam de ficar presos neste lote e voltam ao estoque avulso. Lotes que já participaram de pedido não podem ser apagados.'))return;
    const op=requireOperator();if(!op)return;const d=state.basketKitDetail;
    try{
      await api('basket_kit_lot_delete',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lot_id:lotId,operator:op})});
      toast('Lote excluído');await openBasketKitAdmin(d.kit.id);
    }catch(e){
      const m=String(e?.message||'');
      toast(m==='lot_has_order_history'?'Este lote já participou de pedido e precisa permanecer no histórico.':m==='lot_linked_to_food_lot'?'Este lote de limpeza está conectado a uma cesta de alimentos. Troque o vínculo antes de excluir.':'Não consegui excluir o lote.');
    }
  }

'''
pos=admin.find(insert_marker)
if pos<0: raise SystemExit('delete function insert marker missing')
admin=admin[:pos]+delete_fn+admin[pos:]

sep_items=r'''  function separationItems(detail){
    const map=new Map();
    const add=(key,name,qty,image,gondola,shelf,gtin='',prefix='')=>{
      const n=Number(qty||0);if(n<=0)return;
      const k=String(key||name)+'|'+prefix;const old=map.get(k);
      if(old)old.quantity+=n;
      else map.set(k,{name:(prefix?prefix+' · ':'')+(name||'Produto'),quantity:n,image_url:image||'/img/logoantonia5.png',gondola_number:gondola??null,shelf_label:String(shelf||'').trim()||null,gtin:String(gtin||'').replace(/\D/g,'')});
    };
    for(const item of detail?.items||[]){
      if(item?.item_kind==='basket'){
        for(const c of item.components||[]){
          const m=c?.metadata||{},loose=Number(m.loose_quantity??c.quantity??0),preassembled=Number(m.preassembled_units||0);
          if(loose<=0)continue;
          add(c.product_id||c.id||c.name_snapshot,c.name_snapshot,loose,c.image_url,c.gondola_number,c.shelf_label,c.gtin,preassembled>0?'EXTRA':'MONTAR');
        }
        continue;
      }
      add(item.product_id||item.id||item.name_snapshot,item.name_snapshot,item.quantity,item.image_url,item.gondola_number,item.shelf_label,item.gtin,'');
    }
    return [...map.values()].sort((a,b)=>{
      const ga=Number.isFinite(Number(a.gondola_number))?Number(a.gondola_number):999999,gb=Number.isFinite(Number(b.gondola_number))?Number(b.gondola_number):999999;
      return ga-gb||String(a.shelf_label||'').localeCompare(String(b.shelf_label||''),'pt-BR',{numeric:true})||String(a.name||'').localeCompare(String(b.name||''),'pt-BR');
    });
  }
'''
admin=between(admin,"  function separationItems(detail){\n","  function separationKitRefs(detail){\n",sep_items,'separation items')

sep_refs=r'''  function separationKitRefs(detail){
    const out=[];
    for(const plan of detail?.checkout_separation_plan||[]){
      const qty=Number(plan?.quantity||1),food=plan?.food||{},hygiene=plan?.hygiene||{};
      if(food.mode==='lot'){
        const codes=[food.short_code,hygiene.mode==='lot'?hygiene.short_code:null].filter(Boolean).join(' + ');
        out.push({label:'CESTA ORIGINAL · permanece original',code:codes||'LOTE',quantity:qty,basket:plan.basket_name||'Cesta'});
      }
    }
    return out;
  }
'''
admin=between(admin,"  function separationKitRefs(detail){\n","  function separationTicketBody(detail){\n",sep_refs,'separation kit refs')

ADMIN.write_text(admin)

api=API.read_text()
# Return the persisted food->hygiene link with both list and detail responses.
count=api.count('hidden_adjustment_snapshot,public_name")')
if count!=2: raise SystemExit(f'lot select anchor expected 2, found {count}')
api=api.replace('hidden_adjustment_snapshot,public_name")','hidden_adjustment_snapshot,public_name,linked_hygiene_lot_id")')

start=api.find('async function basketKitAdminDetail')
end=api.find('async function basketKitLotCreate',start)
if start<0 or end<0: raise SystemExit('basketKitAdminDetail block missing')
detail=api[start:end]
detail=once(detail,
'  const nx=await db.rpc("next_basket_kit_short_code_v1",{p_kit_template_id:kid});\n',
'  let hygieneLots:any[]=[];\n  const basket:any=Array.isArray(kq.data.basket)?kq.data.basket[0]:kq.data.basket;\n  if(kq.data.kind==="food"&&basket?.uses_hygiene_kit===true){\n    const hq=await db.from("basket_stock_lots").select("id,kit_template_id,lot_kind,short_code,lot_code,status,sale_enabled,quantity_built,quantity_available,built_at,public_name").eq("lot_kind","hygiene").eq("status","ready").gt("quantity_available",0).order("built_at",{ascending:true});\n    if(hq.error)throw hq.error;hygieneLots=hq.data||[];\n  }\n  const nx=await db.rpc("next_basket_kit_short_code_v1",{p_kit_template_id:kid});\n',
'detail hygiene query')
detail=once(detail,
'  return {kit:{...kq.data,basket:Array.isArray(kq.data.basket)?kq.data.basket[0]:kq.data.basket},items,lots:lotRows,\n',
'  return {kit:{...kq.data,basket},items,lots:lotRows,hygiene_lots:hygieneLots,default_hygiene_lot_id:hygieneLots[0]?.id||null,\n',
'detail hygiene return')
api=api[:start]+detail+api[end:]

api=api.replace('db.rpc("create_basket_kit_lot_v2",{','db.rpc("create_basket_kit_lot_v3",{',1)
api=api.replace('db.rpc("save_basket_kit_lot_draft_v2",{','db.rpc("save_basket_kit_lot_draft_v3",{',1)
args='    p_public_name:tx(p?.public_name,120)||null,p_sale_price:p?.sale_price==null?null:Number(p.sale_price)\n'
if api.count(args)!=2: raise SystemExit(f'commercial rpc args expected 2, found {api.count(args)}')
api=api.replace(args,'    p_public_name:tx(p?.public_name,120)||null,p_sale_price:p?.sale_price==null?null:Number(p.sale_price),\n    p_linked_hygiene_lot_id:id(p?.linked_hygiene_lot_id)||null\n')
api=api.replace('db.rpc("activate_basket_kit_lot_draft_v1",{','db.rpc("activate_basket_kit_lot_draft_v2",{',1)

cancel_marker='async function basketKitLotCancel(p:any,auth:any){'
pos=api.find(cancel_marker)
if pos<0: raise SystemExit('basketKitLotCancel marker missing')
delete_api=r'''async function basketKitLotDelete(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const lid=id(p?.lot_id);if(!lid)return {error:"invalid_lot",status:400};
  const q=await db.rpc("basket_kit_lot_delete_v1",{p_lot_id:lid,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error){
    const m=String(q.error.message||"");
    if(m.includes("lot_has_order_history"))return {error:"lot_has_order_history",status:409};
    if(m.includes("lot_linked_to_food_lot"))return {error:"lot_linked_to_food_lot",status:409};
    if(m.includes("lot_not_found"))return {error:"lot_not_found",status:404};
    throw q.error;
  }
  return {result:q.data};
}
'''
api=api[:pos]+delete_api+api[pos:]

set_fragment='"basket_kit_lot_create","basket_kit_lot_cancel","basket_kit_lot_draft_save"'
if api.count(set_fragment)!=2: raise SystemExit(f'action set anchor expected 2, found {api.count(set_fragment)}')
api=api.replace(set_fragment,'"basket_kit_lot_create","basket_kit_lot_cancel","basket_kit_lot_delete","basket_kit_lot_draft_save"')
route='if(r.method==="POST"&&a==="basket_kit_lot_cancel"){const x:any=await basketKitLotCancel(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}'
if api.count(route)!=1: raise SystemExit(f'cancel route expected 1, found {api.count(route)}')
api=api.replace(route,route+'if(r.method==="POST"&&a==="basket_kit_lot_delete"){const x:any=await basketKitLotDelete(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}',1)

API.write_text(api)
print('basket lot ops patch applied')
