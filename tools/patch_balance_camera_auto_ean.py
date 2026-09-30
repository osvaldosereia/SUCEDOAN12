from pathlib import Path
import re

ROOT=Path('.')
EDGE=ROOT/'supabase/functions/admin-products-live-v1/index.ts'
ADMIN=ROOT/'vitrine/admin/index.html'
IMAGE=ROOT/'supabase/functions/product-image-openai-v1/index.ts'


def must_replace(text,old,new,label):
    n=text.count(old)
    if n!=1: raise RuntimeError(f'{label}: expected 1 occurrence, found {n}')
    return text.replace(old,new,1)

def must_regex(text,pattern,repl,label):
    out,n=re.subn(pattern,repl,text,count=1,flags=re.S)
    if n!=1: raise RuntimeError(f'{label}: expected 1 match, found {n}')
    return out

# ---------------- Backend canonical balance ----------------
edge=EDGE.read_text(encoding='utf-8')
edge=must_replace(edge,'"product_lifecycle_audit","ean_lookup","balance_confirm","inventory_incidents"','"product_lifecycle_audit","ean_lookup","inventory_balance_resolve_ean","inventory_balance_status","balance_confirm","inventory_balance_prepare_unknown","inventory_balance_commit","inventory_incidents"','LOCAL actions')
edge=must_replace(edge,'"product_lot_tracking_complete","balance_confirm","inventory_incident_create"','"product_lot_tracking_complete","balance_confirm","inventory_balance_prepare_unknown","inventory_balance_commit","inventory_incident_create"','WRITE actions')

