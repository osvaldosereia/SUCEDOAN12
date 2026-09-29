import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
async function stockAuthority(){const r=await db.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle();if(r.error)throw r.error;return String((r.data?.metadata||{}).ops2_stock_authority||"legacy_shadow")}
async function effectiveStockMap(ids:string[]){
  const out=new Map<string,number>();const cleanIds=[...new Set((ids||[]).filter(Boolean))];if(!cleanIds.length)return out;
  const r=await db.from("ops2_sellable_stock_v1").select("product_id,effective_sellable_stock").in("product_id",cleanIds);
  if(r.error)throw r.error;for(const x of r.data||[])out.set(String(x.product_id),Math.max(0,Number(x.effective_sellable_stock||0)));return out;
}
async function mappedProduct(p:any){
  if(!p?.id)return mp(p);const m=await effectiveStockMap([p.id]);return mp({...p,stock:m.has(String(p.id))?m.get(String(p.id)):0});
}
const O=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const OP_SOURCES=["vitrine","manual_whatsapp","papoai","reorder"];
const LOCAL=new Set(["health","products","product_facets","product_save","offer_save","expirations","expiration_save","expiry_alerts","product_lots","product_fefo_preview","product_lifecycle_audit","ean_lookup","balance_confirm","inventory_incidents","inventory_incident_create","stock_recount_queue","stock_reconciliation_classify","stock_cutover_preflight","order_check","gondolas","gondola","gondola_create","gondola_assign","gondola_shelf_update","gondola_remove","gondola_clear","gondola_assign_count","orders","order","closure_orders","order_stock_shortages","order_update","order_payment_capture","delivery_fail_register","delivery_return_confirm","delivery_return_resolve","order_consume_stock","bling_status","bling_status_catalog_probe","bling_oauth_begin","bling_probe_readonly","bling_reconcile_catalog_readonly","bling_reconcile_customers_readonly","bling_preview_order_sync","bling_reconcile_order_dependencies_readonly","bling_create_order_customer","bling_create_order_products","order_fiscal_status","order_fiscal_dispatch_canary_execute","order_fiscal_document_pdf","order_fiscal_confirm_payment","bling_finance_overview","bling_finance_action","history_sync_retry","order_component_replace","ops_summary","ops_attention","ops_shadow_readiness","ops_print_queue","ops_print_presented","manual_order_create","ops_papoai_capture_status","papoai_issue_catalog_link","ops_timeline","ops_delivery_runs","ops_delivery_plan","ops2_recover_ean_verified","inventory_sheet_create","inventory_sheet_preview","inventory_sheet_options","inventory_sheet_batches","inventory_sheet_manifest","inventory_sheet_pending_manual","inventory_sheet_cancel_scan","inventory_sheet_analyze","inventory_sheet_apply","baskets_admin","basket_admin","basket_save","basket_item_save","basket_item_delete","basket_alternative_save","basket_alternative_delete","basket_lot_create","basket_lot_cancel"]);
const WRITE_ACTIONS=new Set(["product_save","offer_save","expiration_save","product_lot_save","product_lot_tracking_complete","balance_confirm","inventory_incident_create","stock_reconciliation_classify","order_check_start","order_check_scan","order_check_finish","gondola_create","gondola_assign","gondola_shelf_update","gondola_remove","gondola_clear","gondola_assign_count","ops_print_presented","ops_delivery_plan","manual_order_create","papoai_issue_catalog_link","order_payment_capture","delivery_fail_register","delivery_return_confirm","delivery_return_resolve","order_update","order_consume_stock","bling_create_order_customer","bling_create_order_products","order_fiscal_dispatch_canary_execute","order_fiscal_confirm_payment","bling_finance_action","inventory_sheet_create","inventory_sheet_cancel_scan","inventory_sheet_analyze","inventory_sheet_apply","basket_save","basket_item_save","basket_item_delete","basket_alternative_save","basket_alternative_delete","basket_lot_create","basket_lot_cancel"]);
const cors=(r:Request)=>{const o=r.headers.get("origin")||"";return {"Access-Control-Allow-Origin":O.has(o)?o:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}};
const js=(r:Request,b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(r),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const tx=(v:any,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const dg=(v:any,n=30)=>String(v??"").replace(/\D+/g,"").slice(0,n);
const id=(v:any)=>{const s=tx(v,64);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const nm=(v:any,a=0,b=999999999)=>{const n=Number(v);return Number.isFinite(n)?Math.max(a,Math.min(b,n)):a};
const dt=(v:any)=>/^\d{4}-\d{2}-\d{2}$/.test(tx(v,10))?tx(v,10):null;
const meta=(v:any)=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Cuiaba",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function add(d:string,n:number){const x=new Date(d+"T12:00:00Z");x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)}
function days(a:string,b:string){return Math.round((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/86400000)}
function offer(p:any){if(!p.is_offer||p.offer_price==null)return null;const m=meta(p.metadata);return {id:p.id,product_id:p.id,title:p.name,sale_price_cents:Math.round(Number(p.offer_price||0)*100),starts_at:m.offer_starts_at||null,ends_at:m.offer_ends_at||null,active:true,metadata:{source:m.offer_source||"manual",discount_percent:m.offer_discount_percent??null,duration_mode:m.offer_duration_mode||"stock_zero"}}}
function mp(p:any){const m=meta(p.metadata);return {id:p.id,sku:p.sku||null,gtin:p.gtin||null,name:p.name||"",description:p.description_short||p.description_long||"",active:p.is_active!==false,sale_price_cents:Math.round(Number(p.price||0)*100),stock_quantity:Number(p.stock||0),image_url:p.image_url||"",expiration_date:p.validity_date||null,auto_expiry_offer_enabled:m.auto_expiry_offer_enabled===true,deactivation_reason:m.deactivation_reason||null,deactivated_at:m.deactivated_at||null,updated_at:p.updated_at,packaging:p.packaging||"",subcategory:p.subcategory||"",detailed_subcategory:p.subsubcategory||"",category:p.sales_category||p.storefront_category||p.category||"",gondola_number:p.gondola&&/^\d+$/.test(String(p.gondola))?Number(p.gondola):null,shelf_label:p.shelf||null,offer:offer(p)}}
async function one(pid:string){const r=await db.from("products").select("*").eq("id",pid).maybeSingle();if(r.error)throw r.error;return r.data}
async function aud(b:any,a:any,p:any,src:string){if(!b||!a)return;const ba=b.is_active!==false,aa=a.is_active!==false,bd=b.validity_date||null,ad=a.validity_date||null;if(ba===aa&&bd===ad)return;let ev="expiration_changed",at="operator",al=tx(p?.operator,80)||"Operador não identificado";if(ba!==aa&&aa)ev="reactivated";else if(ba!==aa&&!aa){if(meta(a.metadata).deactivation_reason==="expired"){ev="auto_expired_deactivation";at="system";al="Sistema · regra de validade"}else ev="manual_deactivated"}await db.from("product_lifecycle_audit").insert({product_id:a.id,event:ev,actor_type:at,actor_label:al,previous_active:ba,new_active:aa,previous_expiration_date:bd,new_expiration_date:ad,details:{source:src}})}
async function rec(){
  const authority=await stockAuthority(),t=today();
  const lotReconcile=await db.rpc("ops2_reconcile_lot_expiry_status_v1");if(lotReconcile.error)throw lotReconcile.error;
  const [q,sq]=await Promise.all([
    db.from("products").select("id,name,price,stock,is_active,is_offer,offer_price,validity_date,metadata").limit(5000),
    db.from("ops2_expiry_offer_policy_v1").select("product_id,lot_tracking_complete,effective_expiration_date,has_sellable_validity,expiry_deactivation_candidate,days_to_expiry,recommended_discount_percent,lot_count,sellable_lot_qty,expired_lot_qty").limit(5000)
  ]);
  if(q.error)throw q.error;if(sq.error)throw sq.error;
  const sm=new Map((sq.data||[]).map((x:any)=>[String(x.product_id),x]));
  for(const p of q.data||[]){
    const m=meta(p.metadata),s:any=sm.get(String(p.id))||{},complete=s?.lot_tracking_complete===true;
    const effective=complete?(s?.effective_expiration_date||null):(p.validity_date||null);
    const d=effective?days(t,String(effective)):null;
    const expiredCandidate=complete?s?.expiry_deactivation_candidate===true:(effective?Number(d)<0:false);
    const hasSellable=complete?s?.has_sellable_validity===true:(effective?Number(d)>=0:true);

    if(complete&&effective&&String(p.validity_date||"")!==String(effective)){
      const vr=await db.from("products").update({validity_date:effective,updated_at:new Date().toISOString()}).eq("id",p.id);
      if(vr.error)throw vr.error;
      p.validity_date=effective;
    }

    if(expiredCandidate&&p.is_active!==false){
      const r=await db.from("products").update({
        is_active:false,...(authority==="bling"?{}:{stock:0}),is_offer:false,offer_price:null,
        metadata:{...m,deactivation_reason:"expired",deactivated_at:new Date().toISOString(),offer_source:null,offer_discount_percent:null,
          expiry_basis:complete?"lot_fefo":"legacy_product_validity"},
        updated_at:new Date().toISOString()
      }).eq("id",p.id).select("*").single();
      if(!r.error)await aud(p,r.data,{operator:"Sistema"},"expiry_reconcile");
      continue;
    }

    if(hasSellable&&p.is_active===false&&m.deactivation_reason==="expired"){
      const r=await db.from("products").update({
        is_active:true,
        metadata:{...m,deactivation_reason:null,deactivated_at:null,expiry_basis:complete?"lot_fefo":"legacy_product_validity"},
        updated_at:new Date().toISOString()
      }).eq("id",p.id).select("*").single();
      if(!r.error){await aud(p,r.data,{operator:"Sistema"},"expiry_reactivate");p.is_active=true}
    }

    if(p.is_active===false)continue;
    const auto=m.auto_expiry_offer_enabled===true;
    const pc=effective&&d!==null&&d>=0&&d<=90?(d<30?40:d<60?20:10):null;
    if(auto&&pc){
      const op=Math.round(Number(p.price||0)*(100-pc))/100;
      if(p.is_offer!==true||Number(p.offer_price)!==op||m.offer_source!=="expiry_auto"||Number(m.offer_discount_percent)!==pc){
        const ur=await db.from("products").update({
          is_offer:true,offer_price:op,
          metadata:{...m,offer_source:"expiry_auto",offer_discount_percent:pc,offer_duration_mode:"validity",
            offer_expiration_basis:complete?"lot_fefo":"legacy_product_validity",offer_effective_expiration:effective},
          updated_at:new Date().toISOString()
        }).eq("id",p.id);
        if(ur.error)throw ur.error;
      }
    }else if(m.offer_source==="expiry_auto"&&(p.is_offer||p.offer_price!=null)){
      const ur=await db.from("products").update({
        is_offer:false,offer_price:null,
        metadata:{...m,offer_source:null,offer_discount_percent:null,offer_effective_expiration:null},
        updated_at:new Date().toISOString()
      }).eq("id",p.id);
      if(ur.error)throw ur.error;
    }
  }
}
async function products(u:URL){
  const off=Math.floor(nm(u.searchParams.get("offset"),0,100000)),lim=Math.floor(nm(u.searchParams.get("limit")||60,1,100));
  const qv=tx(u.searchParams.get("q"),100).replace(/[,%()]/g," "),cat=tx(u.searchParams.get("category"),120),sub=tx(u.searchParams.get("subcategory"),120),act=tx(u.searchParams.get("active"),12);
  let rows:any[]=[];
  if(cat){
    const all:any[]=[];
    for(let pos=0;pos<10000;pos+=1000){
      let q=db.from("products").select("*").order("id").range(pos,pos+999);
      if(sub)q=q.eq("subcategory",sub);
      if(act==="true")q=q.eq("is_active",true);
      if(act==="false")q=q.eq("is_active",false);
      if(qv)q=q.or("name.ilike.%"+qv+"%,gtin.ilike.%"+qv+"%,sku.ilike.%"+qv+"%");
      const r=await q;if(r.error)throw r.error;
      all.push(...(r.data||[]));
      if((r.data||[]).length<1000)break;
    }
    const wanted=inventorySheetCanonicalCategory(cat);
    const filtered=all.filter((x:any)=>inventorySheetCanonicalCategory(x.sales_category||x.storefront_category||x.category)===wanted)
      .sort((a:any,b:any)=>String(a.name||"").localeCompare(String(b.name||""),"pt-BR"));
    rows=filtered.slice(off,off+lim);
    const sm=await effectiveStockMap(rows.map((x:any)=>x.id));
    return {products:rows.map((x:any)=>mp({...x,stock:sm.has(String(x.id))?sm.get(String(x.id)):0})),next_offset:off+lim<filtered.length?off+lim:null,total:filtered.length};
  }
  let q=db.from("products").select("*").order("name").range(off,off+lim-1);
  if(sub)q=q.eq("subcategory",sub);
  if(act==="true")q=q.eq("is_active",true);
  if(act==="false")q=q.eq("is_active",false);
  if(qv)q=q.or("name.ilike.%"+qv+"%,gtin.ilike.%"+qv+"%,sku.ilike.%"+qv+"%");
  const r=await q;if(r.error)throw r.error;
  rows=r.data||[];
  const sm=await effectiveStockMap(rows.map((x:any)=>x.id));
  return {products:rows.map((x:any)=>mp({...x,stock:sm.has(String(x.id))?sm.get(String(x.id)):0})),next_offset:rows.length===lim?off+lim:null};
}
async function facets(c:string,act=""){
  const all:any[]=[];
  for(let pos=0;pos<10000;pos+=1000){
    let q=db.from("products").select("id,sales_category,storefront_category,category,subcategory,is_active").order("id").range(pos,pos+999);
    if(act==="true")q=q.eq("is_active",true);
    if(act==="false")q=q.eq("is_active",false);
    const r=await q;if(r.error)throw r.error;
    all.push(...(r.data||[]));
    if((r.data||[]).length<1000)break;
  }
  const cm=new Map(),sm=new Map(),wanted=c?inventorySheetCanonicalCategory(c):"";
  for(const p of all){
    const x=inventorySheetCanonicalCategory(p.sales_category||p.storefront_category||p.category),s=tx(p.subcategory,120);
    if(x)cm.set(x,(cm.get(x)||0)+1);
    if(s&&(!wanted||x===wanted))sm.set(s,(sm.get(s)||0)+1);
  }
  return {
    categories:[...cm].map(([value,count])=>({value,label:value,count})).sort((a,b)=>String(a.label).localeCompare(String(b.label),"pt-BR")),
    subcategories:[...sm].map(([value,count])=>({value,label:value,count})).sort((a,b)=>String(a.label).localeCompare(String(b.label),"pt-BR"))
  };
}
async function saveProduct(p:any){const authority=await stockAuthority(),pid=id(p?.id),name=tx(p?.name,300);if(!name)return {error:"name_required",status:400};const b=pid?await one(pid):null,m=meta(b?.metadata),exp=Object.prototype.hasOwnProperty.call(p||{},"expiration_date")?dt(p.expiration_date):b?.validity_date||null;if(p?.expiration_date&&!exp)return {error:"invalid_expiration_date",status:400};let active=Object.prototype.hasOwnProperty.call(p||{},"active")?p.active!==false:(b?.is_active!==false),stock=Number(p?.stock_quantity??b?.stock??0),io=b?.is_offer===true,op=b?.offer_price??null,nmeta={...m,auto_expiry_offer_enabled:p?.auto_expiry_offer_enabled===true};if(exp&&days(today(),exp)<0){active=false;stock=0;io=false;op=null;nmeta={...nmeta,deactivation_reason:"expired",deactivated_at:new Date().toISOString(),offer_source:null}}else if(active&&m.deactivation_reason==="expired")nmeta={...nmeta,deactivation_reason:null,deactivated_at:null};const patch:any={name,sku:tx(p?.sku,120)||null,gtin:dg(p?.gtin)||null,price:Number(p?.sale_price_cents||0)/100,...(authority==="bling"&&pid?{}:{stock}),is_active:active,validity_date:exp,sales_category:tx(p?.category,120)||null,storefront_category:tx(p?.category,120)||null,category:tx(p?.category,120)||null,subcategory:tx(p?.subcategory,120)||null,packaging:tx(p?.packaging,120)||null,image_url:tx(p?.image_url,1200)||null,description_short:tx(p?.description,1000)||null,is_offer:io,offer_price:op,metadata:nmeta,updated_at:new Date().toISOString()};let r:any;if(pid)r=await db.from("products").update(patch).eq("id",pid).select("*").single();else r=await db.from("products").insert({...patch,source_system:"admin_registration",sync_status:"local"}).select("*").single();if(r.error)throw r.error;if(b)await aud(b,r.data,p,"product_save");await rec();const fr=await one(r.data.id);return {product_id:r.data.id,product:await mappedProduct(fr)}}
async function saveOffer(p:any){const pid=id(p?.product_id);if(!pid)return {error:"invalid_product",status:400};const x=await one(pid);if(!x)return {error:"product_not_found",status:404};const m=meta(x.metadata),active=p?.active===true,price=Number(x.price||0),sale=Number(p?.sale_price_cents||0)/100,disc=Number(p?.discount_percent||0),dur=tx(p?.duration,20)||"stock_zero";let end:any=null;if(["5","10","15"].includes(dur))end=new Date(Date.now()+Number(dur)*86400000).toISOString();const op=sale>0?sale:(disc>0&&disc<100?Math.round(price*(100-disc))/100:null),nmeta={...m,auto_expiry_offer_enabled:false,offer_source:active?"manual":null,offer_discount_percent:active?disc:null,offer_duration_mode:dur,offer_starts_at:active?new Date().toISOString():null,offer_ends_at:active?end:null};const r=await db.from("products").update({is_offer:active,offer_price:active?op:null,metadata:nmeta,updated_at:new Date().toISOString()}).eq("id",pid).select("*").single();if(r.error)throw r.error;return {product_id:pid,product:mp(r.data),offer:offer(r.data)}}
async function exps(){
  await rec();
  const t=today(),h=add(t,90);
  const [policy,productsQ,expiredQ]=await Promise.all([
    db.from("ops2_expiry_offer_policy_v1")
      .select("product_id,name,is_active,price,legacy_validity_date,lot_tracking_complete,lot_count,quantified_lot_count,sellable_lot_qty,expired_lot_qty,earliest_sellable_expiration,effective_expiration_date,days_to_expiry,recommended_discount_percent,has_sellable_validity,expiry_deactivation_candidate")
      .not("effective_expiration_date","is",null).lte("effective_expiration_date",h).order("effective_expiration_date").limit(5000),
    db.from("products").select("id,sku,gtin,name,is_active,is_offer,offer_price,validity_date,metadata,image_url,price,packaging,subcategory,subsubcategory,sales_category,storefront_category,category,gondola,shelf,updated_at").limit(5000),
    db.from("products").select("*").eq("is_active",false).limit(5000)
  ]);
  if(policy.error)throw policy.error;if(productsQ.error)throw productsQ.error;if(expiredQ.error)throw expiredQ.error;
  const pm=new Map((productsQ.data||[]).map((x:any)=>[String(x.id),x]));
  const rows=(policy.data||[]).filter((x:any)=>x.is_active!==false).map((s:any)=>{
    const p:any=pm.get(String(s.product_id))||{};
    return {...mp(p),expiration_date:s.effective_expiration_date,days_left:Number(s.days_to_expiry),
      suggested_discount_percent:s.recommended_discount_percent,
      lot_tracking_complete:s.lot_tracking_complete===true,lot_count:Number(s.lot_count||0),
      sellable_lot_qty:Number(s.sellable_lot_qty||0),expired_lot_qty:Number(s.expired_lot_qty||0),
      earliest_sellable_expiration:s.earliest_sellable_expiration||null,validity_source:s.lot_tracking_complete?"lot_fefo":"legacy"};
  });
  const ac=(productsQ.data||[]).filter((p:any)=>p.is_active!==false),
        ex=(productsQ.data||[]).filter((p:any)=>p.is_active===false&&meta(p.metadata).deactivation_reason==="expired");
  return {active_only:true,products:rows,summary:{
    expired_deactivated:ex.length,
    under_30:rows.filter((x:any)=>x.days_left<30).length,
    days_30_59:rows.filter((x:any)=>x.days_left>=30&&x.days_left<60).length,
    days_60_90:rows.filter((x:any)=>x.days_left>=60&&x.days_left<=90).length,
    without_expiration:ac.filter((p:any)=>!p.validity_date).length,
    auto_enabled:ac.filter((p:any)=>meta(p.metadata).auto_expiry_offer_enabled===true).length,
    lot_tracking_complete:ac.filter((p:any)=>meta(p.metadata).lot_tracking_complete===true).length,
    total_products:ac.length},
    expired_deactivated:(expiredQ.data||[]).filter((p:any)=>meta(p.metadata).deactivation_reason==="expired").slice(0,30).map(mp)};
}
async function expSave(p:any){
  const pid=id(p?.product_id);if(!pid)return {error:"invalid_product",status:400};
  const b=await one(pid);if(!b)return {error:"product_not_found",status:404};
  const exp=p?.expiration_date?dt(p.expiration_date):null;
  if(p?.expiration_date&&!exp)return {error:"invalid_expiration_date",status:400};
  const currentMeta=meta(b.metadata);
  if(currentMeta.lot_tracking_complete===true&&p?.force_legacy_validity!==true){
    return {error:"lot_tracking_complete_use_product_lots",status:409};
  }
  const authority=await stockAuthority();
  let m={...currentMeta,auto_expiry_offer_enabled:p?.auto_expiry_offer_enabled===true},
      patch:any={validity_date:exp,metadata:m,updated_at:new Date().toISOString()};
  if(exp&&days(today(),exp)<0){
    patch={...patch,is_active:false,...(authority==="bling"?{}:{stock:0}),is_offer:false,offer_price:null,
      metadata:{...m,deactivation_reason:"expired",deactivated_at:new Date().toISOString(),offer_source:null,expiry_basis:"legacy_product_validity"}};
  }else if(currentMeta.deactivation_reason==="expired"){
    patch={...patch,is_active:true,metadata:{...m,deactivation_reason:null,deactivated_at:null}};
  }
  const r=await db.from("products").update(patch).eq("id",pid).select("*").single();
  if(r.error)throw r.error;await aud(b,r.data,p,"expiration_save");await rec();
  return {product:await mappedProduct(await one(pid))};
}
async function productLots(pidRaw:any){
  const pid=id(pidRaw);if(!pid)return {error:"invalid_product",status:400};
  const [p,l,s]=await Promise.all([
    one(pid),
    db.from("product_inventory_lots").select("*").eq("product_id",pid).order("expiration_date",{ascending:true}).order("created_at",{ascending:true}),
    db.from("ops2_product_lot_summary_v1").select("*").eq("product_id",pid).maybeSingle()
  ]);
  if(!p)return {error:"product_not_found",status:404};if(l.error)throw l.error;if(s.error)throw s.error;
  return {product:await mappedProduct(p),lots:l.data||[],summary:s.data||null};
}
async function saveProductLot(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const pid=id(p?.product_id),exp=dt(p?.expiration_date),qty=p?.quantity_on_hand===null||p?.quantity_on_hand===undefined?null:Number(p.quantity_on_hand);
  if(!pid||!exp)return {error:"invalid_product_lot",status:400};
  if(qty!==null&&(!Number.isFinite(qty)||qty<0))return {error:"invalid_lot_quantity",status:400};
  const q=await db.rpc("ops2_upsert_product_lot_v1",{
    p_product_id:pid,p_lot_code:tx(p?.lot_code,120)||null,p_expiration_date:exp,p_quantity_on_hand:qty,
    p_source:tx(p?.source,30)||"manual",p_source_ref:tx(p?.source_ref,180)||null,
    p_received_at:p?.received_at||null,p_metadata:meta(p?.metadata)
  });
  if(q.error)throw q.error;await rec();return await productLots(pid);
}
async function setLotTrackingComplete(p:any,auth:any){
  if(!["owner","supervisor"].includes(String(auth?.role||"")))return {error:"supervisor_required",status:403};
  const pid=id(p?.product_id);if(!pid)return {error:"invalid_product",status:400};
  const q=await db.rpc("ops2_set_lot_tracking_complete_v1",{p_product_id:pid,p_complete:p?.complete===true,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error){const m=String(q.error.message||"");if(m.includes("lot_tracking_requires_quantified_lot"))return {error:"lot_tracking_requires_quantified_lot",status:409};throw q.error}
  await rec();return await productLots(pid);
}
async function fefoPreview(pidRaw:any,qtyRaw:any){
  const pid=id(pidRaw),qty=Number(qtyRaw);if(!pid||!Number.isFinite(qty)||qty<=0)return {error:"invalid_fefo_request",status:400};
  const q=await db.rpc("ops2_fefo_preview_v1",{p_product_id:pid,p_quantity:qty});if(q.error)throw q.error;return {fefo:q.data};
}
async function auditList(l:number){const r=await db.from("product_lifecycle_audit").select("*").order("created_at",{ascending:false}).limit(l);if(r.error)throw r.error;const ids=[...new Set((r.data||[]).map((x:any)=>x.product_id))],m=new Map();if(ids.length){const p=await db.from("products").select("id,name,sku,gtin").in("id",ids);for(const x of p.data||[])m.set(x.id,x)}return (r.data||[]).map((x:any)=>({...x,product:m.get(x.product_id)||null}))}
async function ean(v:any){const d=dg(v);if(!d)return {error:"invalid_ean",status:400};const r=await db.from("products").select("*").eq("gtin",d).limit(1).maybeSingle();if(r.error)throw r.error;if(!r.data)return {error:"product_not_found",status:404};return {product:await mappedProduct(r.data)}}
async function bal(p:any){
  const pid=id(p?.product_id),q=Number(p?.quantity);
  if(!pid)return {error:"invalid_product",status:400};
  if(!Number.isFinite(q)||q<0)return {error:"invalid_quantity",status:400};
  const operator=tx(p?.operator,80)||"Operação";
  const r=await db.rpc("ops_record_inventory_count_v1",{p_product_id:pid,p_counted_quantity:q,p_operator_label:operator});
  if(r.error)throw r.error;
  const product=await one(pid);if(!product)return {error:"product_not_found",status:404};
  let recount:any=null;
  if(r.data?.count_id){
    const rq=await db.rpc("ops_apply_stock_recount_result_v1",{p_product_id:pid,p_count_id:r.data.count_id,p_counted_quantity:q,p_operator_label:operator});
    if(rq.error)throw rq.error;
    recount=rq.data||null;
  }
  return {product:await mappedProduct(product),count:r.data,recount};
}
async function stockRecountQueue(){
  const r=await db.rpc("get_ops_stock_recount_queue_v1");
  if(r.error)throw r.error;
  return r.data||{count:0,high:0,normal:0,items:[]};
}
async function classifyStockReconciliation(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const aid=id(p?.attention_id),cause=tx(p?.cause_code,40),note=tx(p?.cause_note,500);
  if(!aid)return {error:"invalid_attention",status:400};
  if(!note)return {error:"cause_note_required",status:400};
  const r=await db.rpc("ops_classify_stock_reconciliation_v1",{p_attention_id:aid,p_cause_code:cause,p_cause_note:note,p_evidence_ref:tx(p?.evidence_ref,300)||null,p_operator_label:tx(p?.operator,80)||"Operação"});
  if(r.error)throw r.error; return {classification:r.data};
}
async function inventoryIncidents(limitRaw:any){
  const r=await db.rpc("get_ops_inventory_incidents_v1",{p_limit:Math.max(1,Math.min(100,Number(limitRaw||30)||30))});
  if(r.error)throw r.error;
  return r.data||{};
}
async function createInventoryIncident(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const pid=id(p?.product_id),qty=Number(p?.quantity),kind=tx(p?.incident_type,30).toLowerCase();
  if(!pid)return {error:"invalid_product",status:400};
  if(!Number.isFinite(qty)||qty<=0)return {error:"invalid_quantity",status:400};
  const allowed=new Set(["damage","expired","loss","return","other"]);
  if(!allowed.has(kind))return {error:"invalid_incident_type",status:400};
  const oid=id(p?.source_order_id)||null;
  const r=await db.rpc("ops_record_inventory_incident_v1",{
    p_product_id:pid,p_incident_type:kind,p_quantity:qty,
    p_operator_label:tx(p?.operator,80)||"Operação",p_note:tx(p?.note,500)||null,
    p_source_order_id:oid
  });
  if(r.error)throw r.error;
  const product=await one(pid);
  return {incident:r.data,product:product?mp(product):null};
}
async function glist(){
  const g=await db.from("vitrine_gondolas").select("*").eq("active",true).order("number");
  if(g.error)throw g.error;
  const all:any[]=[];
  for(let pos=0;pos<10000;pos+=1000){
    const p=await db.from("products").select("id,gondola,is_active").not("gondola","is",null).order("id").range(pos,pos+999);
    if(p.error)throw p.error;
    all.push(...(p.data||[]));
    if((p.data||[]).length<1000)break;
  }
  const counts=new Map();
  for(const x of all){
    if(x.is_active===false)continue;
    const raw=String(x.gondola||"").trim();
    if(!/^\d+$/.test(raw))continue;
    const key=String(Number(raw));
    counts.set(key,(counts.get(key)||0)+1);
  }
  return {gondolas:(g.data||[]).map((x:any)=>({...x,product_count:counts.get(String(Number(x.number)))||0}))};
}
async function gone(v:any){const gid=id(v);if(!gid)return {error:"invalid_gondola",status:400};const g=await db.from("vitrine_gondolas").select("*").eq("id",gid).eq("active",true).maybeSingle();if(g.error)throw g.error;if(!g.data)return {error:"gondola_not_found",status:404};const p=await db.from("products").select("*").eq("gondola",String(g.data.number)).order("name").limit(5000);if(p.error)throw p.error;return {gondola:g.data,products:(p.data||[]).map(mp)}}
async function gcreate(p:any){const n=Math.floor(Number(p?.number));if(!Number.isInteger(n)||n<1||n>9999)return {error:"invalid_gondola",status:400};let g=await db.from("vitrine_gondolas").select("*").eq("number",n).maybeSingle();if(g.error)throw g.error;if(g.data){if(!g.data.active)g=await db.from("vitrine_gondolas").update({active:true,updated_at:new Date().toISOString()}).eq("id",g.data.id).select("*").single();return {gondola:g.data,reused:true}}g=await db.from("vitrine_gondolas").insert({number:n}).select("*").single();if(g.error)throw g.error;return {gondola:g.data,reused:false}}
async function gassign(p:any){const gid=id(p?.gondola_id);if(!gid)return {error:"invalid_gondola",status:400};const g=await db.from("vitrine_gondolas").select("*").eq("id",gid).eq("active",true).maybeSingle();if(g.error)throw g.error;if(!g.data)return {error:"gondola_not_found",status:404};const e:any=await ean(p?.ean);if(e.error)return e;const b=await one(e.product.id),prev=b?.gondola&&/^\d+$/.test(String(b.gondola))?Number(b.gondola):null,r=await db.from("products").update({gondola:String(g.data.number),updated_at:new Date().toISOString()}).eq("id",e.product.id).select("*").single();if(r.error)throw r.error;return {product:mp(r.data),previous_gondola_number:prev}}
async function gshelf(p:any){const gid=id(p?.gondola_id),pid=id(p?.product_id);if(!gid||!pid)return {error:"invalid_request",status:400};const g=await db.from("vitrine_gondolas").select("*").eq("id",gid).maybeSingle();if(g.error)throw g.error;if(!g.data)return {error:"gondola_not_found",status:404};const s=tx(p?.shelf_label,24)||null,r=await db.from("products").update({shelf:s,updated_at:new Date().toISOString()}).eq("id",pid).eq("gondola",String(g.data.number)).select("id").maybeSingle();if(r.error)throw r.error;if(!r.data)return {error:"product_not_in_gondola",status:404};return {product_id:pid,shelf_label:s}}
async function grem(p:any){const gid=id(p?.gondola_id),pid=id(p?.product_id);if(!gid||!pid)return {error:"invalid_request",status:400};const g=await db.from("vitrine_gondolas").select("*").eq("id",gid).maybeSingle();if(g.error)throw g.error;if(!g.data)return {error:"gondola_not_found",status:404};const r=await db.from("products").update({gondola:null,shelf:null,updated_at:new Date().toISOString()}).eq("id",pid).eq("gondola",String(g.data.number));if(r.error)throw r.error;return {product_id:pid,removed:true}}

async function gclear(p:any){
  const gid=id(p?.gondola_id);
  if(!gid)return {error:"invalid_gondola",status:400};
  const g=await db.from("vitrine_gondolas").select("*").eq("id",gid).eq("active",true).maybeSingle();
  if(g.error)throw g.error;
  if(!g.data)return {error:"gondola_not_found",status:404};
  const expected="LIMPAR_GONDOLA_"+String(g.data.number);
  if(tx(p?.confirmation,80)!==expected)return {error:"gondola_clear_confirmation_required",status:409};
  const r=await db.from("products").update({gondola:null,shelf:null,updated_at:new Date().toISOString()}).eq("gondola",String(g.data.number)).select("id");
  if(r.error)throw r.error;
  const removed=(r.data||[]).length;
  await opsEvent("gondola.cleared","Gôndola "+g.data.number+" foi limpa.","gondola",gid,{gondola_number:g.data.number,removed_count:removed},tx(p?.operator,80)||"Operação","human","dona_antonia",null);
  return {gondola:g.data,removed_count:removed};
}
async function gassignCount(p:any){
  const gid=id(p?.gondola_id),pid=id(p?.product_id),q=Number(p?.quantity);
  if(!gid)return {error:"invalid_gondola",status:400};
  if(!pid)return {error:"invalid_product",status:400};
  if(!Number.isFinite(q)||q<0)return {error:"invalid_quantity",status:400};
  const g=await db.from("vitrine_gondolas").select("*").eq("id",gid).eq("active",true).maybeSingle();
  if(g.error)throw g.error;
  if(!g.data)return {error:"gondola_not_found",status:404};
  const before=await one(pid);
  if(!before)return {error:"product_not_found",status:404};
  const prev=before.gondola&&/^\d+$/.test(String(before.gondola))?Number(before.gondola):null;
  const counted:any=await bal({product_id:pid,quantity:q,operator:p?.operator});
  if(counted?.error)return counted;
  const r=await db.from("products").update({gondola:String(g.data.number),updated_at:new Date().toISOString()}).eq("id",pid).select("*").single();
  if(r.error)throw r.error;
  return {product:mp(r.data),previous_gondola_number:prev,count:counted.count||null,recount:counted.recount||null};
}

const HUB_API="https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1";
async function hub(subaction:string,extra:any={},authorization=""){
  const key=await db.rpc("get_bling_hub_key_v2");
  if(key.error||!key.data)return {error:"bling_bridge_not_configured",status:503};
  const res=await fetch(HUB_API,{method:"POST",headers:{"Content-Type":"application/json","x-dona-antonia-bling-hub-key":String(key.data),...(authorization?{"Authorization":authorization}:{})},body:JSON.stringify({action:"vitrine_bling_hub_internal",subaction,...extra}),signal:AbortSignal.timeout(120000)});
  const data=await res.json().catch(()=>({ok:false,error:"invalid_bling_response"}));
  if(!res.ok||data?.ok===false)return {error:String(data?.error||"bling_hub_unavailable"),status:res.status||502,detail:data?.detail||null,data};
  return {data};
}
async function ops2LiveRuntime(){
  const q=await db.from("bling_hub_runtime_v2").select("mode,hub_enabled,orders_enabled,stock_enabled,webhooks_enabled,metadata").eq("id",1).maybeSingle();
  if(q.error)throw q.error;const m=meta(q.data?.metadata),cut=String(m.ops2_live_cutover_at||"");
  return {mode:String(q.data?.mode||""),hub_enabled:q.data?.hub_enabled===true,orders_enabled:q.data?.orders_enabled===true,stock_enabled:q.data?.stock_enabled===true,webhooks_enabled:q.data?.webhooks_enabled===true,cutover_at:cut,direct_order_state:m.ops2_direct_order_state_enabled===true};
}
async function postCutoverOrder(oid:string){
  const [rt,o]=await Promise.all([ops2LiveRuntime(),db.from("orders").select("id,created_at,updated_at,status").eq("id",oid).maybeSingle()]);
  if(o.error)throw o.error;if(!o.data)return {enabled:false,reason:"order_not_found"};
  const cut=Date.parse(rt.cutover_at||"");
  const created=Date.parse(o.data.created_at||"");
  const enabled=rt.mode==="live"&&rt.hub_enabled&&rt.orders_enabled&&rt.direct_order_state&&Number.isFinite(cut)&&Number.isFinite(created)&&created>=cut;
  return {enabled,reason:enabled?"post_cutover":"pre_cutover_or_disabled",runtime:rt,order:o.data};
}
async function syncConfirmedOrderToBling(oid:string,operator="Operação"){
  const gate=await postCutoverOrder(oid);if(!gate.enabled)return {attempted:false,ok:true,skipped:true,reason:gate.reason};
  const snap=await buildSnapshot(oid,"approved_early_order");
  const h=await hub("ops2_ensure_order_state",{payload:snap,target_key:"approved_separation",canary:false});
  const now=new Date().toISOString();
  if(h.error){
    await db.from("orders").update({sync_status:"review_bling",updated_at:now}).eq("id",oid);
    let retryQueued=false,retryJobId:any=null;
    try{
      const revision=String(gate.order?.updated_at||gate.order?.created_at||"").replace(/[^0-9]/g,"").slice(0,18)||"r1";
      const retry=await hub("enqueue_job",{
        domain:"order",operation:"sync_order_status",source_id:oid,
        idempotency_key:"ops2:live-order-state-retry:"+oid+":"+revision,
        payload:{...snap,source_order_id:oid,local_status:"confirmed",target_key:"approved_separation",queue_reason:"approved_early_order_retry"}
      });
      retryQueued=!retry.error&&retry.data?.queued!==false;
      retryJobId=retry.data?.job_id||null;
    }catch{}
    try{await db.rpc("ops_open_attention_v1",{p_type:"order_bling_sync_failed",p_summary:"Pedido confirmado ainda não sincronizou com o Bling.",p_entity_type:"order",p_entity_id:oid,p_correlation_id:oid,p_priority:"high",p_owner_role:"supervisor",p_recommended_action:"O sistema tentará novamente a cada ciclo. Se persistir, abra o pedido e confira cliente/produtos.",p_evidence:{error:h.error,status:h.status||null,detail:h.data||h.detail||null,cutover_at:gate.runtime?.cutover_at,retry_queued:retryQueued,retry_job_id:retryJobId},p_source_system:"bling",p_idempotency_key:"ops2:order_bling_sync:"+oid,p_due_at:null})}catch{}
    await opsEvent("order.bling_sync_pending","Pedido confirmado; sincronização com Bling ficou pendente e entrou na fila de recuperação.","order",oid,{error:h.error,status:h.status||null,retry_queued:retryQueued,retry_job_id:retryJobId},operator,"automation","bling","order-bling-sync-pending:"+oid);
    return {attempted:true,ok:false,error:h.error,status:h.status||409,detail:h.data||h.detail||null,retry_queued:retryQueued,retry_job_id:retryJobId};
  }
  const blingId=Number(h.data?.bling_order_id||0)||null;
  await db.from("orders").update({bling_order_id:blingId,bling_synced_at:now,sync_status:"sent_to_bling",updated_at:now}).eq("id",oid);
  try{
    const a=await db.from("ops_attention").select("id").eq("idempotency_key","ops2:order_bling_sync:"+oid).in("status",["open","acknowledged"]).maybeSingle();
    if(!a.error&&a.data?.id)await db.rpc("ops_resolve_attention_v1",{p_attention_id:a.data.id,p_resolution:"Pedido sincronizado e verificado no Bling.",p_resolution_ref:blingId?"bling-order:"+blingId:null});
  }catch{}
  await opsEvent("order.bling_synced","Pedido confirmado sincronizado e reservado no Bling.","order",oid,{bling_order_id:blingId,target_key:"approved_separation"},operator,"automation","bling","order-bling-synced:"+oid);
  return {attempted:true,ok:true,bling_order_id:blingId,result:h.data};
}
async function recoverPendingEanVerified(limitRaw:any=3){
  const runtime=await db.from("bling_hub_runtime_v2").select("mode,hub_enabled,orders_enabled,metadata").eq("id",1).maybeSingle();
  if(runtime.error)throw runtime.error;
  const m=meta(runtime.data?.metadata),cutoverAt=tx(m.ops2_live_cutover_at,80);
  if(runtime.data?.mode!=="live"||runtime.data?.hub_enabled!==true||runtime.data?.orders_enabled!==true||m.ops2_direct_order_state_enabled!==true||m.ops2_ean_verified_sync_enabled!==true){
    return {ok:true,enabled:false,reason:"ops2_live_ean_recovery_disabled",checked:0,recovered:0,pending:0};
  }
  if(!cutoverAt||!Number.isFinite(Date.parse(cutoverAt)))return {ok:false,error:"ops2_live_cutover_missing",checked:0,recovered:0,pending:0};
  const limit=Math.max(1,Math.min(10,Number(limitRaw||3)||3));
  const q=await db.from("orders")
    .select("id,created_at,updated_at,status,sync_status")
    .eq("status","ready")
    .eq("sync_status","review_bling")
    .gte("created_at",cutoverAt)
    .order("updated_at",{ascending:true})
    .limit(limit);
  if(q.error)throw q.error;
  const summary:any={ok:true,enabled:true,checked:0,recovered:0,pending:0,items:[]};
  for(const o of q.data||[]){
    summary.checked++;
    const checked=await db.from("ops_order_check_sessions").select("id,verified_at")
      .eq("order_id",o.id).eq("status","verified").not("verified_at","is",null)
      .order("verified_at",{ascending:false}).limit(1).maybeSingle();
    if(checked.error)throw checked.error;
    if(!checked.data?.id){
      summary.pending++;summary.items.push({order_id:o.id,ok:false,reason:"verified_check_session_missing"});continue;
    }
    try{
      const snap=await buildSnapshot(o.id,"ean_verified");
      const h=await hub("ops2_ensure_order_state",{payload:snap,target_key:"verified",canary:false});
      if(h.error){
        summary.pending++;
        summary.items.push({order_id:o.id,ok:false,error:h.error,status:h.status||null});
        continue;
      }
      try{
        const a=await db.from("ops_attention").select("id").eq("idempotency_key","ops2:order_bling_verified:"+o.id).in("status",["open","acknowledged"]).maybeSingle();
        if(!a.error&&a.data?.id)await db.rpc("ops_resolve_attention_v1",{p_attention_id:a.data.id,p_resolution:"Recuperação automática concluiu o status Verificado no Bling.",p_resolution_ref:h.data?.bling_order_id?"bling-order:"+String(h.data.bling_order_id):null});
      }catch{}
      await opsEvent("order.bling_verified_recovered","Recuperação automática concluiu o status Verificado no Bling.","order",o.id,{check_session_id:checked.data.id,bling_order_id:h.data?.bling_order_id||null},"Automação","automation","bling","order-bling-verified-recovered:"+o.id);
      summary.recovered++;
      summary.items.push({order_id:o.id,ok:true,bling_order_id:h.data?.bling_order_id||null});
    }catch(e){
      summary.pending++;
      summary.items.push({order_id:o.id,ok:false,error:tx((e as Error)?.message||e,240)});
    }
  }
  return summary;
}
async function cutover(){const q=await db.from("vitrine_operational_cutover_config").select("live_orders_since,legacy_orders_read_only").eq("id",1).maybeSingle();if(q.error)throw q.error;return {live_orders_since:q.data?.live_orders_since||"2026-09-24T03:19:06.631396Z",legacy_orders_read_only:q.data?.legacy_orders_read_only!==false}}
const uiStatus=(s:any)=>String(s||"")==="storefront_received"?"created":String(s||"created");
const paymentLabel=(v:any)=>{const s=tx(v,80).toLowerCase();const m:any={pix:"PIX",cash:"Dinheiro",dinheiro:"Dinheiro",credit:"Cartão de crédito",credit_card:"Cartão de crédito",card:"Cartão",food_card:"Cartão alimentação/refeição",meal_card:"Cartão alimentação/refeição"};return m[s]||tx(v,80)};
async function reservationRows(orderIds:string[]){const m=new Map<string,any[]>();for(const oid of orderIds)m.set(oid,[]);if(!orderIds.length)return m;const q=await db.from("vitrine_stock_reservations").select("order_id,product_id,quantity,status,expires_at,consumed_at,released_at").in("order_id",orderIds);if(q.error)throw q.error;for(const r of q.data||[]){if(!m.has(r.order_id))m.set(r.order_id,[]);m.get(r.order_id)!.push(r)}return m}
async function deliveryReturnMap(orderIds:string[]){
  const out=new Map<string,any>();for(const oid of orderIds)out.set(oid,null);if(!orderIds.length)return out;
  const q=await db.from("order_delivery_return_cases")
    .select("id,order_id,attempt_number,reason_code,reason_label,note,status,recommended_disposition,failed_at,failed_by,returned_at,returned_by")
    .in("order_id",orderIds)
    .in("status",["returning","returned_review"])
    .order("failed_at",{ascending:false});
  if(q.error)throw q.error;
  for(const x of q.data||[])if(!out.get(x.order_id))out.set(x.order_id,{
    id:x.id,attempt_number:x.attempt_number,reason_code:x.reason_code,reason_label:x.reason_label,
    note:x.note||null,status:x.status,recommended_disposition:x.recommended_disposition,
    failed_at:x.failed_at,failed_by:x.failed_by||null,returned_at:x.returned_at||null,returned_by:x.returned_by||null,
    dispatch_blocked:x.status==="returned_review"
  });
  return out;
}

async function paymentSettlementMap(orderIds:string[]){
  const out=new Map<string,any>();for(const oid of orderIds)out.set(oid,null);if(!orderIds.length)return out;
  const s=await db.from("order_payment_settlements").select("id,order_id,status,expected_total_cents,captured_total_cents,planned_method,operator_label,captured_at,bling_sync_state,bling_sync_ref").in("order_id",orderIds);
  if(s.error)throw s.error;
  const rows=s.data||[],ids=rows.map((x:any)=>x.id),partsBy=new Map<string,any[]>();
  if(ids.length){
    const p=await db.from("order_payment_parts").select("settlement_id,sequence,method,amount_cents").in("settlement_id",ids).order("sequence");
    if(p.error)throw p.error;
    for(const x of p.data||[]){if(!partsBy.has(x.settlement_id))partsBy.set(x.settlement_id,[]);partsBy.get(x.settlement_id)!.push({sequence:x.sequence,method:x.method,label:paymentLabel(x.method),amount_cents:Number(x.amount_cents||0)})}
  }
  for(const x of rows)out.set(x.order_id,{id:x.id,status:x.status,expected_total_cents:Number(x.expected_total_cents||0),captured_total_cents:Number(x.captured_total_cents||0),planned_method:x.planned_method||null,operator_label:x.operator_label||null,captured_at:x.captured_at||null,bling_sync_state:x.bling_sync_state||null,bling_sync_ref:x.bling_sync_ref||null,parts:partsBy.get(x.id)||[]});
  return out;
}
function paySnap(o:any,rows:any[],settlement:any=null){const consumed=rows.some((r:any)=>r.status==="consumed"),reserved=consumed||rows.some((r:any)=>r.status==="reserved"&&(!r.expires_at||Date.parse(r.expires_at)>Date.now())),released=!reserved&&rows.some((r:any)=>r.status==="released"),method=tx(o?.payment_method,80);return {method,label:paymentLabel(method),timing:"on_delivery",source:tx(o?.source,80)||"vitrine",stock_reserved:reserved,stock_consumed:consumed,stock_released:released,stock_model:"canonical_vitrine_v1",actual:settlement?{...settlement,received:true}:null}}
async function stockReadiness(orderIds:string[]){
  const out=new Map<string,any>();for(const oid of orderIds)out.set(oid,{ok:true,shortage_count:0,shortages:[],demand_lines:0,reserved_lines:0});if(!orderIds.length)return out;
  const items=await db.from("order_items").select("order_id,product_id,quantity").in("order_id",orderIds).not("product_id","is",null);if(items.error)throw items.error;
  const demand=new Map<string,Map<string,number>>(),pids=new Set<string>();
  for(const r of items.data||[]){if(!demand.has(r.order_id))demand.set(r.order_id,new Map());const d=demand.get(r.order_id)!;const q=Number(r.quantity||0);d.set(r.product_id,(d.get(r.product_id)||0)+q);pids.add(r.product_id)}
  const ids=[...pids];if(!ids.length){for(const oid of orderIds)out.set(oid,{ok:false,shortage_count:0,shortages:[],demand_lines:0,reserved_lines:0,error:"empty_order_stock"});return out}
  const [pr,rr,sm,authority]=await Promise.all([
    db.from("products").select("id,name,sku,gtin,is_active,gondola,shelf").in("id",ids),
    db.from("vitrine_stock_reservations").select("order_id,product_id,quantity,status,expires_at").in("product_id",ids),
    effectiveStockMap(ids),
    stockAuthority()
  ]);
  if(pr.error)throw pr.error;if(rr.error)throw rr.error;
  const active=(rr.data||[]).filter((r:any)=>r.status==="reserved"&&(!r.expires_at||Date.parse(r.expires_at)>Date.now()));
  const reservationOrderIds=[...new Set(active.map((r:any)=>r.order_id).filter(Boolean))],syncMap=new Map<string,boolean>();
  if(reservationOrderIds.length){
    const oq=await db.from("orders").select("id,sync_status,bling_synced_at").in("id",reservationOrderIds);if(oq.error)throw oq.error;
    for(const o of oq.data||[])syncMap.set(o.id,Boolean(o.bling_synced_at)&&o.sync_status==="sent_to_bling");
  }
  const pm=new Map((pr.data||[]).map((p:any)=>[p.id,p]));
  for(const oid of orderIds){
    const lines=demand.get(oid)||new Map(),short:any[]=[];let protectedLines=0;
    for(const [pid,qty] of lines){
      const own=active.filter((r:any)=>r.order_id===oid&&r.product_id===pid).reduce((sum:number,r:any)=>sum+Number(r.quantity||0),0);
      const consumed=(rr.data||[]).filter((r:any)=>r.order_id===oid&&r.product_id===pid&&r.status==="consumed").reduce((sum:number,r:any)=>sum+Number(r.quantity||0),0);
      if(own+consumed+0.0001>=qty){protectedLines++;continue}
      const p=pm.get(pid);
      const pendingOther=active.filter((r:any)=>r.order_id!==oid&&r.product_id===pid&&(authority!=="bling"||syncMap.get(r.order_id)!==true)).reduce((sum:number,r:any)=>sum+Number(r.quantity||0),0);
      const free=Math.max(0,Number(sm.get(pid)||0)-pendingOther),need=Math.max(0,qty-own-consumed),lack=Math.max(0,need-free);
      if(!p||p.is_active===false||lack>0)short.push({product_id:pid,name:p?.name||"Produto indisponível",sku:p?.sku||"",gtin:p?.gtin||"",required:qty,available:p&&p.is_active!==false?free:0,shortage:p&&p.is_active!==false?lack:need,gondola_number:p?.gondola&&/^\d+$/.test(String(p.gondola))?Number(p.gondola):null,shelf_label:p?.shelf||null});
    }
    out.set(oid,{ok:short.length===0&&lines.size>0,shortage_count:short.length,shortages:short.slice(0,8),demand_lines:lines.size,reserved_lines:protectedLines,error:lines.size?"":"empty_order_stock",stock_authority:authority});
  }
  return out;
}
async function mapOrders(rows:any[]){
  const ids=rows.map((o:any)=>o.id);
  const [rmap,ready,smap,dmap]=await Promise.all([reservationRows(ids),stockReadiness(ids),paymentSettlementMap(ids),deliveryReturnMap(ids)]);
  const cids=[...new Set(rows.map((o:any)=>o.customer_id).filter(Boolean))],cm=new Map<string,any>();
  if(cids.length){const cq=await db.from("customers").select("id,name").in("id",cids);if(cq.error)throw cq.error;for(const c of cq.data||[])cm.set(c.id,c)}
  return rows.map((o:any)=>({id:o.id,order_number:o.order_number,status:uiStatus(o.status),total_cents:Math.round(Number(o.total||0)*100),payment_method_snapshot:paySnap(o,rmap.get(o.id)||[],smap.get(o.id)||null),delivery_return:dmap.get(o.id)||null,delivery_address_snapshot:o.delivery_address||{},whatsapp_phone_e164:o.phone_e164||o.delivery_address?.phone||"",customer_id:o.customer_id,created_at:o.created_at,confirmed_at:o.confirmed_at,delivered_at:o.delivered_at,cancelled_at:o.cancelled_at,customer_name:cm.get(o.customer_id)?.name||o.customer_snapshot?.name||o.delivery_address?.customer_name||o.delivery_address?.recipient_name||"",history_sync:{state:"synced",canonical:true},stock_readiness:ready.get(o.id)||null,source:o.source}));
}
async function ordersList(){const c=await cutover(),q=await db.from("orders").select("*").in("source",OP_SOURCES).gte("created_at",c.live_orders_since).order("created_at",{ascending:false}).limit(250);if(q.error)throw q.error;return await mapOrders(q.data||[])}
async function orderDetailCanonical(orderId:any){
  const oid=id(orderId);if(!oid)return {error:"invalid_order",status:400};const oq=await db.from("orders").select("*").eq("id",oid).maybeSingle();if(oq.error)throw oq.error;if(!oq.data)return {error:"order_not_found",status:404};
  const iq=await db.from("order_items").select("*").eq("order_id",oid).order("created_at");if(iq.error)throw iq.error;const itemRows=iq.data||[],pids=[...new Set(itemRows.map((x:any)=>x.product_id).filter(Boolean))],pm=new Map<string,any>();
  if(pids.length){const pq=await db.from("products").select("id,name,image_url,sku,gtin,gondola,shelf").in("id",pids);if(pq.error)throw pq.error;for(const p of pq.data||[])pm.set(p.id,p)}
  const compsByBasket=new Map<string,any[]>();for(const it of itemRows){const im=meta(it.metadata);if(im.history_kind==="basket_component"){const k=tx(im.parent_basket_name,220)||"Cesta";if(!compsByBasket.has(k))compsByBasket.set(k,[]);compsByBasket.get(k)!.push(it)}}
  const result:any[]=[],seenBaskets=new Set<string>();
  for(const it of itemRows){const im=meta(it.metadata);if(im.history_kind==="basket_component")continue;const p=pm.get(it.product_id);if(im.history_kind==="basket"){const k=tx(it.name_snapshot,220)||"Cesta";if(seenBaskets.has(k))continue;seenBaskets.add(k);const baskets=itemRows.filter((z:any)=>meta(z.metadata).history_kind==="basket"&&tx(z.name_snapshot,220)===k),qty=baskets.reduce((s:number,z:any)=>s+Number(z.quantity||0),0),sum=baskets.reduce((s:number,z:any)=>s+Math.round(Number(z.line_total||0)*100),0),grouped=new Map<string,any>();for(const c of compsByBasket.get(k)||[]){const cp=pm.get(c.product_id),key=String(c.product_id||c.name_snapshot),old=grouped.get(key);if(old)old.quantity+=Number(c.quantity||0);else grouped.set(key,{id:c.id,product_id:c.product_id,name_snapshot:c.name_snapshot,sku_snapshot:c.sku_snapshot,gtin:cp?.gtin||"",quantity:Number(c.quantity||0),image_url:cp?.image_url||meta(c.metadata).image_url||"",gondola_number:cp?.gondola&&/^\d+$/.test(String(cp.gondola))?Number(cp.gondola):null,shelf_label:cp?.shelf||null,metadata:c.metadata})}result.push({...it,item_kind:"basket",quantity:1,name_snapshot:k+(qty>1?" ("+qty+" cestas)":""),total_cents:sum,image_url:im.image_url||"",gondola_number:null,shelf_label:null,components:[...grouped.values()]});continue}result.push({...it,item_kind:"product",total_cents:Math.round(Number(it.line_total||0)*100),gtin:p?.gtin||"",image_url:p?.image_url||im.image_url||"",gondola_number:p?.gondola&&/^\d+$/.test(String(p.gondola))?Number(p.gondola):null,shelf_label:p?.shelf||null,components:[]})}
  let customer:any=null;const cid=oq.data.customer_id||oq.data.customer_snapshot?.customer_id||oq.data.delivery_address?.source_customer_id;
  if(id(cid)){const cq=await db.from("customers").select("*").eq("id",cid).maybeSingle();if(cq.error)throw cq.error;if(cq.data){const aq=await db.from("customer_addresses").select("*").eq("customer_id",cid).eq("is_active",true).order("is_default",{ascending:false}).limit(1).maybeSingle();if(aq.error)throw aq.error;customer={id:cq.data.id,display_name:cq.data.name,phone:cq.data.primary_whatsapp_e164||"",cpf:cq.data.cpf_cnpj||"",email:"",status:cq.data.is_active===false?"inactive":"active",address:aq.data||null}}}
  if(!customer){const a=oq.data.delivery_address||{},cs=oq.data.customer_snapshot||{};customer={id:null,source_customer_id:a.source_customer_id||cs.customer_id||null,display_name:cs.name||a.customer_name||a.recipient_name||"",phone:oq.data.phone_e164||a.phone||"",cpf:cs.cpf||a.cpf||"",email:cs.email||a.email||"",status:"active",address:a}}
  const mapped=(await mapOrders([oq.data]))[0];let bl:any=null;try{const h=await hub("order_link_status",{source_order_id:oid});if(!h.error)bl=h.data}catch{}
  return {order:{...mapped,subtotal_cents:Math.round(Number(oq.data.subtotal||0)*100),discount_cents:Math.round(Number(oq.data.discount||0)*100),delivery_cents:0},customer,history_sync:{state:"synced",canonical:true},stock_readiness:mapped.stock_readiness,bling_link:bl,items:result};
}
async function guardOrder(oid:string){const c=await cutover(),q=await db.from("orders").select("id,created_at,source").eq("id",oid).maybeSingle();if(q.error)throw q.error;if(!q.data)return {error:"order_not_found",status:404};if(!OP_SOURCES.includes(String(q.data.source||""))||(c.legacy_orders_read_only&&Date.parse(q.data.created_at)<Date.parse(c.live_orders_since)))return {error:"legacy_order_read_only",status:409};return {ok:true}}
function transitionAllowed(a:string,b:string){if(a===b)return true;const m:any={created:["confirmed","cancelled"],confirmed:["processing","cancelled"],processing:["ready","cancelled"],ready:["out_for_delivery","cancelled"],out_for_delivery:["ready","delivered","cancelled"],delivered:[],cancelled:[]};return (m[a]||[]).includes(b)}
async function registerFailedDelivery(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};
  const reason=tx(p?.reason_code,40).toLowerCase(),note=tx(p?.note,500)||null;
  const q=await db.rpc("ops_register_failed_delivery_v1",{p_order_id:oid,p_reason_code:reason,p_note:note,p_operator_label:tx(p?.operator,80)||"Entrega"});
  if(q.error){const m=String(q.error.message||"");if(m.includes("order_not_in_delivery"))return {error:"order_not_in_delivery",status:409};if(m.includes("payment_already_captured"))return {error:"payment_already_captured",status:409};if(m.includes("invalid_delivery_failure_reason"))return {error:"invalid_delivery_failure_reason",status:400};throw q.error}
  try{await db.rpc("ops_mark_delivery_stop_failed_v1",{p_order_id:oid,p_reason:reason})}catch{}
  return {delivery_return:q.data};
}
async function confirmDeliveryReturn(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const cid=id(p?.case_id);if(!cid)return {error:"invalid_delivery_return_case",status:400};
  const disposition=tx(p?.disposition,30).toLowerCase();
  const q=await db.rpc("ops_confirm_delivery_return_v1",{p_case_id:cid,p_disposition:disposition,p_operator_label:tx(p?.operator,80)||"Operação"});
  if(q.error){const m=String(q.error.message||"");if(m.includes("delivery_return_case_not_found"))return {error:"delivery_return_case_not_found",status:404};if(m.includes("invalid_return_disposition"))return {error:"invalid_return_disposition",status:400};if(m.includes("order_not_in_delivery"))return {error:"order_not_in_delivery",status:409};throw q.error}
  return {delivery_return:q.data};
}

async function reverseDeliveryReturnStockIfNeeded(caseId:string){
  const authority=await stockAuthority();
  if(authority!=="bling")return {ok:true,skipped:true,reason:"legacy_stock_authority"};
  const rc=await db.from("order_delivery_return_cases").select("order_id,status").eq("id",caseId).maybeSingle();
  if(rc.error)throw rc.error;
  if(!rc.data?.order_id)return {ok:false,error:"delivery_return_case_not_found",status:404};
  if(rc.data.status!=="returned_review")return {ok:false,error:"delivery_return_not_in_review",status:409};
  const snap=await buildSnapshot(rc.data.order_id,"delivery_return_cancel_intact");
  const res=await fetch(U+"/functions/v1/shopping-room-reset-v1",{
    method:"POST",
    headers:{Authorization:"Bearer "+K,"Content-Type":"application/json"},
    body:JSON.stringify({source_order_id:rc.data.order_id,items:snap?.items||[]}),
    signal:AbortSignal.timeout(30000)
  });
  const raw=await res.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
  if(!res.ok||data?.ok!==true)return {ok:false,error:String(data?.error||"physical_stock_reverse_failed"),status:res.status||409,detail:data};
  return {ok:true,...data};
}

async function resolveDeliveryReturnReview(p:any,auth:any){
  if(!["owner","supervisor"].includes(String(auth?.role||"")))return {error:"supervisor_required",status:403};
  const cid=id(p?.case_id);if(!cid)return {error:"invalid_delivery_return_case",status:400};
  const action=tx(p?.resolution_action,40).toLowerCase();
  let stock_reverse:any=null;
  if(action==="cancel_intact"){
    stock_reverse=await reverseDeliveryReturnStockIfNeeded(cid);
    if(stock_reverse?.ok!==true)return {error:stock_reverse?.error||"physical_stock_reverse_failed",status:stock_reverse?.status||409,stock_reverse};
  }
  const q=await db.rpc("ops_resolve_delivery_return_review_v1",{p_case_id:cid,p_action:action,p_operator_label:tx(p?.operator,80)||"Supervisão"});
  if(q.error){
    const m=String(q.error.message||"");
    if(m.includes("delivery_return_case_not_found"))return {error:"delivery_return_case_not_found",status:404};
    if(m.includes("delivery_return_not_in_review"))return {error:"delivery_return_not_in_review",status:409};
    if(m.includes("invalid_return_review_action"))return {error:"invalid_return_review_action",status:400};
    if(m.includes("return_has_captured_payment"))return {error:"return_has_captured_payment",status:409};
    if(m.includes("bling_physical_stock_reverse_required_before_cancel"))return {error:"physical_stock_reverse_required",status:409};
    if(m.includes("stock_restore_failed"))return {error:"stock_restore_failed",status:409};
    throw q.error;
  }
  return {resolution:q.data,stock_reverse};
}

async function captureDeliveryPayment(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};
  const ret=await db.from("order_delivery_return_cases").select("id,status").eq("order_id",oid).in("status",["returning","returned_review"]).limit(1).maybeSingle();
  if(ret.error)throw ret.error;if(ret.data?.id)return {error:"delivery_return_open",status:409,delivery_return_case_id:ret.data.id};
  const parts=Array.isArray(p?.parts)?p.parts:[];
  if(!parts.length||parts.length>8)return {error:"invalid_payment_parts",status:400};
  const normalized=parts.map((x:any)=>({method:tx(x?.method,40).toLowerCase(),amount_cents:Math.round(Number(x?.amount_cents||0))}));
  if(normalized.some((x:any)=>!x.method||!Number.isFinite(x.amount_cents)||x.amount_cents<=0))return {error:"invalid_payment_parts",status:400};
  const q=await db.rpc("ops_record_delivery_payment_v1",{p_order_id:oid,p_parts:normalized,p_operator_label:tx(p?.operator,80)||"Operação",p_idempotency_key:"delivery-payment:"+oid});
  if(q.error){const m=String(q.error.message||"");if(m.includes("payment_total_mismatch"))return {error:"payment_total_mismatch",status:409};if(m.includes("payment_already_captured"))return {error:"payment_already_captured",status:409};if(m.includes("order_not_in_delivery"))return {error:"order_not_in_delivery",status:409};throw q.error}
  return {settlement:q.data};
}

async function updateOrderCanonical(p:any){
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};const g=await guardOrder(oid);if(g.error)return g;const q=await db.from("orders").select("*").eq("id",oid).maybeSingle();if(q.error)throw q.error;const o=q.data,cur=uiStatus(o.status),patch:any={updated_at:new Date().toISOString()};
  if(p?.delivery_address!==undefined){const a=p.delivery_address&&typeof p.delivery_address==="object"?p.delivery_address:{};patch.delivery_address={...(o.delivery_address||{}),customer_name:tx(a.customer_name??a.recipient_name??o.delivery_address?.customer_name,180)||null,recipient_name:tx(a.customer_name??a.recipient_name??o.delivery_address?.recipient_name,180)||null,phone:tx(a.phone,40)||o.phone_e164||null,postal_code:tx(a.postal_code,20)||null,street:tx(a.street,180)||null,number:tx(a.number,40)||null,complement:tx(a.complement,140)||null,district:tx(a.district,140)||null,city:tx(a.city,120)||null,state:tx(a.state,2).toUpperCase()||null,raw_text:tx(a.raw_text,400)||null,google_maps_url:tx(a.google_maps_url,800)||null,block:tx(a.block,80)||null}}
  if(p?.payment_method!==undefined)patch.payment_method=tx(p.payment_method,80)||null;
  if(p?.customer_id!==undefined){const cid=id(p.customer_id);patch.customer_id=cid||null;if(cid){const c=await db.from("customers").select("id,name,primary_whatsapp_e164").eq("id",cid).maybeSingle();if(c.error)throw c.error;if(!c.data)return {error:"customer_not_found",status:404};patch.customer_snapshot={...(o.customer_snapshot||{}),customer_id:cid,name:c.data.name,phone_e164:c.data.primary_whatsapp_e164||o.phone_e164||null};const a=await db.from("customer_addresses").select("*").eq("customer_id",cid).eq("is_active",true).order("is_default",{ascending:false}).limit(1).maybeSingle();if(a.error)throw a.error;if(a.data)patch.delivery_address={...(o.delivery_address||{}),source_customer_id:cid,customer_name:c.data.name,phone:c.data.primary_whatsapp_e164||o.phone_e164||null,street:a.data.street,number:a.data.number,complement:a.data.complement,district:a.data.neighborhood,city:a.data.city,state:a.data.state,postal_code:a.data.postal_code,google_maps_url:a.data.google_maps_url,block:a.data.block}}}
  if(p?.customer_snapshot!==undefined){const s=p.customer_snapshot&&typeof p.customer_snapshot==="object"?p.customer_snapshot:{},cid=id(s.id);if(cid){patch.customer_id=cid;patch.customer_snapshot={...(o.customer_snapshot||{}),customer_id:cid,name:tx(s.display_name,180),phone_e164:tx(s.phone,40)};const a=s.address&&typeof s.address==="object"?s.address:{};patch.delivery_address={...(o.delivery_address||{}),source_customer_id:cid,customer_name:tx(s.display_name,180),phone:tx(s.phone,40),street:tx(a.street,180)||null,number:tx(a.number,40)||null,complement:tx(a.complement,140)||null,district:tx(a.neighborhood??a.district,140)||null,city:tx(a.city,120)||null,state:tx(a.state,2).toUpperCase()||null,postal_code:tx(a.postal_code,20)||null,google_maps_url:tx(a.google_maps_url,800)||null,block:tx(a.block,80)||null}}}
  const next=p?.status!==undefined?uiStatus(p.status):"";if(next){if(!transitionAllowed(cur,next))return {error:"invalid_status_transition",status:409,current_status:cur,requested_status:next};const effectiveA=patch.delivery_address??o.delivery_address??{},effectiveP=(patch.payment_method??o.payment_method)||"";if(["confirmed","processing","ready","out_for_delivery","delivered"].includes(next)){const blockers=[];if(!tx(effectiveA.customer_name??effectiveA.recipient_name,180))blockers.push("customer_required");if(!tx(effectiveA.street,180))blockers.push("delivery_street_required");if(!tx(effectiveA.number,40))blockers.push("delivery_number_required");if(!tx(effectiveA.city,120))blockers.push("delivery_city_required");if(!tx(effectiveA.state,2))blockers.push("delivery_state_required");if(!tx(effectiveP,80))blockers.push("payment_method_required");if(blockers.length)return {error:"order_operational_data_incomplete",status:409,blockers,current_status:cur,requested_status:next}}
    if(next==="processing"&&cur==="confirmed"){
      const authority=await stockAuthority();
      if(authority==="bling"){
        let approval:any=null;
        try{approval=await syncConfirmedOrderToBling(oid,tx(p?.operator,80)||"Operação")}
        catch(e){approval={attempted:true,ok:false,error:tx((e as Error)?.message||e,300)}}
        if(!approval?.ok)return {
          error:"bling_approval_required_before_separation",status:409,
          current_status:cur,requested_status:next,bling_sync:approval,
          recommended_action:"O pedido precisa estar em Aprovado / Separar no Bling antes de iniciar a separação."
        };
      }
    }
    if(next==="confirmed"&&cur==="created"){const r=await db.rpc("reserve_vitrine_order_stock_v1",{p_order_id:oid});if(r.error)throw r.error;if(r.data?.ok!==true)return {error:String(r.data?.error||"insufficient_stock"),status:409,...r.data};patch.confirmed_at=new Date().toISOString()}
    if(next==="cancelled"&&cur!=="cancelled"){const r=await db.rpc("release_vitrine_order_stock_v1",{p_order_id:oid});if(r.error)throw r.error;if(r.data?.ok===false)return {error:String(r.data?.error||"stock_release_failed"),status:409};patch.cancelled_at=new Date().toISOString()}
    if(next==="out_for_delivery"&&cur==="ready"){const ret=await db.from("order_delivery_return_cases").select("id,status").eq("order_id",oid).eq("status","returned_review").limit(1).maybeSingle();if(ret.error)throw ret.error;if(ret.data?.id)return {error:"delivery_return_review_open",status:409,delivery_return_case_id:ret.data.id};const h=await hub("fiscal_dispatch_gate",{source_order_id:oid});if(h.error)return {error:"fiscal_dispatch_gate_unavailable",status:h.status||503,detail:h.detail||null};if(h.data?.allowed!==true)return {error:"fiscal_dispatch_not_authorized",status:409,fiscal_dispatch_gate:h.data};const authority=await stockAuthority();if(authority==="bling"){const snap=await buildSnapshot(oid,"dispatch_physical_stock");const launch=await hub("ops2_launch_physical_stock",{payload:snap});if(launch.error)return {error:launch.error||"physical_stock_launch_failed",status:launch.status||409,detail:launch.detail||launch.data||null}}}
    if(next==="delivered"){if(cur!=="out_for_delivery")return {error:"order_not_in_delivery",status:409};const ret=await db.from("order_delivery_return_cases").select("id,status").eq("order_id",oid).in("status",["returning","returned_review"]).limit(1).maybeSingle();if(ret.error)throw ret.error;if(ret.data?.id)return {error:"delivery_return_open",status:409,delivery_return_case_id:ret.data.id};const pay=await db.from("order_payment_settlements").select("id,status,source,expected_total_cents,captured_total_cents").eq("order_id",oid).in("status",["captured","synced","needs_review"]).limit(1).maybeSingle();if(pay.error)throw pay.error;if(!pay.data?.id||pay.data.source!=="delivery")return {error:"delivery_payment_required",status:409};const expected=Math.round(Number(o.total||0)*100);if(Number(pay.data.expected_total_cents)!==expected||Number(pay.data.captured_total_cents)!==expected)return {error:"delivery_payment_mismatch",status:409};patch.delivered_at=new Date().toISOString()}patch.status=next;
  }
  const u=await db.from("orders").update(patch).eq("id",oid).select("id,updated_at").single();if(u.error)throw u.error;
  if(next&&next!==cur)await opsEvent("order.status_changed","Pedido alterado de "+cur+" para "+next+".","order",oid,{from:cur,to:next,source:o.source||null},tx(p?.operator,80)||"Operação","human","dona_antonia","order-status:"+oid+":"+next+":"+String(u.data.updated_at));
  if(next&&next!==cur&&["ready","out_for_delivery","delivered","cancelled"].includes(next)){try{await db.rpc("ops_sync_delivery_stop_v1",{p_order_id:oid,p_order_status:next})}catch{}}

  let print_queued:null|boolean=null,bling_sync:any=null,bling_completion:any=null;
  if(next==="confirmed"&&cur==="created"){
    print_queued=await enqueuePickingPrint(oid,o,String(patch.confirmed_at||u.data.updated_at));
    try{bling_sync=await syncConfirmedOrderToBling(oid,tx(p?.operator,80)||"Operação")}
    catch(e){bling_sync={attempted:true,ok:false,error:tx((e as Error)?.message||e,300)}}
  }else if((p?.customer_id!==undefined||p?.customer_snapshot!==undefined)&&["confirmed","processing"].includes(next||cur)){
    try{bling_sync=await syncConfirmedOrderToBling(oid,tx(p?.operator,80)||"Operação")}
    catch(e){bling_sync={attempted:true,ok:false,error:tx((e as Error)?.message||e,300)}}
  }

  if(next==="cancelled"&&cur!=="cancelled")await cancelPendingPrints(oid);

  if(next==="delivered"){
    try{await hub("fiscal_status",{source_order_id:oid})}catch{}
    try{
      const h=await hub("ops2_ensure_delivered_attended",{source_order_id:oid});
      if(h.error){
        await db.from("orders").update({sync_status:"review_bling",updated_at:new Date().toISOString()}).eq("id",oid);
        try{await db.rpc("ops_open_attention_v1",{
          p_type:"order_bling_attended_failed",
          p_summary:"Entrega concluída, mas o pedido ainda não foi confirmado como Atendido no Bling.",
          p_entity_type:"order",p_entity_id:oid,p_correlation_id:oid,p_priority:"high",p_owner_role:"supervisor",
          p_recommended_action:"Não refaça a baixa de estoque. O sistema tentará novamente automaticamente.",
          p_evidence:{error:h.error,status:h.status||null,detail:h.data||h.detail||null},
          p_source_system:"bling",p_idempotency_key:"ops2:order_bling_attended:"+oid,p_due_at:null
        })}catch{}
        bling_completion={attempted:true,ok:false,error:h.error,status:h.status||409,recovery_scheduled:true};
        await opsEvent("order.bling_attended_pending","Entrega concluída; fechamento como Atendido no Bling entrou em recuperação automática.","order",oid,{bling_completion},tx(p?.operator,80)||"Operação","automation","bling","order-bling-attended-pending:"+oid);
      }else{
        bling_completion={attempted:true,ok:true,result:h.data};
        await opsEvent("order.bling_attended","Pedido entregue confirmado como Atendido no Bling.","order",oid,{bling_completion},tx(p?.operator,80)||"Operação","automation","bling","order-bling-attended:"+oid);
      }
    }catch(e){
      await db.from("orders").update({sync_status:"review_bling",updated_at:new Date().toISOString()}).eq("id",oid);
      bling_completion={attempted:true,ok:false,error:tx((e as Error)?.message||e,300),recovery_scheduled:true};
    }
  }else if(next==="cancelled"){
    try{await hub("fiscal_status",{source_order_id:oid})}catch{}
  }

  return {order_id:oid,history_synced:true,print_queued,bling_sync,bling_completion};
}
async function buildSnapshot(oid:string,reason="first_separation"){
  const oq=await db.from("orders").select("*").eq("id",oid).maybeSingle();if(oq.error)throw oq.error;if(!oq.data)throw new Error("order_not_found");const iq=await db.from("order_items").select("*").eq("order_id",oid).order("created_at");if(iq.error)throw iq.error;const rows=iq.data||[],pids=[...new Set(rows.map((z:any)=>z.product_id).filter(Boolean))],pm=new Map<string,any>();
  if(pids.length){const pq=await db.from("products").select("id,sku,gtin,name").in("id",pids);if(pq.error)throw pq.error;for(const p of pq.data||[])pm.set(p.id,p)}
  const grouped=new Map<string,any>();for(const it of rows){if(!it.product_id)continue;const im=meta(it.metadata),p=pm.get(it.product_id),unit=im.history_kind==="basket_component"&&Number.isFinite(Number(im.unit_price_cents))?Math.round(Number(im.unit_price_cents)):Math.round(Number(it.unit_price||0)*100),qty=Number(it.quantity||0);if(qty<=0)continue;const k=it.product_id+"|"+unit,old=grouped.get(k);if(old)old.quantity=Math.round((old.quantity+qty)*1000)/1000;else grouped.set(k,{product_id:it.product_id,sku:it.sku_snapshot||p?.sku||"",gtin:p?.gtin||"",name:it.name_snapshot||p?.name||"Produto",quantity:qty,unit_price_cents:unit,source_kind:im.history_kind==="basket_component"?"basket_component":"product"})}
  const items=[...grouped.values()],individual=items.reduce((s:number,z:any)=>s+Math.round(Number(z.quantity)*Number(z.unit_price_cents)),0),total=Math.round(Number(oq.data.total||0)*100),rm=await reservationRows([oid]),pay=paySnap(oq.data,rm.get(oid)||[]),d=oq.data.delivery_address||{},c=oq.data.customer_snapshot||{};
  return {source_order_id:oid,order_number:oq.data.order_number||"",status:uiStatus(oq.data.status),created_at:oq.data.created_at,queue_reason:reason,issues:[],customer:{source_customer_id:oq.data.customer_id||d.source_customer_id||c.customer_id||null,name:c.name||d.customer_name||d.recipient_name||""},delivery:d,payment:pay,items,totals:{individual_products_cents:individual,commercial_order_cents:total,commercial_delta_cents:total-individual}};
}
async function previewOrder(oid:string){const s=await buildSnapshot(oid,"first_separation"),h=await hub("preview_order_sync",{payload:s});return h.error?{error:h.error,status:h.status,detail:h.detail}:h.data}
async function queueOrder(oid:string,reason:string){const s=await buildSnapshot(oid,reason),bytes=new TextEncoder().encode(JSON.stringify(s)),hash=await crypto.subtle.digest("SHA-256",bytes),dig=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,24);return await hub("enqueue_job",{domain:"order",operation:"sync_order",source_id:oid,idempotency_key:"vitrine_canonical:order:"+oid+":v1:"+dig,payload:{...s,queue_reason:reason,queued_at:new Date().toISOString()}})}
async function consumeOrder(p:any){
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};
  const g=await guardOrder(oid);if(g.error)return g;
  const o=await db.from("orders").select("status,updated_at").eq("id",oid).maybeSingle();
  if(o.error)throw o.error;if(!o.data)return {error:"order_not_found",status:404};
  const st=uiStatus(o.data.status);
  if(!["confirmed","processing"].includes(st))return {error:"order_not_ready_for_separation",status:409,current_status:st};

  const authority=await stockAuthority();
  let bling_sync:any=null;
  if(authority==="bling"){
    try{bling_sync=await syncConfirmedOrderToBling(oid,tx(p?.operator,80)||"Operação")}
    catch(e){bling_sync={attempted:true,ok:false,error:tx((e as Error)?.message||e,300)}}
    if(!bling_sync?.ok){
      return {
        error:"bling_approval_required_before_separation",status:409,
        current_status:st,bling_sync,
        recommended_action:"Aguarde a recuperação automática do Bling e tente iniciar a separação novamente."
      };
    }
  }

  const x=await db.rpc("consume_vitrine_order_stock_v1",{p_order_id:oid});
  if(x.error)throw x.error;
  if(x.data?.ok!==true)return {error:String(x.data?.error||"stock_consume_failed"),status:409,...x.data};

  const blingAuthority=authority==="bling"||x.data?.status==="bling_authority"||x.data?.local_consume_skipped===true;
  let queued=false;
  if(blingAuthority){
    queued=Boolean(bling_sync?.ok);
  }else{
    try{const q=await queueOrder(oid,"first_separation");queued=!q.error}catch{}
  }

  if(blingAuthority){
    await opsEvent(
      "order.separation_started",
      "Separação iniciada sob autoridade de estoque Bling; nenhuma baixa local foi executada.",
      "order",oid,
      {stock_status:"bling_authority",bling_order_synced:queued,legacy_stock_model:false,local_consume_skipped:true},
      tx(p?.operator,80)||"Operação","human","dona_antonia",
      "order-separation:"+oid+":"+String(o.data.updated_at)
    );
  }else if(!x.data?.already_consumed){
    await opsEvent(
      "order.separation_started",
      "Separação iniciada e estoque local consumido no fluxo legado.",
      "order",oid,
      {stock_status:"consumed",bling_order_queued:queued,legacy_stock_model:true},
      tx(p?.operator,80)||"Operação","human","dona_antonia",
      "order-separation:"+oid+":"+String(o.data.updated_at)
    );
  }
  return {
    order_id:oid,
    stock_status:blingAuthority?"bling_authority":"consumed",
    already_consumed:Boolean(x.data?.already_consumed),
    local_consume_skipped:Boolean(x.data?.local_consume_skipped),
    history_synced:true,
    bling_order_queued:queued,
    bling_sync
  };
}
async function orderShortages(){const rows=await ordersList(),open=rows.filter((o:any)=>["created","confirmed","processing"].includes(o.status)&&o.stock_readiness?.ok===false),m=new Map<string,any>();for(const o of open)for(const s of o.stock_readiness?.shortages||[]){const z=m.get(s.product_id)||{...s,pending_orders:0,order_numbers:[],shortage:0};z.pending_orders++;z.order_numbers.push(String(o.order_number||o.id).slice(-8));z.shortage=Math.max(z.shortage,Number(s.shortage||0));m.set(s.product_id,z)}const products=[...m.values()].sort((a:any,b:any)=>b.shortage-a.shortage);return {products,summary:{products:products.length,shortage_units:products.reduce((s:number,z:any)=>s+Number(z.shortage||0),0),pending_orders:open.length}}}
async function closureOrders(){const c=await cutover(),q=await db.from("orders").select("*").in("source",OP_SOURCES).eq("status","delivered").gte("created_at",c.live_orders_since).order("delivered_at",{ascending:false}).limit(60);if(q.error)throw q.error;const orders=await mapOrders(q.data||[]),h=await hub("fiscal_pending_orders",{limit:5000}),fb:any={};for(const z of h.error?[]:(h.data?.orders||[])){if(z.source_order_id)fb[z.source_order_id]=z}return {orders,fiscal_by_order:fb,pending_count:Object.keys(fb).length,pending_lookup_ok:!h.error,pending_lookup_truncated:Boolean(h.data?.truncated)}}
async function reconcileCatalog(){const q=await db.from("products").select("id,sku,gtin,name").eq("is_active",true).limit(5000);if(q.error)throw q.error;return await hub("reconcile_product_catalog_readonly",{items:(q.data||[]).map((p:any)=>({source_id:p.id,sku:p.sku||"",gtin:p.gtin||"",name:p.name||""}))})}
async function reconcileDeps(oid:string){const s=await buildSnapshot(oid),cid=id(s.customer?.source_customer_id);let cr:any=null;if(cid){const h=await hub("reconcile_customer_readonly",{customer_id:cid});cr=h.error?{ok:false,error:h.error}:h.data}const seen=new Set<string>(),items:any[]=[];for(const z of s.items){if(z.product_id&&!seen.has(z.product_id)){seen.add(z.product_id);items.push({source_id:z.product_id,sku:z.sku||"",gtin:z.gtin||"",name:z.name||""})}}let pr:any=null;if(items.length){const h=await hub("reconcile_products_readonly",{items});pr=h.error?{ok:false,error:h.error}:h.data}const pv=await previewOrder(oid);return {order_id:oid,customer_reconcile:cr,product_reconcile:pr,preview:pv,external_write:false}}
async function ensureOrderCustomer(oid:string){const s=await buildSnapshot(oid),cid=id(s.customer?.source_customer_id);if(!cid)return {error:"customer_not_linked",status:409};const b:any=await previewOrder(oid);if(b.error)return b;if(!(b.write_blockers||[]).includes("customer_missing_bling_contact_id"))return {order_id:oid,customer_id:cid,requested:false,preview:b};const h=await hub("ensure_customer_now",{customer_id:cid});if(h.error)return {error:h.error,status:h.status,detail:h.detail};return {order_id:oid,customer_id:cid,requested:true,customer_sync:h.data,preview:await previewOrder(oid)}}
async function createOrderProducts(oid:string){const before:any=await previewOrder(oid);if(before.error)return before;const unresolved=(before.unresolved_products||[]).filter((z:any)=>z.reason==="product_not_linked"&&id(z.product_id)),ids=[...new Set(unresolved.map((z:any)=>id(z.product_id)))];if(!ids.length)return {order_id:oid,queued:0,processed:null,preview:before};const q=await db.from("products").select("*").in("id",ids);if(q.error)throw q.error;const jobs=(q.data||[]).map((p:any)=>({domain:"product",operation:"create_product",source_id:p.id,idempotency_key:"vitrine_canonical:product:create:"+p.id+":"+String(p.updated_at),payload:{product:{id:p.id,sku:p.sku||"",gtin:p.gtin||"",name:p.name||"",description:p.description_short||p.description_long||"",active:p.is_active!==false,sale_price_cents:Math.round(Number(p.price||0)*100),stock_quantity:Number(p.stock||0),image_url:p.image_url||"",metadata:p.metadata||{},expiration_date:p.validity_date||null},requested_from:"order_preflight",source_order_id:oid}}));const h=await hub("enqueue_jobs",{jobs});if(h.error)return {error:h.error,status:h.status,detail:h.detail};let processed:any=null;try{const run=await hub("process_product_jobs",{limit:Math.min(10,jobs.length)});if(!run.error)processed=run.data}catch{}return {order_id:oid,queued:Number(h.data?.queued||jobs.length),processed,preview:await previewOrder(oid)}}

