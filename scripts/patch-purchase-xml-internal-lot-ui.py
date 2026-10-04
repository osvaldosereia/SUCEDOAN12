from pathlib import Path
import re

ADMIN=Path('vitrine/admin/index.html')
BACKENDS=[
    Path('supabase/functions/purchase-xml-v1/index.ts'),
    Path('supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts'),
]

def between(text,start,end,replacement,label):
    s=text.find(start)
    e=text.find(end,s+len(start)) if s>=0 else -1
    if s<0 or e<0:
        raise SystemExit(f'{label}: anchors not found')
    return text[:s]+replacement.rstrip()+"\n\n"+text[e:]

def once(text,old,new,label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    return text.replace(old,new,1)

admin=ADMIN.read_text()
ui_block=r'''  function purchaseInternalLotShort(item){
    const id=String(item?.entry_inventory_lot?.id||item?.inventory_lot_id||'').replace(/-/g,'');
    return id?id.slice(0,8).toUpperCase():'PENDENTE';
  }
  function purchaseInternalLotStatus(v){
    return ({quarantine:'Aguardando entrada',active:'Ativo',depleted:'Esgotado',expired:'Vencido',cancelled:'Cancelado'})[String(v||'')]||'Preparando';
  }
  function purchaseCurrentInventoryLotsHtml(item){
    const currentId=String(item?.inventory_lot_id||item?.entry_inventory_lot?.id||'');
    const lots=(item?.current_inventory_lots||[])
      .filter(x=>String(x.id||'')!==currentId&&Number(x.quantity_on_hand||0)>Number(x.quantity_reserved||0))
      .sort((a,b)=>String(a.received_at||a.created_at||'').localeCompare(String(b.received_at||b.created_at||'')));
    if(!lots.length)return '<div class="purchase-factor-hint" style="margin:6px 0 10px">Nenhum lote anterior com saldo disponível.</div>';
    return '<div style="margin:8px 0 10px"><small class="sub" style="display:block;margin-bottom:6px">Estoque anterior por lote · FIFO</small><div style="display:flex;gap:6px;flex-wrap:wrap">'+
      lots.map((x,i)=>{
        const available=Math.max(0,Number(x.quantity_on_hand||0)-Number(x.quantity_reserved||0));
        const ref=String(x.lot_code||String(x.id||'').replace(/-/g,'').slice(0,8).toUpperCase()||'INTERNO');
        const exp=x.expiration_date?'Val. '+dateOnly(String(x.expiration_date)):'Sem validade';
        return '<span class="pill '+(i===0?'warn':'')+'" title="'+esc(String(x.id||''))+'">Lote '+esc(ref)+' · '+esc(exp)+' · '+esc(fmtQty(available))+' UN'+(i===0?' · FIFO: sai primeiro':'')+'</span>';
      }).join('')+'</div><small class="sub" style="display:block;margin-top:6px">A ordem de saída considera a data de recebimento do lote, não a validade.</small></div>';
  }
  function purchaseReceiptLotsHtml(d,items,lotPlan){
    if(!Array.isArray(items)||!items.length)return '';
    const complete=lotPlan?.complete===true;
    const planItems=Array.isArray(lotPlan?.items)?lotPlan.items:[];
    return '<div class="purchase-safe '+(complete?'':'purchase-danger')+'" style="margin:14px 0 0">'+
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">'+
        '<div><strong>Lotes internos desta entrada</strong><small>Cada item desta NF-e recebe automaticamente um lote interno. Não é necessário informar número de lote real; a validade é opcional.</small></div>'+
        '<span class="pill '+(complete?'':'warn')+'">'+(complete?'Lotes gerados':'Preparando lotes')+'</span>'+
      '</div>'+
      '<div class="purchase-items" style="margin-top:10px">'+items.map((item,idx)=>{
        const planItem=planItems.find(x=>String(x.item_id)===String(item.id))||{};
        const lot=item.entry_inventory_lot||planItem.inventory_lot||null;
        const lotId=String(lot?.id||item.inventory_lot_id||planItem.inventory_lot_id||'');
        const expected=Number(item.converted_quantity||item?.pricing_preview?.proposed_base_quantity||planItem.expected_base_quantity||0);
        const expiry=String(item.lot_expiration_date||lot?.expiration_date||planItem.expiration_date||'').slice(0,10);
        const ref=purchaseInternalLotShort({...item,entry_inventory_lot:lot,inventory_lot_id:lotId});
        const status=purchaseInternalLotStatus(lot?.status);
        return '<div class="purchase-item-card" data-receipt-lot-item="'+esc(item.id)+'">'+
          '<div class="purchase-item-title"><div><strong>'+esc(item?.products?.name||item.description||('Item '+(idx+1)))+'</strong><small>Entrada: '+esc(fmtQty(expected))+' UN</small></div><span class="pill '+(lot?.status==='quarantine'?'warn':'')+'">Lote interno '+esc(ref)+'</span></div>'+
          '<div class="purchase-factor-hint" title="'+esc(lotId)+'" style="margin:6px 0 10px">Status: '+esc(status)+' · '+(expiry?'Validade '+esc(dateOnly(expiry)):'Sem validade informada')+'</div>'+
          purchaseCurrentInventoryLotsHtml(item)+
          '<div class="purchase-price-grid">'+
            '<div class="purchase-field"><label>Validade desta entrada (opcional)</label><input type="date" data-receipt-lot-exp value="'+esc(expiry)+'"><div class="purchase-factor-hint">Pode ficar em branco. Informar uma data não altera a quantidade recebida.</div></div>'+
            '<div class="purchase-price-box"><small>Lote interno</small><strong title="'+esc(lotId)+'">'+esc(ref)+'</strong></div>'+
            '<div class="purchase-price-box"><small>Quantidade da NF-e</small><strong>'+esc(fmtQty(expected))+' UN</strong></div>'+
            '<div class="purchase-price-box"><small>Ordem de saída</small><strong>FIFO</strong></div>'+
          '</div>'+
        '</div>';
      }).join('')+'</div>'+
      '<div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="primary" type="button" data-save-receipt-lots="'+esc(d.id)+'">Salvar validade</button></div>'+
      '<small class="sub" style="display:block;margin-top:8px">Deixe a validade em branco quando ela não for conhecida ou não se aplicar. O saldo físico continua sendo do Bling e o consumo interno dos lotes segue FIFO.</small>'+
    '</div>';
  }
  function bindPurchaseReceiptLots(docId){
    const host=document.querySelector('[data-purchase-detail="'+CSS.escape(docId)+'"]');if(!host)return;
    const save=host.querySelector('[data-save-receipt-lots]');if(save)save.onclick=()=>savePurchaseReceiptLots(docId);
  }
  async function savePurchaseReceiptLots(docId){
    const host=document.querySelector('[data-purchase-detail="'+CSS.escape(docId)+'"]');if(!host)return;
    const items=[...host.querySelectorAll('[data-receipt-lot-item]')].map(item=>({
      item_id:item.dataset.receiptLotItem,
      expiration_date:String(item.querySelector('[data-receipt-lot-exp]')?.value||'').trim()
    }));
    const btn=host.querySelector('[data-save-receipt-lots]');if(btn){btn.disabled=true;btn.textContent='Salvando…'}
    try{
      await purchaseApi('save_receipt_lots',{document_id:docId,items});
      toast('Validade opcional salva');
      await refreshPurchaseAfterApproval(docId);
    }catch(e){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent='Salvar validade'}}
  }'''
admin=between(admin,'  function purchaseLotRowsForItem(item){','  function purchaseStockBlockHtml(d,plan=null,lotPlan=null){',ui_block,'admin lot UI')
admin=once(admin,'Antes de preparar a entrada, salve os lotes e validades de todos os itens acima.','O lote interno de algum item ainda não foi gerado. Revise o vínculo do produto e a conversão antes de preparar a entrada.','receipt pending copy')
admin=admin.replace('Produtos e validades estão prontos.','Produtos e lotes internos estão prontos. A validade é opcional.')
ADMIN.write_text(admin)

receipt_status=r'''async function receiptLotPlanStatus(documentId:string){
  const iq=await sb.from("purchase_xml_items")
    .select("id,document_id,product_id,description,converted_quantity,conversion_factor,purchase_quantity,purchase_unit,inventory_lot_id,lot_expiration_date")
    .eq("document_id",documentId).order("item_number");
  if(iq.error)throw iq.error;
  const items=iq.data||[];
  const lotIds=[...new Set(items.map((x:any)=>x.inventory_lot_id).filter(Boolean))];
  const lq=lotIds.length
    ?await sb.from("product_inventory_lots").select("id,product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,status,source,source_ref,received_at,created_at,metadata").in("id",lotIds)
    :{data:[],error:null};
  if(lq.error)throw lq.error;
  const lotMap=new Map((lq.data||[]).map((x:any)=>[String(x.id),x]));
  const detail=items.map((it:any)=>{
    const expected=Number(it.converted_quantity||0);
    const lot=it.inventory_lot_id?lotMap.get(String(it.inventory_lot_id))||null:null;
    const valid=Boolean(it.product_id&&expected>0&&it.inventory_lot_id&&lot);
    return {
      item_id:it.id,product_id:it.product_id||null,description:it.description||"",
      expected_base_quantity:expected,planned_base_quantity:expected,
      inventory_lot_id:it.inventory_lot_id||null,
      expiration_date:day(it.lot_expiration_date||lot?.expiration_date)||null,
      expiration_optional:true,inventory_lot:lot,valid
    };
  });
  return {
    complete:detail.length>0&&detail.every((x:any)=>x.valid),
    item_count:detail.length,
    ready_count:detail.filter((x:any)=>x.valid).length,
    pending_count:detail.filter((x:any)=>!x.valid).length,
    expiration_required:false,items:detail
  };
}'''

save_plan=r'''async function saveReceiptLotPlan(body:any,userId:string|null){
  const documentId=clean(body?.document_id||body?.id,80);
  if(!/^[0-9a-f-]{36}$/i.test(documentId))return {ok:false,status:400,error:"invalid_document"};
  const requested=Array.isArray(body?.items)?body.items:[];
  const iq=await sb.from("purchase_xml_items")
    .select("id,document_id,product_id,converted_quantity,inventory_lot_id,lot_expiration_date")
    .eq("document_id",documentId).order("item_number");
  if(iq.error)throw iq.error;
  const items=iq.data||[];
  if(!items.length)return {ok:false,status:404,error:"document_without_items"};
  const byId=new Map(items.map((x:any)=>[String(x.id),x]));
  if(requested.length!==items.length)return {ok:false,status:409,error:"all_receipt_items_required"};
  for(const entry of requested){
    const item=byId.get(String(entry?.item_id||""));
    if(!item)return {ok:false,status:409,error:"invalid_receipt_item"};
    const raw=clean(entry?.expiration_date??entry?.lots?.[0]?.expiration_date??"",20);
    const exp=raw?day(raw):"";
    if(raw&&!exp)return {ok:false,status:409,error:"invalid_expiration_date",item_id:item.id};
    const up=await sb.from("purchase_xml_items")
      .update({lot_expiration_date:exp||null,updated_at:new Date().toISOString()})
      .eq("id",item.id);
    if(up.error)throw up.error;
  }
  const status=await receiptLotPlanStatus(documentId);
  await sb.from("bling_hub_audit_v2").insert({
    event_type:"purchase_receipt_lot_validity_saved",severity:"info",domain:"stock",source_system:"canonical",source_id:documentId,
    details:{item_count:status.item_count,ready_count:status.ready_count,pending_count:status.pending_count,complete:status.complete,expiration_required:false,user_id:userId||null,stock_changed:false}
  });
  return {ok:true,document_id:documentId,lot_plan:status,stock_changed:false,expiration_required:false};
}'''

materialize=r'''async function materializeReceiptLots(documentId:string,userId:string|null){
  const q=await sb.rpc("activate_purchase_xml_inventory_lots_v1",{p_document_id:documentId,p_user_id:userId});
  if(q.error)throw q.error;
  const result=q.data||{};
  await sb.from("bling_hub_audit_v2").insert({
    event_type:"purchase_receipt_internal_lots_activated",severity:"info",domain:"stock",source_system:"canonical",source_id:documentId,
    details:{active_lots:Number(result?.active_lots||0),items_touched:Number(result?.items_touched||0),user_id:userId||null,physical_stock_changed:false,local_product_stock_mutated:false}
  });
  return {
    ok:result?.ok!==false,
    materialized_lots:Number(result?.active_lots||0),
    items_touched:Number(result?.items_touched||0),
    physical_stock_changed:false,
    local_product_stock_mutated:false,
    lot_tracking_complete_changed:false
  };
}'''

for path in BACKENDS:
    src=path.read_text()
    src=between(src,'async function receiptLotPlanStatus(documentId:string){','async function saveReceiptLotPlan(body:any,userId:string|null){',receipt_status,'receiptLotPlanStatus '+str(path))
    src=between(src,'async function saveReceiptLotPlan(body:any,userId:string|null){','async function materializeReceiptLots(documentId:string,userId:string|null){',save_plan,'saveReceiptLotPlan '+str(path))
    src=between(src,'async function materializeReceiptLots(documentId:string,userId:string|null){','async function docDetail(id:string){',materialize,'materializeReceiptLots '+str(path))

    old='''  const itemIds=(it.data||[]).map((x:any)=>x.id);\n  const productIds=[...new Set((it.data||[]).map((x:any)=>x.product_id).filter(Boolean))];\n  const [lotQ,currentLotQ]=await Promise.all([\n    itemIds.length?sb.from("purchase_xml_item_lot_evidence").select("*").in("purchase_item_id",itemIds).order("purchase_item_id").order("trace_index"):Promise.resolve({data:[],error:null}),\n    productIds.length?sb.from("product_inventory_lots").select("id,product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,status,source,source_ref,received_at,metadata").in("product_id",productIds).in("status",["active","expired"]).order("expiration_date",{ascending:true}):Promise.resolve({data:[],error:null})\n  ]);\n  if(lotQ.error)throw lotQ.error;if(currentLotQ.error)throw currentLotQ.error;\n  const lotMap=new Map<string,any[]>(),currentLotMap=new Map<string,any[]>();\n  for(const lot of lotQ.data||[]){const k=String(lot.purchase_item_id);if(!lotMap.has(k))lotMap.set(k,[]);lotMap.get(k)!.push(lot)}\n  for(const lot of currentLotQ.data||[]){const k=String(lot.product_id);if(!currentLotMap.has(k))currentLotMap.set(k,[]);currentLotMap.get(k)!.push(lot)}'''
    new='''  const itemIds=(it.data||[]).map((x:any)=>x.id);\n  const productIds=[...new Set((it.data||[]).map((x:any)=>x.product_id).filter(Boolean))];\n  const entryLotIds=[...new Set((it.data||[]).map((x:any)=>x.inventory_lot_id).filter(Boolean))];\n  const [lotQ,currentLotQ,entryLotQ]=await Promise.all([\n    itemIds.length?sb.from("purchase_xml_item_lot_evidence").select("*").in("purchase_item_id",itemIds).order("purchase_item_id").order("trace_index"):Promise.resolve({data:[],error:null}),\n    productIds.length?sb.from("product_inventory_lots").select("id,product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,status,source,source_ref,received_at,created_at,metadata").in("product_id",productIds).in("status",["active","expired","depleted"]):Promise.resolve({data:[],error:null}),\n    entryLotIds.length?sb.from("product_inventory_lots").select("id,product_id,lot_code,expiration_date,quantity_on_hand,quantity_reserved,status,source,source_ref,received_at,created_at,metadata").in("id",entryLotIds):Promise.resolve({data:[],error:null})\n  ]);\n  if(lotQ.error)throw lotQ.error;if(currentLotQ.error)throw currentLotQ.error;if(entryLotQ.error)throw entryLotQ.error;\n  const lotMap=new Map<string,any[]>(),currentLotMap=new Map<string,any[]>(),entryLotMap=new Map<string,any>();\n  for(const lot of lotQ.data||[]){const k=String(lot.purchase_item_id);if(!lotMap.has(k))lotMap.set(k,[]);lotMap.get(k)!.push(lot)}\n  for(const lot of currentLotQ.data||[]){const k=String(lot.product_id);if(!currentLotMap.has(k))currentLotMap.set(k,[]);currentLotMap.get(k)!.push(lot)}\n  for(const lot of entryLotQ.data||[])entryLotMap.set(String(lot.id),lot)'''
    src=once(src,old,new,'docDetail lot queries '+str(path))
    src=once(src,
      'return {...x,products:prod||null,lot_evidence:lotMap.get(String(x.id))||[],current_inventory_lots:currentLotMap.get(String(x.product_id))||[],pricing_preview:{',
      'return {...x,products:prod||null,lot_evidence:lotMap.get(String(x.id))||[],entry_inventory_lot:entryLotMap.get(String(x.inventory_lot_id))||null,current_inventory_lots:currentLotMap.get(String(x.product_id))||[],pricing_preview:{',
      'docDetail item lot '+str(path))
    src=once(src,
      'receipt_requires_bling_verification:true,receipt_lots_required:true',
      'receipt_requires_bling_verification:true,receipt_internal_lot_required:true,receipt_expiration_optional:true,lot_number_required:false,lot_allocation_policy:"fifo"',
      'pricing policy '+str(path))
    path.write_text(src)

if BACKENDS[0].read_text()!=BACKENDS[1].read_text():
    raise SystemExit('backend modules diverged after patch')

print('purchase XML internal lot + optional expiry patch applied')