backend_block=r'''
function inventoryBalanceReadiness(row:any){
  const blockers:string[]=[];
  const name=tx(row?.name,300),gtin=dg(row?.gtin),price=Number(row?.price||0);
  const cat=tx(row?.sales_category||row?.storefront_category,80);
  if(!name||/^Produto EAN\s+\d+$/i.test(name)||/^EAN\s+\d+$/i.test(name))blockers.push("nome");
  if(!gtin)blockers.push("ean");
  if(!(price>0))blockers.push("preco");
  if(!["mercearia","limpeza_lavanderia","higiene_beleza","casa_pet"].includes(cat))blockers.push("categoria");
  if(!tx(row?.image_url,1600))blockers.push("imagem");
  const exp=dt(row?.validity_date);if(exp&&days(today(),exp)<0)blockers.push("vencido");
  if(meta(row?.metadata).identity_conflict===true)blockers.push("identidade");
  return {ready:blockers.length===0,blockers};
}
async function inventoryBalanceProduct(pid:string){
  const p=await one(pid);if(!p)return null;
  return {product:await mappedProduct(p),readiness:inventoryBalanceReadiness(p),raw:p};
}
async function resolveInventoryBalanceEan(input:any,auth:any){
  const ean=dg(input?.ean);if(ean.length<4)return {error:"invalid_ean",status:400};
  const found=await db.from("products").select("*").eq("gtin",ean).limit(1).maybeSingle();
  if(found.error)throw found.error;
  if(found.data){
    const r=await inventoryBalanceProduct(found.data.id);
    return {state:"known",source:"products",photo_required:!tx(found.data.image_url,1600),...r};
  }

  const [xml,fiscal,baseline]=await Promise.all([
    db.from("purchase_xml_items").select("supplier_item_code,description,commercial_gtin,tax_gtin,ncm,cest,purchase_unit,purchase_unit_price,base_unit,base_unit_cost,bling_product_id,updated_at").or("commercial_gtin.eq."+ean+",tax_gtin.eq."+ean).order("updated_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("product_fiscal_evidence").select("gtin,ncm,cest,fiscal_description,evidence_confidence,observed_at").eq("gtin",ean).order("observed_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("ops2_catalog_baseline_items").select("product_id,bling_product_id,sku,gtin,is_active,sale_price,stock,identity_state,bling_observed_at,created_at").eq("gtin",ean).order("created_at",{ascending:false}).limit(1).maybeSingle()
  ]);
  if(xml.error)throw xml.error;if(fiscal.error)throw fiscal.error;if(baseline.error)throw baseline.error;

  if(baseline.data?.product_id){
    const linked=await db.from("products").select("*").eq("id",baseline.data.product_id).maybeSingle();
    if(linked.error)throw linked.error;
    if(linked.data){
      if(!linked.data.gtin)await db.from("products").update({gtin:ean,updated_at:new Date().toISOString()}).eq("id",linked.data.id);
      const r=await inventoryBalanceProduct(linked.data.id);
      return {state:"recovered",source:"bling_baseline",photo_required:!tx(linked.data.image_url,1600),sources:["bling_baseline"],...r};
    }
  }

  const x:any=xml.data||{},f:any=fiscal.data||{},b:any=baseline.data||{};
  const hasEvidence=Boolean(x.description||f.fiscal_description||b.bling_product_id);
  const cost=Number(x.base_unit_cost||x.purchase_unit_price||0);
  const baselinePrice=Number(b.sale_price||0);
  const price=baselinePrice>0?baselinePrice:(cost>0?Math.round(cost*1.4*100)/100:null);
  const now=new Date().toISOString();
  const payload:any={
    name:tx(x.description||f.fiscal_description,300)||("Produto EAN "+ean),gtin:ean,
    sku:tx(b.sku||x.supplier_item_code,120)||null,ncm:dg(x.ncm||f.ncm,16)||null,
    price,cost:cost>0?cost:null,stock:0,image_url:null,brand:null,category:null,subcategory:null,subsubcategory:null,
    packaging:tx(x.purchase_unit,120)||null,supplier:null,unit:tx(x.base_unit||"UN",40)||"UN",validity_date:null,gondola:null,shelf:null,
    source_system:"balance_auto_registration",sync_status:"local",bling_product_id:Number(b.bling_product_id||x.bling_product_id||0)||null,
    is_active:false,is_whatsapp_active:false,is_offer:false,desired_bling_status:"A",physically_verified:false,
    metadata:{balance_auto_registration:true,balance_registered_at:now,balance_registered_by:auth?.user_id||null,
      balance_sources:[...(x.description?["purchase_xml"]:[]),...(f.gtin?["fiscal_evidence"]:[]),...(b.gtin?["bling_baseline"]:[])],
      balance_identity_confidence:hasEvidence?"internal_evidence":"photo_required",price_origin:baselinePrice>0?"bling_baseline":(cost>0?"cost_plus_40pct":"pending")}
  };
  let inserted=await db.from("products").insert(payload).select("*").single();
  if(inserted.error){
    const raced=await db.from("products").select("*").eq("gtin",ean).limit(1).maybeSingle();
    if(raced.error||!raced.data)throw inserted.error;
    inserted={data:raced.data,error:null} as any;
  }
  const pid=inserted.data.id;
  try{await db.rpc("capture_inventory_unknown_ean_v1",{p_ean:ean,p_operator_label:tx(input?.operator,80)||"Operação",p_source:"balance_camera",p_observed_quantity:null,p_observed_gondola_number:null})}catch{}
  await db.from("inventory_unknown_eans").update({linked_product_id:pid,status:hasEvidence?"identified":"pending",research:{source:"balance_auto_registration",has_internal_evidence:hasEvidence},updated_at:now}).eq("ean",ean);
  const r=await inventoryBalanceProduct(pid);
  return {state:hasEvidence?"created":"photo_required",source:hasEvidence?"internal_evidence":"provisional",photo_required:true,sources:payload.metadata.balance_sources,...r};
}
async function prepareInventoryBalanceUnknown(input:any,auth:any){
  const r:any=await resolveInventoryBalanceEan(input,auth);if(r.error)return r;
  return {...r,prepared:true};
}
async function inventoryBalanceStatus(input:any){
  const pid=id(input?.product_id);if(!pid)return {error:"invalid_product",status:400};
  const r=await inventoryBalanceProduct(pid);if(!r)return {error:"product_not_found",status:404};
  return {state:"known",photo_required:!tx(r.raw?.image_url,1600),...r};
}
async function ensureInventoryBalanceGondola(number:number){
  let q=await db.from("vitrine_gondolas").select("*").eq("number",number).maybeSingle();if(q.error)throw q.error;
  if(!q.data){const ins=await db.from("vitrine_gondolas").insert({number,active:true}).select("*").single();if(ins.error)throw ins.error;return ins.data}
  if(q.data.active!==true){const up=await db.from("vitrine_gondolas").update({active:true,updated_at:new Date().toISOString()}).eq("id",q.data.id).select("*").single();if(up.error)throw up.error;return up.data}
  return q.data;
}
async function commitInventoryBalance(input:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const pid=id(input?.product_id),ean=dg(input?.ean),quantity=Number(input?.counted_quantity),gondola=Number(input?.gondola_number);
  const operator=tx(input?.operator,80)||"Operação",expiration=input?.expiration_date?dt(input.expiration_date):null,lotId=id(input?.lot_id)||null;
  if(!pid)return {error:"invalid_product",status:400};if(!Number.isFinite(quantity)||quantity<0)return {error:"invalid_quantity",status:400};
  if(!Number.isInteger(gondola)||gondola<1||gondola>9999)return {error:"invalid_gondola",status:400};
  if(input?.expiration_date&&!expiration)return {error:"invalid_expiration_date",status:400};
  const before=await one(pid);if(!before)return {error:"product_not_found",status:404};
  if(ean&&before.gtin&&dg(before.gtin)!==ean)return {error:"ean_product_mismatch",status:409};

  const g=await ensureInventoryBalanceGondola(gondola);
  const loc=await db.from("products").update({gondola:String(g.number),updated_at:new Date().toISOString()}).eq("id",pid);if(loc.error)throw loc.error;
  let validity:any={mode:"unchanged"};
  if(expiration){
    const lots=await db.from("product_inventory_lots").select("id,lot_code,expiration_date,quantity_on_hand,status").eq("product_id",pid).gt("quantity_on_hand",0).order("expiration_date",{ascending:true});
    if(lots.error)throw lots.error;const active=lots.data||[];
    if(lotId){const chosen=active.find((x:any)=>x.id===lotId);if(!chosen)return {error:"lot_not_found",status:404};const up=await db.from("product_inventory_lots").update({expiration_date:expiration,updated_at:new Date().toISOString()}).eq("id",lotId);if(up.error)throw up.error;validity={mode:"lot",lot_id:lotId,expiration_date:expiration}}
    else if(active.length>1)return {error:"lot_selection_required",status:409,lots:active};
    else if(active.length===1){const up=await db.from("product_inventory_lots").update({expiration_date:expiration,updated_at:new Date().toISOString()}).eq("id",active[0].id);if(up.error)throw up.error;validity={mode:"lot",lot_id:active[0].id,expiration_date:expiration}}
    else{const ex:any=await expSave({product_id:pid,expiration_date:expiration,auto_expiry_offer_enabled:meta(before.metadata).auto_expiry_offer_enabled===true});if(ex.error)return ex;validity={mode:"legacy",expiration_date:expiration}}
  }

  const counted:any=await bal({product_id:pid,quantity,operator});if(counted.error)return counted;
  const authority=await stockAuthority();let stock:any={verified:false,state:"matched"};
  if(authority==="bling"){
    const s:any=await setProductStockOfficial({product_id:pid,stock_quantity:quantity,operator},auth);
    if(s.error)return {...s,count:counted.count||null,location:{gondola_number:g.number},validity};
    const diff=Number(counted.count?.difference||0);
    stock={...s,state:diff===0?"matched":(diff!==0?"stock_synced_review_pending":"stock_synced")};
  }else stock={verified:true,state:Number(counted.count?.difference||0)===0?"matched":"stock_synced"};

  let current=await one(pid);let readiness=inventoryBalanceReadiness(current);
  if(before.is_active===false&&readiness.ready){const up=await db.from("products").update({is_active:true,is_whatsapp_active:true,desired_bling_status:"A",updated_at:new Date().toISOString()}).eq("id",pid).select("*").single();if(up.error)throw up.error;current=up.data;readiness=inventoryBalanceReadiness(current)}
  await db.from("inventory_unknown_eans").update({linked_product_id:pid,status:"registered",observed_quantity:quantity,observed_gondola_number:g.number,updated_at:new Date().toISOString()}).eq("ean",current.gtin||ean);
  return {product:await mappedProduct(current),count:counted.count||null,recount:counted.recount||null,location:{gondola_number:g.number},validity,stock,commercial_readiness:readiness};
}
'''
edge=must_replace(edge,'async function stockRecountQueue(){',backend_block+'\nasync function stockRecountQueue(){','backend insert')
edge=must_replace(edge,'if(r.method==="GET"&&a==="ean_lookup"){const x:any=await ean(u.searchParams.get("ean"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}',
'''if(r.method==="GET"&&a==="inventory_balance_resolve_ean"){const x:any=await resolveInventoryBalanceEan({ean:u.searchParams.get("ean"),operator:u.searchParams.get("operator")},auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="inventory_balance_status"){const x:any=await inventoryBalanceStatus({product_id:u.searchParams.get("product_id")});return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="ean_lookup"){const x:any=await ean(u.searchParams.get("ean"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}''','backend GET routes')
edge=must_replace(edge,'let x:any;if(a==="product_save")x=await saveProduct(p);',
'''if(r.method==="POST"&&a==="inventory_balance_prepare_unknown"){const z:any=await prepareInventoryBalanceUnknown(p,auth);return z.error?js(r,{ok:false,...z},z.status||400):js(r,{ok:true,...z})}if(r.method==="POST"&&a==="inventory_balance_commit"){const z:any=await commitInventoryBalance(p,auth);return z.error?js(r,{ok:false,...z},z.status||400):js(r,{ok:true,...z})}let x:any;if(a==="product_save")x=await saveProduct(p);''','backend POST routes')
EDGE.write_text(edge,encoding='utf-8')

