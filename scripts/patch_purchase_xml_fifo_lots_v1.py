from pathlib import Path

BACKENDS = [
    Path('supabase/functions/purchase-xml-v1/index.ts'),
    Path('supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts'),
]
ADMIN = Path('vitrine/admin/index.html')

BACKEND_MARKER = '// PURCHASE_XML_FIFO_LOTS_V1'
ADMIN_MARKER = 'PURCHASE_XML_FIFO_LOTS_V1'

backend_injection = r'''
// PURCHASE_XML_FIFO_LOTS_V1
async function purchaseLotState(body:any){
  const id=clean(body?.item_id,80);
  if(!/^[0-9a-f-]{36}$/i.test(id))return {ok:false,status:400,error:"invalid_item"};
  const q=await sb.from("purchase_xml_items")
    .select("id,document_id,item_number,description,product_id,converted_quantity,base_unit,lot_expiration_date,inventory_lot_id,processing_status")
    .eq("id",id).maybeSingle();
  if(q.error)throw q.error;
  if(!q.data)return {ok:false,status:404,error:"item_not_found"};
  let lot:any=null;
  if(q.data.inventory_lot_id){
    const l=await sb.from("product_inventory_lots")
      .select("id,product_id,expiration_date,quantity_on_hand,quantity_reserved,status,source,source_ref,received_at,created_at,updated_at")
      .eq("id",q.data.inventory_lot_id).maybeSingle();
    if(l.error)throw l.error;
    lot=l.data||null;
  }
  return {
    ok:true,
    item_id:q.data.id,
    document_id:q.data.document_id,
    product_id:q.data.product_id,
    expiration_date:q.data.lot_expiration_date||lot?.expiration_date||null,
    inventory_lot_id:q.data.inventory_lot_id||null,
    expected_quantity:Number(q.data.converted_quantity||0),
    base_unit:q.data.base_unit||"UN",
    processing_status:q.data.processing_status,
    lot,
    expiration_required:false,
    lot_number_required:false,
  };
}
async function setPurchaseLotExpiration(body:any,userId:string|null){
  const id=clean(body?.item_id,80);
  if(!/^[0-9a-f-]{36}$/i.test(id))return {ok:false,status:400,error:"invalid_item"};
  const raw=clean(body?.expiration_date,20);
  const expiration=raw?day(raw):null;
  if(raw&&!expiration)return {ok:false,status:400,error:"invalid_expiration_date"};
  const before=await purchaseLotState({item_id:id});
  if(!before.ok)return before;
  const u=await sb.from("purchase_xml_items")
    .update({lot_expiration_date:expiration,updated_at:new Date().toISOString()})
    .eq("id",id);
  if(u.error)throw u.error;
  await sb.from("bling_hub_audit_v2").insert({
    event_type:"purchase_xml_lot_expiration_updated",severity:"info",domain:"stock",
    source_system:"vitrine_admin",source_id:id,
    details:{expiration_date:expiration,previous_expiration_date:before.expiration_date||null,user_id:userId,lot_number_required:false}
  });
  return await purchaseLotState({item_id:id});
}
'''