async function sha256Hex(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}

async function opsEvent(event_type:string,summary:string,entity_type:string|null,entity_id:string|null,payload:any={},actor_label="Sistema",actor_type="system",source_system="dona_antonia",idempotency_key:string|null=null){
  try{
    await db.rpc("ops_record_event_v1",{
      p_domain:entity_type==="order"?"order":entity_type==="product"?"inventory":"operations",
      p_event_type:event_type,p_summary:summary,p_actor_type:actor_type,
      p_entity_type:entity_type,p_entity_id:entity_id,p_correlation_id:entity_id,
      p_actor_id:null,p_actor_label:actor_label,p_source_system:source_system,p_severity:"info",
      p_payload:payload&&typeof payload==="object"?payload:{},p_external_ref:null,
      p_idempotency_key:idempotency_key,p_occurred_at:new Date().toISOString()
    });
  }catch(e){console.error("ops_event_failed",event_type,String((e as Error)?.message||e))}
}

async function blingOauthBegin(auth:any){
  if(auth?.role!=="owner")return {error:"owner_required",status:403};
  const creds=await db.rpc("get_bling_api_credentials_v1");
  if(creds.error)return {error:"credentials_lookup_failed",status:500};
  const clientId=tx(creds.data?.client_id,500);
  if(!clientId)return {error:"bling_client_id_missing",status:409};
  const state=crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");
  const hash=await sha256Hex(state),expires=new Date(Date.now()+10*60*1000).toISOString();
  const saved=await db.rpc("merge_bling_hub_runtime_metadata_v2",{p_patch:{oauth_exchange_v1:{
    expires_at:expires,consumed_at:null,last_result:"pending",nonce_sha256:hash
  }}});
  if(saved.error)return {error:"oauth_state_persist_failed",status:500};
  const url=new URL("https://www.bling.com.br/Api/v3/oauth/authorize");
  url.searchParams.set("response_type","code");url.searchParams.set("client_id",clientId);url.searchParams.set("state",state);
  return {ok:true,authorization_url:url.toString(),expires_at:expires,redirect_url:"https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1"};
}