# ---------------- Product image identity ----------------
image=IMAGE.read_text(encoding='utf-8')
image=must_replace(image,'select("id,name,brand,packaging,gtin,image_url,image_original_url,image_ai_url,image_ai_status,image_ai_attempts")','select("id,name,brand,packaging,gtin,price,cost,category,sales_category,storefront_category,image_url,image_original_url,image_ai_url,image_ai_status,image_ai_attempts")','image product fields')
identify_block=r'''
const identitySchema={type:"object",additionalProperties:false,properties:{
  name:{type:"string",maxLength:240},brand:{type:"string",maxLength:120},packaging:{type:"string",maxLength:120},
  sales_category:{type:"string",enum:["mercearia","limpeza_lavanderia","higiene_beleza","casa_pet"]},
  confidence:{type:"number",minimum:0,maximum:1},notes:{type:"string",maxLength:240}
},required:["name","brand","packaging","sales_category","confidence","notes"]};
async function identifyProduct(req:Request,sb:any,body:any){
  const productId=uuid(body?.product_id);if(!productId)return json(req,{ok:false,error:"product_id_required"},400);
  const product=await productRow(sb,productId);const sourceUrl=clean(product.image_original_url||product.image_url,1800);if(!sourceUrl)return json(req,{ok:false,error:"product_image_missing"},409);
  const key=await openaiKey(sb);if(!key)return json(req,{ok:false,error:"openai_key_missing"},503);
  // fiscal fields are not inferred: NCM, CEST, custo e preco nunca saem desta analise visual.
  const request={model:VALIDATOR_MODEL,store:false,max_output_tokens:420,reasoning:{effort:"low"},input:[{role:"user",content:[
    {type:"input_text",text:"Identifique somente o que e visivel nesta foto real de produto de supermercado. Retorne o nome comercial completo, marca, embalagem/conteudo visivel e classifique em exatamente uma das categorias: mercearia, limpeza_lavanderia, higiene_beleza, casa_pet. Nao invente NCM, CEST, custo, preco, peso ou variante que nao estejam visiveis. Se houver duvida, use confidence baixa e explique em notes."},
    {type:"input_image",image_url:sourceUrl,detail:"high"}
  ]}],text:{format:{type:"json_schema",name:"product_visual_identity",strict:true,schema:identitySchema}}};
  const r=await fetch(OPENAI_RESPONSES_URL,{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(request),signal:AbortSignal.timeout(60000)});
  const data=await r.json().catch(()=>({}));if(!r.ok)return json(req,{ok:false,error:"identify_http_"+r.status+"_"+clean(data?.error?.message||"error",120)},502);
  const t=finalText(data);let parsed:any;try{parsed=JSON.parse(t)}catch{return json(req,{ok:false,error:"identify_invalid_json"},502)}
  const name=clean(parsed?.name,240),brand=clean(parsed?.brand,120),packaging=clean(parsed?.packaging,120),cat=clean(parsed?.sales_category,40),confidence=score(parsed?.confidence);
  if(!name||!["mercearia","limpeza_lavanderia","higiene_beleza","casa_pet"].includes(cat))return json(req,{ok:false,error:"identify_incomplete"},409);
  const labels:any={mercearia:"Mercearia",limpeza_lavanderia:"Limpeza/Lavanderia",higiene_beleza:"Higiene/Beleza",casa_pet:"Casa/Pet"};
  const placeholder=/^(Produto EAN|EAN)\s+\d+$/i.test(clean(product.name,240));
  const patch:any={sales_category:cat,storefront_category:cat,updated_at:new Date().toISOString(),metadata:{visual_identity:{confidence,notes:clean(parsed?.notes,240),model:VALIDATOR_MODEL,identified_at:new Date().toISOString()}}};
  if(placeholder||!clean(product.name,240))patch.name=name;if(!clean(product.brand,120)&&brand)patch.brand=brand;if(!clean(product.packaging,120)&&packaging)patch.packaging=packaging;if(!clean(product.category,120))patch.category=labels[cat];
  const u=await sb.from("products").update(patch).eq("id",productId).select("id,name,brand,packaging,gtin,price,cost,category,sales_category,storefront_category,image_url,image_original_url,image_ai_status").single();
  if(u.error)return json(req,{ok:false,error:"product_update_"+clean(u.error.message,160)},500);
  return json(req,{ok:true,event:"identify",product:u.data,identity:{name,brand,packaging,sales_category:cat,confidence,notes:clean(parsed?.notes,240)},response_id:clean(data?.id,180)});
}
'''
image=must_replace(image,'\nDeno.serve(async(req:Request)=>{',identify_block+'\nDeno.serve(async(req:Request)=>{','image identify insert')
image=must_replace(image,'  if(event==="standardize"){\n    try{return await standardize(req,sb,auth,body)}catch(e){return json(req,{ok:false,error:clean(e instanceof Error?e.message:e,300)},500)}\n  }',
'''  if(event==="identify"){try{return await identifyProduct(req,sb,body)}catch(e){return json(req,{ok:false,error:clean(e instanceof Error?e.message:e,300)},500)}}
  if(event==="standardize"){
    try{return await standardize(req,sb,auth,body)}catch(e){return json(req,{ok:false,error:clean(e instanceof Error?e.message:e,300)},500)}
  }''','image identify route')