admin_injection = r'''
<style id="purchase-xml-fifo-lots-v1-style">
.purchase-fifo-lot-v1{border:1px solid #dfe8e2;background:#fff;border-radius:12px;padding:11px;margin-top:9px}.purchase-fifo-lot-v1 h4{margin:0 0 4px;font-size:13px}.purchase-fifo-lot-v1 p{margin:0 0 9px;color:var(--muted);font-size:11px}.purchase-fifo-lot-grid{display:grid;grid-template-columns:minmax(180px,1fr) auto auto;gap:8px;align-items:end}.purchase-fifo-lot-grid label span{display:block;font-size:11px;font-weight:800;margin-bottom:4px}.purchase-fifo-lot-grid input{min-height:38px}.purchase-fifo-lot-grid button{min-height:38px}.purchase-fifo-lot-state{margin-top:8px;font-size:11px;line-height:1.45;color:#536158}.purchase-fifo-lot-state strong{color:var(--ink)}@media(max-width:680px){.purchase-fifo-lot-grid{grid-template-columns:1fr}.purchase-fifo-lot-grid button{width:100%}}
</style>
<script id="PURCHASE_XML_FIFO_LOTS_V1">
(function(){
  const lotLabel=s=>({quarantine:'Aguardando entrada no estoque',active:'Ativo',depleted:'Esgotado',expired:'Vencido',cancelled:'Cancelado'})[s]||s||'Ainda não criado';
  const n=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
  async function loadLot(card,item){
    const box=card.querySelector('[data-purchase-fifo-lot]');if(!box)return;
    const state=box.querySelector('[data-purchase-lot-state]'),input=box.querySelector('[data-purchase-lot-expiration]');
    try{
      const r=await purchaseApi('lot_state',{item_id:item.id});
      if(input)input.value=r?.expiration_date||'';
      if(!state)return;
      if(!r?.inventory_lot_id){state.innerHTML='<strong>Lote interno:</strong> será criado quando o produto estiver identificado e com quantidade convertida.';return}
      const l=r.lot||{},available=Math.max(0,Number(l.quantity_on_hand||0)-Number(l.quantity_reserved||0));
      state.innerHTML='<strong>Lote interno:</strong> '+esc(lotLabel(l.status))+' · entrada '+esc(n(l.quantity_on_hand))+' '+esc(r.base_unit||'UN')+' · reservado '+esc(n(l.quantity_reserved))+' · disponível '+esc(n(available))+'<br><span>Sem número de lote obrigatório. O estoque total continua sendo conferido pelo Bling.</span>';
    }catch(e){if(state)state.textContent=errorMessage(e.message)}
  }
  async function saveLot(card,item,clear=false){
    const box=card.querySelector('[data-purchase-fifo-lot]'),input=box?.querySelector('[data-purchase-lot-expiration]'),btn=clear?box?.querySelector('[data-purchase-lot-clear]'):box?.querySelector('[data-purchase-lot-save]');
    if(!box||!input)return;
    if(btn){btn.disabled=true;btn.textContent=clear?'Limpando…':'Salvando…'}
    try{
      const expiration=clear?null:(input.value||null);
      await purchaseApi('set_lot_expiration',{item_id:item.id,expiration_date:expiration});
      if(clear)input.value='';
      toast(clear?'Validade removida':'Validade desta entrada salva');
      await loadLot(card,item);
    }catch(e){toast(errorMessage(e.message))}
    finally{if(btn){btn.disabled=false;btn.textContent=clear?'Sem validade':'Salvar validade'}}
  }
  function enhancePurchaseFifoLots(){
    document.querySelectorAll('[data-purchase-catalog-item]').forEach(card=>{
      if(card.querySelector('[data-purchase-fifo-lot]'))return;
      let item=null;try{item=JSON.parse(card.getAttribute('data-catalog-item')||'null')}catch{}
      if(!item?.id)return;
      const identity=card.querySelector('.purchase-identity-v1')||card;
      const box=document.createElement('div');box.className='purchase-fifo-lot-v1';box.setAttribute('data-purchase-fifo-lot','1');
      box.innerHTML='<h4>Entrada de estoque desta nota</h4><p>Cada item recebido vira uma entrada interna separada. A validade é opcional; não precisa informar número de lote.</p><div class="purchase-fifo-lot-grid"><label><span>Validade desta entrada (opcional)</span><input type="date" data-purchase-lot-expiration></label><button class="secondary" type="button" data-purchase-lot-save>Salvar validade</button><button class="text" type="button" data-purchase-lot-clear>Sem validade</button></div><div class="purchase-fifo-lot-state" data-purchase-lot-state>Carregando lote interno…</div>';
      identity.appendChild(box);
      box.querySelector('[data-purchase-lot-save]')?.addEventListener('click',()=>saveLot(card,item,false));
      box.querySelector('[data-purchase-lot-clear]')?.addEventListener('click',()=>saveLot(card,item,true));
      loadLot(card,item);
    });
  }
  const previousPurchaseFifoPaint=paintPurchaseCatalogList;
  paintPurchaseCatalogList=function(){previousPurchaseFifoPaint();setTimeout(enhancePurchaseFifoLots,0)};
  setTimeout(enhancePurchaseFifoLots,350);
})();
</script>
'''

for path in BACKENDS:
    text = path.read_text(encoding='utf-8')
    if BACKEND_MARKER not in text:
        marker = 'async function catalogQueue(windowInput:any=null){'
        if marker not in text:
            raise SystemExit(f'{path}: catalogQueue marker missing')
        text = text.replace(marker, backend_injection + '\n' + marker, 1)
    route = 'if(action==="catalog_queue")return js(req,await catalogQueue(body));'
    route_patch = route + '\n    if(action==="lot_state"){const r=await purchaseLotState(body);return js(req,r,r.ok?200:Number(r.status||400))}\n    if(action==="set_lot_expiration"){if(a.internal)return js(req,{ok:false,error:"human_action_required"},403);const r=await setPurchaseLotExpiration(body,a.user_id||null);return js(req,r,r.ok?200:Number(r.status||400))}'
    if 'if(action==="lot_state")' not in text:
        if route not in text:
            raise SystemExit(f'{path}: router marker missing')
        text = text.replace(route, route_patch, 1)
    path.write_text(text, encoding='utf-8')

admin = ADMIN.read_text(encoding='utf-8')
if ADMIN_MARKER not in admin:
    if '</body>' not in admin:
        raise SystemExit('admin: closing body marker missing')
    admin = admin.replace('</body>', admin_injection + '\n</body>', 1)
    ADMIN.write_text(admin, encoding='utf-8')

print('PURCHASE_XML_FIFO_LOTS_V1 patch applied')