async function blingStatusCatalogProbe(auth:any){
  if(auth?.role!=="owner")return {error:"owner_required",status:403};
  const h=await hub("order_status_catalog");
  if(h.error){
    try{
      await db.rpc("ops_open_attention_v1",{
        p_type:"bling_scope_missing",
        p_summary:"Bling ainda não permite automatizar situações dos pedidos.",
        p_entity_type:"integration",p_entity_id:"bling",p_correlation_id:null,
        p_priority:"high",p_owner_role:"owner",
        p_recommended_action:"Reautorizar a integração Bling com acesso ao recurso Situações/Módulos e testar novamente.",
        p_evidence:{error:h.error,status:h.status||null,detail:h.detail||null},
        p_source_system:"bling",p_idempotency_key:"ops2:attention:bling_status_scope",p_due_at:null
      });
    }catch{}
    return {error:h.error,status:h.status||502,detail:h.detail||null};
  }
  const result=h.data||{};
  try{
    const q=await db.from("ops_attention").select("id").eq("idempotency_key","ops2:attention:bling_status_scope").in("status",["open","acknowledged"]).maybeSingle();
    if(!q.error&&q.data?.id)await db.rpc("ops_resolve_attention_v1",{p_attention_id:q.data.id,p_resolution:"Permissão Situações/Módulos homologada no Bling.",p_resolution_ref:"bling:order_status_catalog"});
    await db.rpc("ops_record_event_v1",{
      p_domain:"integration",p_event_type:"bling.order_status_catalog_verified",
      p_summary:"Permissão de Situações/Módulos do Bling homologada.",p_actor_type:"human",
      p_entity_type:"integration",p_entity_id:"bling",p_correlation_id:null,p_actor_id:auth?.user_id||null,
      p_actor_label:"Owner",p_source_system:"bling",p_severity:"info",p_payload:result,
      p_external_ref:null,p_idempotency_key:"ops2:bling_status_catalog_verified:v1",p_occurred_at:new Date().toISOString()
    });
  }catch{}
  return {ok:true,catalog:result};
}