IMAGE.write_text(image,encoding='utf-8')

# ---------------- Mobile admin ----------------
admin=ADMIN.read_text(encoding='utf-8')
admin=must_replace(admin,"balanceProduct:null,balanceQty:'',balanceHistory:[],balanceMode:'count',inventorySheetScan:null", "balanceProduct:null,balanceQty:'',balanceHistory:[],balanceMode:'count',balanceSubtab:'scanner',balanceGondola:'',balanceValidity:'',balanceLotId:'',balanceNeedsPhoto:false,balanceReadiness:null,balanceCameraStream:null,balanceCameraDetector:null,balanceCameraRunning:false,balanceLastCameraEan:'',balanceLastCameraAt:0,balanceManualSearchTimer:null,inventorySheetScan:null",'state balance fields')
admin=must_replace(admin,"  function setTab(tab){\n    state.tab=tab;", "  function setTab(tab){\n    if(state.tab==='balance'&&tab!=='balance')stopBalanceCamera();\n    state.tab=tab;",'stop camera on tab')

css=r'''
    .balance-subtabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px}
    .balance-subtabs button{min-height:46px;border:1px solid var(--line);border-radius:11px;background:#fff;font-weight:900}.balance-subtabs button.active{background:var(--ink);color:#fff;border-color:var(--ink)}
    .balance-camera-shell{padding:12px;margin-bottom:12px}.balance-camera-view{position:relative;border-radius:14px;overflow:hidden;background:#111;min-height:220px;display:flex;align-items:center;justify-content:center}.balance-camera-view video{width:100%;max-height:52vh;object-fit:cover;background:#111}.balance-camera-frame{position:absolute;inset:25% 8%;border:2px solid rgba(255,255,255,.9);border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,.18);pointer-events:none}.balance-camera-status{font-size:12px;color:var(--muted);margin:8px 0}.balance-search-results{display:grid;gap:6px;margin-top:8px}.balance-search-result{display:grid;grid-template-columns:44px minmax(0,1fr);gap:8px;align-items:center;width:100%;border:1px solid var(--line);border-radius:10px;background:#fff;padding:8px;text-align:left}.balance-search-result img{width:42px;height:42px;object-fit:contain;border:1px solid var(--line);border-radius:8px}.balance-product-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.balance-photo-callout{border:1px solid #efd59b;background:#fffaf0;border-radius:12px;padding:10px;margin:10px 0}.balance-readiness{font-size:11px;color:var(--muted);margin-top:5px}.balance-readiness.ok{color:#176b43}.balance-camera-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
    @media(max-width:640px){.balance-camera-shell{padding:9px}.balance-camera-view{min-height:190px}.balance-product-fields{grid-template-columns:1fr}.balance-camera-actions{display:grid;grid-template-columns:1fr 1fr}.balance-camera-actions button{width:100%}}
'''
admin=must_replace(admin,'    /* Admin Navigation V6.1 · desktop + mobile sem overflow horizontal */',css+'\n    /* Admin Navigation V6.1 · desktop + mobile sem overflow horizontal */','camera css')