async function opsAttention(limitRaw:any){
  const limit=Math.max(1,Math.min(50,Number(limitRaw||20)||20));
  const r=await db.from("ops_attention")
    .select("id,type,entity_type,entity_id,priority,owner_role,status,summary,recommended_action,evidence,opened_at,due_at")
    .in("status",["open","acknowledged"])
    .order("opened_at",{ascending:true})
    .limit(limit);
  if(r.error)throw r.error;
  const rank:any={critical:0,high:1,normal:2,low:3};
  return (r.data||[]).sort((a:any,b:any)=>(rank[a.priority]??9)-(rank[b.priority]??9)||Date.parse(a.opened_at)-Date.parse(b.opened_at));
}

async function createManualWhatsappOrder(p:any,auth:any){
  if(!["owner","admin","manager"].includes(String(auth?.role||"")))return {error:"editor_required",status:403};
  const phone=tx(p?.phone,40),payment=tx(p?.payment_method,80),items=Array.isArray(p?.items)?p.items.slice(0,80):[];
  if(!phone)return {error:"invalid_phone",status:400};
  if(!items.length)return {error:"empty_cart",status:400};
  const snapshot=p?.customer_snapshot&&typeof p.customer_snapshot==="object"?p.customer_snapshot:{};
  const delivery=p?.delivery&&typeof p.delivery==="object"?p.delivery:{};
  const q=await db.rpc("create_canonical_cart_order_v2",{
    p_source:"manual_whatsapp",p_phone:phone,p_payment_method:payment,p_items:items,
    p_customer_snapshot:snapshot,p_delivery:delivery
  });
  if(q.error){const e=tx(q.error.message,180).split("\n")[0];return {error:e||"order_failed",status:["insufficient_stock","product_unavailable","basket_unavailable","basket_product_unavailable","minimum_order"].includes(e)?409:400}}
  const oid=id(q.data?.order_id);
  if(oid){
    await opsEvent("order.received","Pedido manual do WhatsApp criado e aguardando confirmação.","order",oid,{source:"manual_whatsapp",payment_method:payment,created_by:auth?.user_id||null,reservation_on_confirmation:true},tx(p?.operator,80)||"Operação","human","dona_antonia","manual-order-received:"+oid);
  }
  return {...(q.data||{}),order_id:oid,source:"manual_whatsapp",status:"storefront_received",stock_reserved:false,reservation_timing:"on_confirmation"};
}

async function opsDeliveryRuns(){
  const r=await db.rpc("get_ops_delivery_runs_today_v1");
  if(r.error)throw r.error;
  return r.data||{};
}
async function opsDeliveryPlan(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const vehicle=tx(p?.vehicle_key,20),ids=(Array.isArray(p?.order_ids)?p.order_ids:[]).map((x:any)=>id(x)).filter(Boolean).slice(0,30);
  if(!["car_1","car_2"].includes(vehicle))return {error:"invalid_vehicle",status:400};
  if(!ids.length)return {error:"empty_route",status:400};
  const q=await db.rpc("ops_plan_delivery_run_v1",{p_vehicle_key:vehicle,p_order_ids:ids,p_operator_label:tx(p?.operator,80)||"Operação"});
  if(q.error){const m=String(q.error.message||"");if(m.includes("order_not_ready"))return {error:"order_not_ready",status:409};if(m.includes("vehicle_already_dispatched"))return {error:"vehicle_already_dispatched",status:409};if(m.includes("order_already_dispatched"))return {error:"order_already_dispatched",status:409};if(m.includes("delivery_return_review_open"))return {error:"delivery_return_review_open",status:409};if(m.includes("duplicate_order_in_route"))return {error:"duplicate_order_in_route",status:400};throw q.error}
  const runId=id(q.data);
  await opsEvent("delivery.run_planned","Rota de entrega preparada.","delivery_run",runId,{vehicle_key:vehicle,order_count:ids.length,order_ids:ids},tx(p?.operator,80)||"Operação","human","dona_antonia","delivery-run:"+runId);
  return {run_id:runId,vehicle_key:vehicle,order_count:ids.length};
}

async function opsTimeline(limitRaw:any){
  const limit=Math.max(1,Math.min(50,Number(limitRaw||20)||20));
  const r=await db.from("ops_events")
    .select("id,occurred_at,domain,event_type,entity_type,entity_id,actor_type,actor_label,source_system,severity,summary,external_ref")
    .order("occurred_at",{ascending:false})
    .limit(limit);
  if(r.error)throw r.error;
  return r.data||[];
}

async function opsPapoAiCaptureStatus(){
  const [legacy,bridge]=await Promise.all([
    db.rpc("get_papoai_webhook_capture_status_v2"),
    db.rpc("get_ops2_papoai_bridge_health_v1")
  ]);
  if(legacy.error)throw legacy.error;
  if(bridge.error)throw bridge.error;
  const a=legacy.data||{},b=bridge.data||{};
  return {
    ...a,...b,
    captured_24h:Number(b.events_24h??a.captured_24h??0),
    review_required:Number(b.events_review??a.review_required??0),
    bridge_state:b.capture_enabled===true?(b.last_error?"attention":"online"):"offline"
  };
}
async function opsPapoAiIssueCatalogLink(p:any,auth:any){
  const phone=tx(p?.phone,40);
  const conversationId=id(p?.conversation_id);
  if(!phone)return {error:"phone_required",status:400};
  const q=await db.rpc("ops2_issue_papoai_catalog_link_v1",{
    p_phone:phone,p_conversation_id:conversationId||null,
    p_source_event_key:"admin:"+String(auth?.user_id||"operator")+":"+new Date().toISOString().slice(0,16)
  });
  if(q.error)return {error:tx(q.error.message,240)||"catalog_link_failed",status:409};
  const x=q.data||{};
  return {...x,url:"https://www.donaantonia.com.br"+String(x.catalog_path||"")};
}

async function opsPrintQueue(limitRaw:any){
  const r=await db.rpc("get_ops_print_queue_v1",{p_limit:Math.max(1,Math.min(100,Number(limitRaw||30)||30))});
  if(r.error)throw r.error;
  return r.data||{};
}
async function opsPrintPresented(orderIdRaw:any){
  const oid=id(orderIdRaw);if(!oid)return {error:"invalid_order",status:400};
  const q=await db.rpc("ops_present_print_job_v1",{p_entity_type:"order",p_entity_id:oid,p_job_type:"picking"});
  if(q.error)throw q.error;
  if(Number(q.data||0)>0)await opsEvent("print.picking_presented","Lista de separação apresentada para impressão.","order",oid,{job_type:"picking",proof:"browser_print_dialog_presented"},"Operação","human","dona_antonia","print-presented:"+oid+":"+new Date().toISOString().slice(0,16));
  return {order_id:oid,presented:Number(q.data||0)};
}
async function enqueuePickingPrint(oid:string,o:any,versionKey:string){
  try{
    const q=await db.rpc("ops_enqueue_print_job_v1",{
      p_job_type:"picking",p_entity_type:"order",p_entity_id:oid,p_version_key:versionKey,
      p_printer_profile:"separation_85mm",p_copies:1,
      p_payload:{order_number:o?.order_number||null,source:o?.source||null,trigger:"order_confirmed"},
      p_source_system:"dona_antonia",p_idempotency_key:"picking:order:"+oid+":"+versionKey
    });
    if(q.error)throw q.error;
    await opsEvent("print.picking_queued","Lista de separação entrou na fila de impressão.","order",oid,{job_id:q.data,printer_profile:"separation_85mm"},"Sistema","automation","dona_antonia","print-queued:"+oid+":"+versionKey);
    return true;
  }catch(e){
    try{await db.rpc("ops_open_attention_v1",{p_type:"print_queue_failed",p_summary:"Não consegui colocar a separação na fila de impressão.",p_entity_type:"order",p_entity_id:oid,p_correlation_id:oid,p_priority:"high",p_owner_role:"supervisor",p_recommended_action:"Abra o pedido e imprima a separação manualmente.",p_evidence:{error:tx((e as Error)?.message||e,300)},p_source_system:"dona_antonia",p_idempotency_key:"ops2:print_queue_failed:"+oid,p_due_at:null})}catch{}
    return false;
  }
}
async function cancelPendingPrints(oid:string){
  try{const q=await db.rpc("ops_cancel_print_jobs_for_entity_v1",{p_entity_type:"order",p_entity_id:oid,p_reason:"order_cancelled"});if(q.error)throw q.error;return Number(q.data||0)}catch{return 0}
}

async function opsShadowReadiness(){
  const r=await db.rpc("get_ops2_order_shadow_readiness_v1");
  if(r.error)throw r.error;
  return r.data||{};
}

async function opsSummary(){
  const r=await db.rpc("get_ops_control_tower_summary_v1");
  if(r.error)throw r.error;
  return r.data||{};
}


const INVENTORY_SHEET_CARDS_PER_PAGE=25;
function inventorySheetDayCode(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Cuiaba",year:"2-digit",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/-/g,"")}
function inventorySheetOutputText(data:any){return Array.isArray(data?.output)?data.output.flatMap((x:any)=>Array.isArray(x?.content)?x.content:[]).filter((x:any)=>x?.type==="output_text").map((x:any)=>String(x?.text||"")).join("").trim():""}
async function inventorySheetOpenAiKey(){let key=Deno.env.get("OPENAI_API_KEY")||"";if(!key){try{const q=await db.rpc("get_conversation_worker_provider_secret_v1");if(typeof q.data==="string")key=q.data}catch{}}return key}

function inventorySheetCanonicalCategory(v:any){
  const raw=tx(v,120);
  if(!raw)return "";
  const norm=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
  const aliases:any={
    "mercearia":"mercearia",
    "alimentos":"mercearia",
    "alimentos e bebidas":"mercearia",
    "bebidas":"mercearia",
    "higiene e beleza":"higiene_beleza",
    "higiene_beleza":"higiene_beleza",
    "limpeza e descartaveis":"limpeza_lavanderia",
    "limpeza e lavanderia":"limpeza_lavanderia",
    "limpeza_lavanderia":"limpeza_lavanderia",
    "casa e pet":"casa_pet",
    "casa_pet":"casa_pet",
    "pets":"casa_pet"
  };
  return aliases[norm]||raw;
}

async function inventorySheetQueryProducts(filters:any){
  const rows:any[]=[];
  const qv=tx(filters?.q,100).replace(/[,()%]/g," ");
  const category=tx(filters?.category,120),subcategory=tx(filters?.subcategory,120),active=String(filters?.active??"true");
  const categories=[...new Set((Array.isArray(filters?.categories)?filters.categories:[]).map((x:any)=>tx(x,120)).filter(Boolean))].slice(0,50);
  const gondolas=[...new Set((Array.isArray(filters?.gondolas)?filters.gondolas:[]).map((x:any)=>tx(x,20)).filter((x:string)=>/^\d{1,4}$/.test(x)))].slice(0,100);
  for(let offset=0;offset<5000;offset+=1000){
    let q=db.from("products").select("id,name,sku,gtin,image_url,validity_date,is_active,sales_category,storefront_category,category,subcategory,gondola").order("name").range(offset,offset+999);
    if(!categories.length&&category)q=q.or("sales_category.eq."+category+",storefront_category.eq."+category+",category.eq."+category);
    if(subcategory)q=q.eq("subcategory",subcategory);
    if(active==="true")q=q.eq("is_active",true);
    if(active==="false")q=q.eq("is_active",false);
    if(qv)q=q.or("name.ilike.%"+qv+"%,gtin.ilike.%"+qv+"%,sku.ilike.%"+qv+"%");
    const r=await q;if(r.error)throw r.error;
    rows.push(...(r.data||[]));if((r.data||[]).length<1000)break;
  }
  let filtered=rows;
  if(categories.length){
    const wanted=new Set(categories.map((x:string)=>inventorySheetCanonicalCategory(x)));
    filtered=filtered.filter((x:any)=>wanted.has(inventorySheetCanonicalCategory(x.sales_category||x.storefront_category||x.category)));
  }
  if(gondolas.length){
    const wanted=new Set(gondolas.map((x:string)=>String(Number(x))));
    filtered=filtered.filter((x:any)=>{const raw=String(x.gondola||"").trim();return /^\d+$/.test(raw)&&wanted.has(String(Number(raw)))});
  }
  return filtered;
}

async function inventorySheetPreview(p:any){
  const products=await inventorySheetQueryProducts(p?.filters||{});
  return {product_count:products.length,page_count:Math.ceil(products.length/INVENTORY_SHEET_CARDS_PER_PAGE)};
}

async function inventorySheetOptions(){
  const all:any[]=[];
  for(let pos=0;pos<10000;pos+=1000){
    const p=await db.from("products").select("id,is_active,sales_category,storefront_category,category,gondola").eq("is_active",true).order("id").range(pos,pos+999);
    if(p.error)throw p.error;
    all.push(...(p.data||[]));
    if((p.data||[]).length<1000)break;
  }
  const categories=new Map<string,number>(),gondolas=new Map<string,number>();
  for(const x of all){
    const cat=inventorySheetCanonicalCategory(x.sales_category||x.storefront_category||x.category);
    if(cat)categories.set(cat,(categories.get(cat)||0)+1);
    const raw=String(x.gondola||"").trim();
    if(/^\d+$/.test(raw)){
      const g=String(Number(raw));
      gondolas.set(g,(gondolas.get(g)||0)+1);
    }
  }
  return {
    categories:[...categories].map(([value,count])=>({value,count,page_count:Math.ceil(count/INVENTORY_SHEET_CARDS_PER_PAGE)})).filter(x=>x.count>0).sort((a,b)=>a.value.localeCompare(b.value,"pt-BR")),
    gondolas:[...gondolas].map(([value,count])=>({value,count,page_count:Math.ceil(count/INVENTORY_SHEET_CARDS_PER_PAGE)})).filter(x=>x.count>0).sort((a,b)=>Number(a.value)-Number(b.value))
  };
}
async function inventorySheetBatches(){
  const q=await db.from("inventory_sheet_batches")
    .select("id,batch_code,product_count,page_count,cards_per_page,status,operator_label,created_at,completed_at")
    .neq("status","cancelled").order("created_at",{ascending:false}).limit(30);
  if(q.error)throw q.error;
  return {batches:(q.data||[]).map((x:any)=>({
    id:x.id,batch_code:x.batch_code,product_count:Number(x.product_count||0),page_count:Number(x.page_count||0),
    cards_per_page:Number(x.cards_per_page||25),status:x.status,operator_label:x.operator_label||null,
    created_at:x.created_at,completed_at:x.completed_at||null
  }))};
}

function inventorySheetParseToken(v:any){
  const raw=tx(v,100).toUpperCase();
  const m=raw.match(/^DA_BAL1\|(BAL-[A-Z0-9-]{6,40})\|(\d{1,5})$/);
  if(!m)return null;
  const page=Number(m[2]);
  return Number.isInteger(page)&&page>=1?{raw,batch_code:m[1],page_number:page}:null;
}

async function inventorySheetManifest(p:any){
  const token=inventorySheetParseToken(p?.sheet_token);
  if(!token)return {error:"invalid_sheet_qr",status:400};
  const b=await db.from("inventory_sheet_batches")
    .select("id,batch_code,product_count,page_count,cards_per_page,status")
    .eq("batch_code",token.batch_code).maybeSingle();
  if(b.error)throw b.error;
  if(!b.data)return {error:"sheet_batch_not_found",status:404,batch_code:token.batch_code,page_number:token.page_number};
  if(token.page_number>Number(b.data.page_count))return {error:"sheet_page_out_of_range",status:422,batch_code:token.batch_code,page_number:token.page_number};
  const cards=Math.max(1,Number(b.data.cards_per_page||25));
  const before=(token.page_number-1)*cards;
  const slotCount=Math.max(0,Math.min(cards,Number(b.data.product_count||0)-before));
  const [latest,total]=await Promise.all([
    db.from("inventory_sheet_page_scans")
      .select("id,status,uploaded_by,created_at,applied_at")
      .eq("batch_id",b.data.id).eq("page_number",token.page_number)
      .order("created_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("inventory_sheet_page_scans")
      .select("id",{count:"exact",head:true})
      .eq("batch_id",b.data.id).eq("page_number",token.page_number)
  ]);
  if(latest.error)throw latest.error;if(total.error)throw total.error;
  return {
    sheet_token:token.raw,batch_code:token.batch_code,page_number:token.page_number,page_count:Number(b.data.page_count||0),
    product_count:Number(b.data.product_count||0),cards_per_page:cards,slot_count:slotCount,batch_status:b.data.status,
    already_uploaded:Boolean(latest.data),can_retry:true,repeat_reading_allowed:true,
    previous_scan_count:Number(total.count||0),existing_scan:latest.data||null
  };
}

async function inventorySheetCreate(p:any,auth:any){
  const products=await inventorySheetQueryProducts(p?.filters||{});
  if(!products.length)return {error:"no_products",status:404};
  const rnd=[...crypto.getRandomValues(new Uint8Array(3))].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
  const batchCode="BAL-"+inventorySheetDayCode()+"-"+rnd,pageCount=Math.ceil(products.length/INVENTORY_SHEET_CARDS_PER_PAGE);
  const b=await db.from("inventory_sheet_batches").insert({
    batch_code:batchCode,created_by:auth.user_id,operator_label:tx(p?.operator,80)||null,filters:p?.filters||{},
    product_count:products.length,page_count:pageCount,cards_per_page:INVENTORY_SHEET_CARDS_PER_PAGE
  }).select("*").single();
  if(b.error)throw b.error;
  const items=products.map((x:any,index:number)=>({
    batch_id:b.data.id,page_number:Math.floor(index/INVENTORY_SHEET_CARDS_PER_PAGE)+1,slot_number:(index%INVENTORY_SHEET_CARDS_PER_PAGE)+1,
    printed_index:index+1,product_id:x.id,product_name_snapshot:x.name||"",gtin_snapshot:dg(x.gtin)||null,
    expiration_date_snapshot:x.validity_date||null,image_url_snapshot:x.image_url||null
  }));
  for(let i=0;i<items.length;i+=400){const r=await db.from("inventory_sheet_items").insert(items.slice(i,i+400));if(r.error){await db.from("inventory_sheet_batches").delete().eq("id",b.data.id);throw r.error}}
  return {batch:{id:b.data.id,batch_code:batchCode,product_count:products.length,page_count:pageCount,cards_per_page:INVENTORY_SHEET_CARDS_PER_PAGE},
    items:items.map((x:any)=>({page_number:x.page_number,slot_number:x.slot_number,printed_index:x.printed_index,product_id:x.product_id,name:x.product_name_snapshot,gtin:x.gtin_snapshot||"",expiration_date:x.expiration_date_snapshot,image_url:x.image_url_snapshot||""}))};
}

const INVENTORY_SHEET_FALLBACK_SCHEMA:any={
  type:"object",additionalProperties:false,
  properties:{
    items:{type:"array",maxItems:50,items:{type:"object",additionalProperties:false,properties:{
      slot_number:{type:"integer",minimum:1,maximum:25},
      field:{type:"string",enum:["quantity","gondola"]},
      value:{type:["integer","null"],minimum:0,maximum:100000},
      confidence:{type:"number",minimum:0,maximum:1},
      ambiguous:{type:"boolean"},
      note:{type:"string"}
    },required:["slot_number","field","value","confidence","ambiguous","note"]}}
  },
  required:["items"]
};


const INVENTORY_SHEET_PAGE_FALLBACK_SCHEMA:any={
  type:"object",additionalProperties:false,
  properties:{
    items:{type:"array",maxItems:25,items:{type:"object",additionalProperties:false,properties:{
      slot_number:{type:"integer",minimum:1,maximum:25},
      quantity:{type:["integer","null"],minimum:0,maximum:100000},
      gondola:{type:["integer","null"],minimum:1,maximum:9999},
      quantity_confidence:{type:"number",minimum:0,maximum:1},
      gondola_confidence:{type:"number",minimum:0,maximum:1},
      ambiguous_quantity:{type:"boolean"},
      ambiguous_gondola:{type:"boolean"},
      note:{type:"string"}
    },required:["slot_number","quantity","gondola","quantity_confidence","gondola_confidence","ambiguous_quantity","ambiguous_gondola","note"]}}
  },
  required:["items"]
};

async function inventorySheetPageFallbackVision(imageDataUrl:string,expectedCount:number){
  const image=String(imageDataUrl||"");
  if(!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image)||image.length>4500000)return {parsed:{items:[]},model:null,response_id:null,error:"invalid_page_image"};
  const key=await inventorySheetOpenAiKey();
  if(!key)return {error:"openai_not_configured",status:503,parsed:{items:[]}};
  const models=[tx(Deno.env.get("INVENTORY_SHEET_FALLBACK_MODEL"),80)||tx(Deno.env.get("INVENTORY_SHEET_VISION_MODEL"),80)||"gpt-6-sol","gpt-5.6-sol"];
  let last:any=null;
  for(const model of [...new Set(models)]){
    try{
      const res=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({
        model,store:false,max_output_tokens:5000,reasoning:{effort:"medium"},
        instructions:[
          "Você lê somente os números manuscritos de uma folha A4 de balanço físico.",
          "A folha tem uma grade fixa 5x5, no máximo 25 cards, em ordem esquerda→direita e cima→baixo.",
          "Cada card possui dois campos manuscritos na parte inferior: ESTOQUE à esquerda e GÔNDOLA à direita.",
          "Não identifique o produto por nome, foto, EAN ou REF. O produto já é determinado pela posição do card.",
          "slot_number 1 é o card superior esquerdo; 5 é o superior direito; 6 começa a segunda linha.",
          "Leia quantity somente do campo ESTOQUE e gondola somente do campo GÔNDOLA.",
          "Zeros manuscritos são valores válidos. Não confunda bordas impressas com dígitos.",
          "Se um número estiver realmente ilegível, use null/ambiguous=true. Não invente.",
          "A imagem pode ter perspectiva, sombra ou leve inclinação. Use a grade impressa como referência.",
          "Retorne até "+Math.max(1,Math.min(25,Number(expectedCount||25)))+" slots."
        ].join(" "),
        input:[{role:"user",content:[
          {type:"input_text",text:"Leia os campos ESTOQUE e GÔNDOLA de cada card pela posição na grade."},
          {type:"input_image",image_url:image,detail:"high"}
        ]}],
        text:{format:{type:"json_schema",name:"inventory_sheet_page_numeric_fallback",strict:true,schema:INVENTORY_SHEET_PAGE_FALLBACK_SCHEMA}}
      }),signal:AbortSignal.timeout(120000)});
      const data=await res.json().catch(()=>({}));
      if(!res.ok){last={error:"openai_page_http_"+res.status,status:502,detail:tx(data?.error?.message||data?.error,500),model,parsed:{items:[]}};if([400,403,404].includes(res.status))continue;return last}
      const out=inventorySheetOutputText(data);if(!out)return {error:"openai_page_empty_output",status:502,model,parsed:{items:[]}};
      let parsed:any;try{parsed=JSON.parse(out)}catch{return {error:"openai_page_invalid_json",status:502,model,parsed:{items:[]}}}
      return {parsed,response_id:data?.id||null,model,usage:data?.usage||null};
    }catch(e){last={error:"openai_page_request_failed",status:502,detail:tx((e as Error)?.message,300),model,parsed:{items:[]}}}
  }
  return last||{error:"openai_page_failed",status:502,parsed:{items:[]}};
}

function inventorySheetMergePageFallback(fieldItems:any[],pageItems:any[]){
  const out=[...(Array.isArray(fieldItems)?fieldItems:[])];
  const byKey=new Map<string,any>();
  for(const x of out){
    const slot=Number(x?.slot_number),field=tx(x?.field,20);
    if(Number.isInteger(slot)&&["quantity","gondola"].includes(field))byKey.set(slot+":"+field,x);
  }
  for(const p of Array.isArray(pageItems)?pageItems:[]){
    const slot=Number(p?.slot_number);if(!Number.isInteger(slot)||slot<1||slot>25)continue;
    for(const field of ["quantity","gondola"]){
      const key=slot+":"+field,existing=byKey.get(key);
      const exValid=existing&&existing.value!=null&&existing.ambiguous!==true&&Number(existing.confidence||0)>=0.92;
      if(exValid)continue;
      const value=p?.[field],confidence=Number(p?.[field+"_confidence"]||0),ambiguous=p?.["ambiguous_"+field]===true;
      const row={slot_number:slot,field,value:value==null?null:Number(value),confidence,ambiguous,note:tx(p?.note,160),source:"page_ai_fallback"};
      const idx=out.findIndex((x:any)=>Number(x?.slot_number)===slot&&tx(x?.field,20)===field);
      if(idx>=0)out[idx]=row;else out.push(row);
      byKey.set(key,row);
    }
  }
  return out;
}