helpers=r'''
  function setBalanceSubtab(tab){
    state.balanceSubtab=tab==='a4'?'a4':'scanner';state.balanceProduct=null;state.balanceQty='';state.balanceNeedsPhoto=false;state.balanceReadiness=null;
    if(state.balanceSubtab==='a4')stopBalanceCamera();renderBalance();
  }
  function stopBalanceCamera(){
    state.balanceCameraRunning=false;
    if(state.balanceCameraStream){for(const t of state.balanceCameraStream.getTracks?.()||[])try{t.stop()}catch{}state.balanceCameraStream=null}
    state.balanceCameraDetector=null;
    const v=$('#balanceCameraVideo');if(v)try{v.srcObject=null}catch{}
  }
  async function startBalanceCamera(){
    if(state.tab!=='balance'||state.balanceMode==='incident'||state.balanceSubtab!=='scanner')return;
    const status=$('#balanceCameraStatus'),video=$('#balanceCameraVideo');if(!video)return;
    if(!navigator.mediaDevices?.getUserMedia){if(status)status.textContent='Este navegador não liberou câmera. Use a busca por nome/EAN abaixo.';return}
    stopBalanceCamera();
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
      state.balanceCameraStream=stream;video.srcObject=stream;await video.play();state.balanceCameraRunning=true;
      if('BarcodeDetector' in window){state.balanceCameraDetector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']});if(status)status.textContent='Câmera ativa · aponte o código de barras para o quadro.';balanceCameraTick()}
      else{if(status)status.textContent='Câmera ativa, mas leitura automática de código não é suportada neste navegador. Digite o EAN ou busque pelo nome.'}
    }catch(e){if(status)status.textContent='Não consegui abrir a câmera. Libere a permissão ou use a busca manual.'}
  }
  async function balanceCameraTick(){
    if(!state.balanceCameraRunning||state.tab!=='balance'||state.balanceSubtab!=='scanner')return;
    const detector=state.balanceCameraDetector,video=$('#balanceCameraVideo');
    if(detector&&video&&video.readyState>=2&&!state.balanceProduct){
      try{
        const codes=await detector.detect(video);const raw=String(codes?.[0]?.rawValue||'').replace(/\D+/g,'');
        if(raw.length>=4){const now=Date.now();if(raw!==state.balanceLastCameraEan||now-state.balanceLastCameraAt>2500){state.balanceLastCameraEan=raw;state.balanceLastCameraAt=now;if(navigator.vibrate)navigator.vibrate(45);await handleBalanceScan(raw)}}
      }catch{}
    }
    if(state.balanceCameraRunning)setTimeout(balanceCameraTick,180);
  }
  function bindBalanceManualSearch(){
    const input=$('#balanceManualSearch'),host=$('#balanceManualResults');if(!input||!host)return;
    input.oninput=()=>{clearTimeout(state.balanceManualSearchTimer);const q=String(input.value||'').trim();if(q.length<2){host.innerHTML='';return}state.balanceManualSearchTimer=setTimeout(()=>searchBalanceProducts(q),220)};
  }
  async function searchBalanceProducts(q){
    const host=$('#balanceManualResults');if(!host)return;host.innerHTML='<div class="loading">Buscando…</div>';
    try{const data=await api('products',{q,limit:10});const rows=data.products||[];host.innerHTML=rows.length?rows.map(p=>'<button class="balance-search-result" type="button" data-balance-pick="'+esc(p.id)+'"><img src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt=""><span><strong>'+esc(p.name)+'</strong><small class="sub">EAN '+esc(p.gtin||'—')+' · '+(p.is_active===false?'inativo':'ativo')+'</small></span></button>').join(''):'<div class="history-empty">Nenhum produto encontrado.</div>';host.querySelectorAll('[data-balance-pick]').forEach(b=>b.onclick=()=>{const p=rows.find(x=>x.id===b.dataset.balancePick);if(p)selectBalanceProduct(p,{photo_required:!p.image_url,readiness:null})})}catch{host.innerHTML='<div class="history-empty">Não consegui buscar agora.</div>'}
  }
  function selectBalanceProduct(p,metaInfo={}){
    state.balanceProduct=p;state.balanceQty='';state.balanceGondola=String(p.gondola_number??p.gondola??'').replace(/\D+/g,'');state.balanceValidity=p.expiration_date||p.validity_date||'';state.balanceLotId='';state.balanceNeedsPhoto=metaInfo.photo_required===true;state.balanceReadiness=metaInfo.readiness||metaInfo.commercial_readiness||null;paintBalance();
  }
  async function uploadBalanceProductPhoto(file){
    const p=state.balanceProduct;if(!p||!file)return;const status=$('#balancePhotoStatus');if(status)status.textContent='Enviando foto real…';
    try{
      await uploadProductImageSource(p.id,file);if(status)status.textContent='Foto salva · identificando produto…';
      try{await productImageApi('identify',{product_id:p.id})}catch{}
      try{const fresh=await api('inventory_balance_status',{product_id:p.id});if(fresh.product)selectBalanceProduct(fresh.product,{photo_required:false,readiness:fresh.readiness})}catch{}
      state.balanceNeedsPhoto=false;if(status)status.textContent='Foto salva. A imagem de catálogo está sendo preparada.';
      standardizeProductImage(p.id).then(()=>api('inventory_balance_status',{product_id:p.id})).then(f=>{if(f?.product&&state.balanceProduct?.id===p.id)selectBalanceProduct(f.product,{photo_required:false,readiness:f.readiness})}).catch(()=>{});
    }catch(e){if(status)status.textContent='Não consegui salvar a foto: '+errorMessage(e.message)}
  }
'''
admin=must_replace(admin,'  async function renderBalance(){',helpers+'\n  async function renderBalance(){','balance helpers')