async function inventorySheetFallbackVision(fields:any[]){
  const safe=(Array.isArray(fields)?fields:[]).slice(0,50).map((x:any)=>({
    slot_number:Number(x?.slot_number),field:tx(x?.field,20),
    image_data_url:String(x?.image_data_url||"")
  })).filter((x:any)=>Number.isInteger(x.slot_number)&&x.slot_number>=1&&x.slot_number<=25&&["quantity","gondola"].includes(x.field)&&/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(x.image_data_url)&&x.image_data_url.length<=900000);
  if(!safe.length)return {parsed:{items:[]},model:null,response_id:null};
  const key=await inventorySheetOpenAiKey();
  if(!key)return {error:"openai_not_configured",status:503,parsed:{items:[]}};
  const models=[tx(Deno.env.get("INVENTORY_SHEET_FALLBACK_MODEL"),80)||tx(Deno.env.get("INVENTORY_SHEET_VISION_MODEL"),80)||"gpt-6-sol","gpt-5.6-sol"];
  const content:any[]=[{type:"input_text",text:"Leia apenas os números manuscritos dos recortes a seguir. Cada recorte já está associado a um slot e a um campo. Não identifique produto, EAN, REF, lote ou página."}];
  for(const x of safe){
    content.push({type:"input_text",text:"slot_number="+x.slot_number+" field="+x.field});
    content.push({type:"input_image",image_url:x.image_data_url,detail:"high"});
  }
  let last:any=null;
  for(const model of [...new Set(models)]){
    try{
      const res=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({
        model,store:false,max_output_tokens:3000,reasoning:{effort:"low"},
        instructions:[
          "Você é fallback de OCR numérico para balanço físico.",
          "Cada imagem contém somente um quadro manuscrito, já identificado pelo texto imediatamente anterior.",
          "field=quantity aceita inteiro de 0 a 100000. field=gondola aceita inteiro de 1 a 9999.",
          "Leia somente os algarismos realmente visíveis. Não use contexto de produto e não tente adivinhar.",
          "Se estiver vazio, ilegível, cortado, rasurado ou duvidoso, devolva value=null, ambiguous=true e confiança baixa.",
          "Retorne exatamente uma linha lógica para cada recorte fornecido, preservando slot_number e field."
        ].join(" "),
        input:[{role:"user",content}],
        text:{format:{type:"json_schema",name:"inventory_sheet_numeric_fallback",strict:true,schema:INVENTORY_SHEET_FALLBACK_SCHEMA}}
      }),signal:AbortSignal.timeout(90000)});
      const data=await res.json().catch(()=>({}));
      if(!res.ok){last={error:"openai_http_"+res.status,status:502,detail:tx(data?.error?.message||data?.error,500),model,parsed:{items:[]}};if([400,403,404].includes(res.status))continue;return last}
      const out=inventorySheetOutputText(data);if(!out)return {error:"openai_empty_output",status:502,model,parsed:{items:[]}};
      let parsed:any;try{parsed=JSON.parse(out)}catch{return {error:"openai_invalid_json",status:502,model,parsed:{items:[]}}}
      return {parsed,response_id:data?.id||null,model,usage:data?.usage||null};
    }catch(e){last={error:"openai_request_failed",status:502,detail:tx((e as Error)?.message,300),model,parsed:{items:[]}}}
  }
  return last||{error:"openai_failed",status:502,parsed:{items:[]}};
}

function inventorySheetDeterministicReview(expected:any[],localItems:any[],fallbackItems:any[],pageConfidence:number,pageComplete:boolean){
  const localBySlot=new Map<number,any>();
  for(const x of Array.isArray(localItems)?localItems:[]){const slot=Number(x?.slot_number);if(Number.isInteger(slot)&&slot>=1&&slot<=25&&!localBySlot.has(slot))localBySlot.set(slot,x)}
  const fallbackByKey=new Map<string,any>();
  for(const x of Array.isArray(fallbackItems)?fallbackItems:[]){const slot=Number(x?.slot_number),field=tx(x?.field,20);if(Number.isInteger(slot)&&slot>=1&&slot<=25&&["quantity","gondola"].includes(field))fallbackByKey.set(slot+":"+field,x)}
  const pageOk=pageComplete===true&&Number(pageConfidence)>=0.90;
  const choose=(slot:number,field:"quantity"|"gondola",local:any)=>{
    const max=field==="quantity"?100000:9999,min=field==="quantity"?0:1;
    const lv=local?.[field],lc=Number(local?.[field+"_confidence"]||0),la=local?.["ambiguous_"+field]===true;
    const localValid=Number.isInteger(lv)&&lv>=min&&lv<=max&&!la&&lc>=0.88;
    if(localValid)return {value:Number(lv),confidence:lc,ambiguous:false,source:"local_ocr",note:""};
    const fb=fallbackByKey.get(slot+":"+field),fv=fb?.value,fc=Number(fb?.confidence||0),fa=fb?.ambiguous===true;
    const fbValid=Number.isInteger(fv)&&fv>=min&&fv<=max&&!fa&&fc>=0.90;
    if(fbValid)return {value:Number(fv),confidence:fc,ambiguous:false,source:fb?.source==="page_ai_fallback"?"page_ai_fallback":"ai_fallback",note:tx(fb?.note,160)};
    return {value:Number.isInteger(lv)&&lv>=min&&lv<=max?Number(lv):null,confidence:Math.max(lc,fc),ambiguous:true,source:fb?"fallback_unresolved":"local_unresolved",note:tx(fb?.note||local?.note,160)};
  };
  return expected.map((item:any)=>{
    const slot=Number(item.slot_number),local=localBySlot.get(slot)||null,q=choose(slot,"quantity",local),g=choose(slot,"gondola",local);
    const validQty=Number.isInteger(q.value)&&q.value>=0&&q.value<=100000,validGondola=Number.isInteger(g.value)&&g.value>=1&&g.value<=9999;
    const ready=pageOk&&validQty&&validGondola&&!q.ambiguous&&!g.ambiguous;
    const reasons:string[]=[];
    if(!pageOk)reasons.push("pagina_nao_validada");
    if(!validQty||q.ambiguous)reasons.push("quantidade_duvidosa");
    if(!validGondola||g.ambiguous)reasons.push("gondola_duvidosa");
    const sources=[q.source,g.source];
    const markKind=sources.every(x=>x==="local_ocr")?"local_ocr":sources.includes("page_ai_fallback")?"page_ai_fallback":sources.includes("ai_fallback")?"local_ocr+ai_fallback":"local_ocr_review";
    const expectedEan=dg(item.gtin_snapshot);
    return {
      sheet_item_id:item.id,product_id:item.product_id,page_number:item.page_number,slot_number:item.slot_number,printed_index:item.printed_index,
      name:item.product_name_snapshot,gtin:expectedEan||"",ai_ean:"",
      ai_quantity:validQty?q.value:null,quantity:validQty?q.value:null,ai_gondola:validGondola?g.value:null,gondola:validGondola?g.value:null,
      confidence:Math.min(Number(q.confidence||0),Number(g.confidence||0)),quantity_confidence:Number(q.confidence||0),gondola_confidence:Number(g.confidence||0),
      quantity_source:q.source,gondola_source:g.source,mark_kind:markKind,note:[q.note,g.note].filter(Boolean).join(" | "),
      review_state:ready?"ready":"review",reason:ready?"":reasons.join(",")
    };
  });
}

async function inventorySheetRefreshScanStatus(scanId:string){
  const scan=await db.from("inventory_sheet_page_scans").select("id,batch_id,status").eq("id",scanId).maybeSingle();
  if(scan.error)throw scan.error;if(!scan.data)return {status:"missing"};
  if(scan.data.status==="rejected")return {status:"rejected"};
  const all=await db.from("inventory_sheet_item_results").select("review_state").eq("scan_id",scanId);
  if(all.error)throw all.error;
  const states=(all.data||[]).map((x:any)=>String(x.review_state||""));
  const status=states.length&&states.every((x:string)=>x==="applied")?"applied":states.some((x:string)=>x==="applied")?"partial":"analyzed";
  const upd=await db.from("inventory_sheet_page_scans").update({
    status,applied_at:status==="applied"?new Date().toISOString():null
  }).eq("id",scanId);
  if(upd.error)throw upd.error;
  if(status==="applied"){
    const b=await db.from("inventory_sheet_batches").select("page_count").eq("id",scan.data.batch_id).maybeSingle();
    const pages=await db.from("inventory_sheet_page_scans")
      .select("page_number").eq("batch_id",scan.data.batch_id).eq("status","applied");
    if(!b.error&&!pages.error&&new Set((pages.data||[]).map((x:any)=>Number(x.page_number))).size>=Number(b.data?.page_count||0)){
      await db.from("inventory_sheet_batches").update({status:"completed",completed_at:new Date().toISOString()}).eq("id",scan.data.batch_id);
    }
  }
  return {status};
}

async function inventorySheetReconcileCompletedJobs(scanId?:string){
  let q:any=db.from("inventory_sheet_item_results")
    .select("id,scan_id,stock_count_id,bling_job_id,review_state")
    .eq("review_state","confirmed").not("bling_job_id","is",null)
    .order("updated_at",{ascending:true}).limit(500);
  if(scanId)q=q.eq("scan_id",scanId);
  const rr=await q;if(rr.error)throw rr.error;
  const rows=rr.data||[];
  if(!rows.length){
    if(scanId)await inventorySheetRefreshScanStatus(scanId);
    return {reconciled:0,scan_ids:scanId?[scanId]:[]};
  }
  const jobIds=[...new Set(rows.map((x:any)=>id(x.bling_job_id)).filter(Boolean))];
  const jq=await db.from("bling_hub_jobs_v2").select("id,status,error_code,error_message").in("id",jobIds);
  if(jq.error)throw jq.error;
  const jobs=new Map((jq.data||[]).map((x:any)=>[String(x.id),x]));
  const touched=new Set<string>();let reconciled=0;
  for(const row of rows){
    const job:any=jobs.get(String(row.bling_job_id));if(!job)continue;
    if(job.status==="synced"){
      const u=await db.from("inventory_sheet_item_results").update({
        review_state:"applied",apply_error:null,updated_at:new Date().toISOString()
      }).eq("id",row.id);
      if(u.error)throw u.error;
      if(row.stock_count_id)await inventorySheetResolveCountAttention(String(row.stock_count_id),"bling-stock-job:"+String(row.bling_job_id));
      touched.add(String(row.scan_id));reconciled++;
    }else if(["review_required","failed"].includes(String(job.status))){
      const u=await db.from("inventory_sheet_item_results").update({
        review_state:"error",apply_error:tx(job.error_code||job.error_message,300)||"bling_sync_failed",updated_at:new Date().toISOString()
      }).eq("id",row.id);
      if(u.error)throw u.error;
      touched.add(String(row.scan_id));reconciled++;
    }
  }
  if(scanId)touched.add(scanId);
  for(const sid of touched)await inventorySheetRefreshScanStatus(sid);
  return {reconciled,scan_ids:[...touched]};
}

async function inventorySheetPendingManual(){
  await inventorySheetReconcileCompletedJobs();
  const rr=await db.from("inventory_sheet_item_results")
    .select("id,scan_id,sheet_item_id,ai_quantity,ai_gondola,ai_confidence,ai_mark_kind,ai_note,review_state,apply_error,created_at,updated_at")
    .in("review_state",["review","error"]).order("created_at",{ascending:true}).limit(300);
  if(rr.error)throw rr.error;
  const rows=rr.data||[];
  if(!rows.length)return {count:0,items:[]};

  const scanIds=[...new Set(rows.map((x:any)=>String(x.scan_id)).filter(Boolean))];
  const itemIds=[...new Set(rows.map((x:any)=>String(x.sheet_item_id)).filter(Boolean))];
  const [sq,iq]=await Promise.all([
    db.from("inventory_sheet_page_scans").select("id,batch_id,page_number,status,raw_result,created_at,uploaded_by").in("id",scanIds),
    db.from("inventory_sheet_items").select("id,batch_id,page_number,slot_number,printed_index,product_id,product_name_snapshot,gtin_snapshot").in("id",itemIds)
  ]);
  if(sq.error)throw sq.error;if(iq.error)throw iq.error;

  const scans=new Map((sq.data||[]).map((x:any)=>[String(x.id),x]));
  const items=new Map((iq.data||[]).map((x:any)=>[String(x.id),x]));
  const batchIds=[...new Set((sq.data||[]).map((x:any)=>String(x.batch_id)).filter(Boolean))];
  const bq=batchIds.length?await db.from("inventory_sheet_batches").select("id,batch_code,page_count,status").in("id",batchIds):{data:[],error:null};
  if(bq.error)throw bq.error;
  const batches=new Map((bq.data||[]).map((x:any)=>[String(x.id),x]));

  const out=rows.filter((r:any)=>{
    const scan:any=scans.get(String(r.scan_id))||{};
    return scan.status!=="rejected";
  }).map((r:any)=>{
    const scan:any=scans.get(String(r.scan_id))||{},item:any=items.get(String(r.sheet_item_id))||{},batch:any=batches.get(String(scan.batch_id||item.batch_id))||{};
    const raw=meta(scan.raw_result),missing:string[]=[];
    if(r.ai_quantity==null)missing.push("estoque");
    if(r.ai_gondola==null)missing.push("gondola");
    const reason=r.review_state==="error"
      ?("Falha na atualização"+(r.apply_error?": "+tx(r.apply_error,180):"."))
      :(missing.length===2?"Estoque e gôndola não foram lidos com segurança.":missing.length===1?(missing[0]==="estoque"?"Estoque não foi lido com segurança.":"Gôndola não foi lida com segurança."):"Leitura automática exige conferência manual.");
    return {
      result_id:r.id,scan_id:r.scan_id,sheet_item_id:r.sheet_item_id,review_state:r.review_state,
      product_id:item.product_id||null,name:item.product_name_snapshot||"",gtin:dg(item.gtin_snapshot)||"",
      printed_index:Number(item.printed_index||0),slot_number:Number(item.slot_number||0),
      batch_code:batch.batch_code||"",page_number:Number(scan.page_number||item.page_number||0),page_count:Number(batch.page_count||0),
      quantity:r.ai_quantity==null?null:Number(r.ai_quantity),gondola:r.ai_gondola==null?null:Number(r.ai_gondola),
      confidence:Number(r.ai_confidence||0),mark_kind:r.ai_mark_kind||"",note:r.ai_note||"",apply_error:r.apply_error||"",
      reason,operator_label:tx(raw.operator_label,80)||null,created_at:r.created_at
    };
  });
  return {
    count:out.length,
    quantity_missing:out.filter((x:any)=>x.quantity==null).length,
    gondola_missing:out.filter((x:any)=>x.gondola==null).length,
    apply_errors:out.filter((x:any)=>x.review_state==="error").length,
    items:out
  };
}

async function inventorySheetCancelScan(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const scanId=id(p?.scan_id);if(!scanId)return {error:"invalid_scan",status:400};
  const scan=await db.from("inventory_sheet_page_scans").select("id,status").eq("id",scanId).maybeSingle();
  if(scan.error)throw scan.error;if(!scan.data)return {ok:true,cancelled:true,already_gone:true};
  const rr=await db.from("inventory_sheet_item_results")
    .select("review_state,stock_count_id,bling_job_id,confirmed_at")
    .eq("scan_id",scanId);
  if(rr.error)throw rr.error;
  const touched=(rr.data||[]).some((x:any)=>["confirmed","applied"].includes(String(x.review_state))||Boolean(x.stock_count_id)||Boolean(x.bling_job_id)||Boolean(x.confirmed_at));
  if(touched)return {error:"scan_already_applied_cannot_cancel",status:409,can_read_again:true};
  const upd=await db.from("inventory_sheet_page_scans").update({status:"rejected",applied_at:null}).eq("id",scanId);
  if(upd.error)throw upd.error;
  return {ok:true,cancelled:true,rejected:true,scan_id:scanId,can_read_again:true};
}

async function inventorySheetAnalyze(p:any,auth:any){
  const token=inventorySheetParseToken(p?.sheet_token);
  if(!token)return {error:"invalid_sheet_qr",status:400};
  const batchCode=token.batch_code,pageNumber=token.page_number;
  const pageConfidence=Math.max(0,Math.min(1,Number(p?.page_confidence||0))),pageComplete=p?.page_complete===true;
  const localItems=(Array.isArray(p?.local_items)?p.local_items:[]).slice(0,25);
  const fallbackFields=(Array.isArray(p?.fallback_fields)?p.fallback_fields:[]).slice(0,50);
  if(!localItems.length)return {error:"local_ocr_results_required",status:400};

  const b=await db.from("inventory_sheet_batches").select("*").eq("batch_code",batchCode).maybeSingle();
  if(b.error)throw b.error;
  if(!b.data)return {error:"sheet_batch_not_found",status:404,batch_code:batchCode,page_number:pageNumber};
  if(pageNumber>Number(b.data.page_count))return {error:"sheet_page_out_of_range",status:422,batch_code:batchCode,page_number:pageNumber};

  const it=await db.from("inventory_sheet_items").select("*").eq("batch_id",b.data.id).eq("page_number",pageNumber).order("slot_number");
  if(it.error)throw it.error;

  let fallback:any={parsed:{items:[]},model:null,response_id:null};
  if(fallbackFields.length)fallback=await inventorySheetFallbackVision(fallbackFields);
  let fallbackItems=fallback?.parsed?.items||[];

  const expectedFieldCount=Math.max(1,(it.data||[]).length*2);
  const fieldResolved=fallbackItems.filter((x:any)=>x?.value!=null&&x?.ambiguous!==true&&Number(x?.confidence||0)>=0.92).length;
  let pageFallback:any={parsed:{items:[]},model:null,response_id:null};
  const pageImage=String(p?.page_image_data_url||"");
  const catastrophicFieldFailure=fallbackFields.length>=Math.max(10,Math.floor(expectedFieldCount*.6))&&fieldResolved<Math.max(4,Math.floor(expectedFieldCount*.25));
  const forcePageFallback=p?.force_page_fallback===true;
  if(pageImage&&(forcePageFallback||catastrophicFieldFailure)){
    pageFallback=await inventorySheetPageFallbackVision(pageImage,(it.data||[]).length);
    fallbackItems=inventorySheetMergePageFallback(fallbackItems,pageFallback?.parsed?.items||[]);
  }

  const review=inventorySheetDeterministicReview(it.data||[],localItems,fallbackItems,pageConfidence,pageComplete);
  const localReady=review.filter((x:any)=>x.mark_kind==="local_ocr"&&x.review_state==="ready").length;
  const fallbackReady=review.filter((x:any)=>["local_ocr+ai_fallback","page_ai_fallback"].includes(x.mark_kind)&&x.review_state==="ready").length;
  const model=fallbackFields.length?("local:tesseract.js@7.0.0"+(fallback?.model?"+fallback:"+fallback.model:"+fallback-unavailable")):"local:tesseract.js@7.0.0";
  const rawResult={
    source:"deterministic_qr_batch_page_slot",sheet_token:token.raw,batch_code:batchCode,page_number:pageNumber,page_confidence:pageConfidence,page_complete:pageComplete,operator_label:tx(p?.operator,80)||null,client_upload_id:tx(p?.client_upload_id,80)||null,
    local_engine:"tesseract.js@7.0.0",local_items:localItems,
    fallback_requested:fallbackFields.map((x:any)=>({slot_number:Number(x?.slot_number),field:tx(x?.field,20)})),
    fallback_result:fallbackItems,fallback_error:fallback?.error||null,
    force_page_fallback:forcePageFallback,page_fallback_used:Boolean(pageFallback?.parsed?.items?.length),
    page_fallback_model:pageFallback?.model||null,
    page_fallback_error:pageFallback?.error||null
  };

  const s=await db.from("inventory_sheet_page_scans").insert({
    batch_id:b.data.id,page_number:pageNumber,uploaded_by:auth.user_id,model,ai_response_id:fallback?.response_id||null,page_confidence:pageConfidence,raw_result:rawResult,
    review_result:{ready:review.filter((x:any)=>x.review_state==="ready").length,review:review.filter((x:any)=>x.review_state!=="ready").length,local_ready:localReady,fallback_ready:fallbackReady,fallback_requested:fallbackFields.length},
    status:"analyzed"
  }).select("*").single();
  if(s.error)throw s.error;
  const supersede=await db.from("inventory_sheet_page_scans")
    .update({status:"rejected",applied_at:null})
    .eq("batch_id",b.data.id).eq("page_number",pageNumber)
    .neq("id",s.data.id).in("status",["analyzed","partial"]);
  if(supersede.error)throw supersede.error;
  if(review.length){
    const ins=await db.from("inventory_sheet_item_results").insert(review.map((r:any)=>({
      scan_id:s.data.id,sheet_item_id:r.sheet_item_id,ai_ean:null,ai_quantity:r.ai_quantity,ai_gondola:r.ai_gondola,ai_confidence:r.confidence,
      ai_mark_kind:r.mark_kind,ai_note:r.note||null,review_state:r.review_state
    })));
    if(ins.error)throw ins.error;
  }
  const dr=await db.from("inventory_sheet_item_results").select("id,sheet_item_id").eq("scan_id",s.data.id);
  if(dr.error)throw dr.error;
  const rm=new Map((dr.data||[]).map((x:any)=>[String(x.sheet_item_id),x.id]));
  return {
    duplicate:false,scan_id:s.data.id,batch_code:batchCode,page_number:pageNumber,page_count:b.data.page_count,page_confidence:pageConfidence,page_complete:pageComplete,model,
    fallback_used:fallbackReady>0,fallback_requested:fallbackFields.length,fallback_error:fallback?.error||null,page_fallback_used:Boolean(pageFallback?.parsed?.items?.length),page_fallback_error:pageFallback?.error||null,
    rows:review.map((r:any)=>({...r,result_id:rm.get(String(r.sheet_item_id))||null}))
  };
}

async function inventorySheetCancelOlderPendingJobs(productId:string,currentScanId:string){
  const q=await db.from("bling_hub_jobs_v2")
    .select("id,status,payload")
    .eq("domain","stock").eq("operation","set_stock")
    .eq("source_system","vitrine_qx").eq("source_id",productId)
    .in("status",["queued","retry"]).order("created_at",{ascending:true}).limit(30);
  if(q.error)throw q.error;
  let cancelled=0;
  for(const job of q.data||[]){
    const oldScan=id(job?.payload?.inventory_sheet_scan_id);
    if(!oldScan||oldScan===currentScanId)continue;
    const fin=await db.rpc("finish_bling_hub_job_v2",{
      p_job_id:job.id,p_status:"cancelled",
      p_result:{superseded_by_inventory_sheet_scan_id:currentScanId,previous_inventory_sheet_scan_id:oldScan},
      p_error_code:"inventory_sheet_superseded",
      p_error_message:"Nova leitura da folha substituiu esta atualização de estoque antes da execução.",
      p_http_status:null,p_retry_seconds:120,p_provider_id:null
    });
    if(fin.error)throw fin.error;
    cancelled++;
  }
  return cancelled;
}

async function inventorySheetResolveCountAttention(countId:string,ref:string){
  try{const a=await db.from("ops_attention").select("id").eq("idempotency_key","inventory-count-difference:"+countId).in("status",["open","acknowledged"]).maybeSingle();if(!a.error&&a.data?.id)await db.rpc("ops_resolve_attention_v1",{p_attention_id:a.data.id,p_resolution:"Balanço físico confirmado pela folha A4 e sincronizado no Bling.",p_resolution_ref:ref})}catch{}
}

async function inventorySheetApply(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const scanId=id(p?.scan_id),requested=(Array.isArray(p?.items)?p.items:[]).slice(0,5);
  if(!scanId||!requested.length)return {error:"invalid_apply_request",status:400};

  const scan=await db.from("inventory_sheet_page_scans").select("id,batch_id,page_number,status").eq("id",scanId).maybeSingle();
  if(scan.error)throw scan.error;if(!scan.data)return {error:"scan_not_found",status:404};
  if(scan.data.status==="rejected")return {error:"scan_rejected_read_again",status:409};
  await inventorySheetReconcileCompletedJobs(scanId);

  const ids=requested.map((x:any)=>id(x?.result_id)).filter(Boolean);
  const rr=await db.from("inventory_sheet_item_results").select("*").eq("scan_id",scanId).in("id",ids);
  if(rr.error)throw rr.error;
  const resultMap=new Map((rr.data||[]).map((x:any)=>[String(x.id),x]));
  const sheetIds=(rr.data||[]).map((x:any)=>x.sheet_item_id);
  const si=await db.from("inventory_sheet_items").select("*").in("id",sheetIds);
  if(si.error)throw si.error;
  const itemMap=new Map((si.data||[]).map((x:any)=>[String(x.id),x]));
  const authority=await stockAuthority(),operator=tx(p?.operator,80)||"Balanço por foto";
  if(authority==="bling"){
    const rt=await ops2LiveRuntime();
    if(rt.mode!=="live"||!rt.hub_enabled||!rt.stock_enabled)return {error:"bling_stock_runtime_not_ready",status:409};
  }

  const applied:any[]=[],jobs:any[]=[],jobToResult:any[]=[],existingJobIds:string[]=[];
  for(const req of requested){
    const rid=id(req?.result_id),row:any=resultMap.get(rid);
    if(!row){applied.push({result_id:rid||null,ok:false,error:"result_not_found"});continue}
    if(row.review_state==="applied"){applied.push({result_id:rid,ok:true,already_applied:true,stock_count_id:row.stock_count_id||null,bling_job_id:row.bling_job_id||null,confirmed_gondola:row.confirmed_gondola||null});continue}
    if(row.review_state==="review"&&req?.manual_confirmed!==true){applied.push({result_id:rid,ok:false,error:"manual_confirmation_required"});continue}
    const quantity=Number(req?.quantity),gondola=Number(req?.gondola);
    if(!Number.isInteger(quantity)||quantity<0||quantity>100000){applied.push({result_id:rid,ok:false,error:"invalid_quantity"});continue}
    if(!Number.isInteger(gondola)||gondola<1||gondola>9999){applied.push({result_id:rid,ok:false,error:"invalid_gondola"});continue}
    const aiQuantity=row.ai_quantity==null?null:Number(row.ai_quantity),aiGondola=row.ai_gondola==null?null:Number(row.ai_gondola);
    if(row.review_state==="ready"&&((aiQuantity!==null&&quantity!==aiQuantity)||(aiGondola!==null&&gondola!==aiGondola))&&req?.manual_confirmed!==true){
      applied.push({result_id:rid,ok:false,error:"manual_confirmation_required_for_override",ai_quantity:aiQuantity,ai_gondola:aiGondola});
      continue;
    }
    const item:any=itemMap.get(String(row.sheet_item_id));
    if(!item){applied.push({result_id:rid,ok:false,error:"sheet_item_not_found"});continue}

    // Uma releitura/correção deve prevalecer sobre tentativas antigas ainda em fila/retry.
    // Jobs já concluídos ficam preservados como histórico e nunca são apagados.
    await inventorySheetCancelOlderPendingJobs(String(item.product_id),scanId);

    const previousConfirmed=row.confirmed_quantity==null?null:Number(row.confirmed_quantity);
    const previousGondola=row.confirmed_gondola==null?null:Number(row.confirmed_gondola);
    const previousCountId=id(row.stock_count_id);
    const previousJobId=id(row.bling_job_id);
    if(previousCountId&&((previousConfirmed!==null&&previousConfirmed!==quantity)||(previousGondola!==null&&previousGondola!==gondola))){
      applied.push({result_id:rid,ok:false,error:"values_changed_after_confirmation",confirmed_quantity:previousConfirmed,confirmed_gondola:previousGondola});
      continue;
    }

    let vg=await db.from("vitrine_gondolas").select("id,number,active").eq("number",gondola).maybeSingle();
    if(vg.error){applied.push({result_id:rid,ok:false,error:tx(vg.error.message,240)});continue}
    if(!vg.data){
      vg=await db.from("vitrine_gondolas").insert({number:gondola,active:true}).select("id,number,active").single();
      if(vg.error){applied.push({result_id:rid,ok:false,error:tx(vg.error.message,240)});continue}
    }else if(vg.data.active!==true){
      vg=await db.from("vitrine_gondolas").update({active:true,updated_at:new Date().toISOString()}).eq("id",vg.data.id).select("id,number,active").single();
      if(vg.error){applied.push({result_id:rid,ok:false,error:tx(vg.error.message,240)});continue}
    }
    const currentProduct=await one(item.product_id);
    if(!currentProduct){applied.push({result_id:rid,ok:false,error:"product_not_found"});continue}
    if(String(currentProduct.gondola||"")!==String(gondola)){
      const loc=await db.from("products").update({gondola:String(gondola),shelf:null,updated_at:new Date().toISOString()}).eq("id",item.product_id);
      if(loc.error){applied.push({result_id:rid,ok:false,error:tx(loc.error.message,240)});continue}
    }

    let countId=previousCountId;
    if(!countId){
      const count=await db.rpc("ops_record_inventory_count_v1",{p_product_id:item.product_id,p_counted_quantity:quantity,p_operator_label:operator});
      if(count.error){applied.push({result_id:rid,ok:false,error:tx(count.error.message,240)});continue}
      countId=id(count.data?.count_id);
      await db.from("inventory_sheet_item_results").update({
        confirmed_quantity:quantity,confirmed_gondola:gondola,confirmed_by:auth.user_id,confirmed_at:new Date().toISOString(),
        stock_count_id:countId||null,review_state:authority==="bling"?"confirmed":"applied",
        apply_error:null,updated_at:new Date().toISOString()
      }).eq("id",rid);
    }

    if(authority==="bling"){
      if(previousJobId){
        existingJobIds.push(previousJobId);
        jobToResult.push({rid,countId,jobId:previousJobId});
        applied.push({result_id:rid,ok:true,quantity,gondola,confirmed_gondola:gondola,stock_count_id:countId,bling_job_id:previousJobId,reused:true});
      }else{
        jobs.push({
          domain:"stock",operation:"set_stock",source_id:item.product_id,
          idempotency_key:"inventory-sheet:"+scanId+":"+item.id+":"+String(quantity),
          payload:{stock_quantity:quantity,inventory_sheet_scan_id:scanId,inventory_sheet_result_id:rid,operator_label:operator,count_id:countId||null}
        });
        jobToResult.push({rid,countId,jobId:null});
        applied.push({result_id:rid,ok:true,quantity,gondola,confirmed_gondola:gondola,stock_count_id:countId,queued:true});
      }
    }else{
      await db.from("inventory_sheet_item_results").update({review_state:"applied",updated_at:new Date().toISOString()}).eq("id",rid);
      if(countId)await inventorySheetResolveCountAttention(countId,"inventory-sheet:"+scanId);
      applied.push({result_id:rid,ok:true,quantity,gondola,confirmed_gondola:gondola,stock_count_id:countId,queued:false});
    }
  }

  const allJobIds:string[]=[...existingJobIds];
  if(jobs.length){
    const enq=await hub("enqueue_jobs",{jobs});
    if(enq.error)return {error:enq.error,status:enq.status||502,applied};
    const newIds=(enq.data?.job_ids||[]).map((x:any)=>id(x)).filter(Boolean);
    let newPos=0;
    for(const m of jobToResult){
      if(m.jobId)continue;
      const jid=newIds[newPos++]||"";
      if(jid){
        m.jobId=jid;allJobIds.push(jid);
        await db.from("inventory_sheet_item_results").update({bling_job_id:jid,updated_at:new Date().toISOString()}).eq("id",m.rid);
      }
    }
  }

  let worker:any=null;
  if(allJobIds.length){
    for(let attempt=0;attempt<2;attempt++){
      const pending=await db.from("bling_hub_jobs_v2").select("id,status").in("id",allJobIds);
      if(pending.error)throw pending.error;
      const unresolved=(pending.data||[]).filter((x:any)=>!["synced","review_required","failed"].includes(String(x.status||"")));
      if(!unresolved.length)break;
      worker=await hub("process_stock_jobs",{limit:10});
      if(worker.error)break;
    }

    const jq=await db.from("bling_hub_jobs_v2").select("id,status,error_code,error_message").in("id",allJobIds);
    if(jq.error)throw jq.error;
    const byId=new Map((jq.data||[]).map((x:any)=>[String(x.id),x]));
    for(const m of jobToResult){
      if(!m.jobId)continue;
      const j:any=byId.get(String(m.jobId));
      if(!j)continue;
      if(j.status==="synced"){
        await db.from("inventory_sheet_item_results").update({review_state:"applied",apply_error:null,updated_at:new Date().toISOString()}).eq("id",m.rid);
        if(m.countId)await inventorySheetResolveCountAttention(m.countId,"bling-stock-job:"+m.jobId);
      }else if(["review_required","failed"].includes(String(j.status))){
        await db.from("inventory_sheet_item_results").update({review_state:"error",apply_error:tx(j.error_code||j.error_message,300)||"bling_sync_failed",updated_at:new Date().toISOString()}).eq("id",m.rid);
      }else{
        await db.from("inventory_sheet_item_results").update({review_state:"confirmed",apply_error:null,updated_at:new Date().toISOString()}).eq("id",m.rid);
      }
    }
  }

  await inventorySheetReconcileCompletedJobs(scanId);
  const refreshed=await inventorySheetRefreshScanStatus(scanId);
  const scanStatus=String(refreshed.status||"analyzed");

  const final=await db.from("inventory_sheet_item_results").select("id,review_state,confirmed_quantity,confirmed_gondola,stock_count_id,bling_job_id,apply_error").eq("scan_id",scanId);
  if(final.error)throw final.error;
  return {scan_id:scanId,status:scanStatus,authority,worker:worker?.data||null,rows:final.data||[],applied};
}