new_render=r'''  async function renderBalance(){
    const content=$('#content'),incident=state.balanceMode==='incident',scanner=!incident&&state.balanceSubtab!=='a4';
    const photoPanel=!incident&&state.balanceSubtab==='a4'?'<section class="panel balance-photo-panel"><div class="history-title dispatch-head"><div><strong>Balanço por fotos das folhas A4</strong><span>Cada folha é identificada automaticamente pelo QR Code. A mesma folha pode ser lida novamente para corrigir uma leitura, mesmo depois de concluída.</span></div></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="primary" id="inventorySheetAnalyzeButton" type="button">Tirar foto agora</button><button class="secondary" id="inventorySheetChooseButton" type="button">Selecionar várias fotos</button><input id="inventorySheetCamera" type="file" accept="image/*" capture="environment" hidden><input id="inventorySheetFile" type="file" accept="image/*" multiple hidden></div><div class="muted" id="inventorySheetPhotoStatus" style="margin-bottom:10px">Não precisa informar lote nem página. O sistema lê o QR da própria folha, corrige a foto e processa cada imagem separadamente.</div><div id="inventorySheetUploadQueue" style="margin-bottom:10px"></div><button class="secondary" id="inventorySheetRetryErrors" type="button" hidden style="width:100%;margin-bottom:8px">Reenviar fotos com erro</button><button class="secondary" id="inventorySheetApplyReady" type="button" disabled style="width:100%;margin-bottom:10px">Nenhuma folha pronta para aplicar</button><div id="inventorySheetReview"></div><button class="secondary" id="inventorySheetCancelRead" type="button" hidden style="width:100%;margin-top:10px">Cancelar esta leitura e ler novamente</button><button class="confirm-wide" id="inventorySheetApply" type="button" disabled style="margin-top:8px">Aplicar folha aberta</button></section>':'';
    const manualPendingPanel=!incident&&state.balanceSubtab==='a4'?'<section class="panel balance-pending-panel"><div class="history-title dispatch-head"><div><strong>Pendências para contagem manual</strong><span>Se OCR e IA não conseguirem ler um produto com segurança, ele fica aqui até alguém conferir fisicamente e informar Estoque e Gôndola.</span></div><span class="pill" id="inventorySheetPendingBadge">Verificando…</span></div><div id="inventorySheetPendingManual"><div class="loading">Verificando pendências de leitura…</div></div></section>':'';
    const cameraPanel=scanner?'<section class="panel balance-camera-shell"><div class="balance-camera-view"><video id="balanceCameraVideo" playsinline muted autoplay></video><div class="balance-camera-frame"></div></div><div class="balance-camera-status" id="balanceCameraStatus">Abrindo câmera traseira…</div><div class="balance-camera-actions"><button class="secondary" id="balanceCameraStart" type="button">Ligar câmera</button><button class="secondary" id="balanceCameraStop" type="button">Desligar câmera</button></div><label style="display:block;margin-top:10px"><span>Buscar por nome ou EAN</span><input id="balanceManualSearch" type="search" autocomplete="off" placeholder="Digite nome, EAN ou código"></label><div id="balanceManualResults" class="balance-search-results"></div></section>':'';
    const work=(incident||scanner)?'<div class="tool-grid balance-tool-grid"><section class="panel tool-card">'+(incident?'<div class="form-grid" style="margin-bottom:12px"><label><span>Tipo</span><select id="inventoryIncidentType"><option value="damage">Avaria</option><option value="expired">Vencido</option><option value="loss">Perda / extravio</option><option value="return">Retorno para inspeção</option><option value="other">Outro</option></select></label><label><span>Observação opcional</span><input id="inventoryIncidentNote" maxlength="500" placeholder="Ex.: embalagem rasgada"></label></div>':'')+'<div id="balanceScanner" class="scanner-hero"><div class="scan-title"><span class="scan-dot"></span>AGUARDANDO EAN</div><div class="scan-value">Leia um produto</div><div class="scan-sub">'+(incident?'Depois informe a quantidade afetada.':'A câmera fica pronta para o próximo produto.')+'</div></div><div id="balanceProductExtras"></div><div class="qty-label">'+(incident?'Quantidade afetada':'Quantidade contada')+'</div><div class="qty-display" id="balanceQty">—</div>'+numericPadHtml('balance')+'<button class="confirm-wide" id="balanceConfirm" type="button" disabled>'+(incident?'Registrar ocorrência':'Salvar e próximo')+'</button></section><section class="panel"><div class="list-head" style="display:block">'+(incident?'Ocorrências abertas':'Contagens desta sessão')+'</div><div id="balanceHistory"></div></section></div>':'';
    content.innerHTML='<div class="page-head"><div><h1>Estoque mobile</h1><p>'+(incident?'Registre avaria, vencimento, perda ou retorno.':'Conte estoque, localização e validade usando a câmera do celular.')+'</p></div><span class="pill">'+(scanner?'Câmera':'Balanço')+'</span></div><div class="order-filters" style="margin-bottom:12px"><button class="filter-chip '+(!incident?'active':'')+'" id="balanceModeCount" type="button">Balanço</button><button class="filter-chip '+(incident?'active':'')+'" id="balanceModeIncident" type="button">Avaria / Vencido / Retorno</button></div>'+(!incident?'<div class="balance-subtabs"><button type="button" id="balanceTabScanner" class="'+(scanner?'active':'')+'">Leitor EAN</button><button type="button" id="balanceTabA4" class="'+(!scanner?'active':'')+'">Folhas A4</button></div>':'')+cameraPanel+photoPanel+manualPendingPanel+work+(!incident?'<section class="panel" style="margin-top:14px"><div class="history-title dispatch-head"><div><strong>Recontagem para Bling</strong><span>Itens que precisam de conferência física</span></div><button class="secondary" id="refreshStockRecount" type="button">Atualizar</button></div><div id="stockRecountRows"><div class="loading">Carregando recontagens…</div></div></section><section class="panel" style="margin-top:14px"><div class="history-title dispatch-head"><div><strong>Faltas dos pedidos</strong><span>Priorize o que está travando pedidos</span></div><button class="secondary" id="refreshStockShortages" type="button">Atualizar</button></div><div id="stockShortageRows"><div class="loading">Calculando faltas…</div></div></section>':'<div class="rule-notice" style="margin-top:14px"><strong>Ocorrências</strong><div>Avaria, vencido e perda seguem para reconciliação operacional/fiscal.</div></div>');
    $('#balanceModeCount').onclick=()=>setBalanceMode('count');$('#balanceModeIncident').onclick=()=>setBalanceMode('incident');
    if(!incident){$('#balanceTabScanner').onclick=()=>setBalanceSubtab('scanner');$('#balanceTabA4').onclick=()=>setBalanceSubtab('a4')}
    if(incident){$('#inventoryIncidentType').value=state.inventoryIncidentType||'damage';$('#inventoryIncidentType').onchange=e=>state.inventoryIncidentType=e.currentTarget.value;$('#inventoryIncidentNote').value=state.inventoryIncidentNote||'';$('#inventoryIncidentNote').oninput=e=>state.inventoryIncidentNote=e.currentTarget.value}
    if(incident||scanner){bindBalancePad();paintBalance()}
    if(scanner){bindBalanceManualSearch();$('#balanceCameraStart').onclick=startBalanceCamera;$('#balanceCameraStop').onclick=stopBalanceCamera;startBalanceCamera()}
    if(!incident&&!scanner){bindInventorySheetPhoto();loadInventorySheetPendingManual()}
    if(!incident){$('#refreshStockRecount').onclick=loadStockRecountQueue;$('#refreshStockShortages').onclick=loadOrderStockShortages;loadStockRecountQueue();loadOrderStockShortages()}else loadInventoryIncidents();
  }
'''
admin=must_regex(admin,r'  async function renderBalance\(\)\{.*?\n  async function loadStockRecountQueue\(\)\{',new_render+'\n  async function loadStockRecountQueue(){','renderBalance replace')

new_paint=r'''  function paintBalance(){
    if(state.tab!=='balance')return;
    const hero=$('#balanceScanner'),qty=$('#balanceQty'),confirm=$('#balanceConfirm'),history=$('#balanceHistory');if(!hero||!qty||!confirm||!history)return;
    const incident=state.balanceMode==='incident',extras=$('#balanceProductExtras');
    if(state.balanceProduct){
      const p=state.balanceProduct;hero.className='scanner-hero ready';hero.innerHTML='<div class="scan-title"><span class="scan-dot"></span>PRODUTO LIDO</div><div class="scan-value">'+esc(p.name)+'</div><div class="scan-sub">EAN '+esc(p.gtin||'—')+' · estoque atual '+esc(fmtQty(p.stock_quantity||0))+(p.is_active===false?' · INATIVO':'')+'</div>';qty.textContent=state.balanceQty||'0';confirm.disabled=state.balanceQty==='';
      if(extras&&!incident){const blockers=state.balanceReadiness?.blockers||[];extras.innerHTML='<div class="balance-product-fields"><label><span>Gôndola</span><input id="balanceGondola" type="number" min="1" max="9999" inputmode="numeric" value="'+esc(state.balanceGondola||'')+'" placeholder="Ex.: 12"></label><label><span>Validade</span><input id="balanceValidity" type="date" value="'+esc(state.balanceValidity||'')+'"></label></div>'+(state.balanceNeedsPhoto?'<div class="balance-photo-callout"><strong>Produto sem foto adequada</strong><div class="sub">Se for produto novo, tire uma foto frontal da embalagem para completar o cadastro automaticamente.</div><button class="primary" id="balanceTakeProductPhoto" type="button" style="margin-top:8px">Tirar foto do produto</button><input id="balanceProductPhotoInput" type="file" accept="image/*" capture="environment" hidden><div id="balancePhotoStatus" class="balance-readiness"></div></div>':'')+'<div class="balance-readiness '+(state.balanceReadiness?.ready?'ok':'')+'">'+(state.balanceReadiness?.ready?'Cadastro comercial completo':(blockers.length?'Cadastro operacional pronto · pendente para o site: '+blockers.join(', '):'Cadastro pronto para balanço'))+'</div>';$('#balanceGondola').oninput=e=>state.balanceGondola=String(e.currentTarget.value||'').replace(/\D+/g,'').slice(0,4);$('#balanceValidity').onchange=e=>state.balanceValidity=e.currentTarget.value||'';const photoBtn=$('#balanceTakeProductPhoto'),photoInput=$('#balanceProductPhotoInput');if(photoBtn&&photoInput){photoBtn.onclick=()=>photoInput.click();photoInput.onchange=e=>{const file=e.currentTarget.files?.[0];if(file)uploadBalanceProductPhoto(file)}}}
    }else{hero.className='scanner-hero';hero.innerHTML='<div class="scan-title"><span class="scan-dot"></span>AGUARDANDO EAN</div><div class="scan-value">Leia um produto</div><div class="scan-sub">'+(incident?'Depois informe a quantidade afetada.':'Aponte a câmera para o código de barras.')+'</div>';qty.textContent='—';confirm.disabled=true;if(extras)extras.innerHTML=''}
    if(incident){const rows=state.inventoryIncidents||[];history.innerHTML=rows.length?rows.map(x=>'<div class="simple-row"><div class="simple-main"><strong>'+esc(x.product_name)+'</strong><small>'+esc(inventoryIncidentLabel(x.incident_type))+' · '+esc(dateTime(x.created_at))+(x.note?' · '+esc(x.note):'')+'</small></div><div class="simple-number">'+esc(fmtQty(x.quantity))+'</div></div>').join(''):'<div class="history-empty">Nenhuma ocorrência aberta.</div>'}
    else history.innerHTML=state.balanceHistory.length?state.balanceHistory.map(x=>'<div class="simple-row"><div class="simple-main"><strong>'+esc(x.name)+'</strong><small>'+esc(x.gtin||'')+(x.gondola_number?' · Gôndola '+esc(x.gondola_number):'')+(x.difference!=null&&Number(x.difference)!==0?' · diferença '+esc(fmtQty(x.difference)):'')+'</small></div><div class="simple-number">'+esc(fmtQty(x.stock_quantity))+'</div></div>').join(''):'<div class="history-empty">Nenhum produto contado nesta sessão.</div>';
  }
'''
admin=must_regex(admin,r'  function paintBalance\(\)\{.*?\n  async function handleBalanceScan\(ean\)\{',new_paint+'\n  async function handleBalanceScan(ean){','paintBalance replace')
admin=must_regex(admin,r'''  async function handleBalanceScan\(ean\)\{.*?\n  \}\n  async function confirmBalance\(\)\{''',r'''  async function handleBalanceScan(ean){
    if(state.tab!=='balance')return;
    if(state.balanceProduct){toast('Salve o produto atual antes de ler o próximo.');return}
    try{const data=await api('inventory_balance_resolve_ean',{ean,operator:currentOperator()||'Operação'});if(!data.product)throw new Error('product_not_found');selectBalanceProduct(data.product,{photo_required:data.photo_required===true,readiness:data.readiness||data.commercial_readiness});const status=$('#balanceCameraStatus');if(status)status.textContent=data.state==='photo_required'?'Produto novo cadastrado · tire uma foto se possível.':'Produto encontrado · informe quantidade, gôndola e validade.'}catch(e){state.balanceProduct=null;state.balanceQty='';paintBalance();toast(errorMessage(e.message))}
  }
  async function confirmBalance(){''','handle scan replace')