async function basketLooseStockMap(ids:string[]){
  const out=new Map<string,any>();const clean=[...new Set((ids||[]).map(String).filter(Boolean))];if(!clean.length)return out;
  for(let i=0;i<clean.length;i+=500){
    const q=await db.from("ops2_loose_sellable_stock_v1")
      .select("product_id,effective_sellable_stock,basket_locked_quantity,loose_sellable_stock,bling_stock_ready")
      .in("product_id",clean.slice(i,i+500));
    if(q.error)throw q.error;
    for(const x of q.data||[])out.set(String(x.product_id),x);
  }
  return out;
}
function basketNorm(v:any){return tx(v,180).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
function basketMeasureKey(p:any){
  const s=basketNorm(String(p?.packaging||"")+" "+String(p?.name||"")).replace(",",".");
  const m=s.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|lt|litro|litros|un|und|unidade|unidades)\b/);
  return m?m[1]+m[2].replace("lt","l").replace("litros","l").replace("litro","l").replace("unidades","un").replace("unidade","un").replace("und","un"):"";
}
function basketCandidateScore(base:any,c:any,saved=false){
  let score=saved?1000:0;const reasons:string[]=[];
  const baseCat=basketNorm(base?.sales_category||base?.storefront_category||base?.category),cat=basketNorm(c?.sales_category||c?.storefront_category||c?.category);
  const baseSub=basketNorm(base?.customer_subcategory||base?.subcategory),sub=basketNorm(c?.customer_subcategory||c?.subcategory);
  const baseSub2=basketNorm(base?.customer_subsubcategory||base?.subsubcategory),sub2=basketNorm(c?.customer_subsubcategory||c?.subsubcategory);
  const bm=basketMeasureKey(base),cm=basketMeasureKey(c),bp=Number(base?.price||0),cp=Number(c?.price||0);
  if(baseSub&&sub&&baseSub===sub){score+=90;reasons.push("mesma subcategoria")}
  if(baseSub2&&sub2&&baseSub2===sub2){score+=45;reasons.push("mesmo tipo")}
  if(baseCat&&cat&&baseCat===cat){score+=22;reasons.push("mesma categoria")}
  if(bm&&cm&&bm===cm){score+=65;reasons.push("mesma embalagem")}
  if(basketNorm(base?.unit)&&basketNorm(base?.unit)===basketNorm(c?.unit)){score+=8}
  if(bp>0&&cp>0){const diff=Math.abs(cp-bp)/bp;if(diff<=.1)score+=20;else if(diff<=.25)score+=10}
  if(saved)reasons.unshift("alternativa cadastrada");
  return {score,reasons};
}
async function basketsAdminList(){
  const [bq,iq,lq]=await Promise.all([
    db.from("basket_templates").select("id,sku,name,description,image_url,base_price,is_active,sort_order,is_whatsapp_active,is_featured,internal_notes,updated_at").order("sort_order").order("name"),
    db.from("basket_template_items").select("id,basket_id,product_id,quantity").order("sort_order"),
    db.from("basket_stock_lots").select("id,basket_id,lot_code,status,quantity_built,quantity_available,built_at,built_by,source,metadata").order("built_at",{ascending:true})
  ]);
  if(bq.error)throw bq.error;if(iq.error)throw iq.error;if(lq.error)throw lq.error;
  const allItems=iq.data||[],allLots=lq.data||[],stock=await basketLooseStockMap(allItems.map((x:any)=>x.product_id));
  const baskets=(bq.data||[]).map((b:any)=>{
    const items=allItems.filter((x:any)=>x.basket_id===b.id),readyLots=allLots.filter((x:any)=>x.basket_id===b.id&&x.status==="ready"&&Number(x.quantity_available||0)>0);
    const demand=new Map<string,number>();for(const i of items)demand.set(String(i.product_id),(demand.get(String(i.product_id))||0)+Number(i.quantity||0));
    let capacity=999999;for(const [pid,qty] of demand){const s:any=stock.get(pid);capacity=Math.min(capacity,qty>0?Math.floor(Number(s?.loose_sellable_stock||0)/qty):999999)}
    if(capacity===999999)capacity=0;
    const current=readyLots[0]||null,readyQty=readyLots.reduce((s:number,x:any)=>s+Number(x.quantity_available||0),0);
    const gap=current&&Array.isArray(current.metadata?.stock_gap_at_creation)?current.metadata.stock_gap_at_creation.length:0;
    return {...b,base_price_cents:Math.round(Number(b.base_price||0)*100),template_item_count:items.length,
      ready_quantity:readyQty,current_lot:current?{id:current.id,lot_code:current.lot_code,quantity_available:Number(current.quantity_available||0),built_at:current.built_at,source:current.source,gap_items:gap}:null,
      ready_lot_count:readyLots.length,max_build_from_template:Math.max(0,capacity)};
  });
  return {baskets,summary:{templates:baskets.length,active:baskets.filter((b:any)=>b.is_active!==false).length,ready_units:baskets.reduce((s:number,b:any)=>s+Number(b.ready_quantity||0),0),attention:baskets.filter((b:any)=>Number(b.current_lot?.gap_items||0)>0).length}};
}
async function basketAdminDetail(rawId:any){
  const bid=id(rawId);if(!bid)return {error:"invalid_basket",status:400};
  const bq=await db.from("basket_templates").select("*").eq("id",bid).maybeSingle();if(bq.error)throw bq.error;if(!bq.data)return {error:"basket_not_found",status:404};
  const [iq,aq,lq,pq]=await Promise.all([
    db.from("basket_template_items").select("*,product:products(id,name,sku,gtin,image_url,price,stock,packaging,unit,brand,category,sales_category,storefront_category,subcategory,customer_subcategory,subsubcategory,customer_subsubcategory,is_active)").eq("basket_id",bid).order("sort_order").order("created_at"),
    db.from("basket_template_item_alternatives").select("id,template_item_id,product_id,priority,is_active").eq("is_active",true).order("priority"),
    db.from("basket_stock_lots").select("id,basket_id,lot_code,status,quantity_built,quantity_available,composition_hash,built_at,built_by,notes,source,metadata,created_at").eq("basket_id",bid).order("built_at",{ascending:false}).limit(20),
    db.from("products").select("id,name,sku,gtin,image_url,price,packaging,unit,brand,category,sales_category,storefront_category,subcategory,customer_subcategory,subsubcategory,customer_subsubcategory,is_active").eq("is_active",true).limit(5000)
  ]);
  if(iq.error)throw iq.error;if(aq.error)throw aq.error;if(lq.error)throw lq.error;if(pq.error)throw pq.error;
  const templateItems=iq.data||[],products=pq.data||[],lots=lq.data||[];
  const lotIds=lots.map((x:any)=>x.id),liq=lotIds.length?await db.from("basket_stock_lot_items").select("id,lot_id,source_template_item_id,product_id,quantity_per_basket,position_order,substitution_reason,metadata,product:products(id,name,sku,gtin,image_url,price,packaging,unit,brand)").in("lot_id",lotIds).order("position_order"):{data:[],error:null} as any;
  if(liq.error)throw liq.error;
  const loose=await basketLooseStockMap(products.map((x:any)=>x.id));
  const pmap=new Map(products.map((x:any)=>[String(x.id),x]));
  const savedByItem=new Map<string,Set<string>>();
  for(const a of aq.data||[]){if(!savedByItem.has(String(a.template_item_id)))savedByItem.set(String(a.template_item_id),new Set());savedByItem.get(String(a.template_item_id))!.add(String(a.product_id))}
  const items=templateItems.map((i:any)=>{
    const base:any=Array.isArray(i.product)?i.product[0]:i.product;
    const saved=savedByItem.get(String(i.id))||new Set<string>();
    const scored:any[]=[];
    for(const cand of products){
      if(String(cand.id)===String(i.product_id))continue;
      const s:any=loose.get(String(cand.id));const available=Number(s?.loose_sellable_stock||0);if(available<=0&&!saved.has(String(cand.id)))continue;
      const sc=basketCandidateScore(base,cand,saved.has(String(cand.id)));
      if(sc.score<55&&!saved.has(String(cand.id)))continue;
      scored.push({id:cand.id,name:cand.name,sku:cand.sku,gtin:cand.gtin,image_url:cand.image_url||"",price_cents:Math.round(Number(cand.price||0)*100),packaging:cand.packaging||"",brand:cand.brand||"",loose_stock:available,basket_locked:Number(s?.basket_locked_quantity||0),score:sc.score,reasons:sc.reasons,saved_alternative:saved.has(String(cand.id)),capacity:Number(i.quantity||0)>0?Math.floor(available/Number(i.quantity||1)):0});
    }
    scored.sort((a,b)=>Number(b.saved_alternative)-Number(a.saved_alternative)||b.score-a.score||b.loose_stock-a.loose_stock||String(a.name).localeCompare(String(b.name),"pt-BR"));
    const ss:any=loose.get(String(i.product_id))||{};
    return {...i,product:base,loose_stock:Number(ss.loose_sellable_stock||0),basket_locked:Number(ss.basket_locked_quantity||0),effective_stock:Number(ss.effective_sellable_stock||0),suggestions:scored.slice(0,7)};
  });
  const lotItems=liq.data||[];
  const lotRows=lots.map((l:any)=>({...l,quantity_built:Number(l.quantity_built||0),quantity_available:Number(l.quantity_available||0),gap_items:Array.isArray(l.metadata?.stock_gap_at_creation)?l.metadata.stock_gap_at_creation.length:0,
    items:lotItems.filter((x:any)=>x.lot_id===l.id).map((x:any)=>{const s:any=loose.get(String(x.product_id))||{};return {...x,quantity_per_basket:Number(x.quantity_per_basket||0),loose_stock:Number(s.loose_sellable_stock||0),product:Array.isArray(x.product)?x.product[0]:x.product}})}));
  const activeReady=[...lotRows].filter((x:any)=>x.status==="ready"&&x.quantity_available>0).sort((a:any,b:any)=>Date.parse(a.built_at)-Date.parse(b.built_at));
  return {basket:{...bq.data,base_price_cents:Math.round(Number(bq.data.base_price||0)*100)},items,lots:lotRows,current_lot:activeReady[0]||null,last_lot:lotRows[0]||null,
    ready_quantity:activeReady.reduce((s:number,x:any)=>s+x.quantity_available,0)};
}
async function basketSave(p:any,auth:any){
  const bid=id(p?.id);if(!bid)return {error:"invalid_basket",status:400};
  const name=tx(p?.name,220);if(!name)return {error:"name_required",status:400};
  const price=Math.max(0,Number(p?.base_price_cents||0)/100);
  const patch:any={name,description:tx(p?.description,1200)||null,image_url:tx(p?.image_url,1200)||null,base_price:price,
    is_active:p?.is_active!==false,is_whatsapp_active:p?.is_whatsapp_active!==false,is_featured:p?.is_featured===true,
    sort_order:Math.floor(nm(p?.sort_order,0,9999)),internal_notes:tx(p?.internal_notes,1600)||null,updated_at:new Date().toISOString(),updated_by:auth?.user_id||null};
  const q=await db.from("basket_templates").update(patch).eq("id",bid).select("*").single();if(q.error)throw q.error;
  await opsEvent("basket.template_updated","Modelo de cesta atualizado.","basket",bid,{name,base_price:price},tx(p?.operator,80)||"Operação","human","dona_antonia","basket-template:"+bid+":"+new Date().toISOString());
  return {basket:q.data};
}
async function basketItemSave(p:any,auth:any){
  const bid=id(p?.basket_id),iid=id(p?.id),pid=id(p?.product_id);if(!bid||!pid)return {error:"invalid_basket_item",status:400};
  const b=await db.from("basket_templates").select("id").eq("id",bid).maybeSingle();if(b.error)throw b.error;if(!b.data)return {error:"basket_not_found",status:404};
  const prod=await db.from("products").select("id,is_active").eq("id",pid).maybeSingle();if(prod.error)throw prod.error;if(!prod.data?.is_active)return {error:"product_unavailable",status:409};
  const qty=Number(p?.quantity);if(!Number.isFinite(qty)||qty<=0||qty>100)return {error:"invalid_quantity",status:400};
  const patch:any={basket_id:bid,product_id:pid,quantity:qty,removable:p?.removable!==false,quantity_editable:p?.quantity_editable!==false,
    min_quantity:Math.max(0,Number(p?.min_quantity??0)),max_quantity:p?.max_quantity==null||p?.max_quantity===""?null:Math.max(0,Number(p.max_quantity)),
    remove_unit_delta:p?.remove_unit_delta_cents==null||p?.remove_unit_delta_cents===""?null:Number(p.remove_unit_delta_cents)/100,
    add_unit_delta:p?.add_unit_delta_cents==null||p?.add_unit_delta_cents===""?null:Number(p.add_unit_delta_cents)/100,
    sort_order:Math.floor(nm(p?.sort_order,0,9999)),updated_at:new Date().toISOString()};
  if(patch.max_quantity!=null&&patch.max_quantity<patch.min_quantity)return {error:"invalid_quantity_range",status:400};
  let q:any;if(iid){
    q=await db.from("basket_template_items").update(patch).eq("id",iid).eq("basket_id",bid).select("*").maybeSingle();
  }else q=await db.from("basket_template_items").insert(patch).select("*").single();
  if(q.error)throw q.error;if(!q.data)return {error:"basket_item_not_found",status:404};
  await opsEvent("basket.template_item_saved","Item do modelo de cesta atualizado.","basket",bid,{template_item_id:q.data.id,product_id:pid,quantity:qty},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {item:q.data};
}
async function basketItemDelete(p:any,auth:any){
  const bid=id(p?.basket_id),iid=id(p?.id);if(!bid||!iid)return {error:"invalid_basket_item",status:400};
  const q=await db.from("basket_template_items").delete().eq("id",iid).eq("basket_id",bid).select("id").maybeSingle();if(q.error)throw q.error;if(!q.data)return {error:"basket_item_not_found",status:404};
  await opsEvent("basket.template_item_deleted","Item removido do modelo de cesta.","basket",bid,{template_item_id:iid},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {deleted:true};
}
async function basketAlternativeSave(p:any){
  const iid=id(p?.template_item_id),pid=id(p?.product_id);if(!iid||!pid)return {error:"invalid_alternative",status:400};
  const iq=await db.from("basket_template_items").select("id,basket_id,product_id").eq("id",iid).maybeSingle();if(iq.error)throw iq.error;if(!iq.data)return {error:"basket_item_not_found",status:404};
  if(String(iq.data.product_id)===pid)return {error:"alternative_is_current_product",status:409};
  const pq=await db.from("products").select("id,is_active").eq("id",pid).maybeSingle();if(pq.error)throw pq.error;if(!pq.data?.is_active)return {error:"product_unavailable",status:409};
  const q=await db.from("basket_template_item_alternatives").upsert({template_item_id:iid,product_id:pid,priority:Math.floor(nm(p?.priority||100,1,9999)),is_active:true,updated_at:new Date().toISOString()},{onConflict:"template_item_id,product_id"}).select("*").single();
  if(q.error)throw q.error;return {alternative:q.data};
}
async function basketAlternativeDelete(p:any){
  const iid=id(p?.template_item_id),pid=id(p?.product_id);if(!iid||!pid)return {error:"invalid_alternative",status:400};
  const q=await db.from("basket_template_item_alternatives").delete().eq("template_item_id",iid).eq("product_id",pid);if(q.error)throw q.error;
  return {deleted:true};
}
async function basketLotCreate(p:any,auth:any){
  const bid=id(p?.basket_id),quantity=Math.floor(Number(p?.quantity||0)),items=Array.isArray(p?.items)?p.items.slice(0,100):[];
  if(!bid||quantity<=0||!items.length)return {error:"invalid_lot",status:400};
  const cleanItems=items.map((x:any,i:number)=>({template_item_id:id(x?.template_item_id)||null,template_product_id:id(x?.template_product_id)||null,product_id:id(x?.product_id),quantity_per_basket:Number(x?.quantity_per_basket||0),position_order:Number(x?.position_order??i),is_substitution:x?.is_substitution===true,substitution_reason:tx(x?.substitution_reason,300)||null}));
  if(cleanItems.some((x:any)=>!x.product_id||!Number.isFinite(x.quantity_per_basket)||x.quantity_per_basket<=0))return {error:"invalid_lot_items",status:400};
  const q=await db.rpc("create_basket_stock_lot_v1",{p_basket_id:bid,p_quantity:quantity,p_items:cleanItems,p_operator:tx(p?.operator,80)||"Operação",p_notes:tx(p?.notes,800)||null,p_source:"admin",p_allow_stock_gap:false});
  if(q.error){const m=tx(q.error.message,240).split("\n")[0];return {error:m.includes("insufficient_loose_stock")?"insufficient_loose_stock":m||"lot_create_failed",status:m.includes("insufficient")?409:400}}
  await opsEvent("basket.lot_built","Novo lote de cestas registrado.","basket",bid,{lot_id:q.data?.lot_id,lot_code:q.data?.lot_code,quantity},tx(p?.operator,80)||"Operação","human","dona_antonia","basket-lot:"+String(q.data?.lot_id||""));
  return {lot:q.data};
}
async function basketLotCancel(p:any,auth:any){
  const lid=id(p?.lot_id);if(!lid)return {error:"invalid_lot",status:400};
  const l=await db.from("basket_stock_lots").select("id,basket_id,lot_code,status,quantity_available").eq("id",lid).maybeSingle();if(l.error)throw l.error;if(!l.data)return {error:"lot_not_found",status:404};
  const a=await db.from("basket_stock_allocations").select("id",{count:"exact",head:true}).eq("lot_id",lid).eq("status","allocated");if(a.error)throw a.error;if(Number(a.count||0)>0)return {error:"lot_has_allocated_orders",status:409};
  if(l.data.status==="cancelled")return {cancelled:true,already_done:true};
  const q=await db.from("basket_stock_lots").update({status:"cancelled",quantity_available:0,updated_at:new Date().toISOString(),metadata:{cancelled_reason:tx(p?.reason,500)||"Cancelado no Admin",cancelled_at:new Date().toISOString()}}).eq("id",lid);if(q.error)throw q.error;
  await opsEvent("basket.lot_cancelled","Lote de cestas cancelado.","basket",l.data.basket_id,{lot_id:lid,lot_code:l.data.lot_code,remaining_quantity:l.data.quantity_available},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {cancelled:true};
}
async function adminAuth(r:Request){
  const token=(r.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false,status:401,error:"admin_session_invalid"};
  const q=await db.from("admin_users").select("role,is_active").eq("user_id",user.data.user.id).maybeSingle();
  if(q.error)return {ok:false,status:500,error:"admin_lookup_failed"};
  if(!q.data?.is_active)return {ok:false,status:403,error:"admin_not_authorized"};
  return {ok:true,status:200,user_id:user.data.user.id,role:q.data.role||"viewer"};
}
Deno.serve(async(r:Request)=>{if(r.method==="OPTIONS")return new Response(null,{status:204,headers:cors(r)});const u=new URL(r.url),a=tx(u.searchParams.get("action")||(r.method==="GET"?"health":""),80);if(!LOCAL.has(a))return js(r,{ok:false,error:"not_found"},404);try{if(a==="health")return js(r,{ok:true,service:"admin-products-live-v1",mode:"canonical-admin-gateway",version:51,legacy_proxy:false});if(a==="ops2_recover_ean_verified"){
  if(r.method!=="POST")return js(r,{ok:false,error:"method_not_allowed"},405);
  const expected=await db.rpc("get_bling_hub_key_v2");
  if(expected.error||!expected.data)return js(r,{ok:false,error:"internal_auth_unavailable"},503);
  const provided=tx(r.headers.get("x-dona-antonia-bling-hub-key"),500);
  if(!provided||provided!==String(expected.data))return js(r,{ok:false,error:"internal_auth_required"},401);
  let internalBody:any={};try{internalBody=await r.json()}catch{}
  const out=await recoverPendingEanVerified(internalBody?.limit??3);
  return js(r,out,out.ok===false?500:200);
}
const auth:any=await adminAuth(r);if(!auth.ok)return js(r,{ok:false,error:auth.error},auth.status||401);if(r.method==="POST"&&auth.role==="viewer"&&WRITE_ACTIONS.has(a))return js(r,{ok:false,error:"forbidden"},403);if(r.method==="GET"&&a==="baskets_admin")return js(r,{ok:true,...await basketsAdminList()});if(r.method==="GET"&&a==="basket_admin"){const x:any=await basketAdminDetail(u.searchParams.get("id"));return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="ops_summary")return js(r,{ok:true,summary:await opsSummary()});if(r.method==="GET"&&a==="ops_shadow_readiness")return js(r,{ok:true,readiness:await opsShadowReadiness()});if(r.method==="GET"&&a==="ops_print_queue")return js(r,{ok:true,queue:await opsPrintQueue(u.searchParams.get("limit"))});if(r.method==="GET"&&a==="ops_papoai_capture_status")return js(r,{ok:true,papoai:await opsPapoAiCaptureStatus()});if(r.method==="GET"&&a==="ops_timeline")return js(r,{ok:true,events:await opsTimeline(u.searchParams.get("limit"))});if(r.method==="GET"&&a==="ops_delivery_runs")return js(r,{ok:true,delivery:await opsDeliveryRuns()});if(r.method==="GET"&&a==="ops_attention")return js(r,{ok:true,attention:await opsAttention(u.searchParams.get("limit"))});if(r.method==="GET"&&a==="products")return js(r,{ok:true,...await products(u)});if(r.method==="GET"&&a==="product_facets")return js(r,{ok:true,...await facets(tx(u.searchParams.get("category"),120),tx(u.searchParams.get("active"),12))});if(r.method==="GET"&&a==="expirations")return js(r,{ok:true,...await exps()});if(r.method==="GET"&&a==="expiry_alerts"){const x=await exps();return js(r,{ok:true,summary:x.summary,products:x.products.slice(0,12),expired_deactivated:x.expired_deactivated})}if(r.method==="GET"&&a==="product_lots"){const x:any=await productLots(u.searchParams.get("id"));return x.error?js(r,{ok:false,error:x.error},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="product_fefo_preview"){const x:any=await fefoPreview(u.searchParams.get("id"),u.searchParams.get("quantity"));return x.error?js(r,{ok:false,error:x.error},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="product_lifecycle_audit")return js(r,{ok:true,audit:await auditList(Math.floor(nm(u.searchParams.get("limit")||40,1,100)))});if(r.method==="GET"&&a==="inventory_incidents")return js(r,{ok:true,inventory:await inventoryIncidents(u.searchParams.get("limit"))});if(r.method==="GET"&&a==="stock_recount_queue")return js(r,{ok:true,recount:await stockRecountQueue()});if(r.method==="GET"&&a==="ean_lookup"){const x:any=await ean(u.searchParams.get("ean"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="gondolas")return js(r,{ok:true,...await glist()});if(r.method==="GET"&&a==="gondola"){const x:any=await gone(u.searchParams.get("id"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="orders")return js(r,{ok:true,orders:await ordersList()});if(r.method==="GET"&&a==="order"){const x:any=await orderDetailCanonical(u.searchParams.get("id"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="order_stock_shortages")return js(r,{ok:true,...await orderShortages()});if(r.method==="GET"&&a==="closure_orders")return js(r,{ok:true,...await closureOrders()});if(r.method==="GET"&&a==="bling_status"){const h=await hub("readiness");return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,bling:h.data?.readiness??h.data})}if(r.method==="POST"&&a==="bling_status_catalog_probe"){const x:any=await blingStatusCatalogProbe(auth);return x.error?js(r,{ok:false,...x},x.status||502):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="bling_oauth_begin"){const x:any=await blingOauthBegin(auth);return x.error?js(r,{ok:false,...x},x.status||500):js(r,{ok:true,...x})}let p:any={};try{p=await r.json()}catch{}if(r.method==="POST"&&a==="basket_save"){const x:any=await basketSave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_item_save"){const x:any=await basketItemSave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_item_delete"){const x:any=await basketItemDelete(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_alternative_save"){const x:any=await basketAlternativeSave(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_alternative_delete"){const x:any=await basketAlternativeDelete(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_lot_create"){const x:any=await basketLotCreate(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_lot_cancel"){const x:any=await basketLotCancel(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="papoai_issue_catalog_link"){const x:any=await opsPapoAiIssueCatalogLink(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="inventory_sheet_options"){return js(r,{ok:true,...await inventorySheetOptions()})}if(r.method==="GET"&&a==="inventory_sheet_batches"){return js(r,{ok:true,...await inventorySheetBatches()})}if(r.method==="POST"&&a==="inventory_sheet_manifest"){const x:any=await inventorySheetManifest(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="inventory_sheet_pending_manual"){return js(r,{ok:true,...await inventorySheetPendingManual()})}if(r.method==="POST"&&a==="inventory_sheet_cancel_scan"){const x:any=await inventorySheetCancelScan(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="inventory_sheet_preview"){return js(r,{ok:true,...await inventorySheetPreview(p)})}if(r.method==="POST"&&a==="inventory_sheet_create"){const x:any=await inventorySheetCreate(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="inventory_sheet_analyze"){const x:any=await inventorySheetAnalyze(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="inventory_sheet_apply"){const x:any=await inventorySheetApply(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="product_lot_save"){const x:any=await saveProductLot(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="product_lot_tracking_complete"){const x:any=await setLotTrackingComplete(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="history_sync_retry"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const g:any=await guardOrder(oid);return g.error?js(r,{ok:false,...g},g.status||409):js(r,{ok:true,order_id:oid,history_synced:true,canonical:true})}
  if(r.method==="POST"&&a==="order_component_replace"){const oid=id(p?.order_id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const g:any=await guardOrder(oid);if(g.error)return js(r,{ok:false,...g},g.status||409);return js(r,{ok:false,error:"order_component_edit_requires_unreserved_order",canonical:true},409)}
  if(r.method==="POST"&&a==="ops_print_presented"){const x:any=await opsPrintPresented(p?.id);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="ops_delivery_plan"){const x:any=await opsDeliveryPlan(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="manual_order_create"){const x:any=await createManualWhatsappOrder(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_payment_capture"){const x:any=await captureDeliveryPayment(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="delivery_fail_register"){const x:any=await registerFailedDelivery(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="delivery_return_confirm"){const x:any=await confirmDeliveryReturn(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="delivery_return_resolve"){const x:any=await resolveDeliveryReturnReview(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="order_check"){const oid=id(new URL(r.url).searchParams.get("id"));if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const z=await db.rpc("ops_get_order_check_v1",{p_order_id:oid});if(z.error)throw z.error;return js(r,{ok:true,check:z.data})}
  if(r.method==="POST"&&a==="order_check_start"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const g:any=await guardOrder(oid);if(g.error)return js(r,{ok:false,...g},g.status||409);const z=await db.rpc("ops_start_order_check_v1",{p_order_id:oid,p_operator_label:tx(p?.operator,80)||"Operação"});if(z.error)return js(r,{ok:false,error:String(z.error.message||"check_start_failed")},409);return js(r,{ok:true,check:z.data})}
  if(r.method==="POST"&&a==="order_check_scan"){const sid=id(p?.session_id),gtin=dg(p?.gtin,30),qty=Number(p?.quantity??1);if(!sid||!gtin)return js(r,{ok:false,error:"invalid_check_scan"},400);const z=await db.rpc("ops_scan_order_check_v1",{p_session_id:sid,p_gtin:gtin,p_quantity:qty});if(z.error){const m=String(z.error.message||"");return js(r,{ok:false,error:m.includes("ean_not_in_order")?"ean_not_in_order":m.includes("checked_quantity_exceeds_expected")?"checked_quantity_exceeds_expected":m.includes("duplicate_ean_in_order")?"duplicate_ean_in_order":"check_scan_failed"},409)}return js(r,{ok:true,item:z.data})}
  if(r.method==="POST"&&a==="order_check_finish"){
    const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);
    const g:any=await guardOrder(oid);if(g.error)return js(r,{ok:false,...g},g.status||409);
    const operator=tx(p?.operator,80)||"Operação";
    const z=await db.rpc("ops_finish_order_check_v1",{p_order_id:oid,p_operator_label:operator});
    if(z.error)return js(r,{ok:false,error:String(z.error.message||"check_finish_failed")},409);
    if(z.data?.ok!==true)return js(r,{ok:false,...z.data},409);
    const u:any=await updateOrderCanonical({id:oid,status:"ready",operator});
    if(u.error)return js(r,{ok:false,...u},u.status||409);
    await opsEvent("order.check_verified","Conferência por EAN concluída sem divergência.","order",oid,{check_session_id:z.data?.session_id,verified:true},operator,"human","dona_antonia","order-check-verified:"+oid+":"+String(z.data?.session_id));
    let bling_verified:any={attempted:false,ok:false,reason:"protected_rollout"};
    const gate=await db.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle();
    if(gate.error)throw gate.error;
    if(gate.data?.metadata?.ops2_ean_verified_sync_enabled===true){
      const snap=await buildSnapshot(oid,"ean_verified");
      const h=await hub("ops2_ensure_order_state",{payload:snap,target_key:"verified",canary:false});
      if(h.error){
        try{await db.from("orders").update({sync_status:"review_bling",updated_at:new Date().toISOString()}).eq("id",oid)}catch{}
        try{await db.rpc("ops_open_attention_v1",{
          p_type:"order_bling_verified_failed",
          p_summary:"Pedido conferido, mas ainda não mudou para Verificado no Bling.",
          p_entity_type:"order",p_entity_id:oid,p_correlation_id:oid,p_priority:"high",p_owner_role:"supervisor",
          p_recommended_action:"O sistema tentará novamente automaticamente. Não libere a expedição enquanto o Bling não estiver como Verificado.",
          p_evidence:{error:h.error,status:h.status||null,detail:h.data||h.detail||null,check_session_id:z.data?.session_id||null,recovery_cycle:"bling-hub-v2-cycle"},
          p_source_system:"bling",p_idempotency_key:"ops2:order_bling_verified:"+oid,p_due_at:null
        })}catch{}
        bling_verified={attempted:true,ok:false,error:h.error,detail:h.data||h.detail||null,recovery_scheduled:true};
      }else{
        try{
          const a=await db.from("ops_attention").select("id").eq("idempotency_key","ops2:order_bling_verified:"+oid).in("status",["open","acknowledged"]).maybeSingle();
          if(!a.error&&a.data?.id)await db.rpc("ops_resolve_attention_v1",{p_attention_id:a.data.id,p_resolution:"Pedido conferido sincronizado como Verificado no Bling.",p_resolution_ref:h.data?.bling_order_id?"bling-order:"+String(h.data.bling_order_id):null});
        }catch{}
        bling_verified={attempted:true,ok:true,result:h.data};
      }
      await opsEvent(
        bling_verified.ok?"order.bling_verified":"order.bling_verified_pending",
        bling_verified.ok?"Pedido conferido sincronizado como Verificado no Bling.":"Conferência concluída; sincronização Verificado no Bling entrou em recuperação automática.",
        "order",oid,{check_session_id:z.data?.session_id,bling_verified},
        "Automação","automation","bling","order-bling-verified:"+oid+":"+String(z.data?.session_id)
      );
    }
    return js(r,{ok:true,verified:true,order_id:oid,check:z.data,bling_verified});
  }
  if(r.method==="POST"&&a==="order_update"){const x:any=await updateOrderCanonical(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_consume_stock"){const x:any=await consumeOrder(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="bling_probe_readonly"){const h=await hub("probe_readonly");return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,probe:h.data})}if(r.method==="POST"&&a==="bling_reconcile_catalog_readonly"){const h=await reconcileCatalog();return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="bling_reconcile_customers_readonly"){const h=await hub("reconcile_customers_readonly",{limit:p?.limit??650});return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="bling_preview_order_sync"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const x:any=await previewOrder(oid);return x.error?js(r,{ok:false,error:x.error,detail:x.detail},x.status||502):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="bling_reconcile_order_dependencies_readonly"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);return js(r,{ok:true,...await reconcileDeps(oid)})}if(r.method==="POST"&&a==="bling_create_order_customer"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const x:any=await ensureOrderCustomer(oid);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="bling_create_order_products"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const x:any=await createOrderProducts(oid);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_fiscal_status"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const h=await hub("fiscal_status",{source_order_id:oid});return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="order_fiscal_dispatch_canary_execute"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);if(tx(p?.confirmation,40)!=="EMITIR_NFE")return js(r,{ok:false,error:"fiscal_human_confirmation_required"},409);const pf=await db.rpc("ops2_fiscal_dispatch_preflight_v1",{p_order_id:oid});if(pf.error)throw pf.error;if(pf.data?.ready!==true)return js(r,{ok:false,error:"fiscal_dispatch_preflight_failed",preflight:pf.data,detail:"Pedido ainda não está pronto para emissão fiscal."},409);const h=await hub("fiscal_dispatch_canary_human_execute",{source_order_id:oid,confirmation:"EMITIR_NFE"});return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="order_fiscal_document_pdf"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const h=await hub("fiscal_document_pdf",{source_order_id:oid});return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="order_fiscal_confirm_payment"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);return js(r,{ok:false,error:"fiscal_payment_confirmation_deprecated",detail:"O pagamento fiscal agora vem do settlement real da entrega. Esta ação antiga foi desativada para evitar conflito com o gate de NF-e antes da expedição."},409)}if(r.method==="POST"&&a==="bling_finance_overview"){const auth=r.headers.get("Authorization")||"",h=await hub("finance_overview",{},auth);return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="bling_finance_action"){const auth=r.headers.get("Authorization")||"",h=await hub("finance_action",p||{},auth);return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="GET"&&a==="stock_cutover_preflight"){const z=await db.rpc("get_ops2_stock_cutover_preflight_v1");if(z.error)throw z.error;return js(r,{ok:true,preflight:z.data})}if(r.method==="POST"&&a==="stock_reconciliation_classify"){const z:any=await classifyStockReconciliation(p,auth);return z.error?js(r,{ok:false,...z},z.status||400):js(r,{ok:true,...z})}if(r.method==="POST"&&a==="inventory_incident_create"){const z:any=await createInventoryIncident(p,auth);return z.error?js(r,{ok:false,...z},z.status||400):js(r,{ok:true,...z})}let x:any;if(a==="product_save")x=await saveProduct(p);else if(a==="offer_save")x=await saveOffer(p);else if(a==="expiration_save")x=await expSave(p);else if(a==="balance_confirm")x=await bal(p);else if(a==="gondola_create")x=await gcreate(p);else if(a==="gondola_assign")x=await gassign(p);else if(a==="gondola_shelf_update")x=await gshelf(p);else if(a==="gondola_remove")x=await grem(p);else if(a==="gondola_clear")x=await gclear(p);else if(a==="gondola_assign_count")x=await gassignCount(p);else return js(r,{ok:false,error:"method_not_allowed"},405);return x?.error?js(r,{ok:false,error:x.error},x.status||400):js(r,{ok:true,...x})}catch(e){console.error("canonical_admin_error",a,String(e?.message||e));return js(r,{ok:false,error:"service_error",detail:String(e?.message||e)},500)}});