admin=must_replace(admin,"        const data=await api('balance_confirm',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:state.balanceProduct.id,ean:state.balanceProduct.gtin,quantity:Number(state.balanceQty),operator})});\n        const item={...data.product,difference:data.count?.difference??0,reconciliation_state:data.count?.reconciliation_state||'matched'};",
"        if(!/^\\d{1,4}$/.test(String(state.balanceGondola||''))||Number(state.balanceGondola)<1){toast('Informe a gôndola antes de salvar');btn.disabled=false;btn.textContent='Salvar e próximo';return}\n        const data=await api('inventory_balance_commit',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:state.balanceProduct.id,ean:state.balanceProduct.gtin,counted_quantity:Number(state.balanceQty),gondola_number:Number(state.balanceGondola),expiration_date:state.balanceValidity||null,lot_id:state.balanceLotId||null,operator,source:'scanner_ean'})});\n        const item={...data.product,difference:data.count?.difference??0,reconciliation_state:data.stock?.state||data.count?.reconciliation_state||'matched'};",'confirm canonical call')
admin=must_replace(admin,"        state.balanceProduct=null;state.balanceQty='';paintBalance();loadStockRecountQueue();loadOrderStockShortages();","        state.balanceProduct=null;state.balanceQty='';state.balanceGondola='';state.balanceValidity='';state.balanceLotId='';state.balanceNeedsPhoto=false;state.balanceReadiness=null;paintBalance();loadStockRecountQueue();loadOrderStockShortages();if(state.balanceSubtab==='scanner')startBalanceCamera();",'confirm reset')
ADMIN.write_text(admin,encoding='utf-8')

print('balance camera auto-EAN patch applied')
