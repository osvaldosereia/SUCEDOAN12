import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
async function stockAuthority(){const r=await db.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle();if(r.error)throw r.error;return String((r.data?.metadata||{}).ops2_stock_authority||"legacy_shadow")}
async function stockBreakdownMap(ids:string[]){
  const out=new Map<string,any>();const cleanIds=[...new Set((ids||[]).filter(Boolean))];if(!cleanIds.length)return out;
  for(let i=0;i<cleanIds.length;i+=80){
    const r=await db.from("ops2_loose_sellable_stock_v1")
      .select("product_id,sellable_physical,effective_sellable_stock,basket_locked_quantity,loose_sellable_stock,bling_stock_ready")
      .in("product_id",cleanIds.slice(i,i+80));
    if(r.error)throw r.error;
    for(const x of r.data||[])out.set(String(x.product_id),{
      physical_stock:Math.max(0,Number(x.sellable_physical??x.effective_sellable_stock??0)),
      effective_stock:Math.max(0,Number(x.effective_sellable_stock||0)),
      basket_locked:Math.max(0,Number(x.basket_locked_quantity||0)),
      loose_stock:Math.max(0,Number(x.loose_sellable_stock||0)),
      bling_stock_ready:x.bling_stock_ready===true
    });
  }
  return out;
}
async function effectiveStockMap(ids:string[]){
  const raw=await stockBreakdownMap(ids),out=new Map<string,number>();
  for(const [k,v] of raw)out.set(k,Number(v.effective_stock||0));
  return out;
}
async function mappedProduct(p:any){
  if(!p?.id)return mp(p);
  const m=await stockBreakdownMap([p.id]),s:any=m.get(String(p.id))||{};
  return mp({...p,stock:s.effective_stock??0,__stock_breakdown:s});
}
const O=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const OP_SOURCES=["vitrine","storefront_v2","manual_whatsapp","papoai","reorder"];
const LOCAL=new Set(["health","products","product_detail","product_facets","product_save","product_quick_save","product_stock_set","offer_save","expirations","expiration_save","expiry_alerts","product_lots","product_fefo_preview","product_lifecycle_audit","ean_lookup","inventory_balance_resolve_ean","inventory_balance_status","balance_confirm","inventory_balance_prepare_unknown","inventory_balance_commit","inventory_incidents","inventory_incident_create","stock_recount_queue","stock_reconciliation_classify","stock_cutover_preflight","order_check","gondolas","gondola","gondola_create","gondola_assign","gondola_shelf_update","gondola_remove","gondola_clear","gondola_assign_count","orders","order","closure_orders","order_stock_shortages","order_update","order_payment_capture","order_delivery_complete_v3","order_delivery_finalize_v4","order_reopen_v3","delivery_fail_register","delivery_return_confirm","delivery_return_resolve","order_consume_stock","order_separation_get","order_separation_board","order_separation_assign","order_separation_item_set","order_separation_complete","bling_status","bling_status_catalog_probe","bling_oauth_begin","bling_probe_readonly","bling_reconcile_catalog_readonly","bling_reconcile_customers_readonly","bling_preview_order_sync","bling_reconcile_order_dependencies_readonly","bling_create_order_customer","bling_create_order_products","order_fiscal_status","order_fiscal_issue_v4","order_dispatch_start_v4","order_fiscal_dispatch_canary_execute","order_fiscal_document_pdf","order_fiscal_confirm_payment","bling_finance_overview","bling_finance_action","history_sync_retry","order_component_replace","ops_summary","ops_attention","ops_shadow_readiness","ops_print_queue","ops_print_presented","manual_order_create","order_whatsapp_send","order_registration_link_issue","order_registration_link_status","ops_papoai_capture_status","papoai_issue_catalog_link","ops_timeline","ops_delivery_runs","ops_delivery_plan","ops2_recover_ean_verified","inventory_sheet_create","inventory_sheet_preview","inventory_sheet_options","inventory_sheet_batches","inventory_sheet_manifest","inventory_sheet_pending_manual","inventory_sheet_cancel_scan","inventory_sheet_analyze","inventory_sheet_apply","baskets_admin","basket_admin","basket_categories_admin","basket_category_save","basket_category_delete","basket_category_assign","basket_subcategory_save","basket_subcategory_delete","basket_product_search","basket_save","basket_item_save","basket_item_delete","basket_alternative_save","basket_alternative_delete","basket_lot_create","basket_lot_cancel","basket_product_search","basket_commercial_create","basket_commercial_admin","basket_kits_admin","basket_kit_product_suggestions","basket_kit_admin","basket_kit_lot_create","basket_kit_lot_cancel","basket_kit_lot_delete","basket_kit_lot_draft_save","basket_kit_lot_draft_delete","basket_kit_lot_draft_activate","basket_kit_lot_reopen","basket_kit_template_save","basket_kit_template_archive","basket_archive","basket_legacy_lot_release","basket_lot_sale_toggle","basket_lots_sale_bulk","basket_sales_runtime","basket_sales_mode_set","quotes","quote","quote_save","quote_status_set","cnpj_lookup"]);
const WRITE_ACTIONS=new Set(["product_save","product_quick_save","product_stock_set","offer_save","expiration_save","product_lot_save","product_lot_tracking_complete","balance_confirm","inventory_balance_prepare_unknown","inventory_balance_commit","inventory_incident_create","stock_reconciliation_classify","order_check_start","order_check_scan","order_check_finish","gondola_create","gondola_assign","gondola_shelf_update","gondola_remove","gondola_clear","gondola_assign_count","ops_print_presented","ops_delivery_plan","manual_order_create","order_whatsapp_send","order_registration_link_issue","papoai_issue_catalog_link","order_payment_capture","order_delivery_complete_v3","order_delivery_finalize_v4","order_reopen_v3","delivery_fail_register","delivery_return_confirm","delivery_return_resolve","order_update","order_consume_stock","order_separation_assign","order_separation_item_set","order_separation_complete","bling_create_order_customer","bling_create_order_products","order_fiscal_issue_v4","order_dispatch_start_v4","order_fiscal_dispatch_canary_execute","order_fiscal_confirm_payment","bling_finance_action","inventory_sheet_create","inventory_sheet_cancel_scan","inventory_sheet_analyze","inventory_sheet_apply","basket_save","basket_commercial_create","basket_category_save","basket_category_delete","basket_category_assign","basket_subcategory_save","basket_subcategory_delete","basket_item_save","basket_item_delete","basket_alternative_save","basket_alternative_delete","basket_lot_create","basket_lot_cancel","basket_kit_lot_create","basket_kit_lot_cancel","basket_kit_lot_delete","basket_kit_lot_draft_save","basket_kit_lot_draft_delete","basket_kit_lot_draft_activate","basket_kit_lot_reopen","basket_kit_template_save","basket_kit_template_archive","basket_archive","basket_legacy_lot_release","basket_lot_sale_toggle","basket_lots_sale_bulk","basket_sales_mode_set","quote_save","quote_status_set"]);
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
function mp(p:any){
  const m=meta(p.metadata),s=meta(p.__stock_breakdown),o=meta(p.__ops_meta);
  const sellable=Number(p.stock||0),physical=Math.max(0,Number(s.physical_stock??sellable)),locked=Math.max(0,Number(s.basket_locked||0)),loose=Math.max(0,physical-locked),sellableLoose=Math.max(0,Number(s.loose_stock??sellable));
  return {
    id:p.id,sku:p.sku||null,gtin:p.gtin||null,name:p.name||"",description:p.description_short||p.description_long||"",
    active:p.is_active!==false,sale_price_cents:Math.round(Number(p.price||0)*100),cost_cents:Math.round(Number(p.cost||0)*100),
    stock_quantity:physical,physical_stock_quantity:physical,sellable_stock_quantity:sellable,virtual_stock_quantity:sellable,loose_stock_quantity:loose,sellable_loose_stock_quantity:sellableLoose,basket_locked_quantity:locked,
    stock_breakdown_warning:locked>physical+0.0001,stock_breakdown_difference:Math.max(0,locked-physical),
    bling_stock_ready:s.bling_stock_ready===true,
    image_url:p.image_url||"",image_original_url:p.image_original_url||"",image_ai_url:p.image_ai_url||"",
    image_ai_status:p.image_ai_status||null,image_ai_model:p.image_ai_model||null,image_ai_processed_at:p.image_ai_processed_at||null,
    image_ai_error:p.image_ai_error||null,image_ai_validation:p.image_ai_validation||null,
    expiration_date:p.validity_date||null,next_expiration_date:o.next_expiration_date||p.validity_date||null,active_lot_count:Number(o.active_lot_count||0),linked_kits:Array.isArray(o.linked_kits)?o.linked_kits:[],auto_expiry_offer_enabled:m.auto_expiry_offer_enabled===true,
    lot_tracking_complete:m.lot_tracking_complete===true||m.lot_tracking_complete==="true",
    deactivation_reason:m.deactivation_reason||null,deactivated_at:m.deactivated_at||null,updated_at:p.updated_at,
    packaging:p.packaging||"",subcategory:p.subcategory||"",detailed_subcategory:p.subsubcategory||"",
    category:p.sales_category||p.storefront_category||p.category||"",
    gondola_number:p.gondola&&/^\d+$/.test(String(p.gondola))?Number(p.gondola):null,shelf_label:p.shelf||null,offer:offer(p)
  };
}
async function one(pid:string){const r=await db.from("products").select("*").eq("id",pid).maybeSingle();if(r.error)throw r.error;return r.data}
const own=(v:any,k:string)=>Object.prototype.hasOwnProperty.call(v||{},k);
function editorGtins(v:any){
  const raw=Array.isArray(v)?v:String(v??"").split(/[\s,;]+/);
  return [...new Set(raw.map((x:any)=>String(x??"").replace(/\D+/g,"")).filter(Boolean))];
}
function editorTags(v:any){
  const raw=Array.isArray(v)?v:String(v??"").split(/[,;\n]+/);
  return [...new Set(raw.map((x:any)=>tx(x,80)).filter(Boolean))].slice(0,40);
}
function editorGtinValid(v:string){return /^\d{8}$/.test(v)||/^\d{12,14}$/.test(v)}
function nullableEditorNumber(v:any){if(v===null||v===undefined||String(v).trim()==="")return null;const n=Number(String(v).replace(",","."));return Number.isFinite(n)?n:null}
function normalizedFiscal(v:any){
  const f=meta(v),digits=(x:any)=>String(x??"").replace(/\D+/g,"");
  const origin=String(f.origin_code??"").trim()===""?null:Number(f.origin_code);
  return {
    ncm:digits(f.ncm)||null,cest:digits(f.cest)||null,origin_code:origin,
    commercial_gtin:digits(f.commercial_gtin)||null,tax_gtin:digits(f.tax_gtin)||null,
    commercial_unit:tx(f.commercial_unit,30)||null,tax_unit:tx(f.tax_unit,30)||null,
    fiscal_description:tx(f.fiscal_description,500)||null
  };
}
async function validateProductEditorExtras(pid:string,p:any){
  if(own(p,"min_stock")){
    const n=nullableEditorNumber(p.min_stock);if(n!==null&&n<0)return {error:"invalid_min_stock",status:400};
  }
  if(own(p,"gondola")){
    const raw=String(p.gondola??"").trim();if(raw){const n=Number(raw);if(!Number.isInteger(n)||n<1||n>30)return {error:"invalid_gondola",status:400}}
  }
  if(own(p,"additional_gtins")){
    const primary=String(p?.gtin??"").replace(/\D+/g,"");
    const desired=[...new Set([primary,...editorGtins(p.additional_gtins)].filter(Boolean))];
    const invalid=desired.find(x=>!editorGtinValid(x));if(invalid)return {error:"invalid_additional_gtin",status:400,identifier:invalid};
    if(desired.length){
      const q=await db.from("product_identifiers").select("product_id,identifier_value,identifier_kind,status")
        .in("identifier_kind",["base_gtin","package_gtin"]).eq("status","confirmed").in("identifier_value",desired);
      if(q.error)throw q.error;
      const conflict=(q.data||[]).find((x:any)=>String(x.product_id)!==String(pid||""));
      if(conflict)return {error:"identifier_already_linked",status:409,identifier:conflict.identifier_value,product_id:conflict.product_id};
    }
  }
  if(p?.fiscal&&typeof p.fiscal==="object"){
    const f=normalizedFiscal(p.fiscal);
    if(f.ncm&&!/^\d{8}$/.test(f.ncm))return {error:"invalid_ncm",status:400};
    if(f.cest&&!/^\d{7}$/.test(f.cest))return {error:"invalid_cest",status:400};
    if(f.origin_code!==null&&(!Number.isInteger(f.origin_code)||f.origin_code<0||f.origin_code>8))return {error:"invalid_origin_code",status:400};
    if(f.commercial_gtin&&!editorGtinValid(f.commercial_gtin))return {error:"invalid_commercial_gtin",status:400};
    if(f.tax_gtin&&!editorGtinValid(f.tax_gtin))return {error:"invalid_tax_gtin",status:400};
  }
  return null;
}
async function syncProductEditorIdentifiers(productId:string,primary:any,extra:any,operator:any){
  const desired=[...new Set([String(primary??"").replace(/\D+/g,""),...editorGtins(extra)].filter(Boolean))];
  const q=await db.from("product_identifiers").select("id,identifier_value,status").eq("product_id",productId).eq("identifier_kind","base_gtin");
  if(q.error)throw q.error;
  const rows=q.data||[],now=new Date().toISOString();
  for(const row of rows){
    const should=desired.includes(String(row.identifier_value));
    if(should&&row.status!=="confirmed"){
      const u=await db.from("product_identifiers").update({status:"confirmed",source:"admin_product_editor",confidence:1,updated_at:now,metadata:{source_ui:"product_editor",operator:tx(operator,80)||null}}).eq("id",row.id);if(u.error)throw u.error;
    }else if(!should&&row.status==="confirmed"){
      const u=await db.from("product_identifiers").update({status:"inactive",updated_at:now,metadata:{source_ui:"product_editor",operator:tx(operator,80)||null}}).eq("id",row.id);if(u.error)throw u.error;
    }
  }
  const existing=new Set(rows.map((x:any)=>String(x.identifier_value)));
  for(const value of desired){
    if(existing.has(value))continue;
    const ins=await db.from("product_identifiers").insert({product_id:productId,identifier_value:value,identifier_kind:"base_gtin",packaging_unit:null,conversion_factor:null,supplier_document:"",source:"admin_product_editor",confidence:1,status:"confirmed",metadata:{source_ui:"product_editor",operator:tx(operator,80)||null}});
    if(ins.error){const msg=String(ins.error.message||"");if(msg.includes("product_identifiers_confirmed_global_uidx"))return {error:"identifier_already_linked",status:409,identifier:value};throw ins.error}
  }
  return {ok:true};
}
async function saveProductEditorFiscal(productId:string,value:any,operator:any){
  const f=normalizedFiscal(value),now=new Date().toISOString();
  const q=await db.from("product_fiscal_profiles").select("*").eq("product_id",productId).maybeSingle();if(q.error)throw q.error;
  const before=q.data||null,keys=["ncm","cest","origin_code","commercial_gtin","tax_gtin","commercial_unit","tax_unit","fiscal_description"];
  const comparable=(v:any)=>v===null||v===undefined||String(v).trim()===""?null:String(v);
  const fiscalChanged=keys.some(k=>comparable(before?.[k])!==comparable((f as any)[k]));
  if(!fiscalChanged)return {ok:true,changed:false};
  const row:any={
    ...(before||{}),product_id:productId,ncm:f.ncm,cest:f.cest,origin_code:f.origin_code,
    commercial_gtin:f.commercial_gtin,tax_gtin:f.tax_gtin,commercial_unit:f.commercial_unit,tax_unit:f.tax_unit,
    fiscal_description:f.fiscal_description,st_status:before?.st_status||"unknown",
    classification_source:"admin_product_editor",review_status:"human_validated",validated_at:now,
    metadata:{...meta(before?.metadata),last_manual_edit_at:now,last_manual_edit_by:tx(operator,80)||"Operação"},updated_at:now
  };
  delete row.created_at;
  const up=await db.from("product_fiscal_profiles").upsert(row,{onConflict:"product_id"});if(up.error)throw up.error;
  return {ok:true,changed:true};
}
async function productDetail(pid:string){
  if(!pid)return {error:"invalid_product",status:400};
  const p=await one(pid);if(!p)return {error:"product_not_found",status:404};
  const [mapped,ids,fiscal]=await Promise.all([
    mappedProduct(p),
    db.from("product_identifiers").select("id,identifier_value,identifier_kind,packaging_unit,conversion_factor,supplier_document,source,confidence,status,created_at,updated_at").eq("product_id",pid).order("created_at",{ascending:true}),
    db.from("product_fiscal_profiles").select("*").eq("product_id",pid).maybeSingle()
  ]);
  if(ids.error)throw ids.error;if(fiscal.error)throw fiscal.error;
  const identifiers=ids.data||[];
  const additionalGtins=identifiers.filter((x:any)=>x.identifier_kind==="base_gtin"&&x.status==="confirmed"&&String(x.identifier_value)!==String(p.gtin||"")).map((x:any)=>String(x.identifier_value));
  return {product:{
    ...mapped,_detail_loaded:true,ncm:p.ncm||"",brand:p.brand||"",supplier:p.supplier||"",unit:p.unit||"",min_stock:p.min_stock??null,
    detailed_subcategory:p.subsubcategory||"",gondola_number:p.gondola&&/^\d+$/.test(String(p.gondola))?Number(p.gondola):null,shelf_label:p.shelf||"",
    tags:Array.isArray(p.tags)?p.tags:[],storefront_featured:p.storefront_featured===true,is_upsell:p.is_upsell===true,
    is_whatsapp_active:p.is_whatsapp_active===true,whatsapp_category:p.whatsapp_category||"",
    customer_category:p.customer_category||"",customer_subcategory:p.customer_subcategory||"",customer_subsubcategory:p.customer_subsubcategory||"",
    bling_product_id:p.bling_product_id??null,sync_status:p.sync_status||"",last_bling_sync_at:p.last_bling_sync_at||null,source_system:p.source_system||"",
    physically_verified:p.physically_verified===true,physically_verified_at:p.physically_verified_at||null,last_counted_at:p.last_counted_at||null,
    additional_gtins:additionalGtins,identifiers,fiscal:fiscal.data||null
  },identifiers,fiscal:fiscal.data||null};
}
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
async function basketKitProductIds(){
  const [b,k]=await Promise.all([
    db.from("basket_templates").select("id").eq("is_active",true),
    db.from("basket_kit_templates").select("id").eq("is_active",true)
  ]);
  if(b.error)throw b.error;if(k.error)throw k.error;
  const basketIds=(b.data||[]).map((x:any)=>x.id),kitIds=(k.data||[]).map((x:any)=>x.id);
  const out=new Set<string>();
  if(basketIds.length){
    const bi=await db.from("basket_template_items").select("id,product_id").in("basket_id",basketIds).limit(10000);
    if(bi.error)throw bi.error;
    for(const x of bi.data||[])if(x.product_id)out.add(String(x.product_id));
    const itemIds=(bi.data||[]).map((x:any)=>x.id);
    if(itemIds.length){
      const al=await db.from("basket_template_item_alternatives").select("product_id").in("template_item_id",itemIds).eq("is_active",true).limit(10000);
      if(al.error)throw al.error;
      for(const x of al.data||[])if(x.product_id)out.add(String(x.product_id));
    }
  }
  if(kitIds.length){
    const ki=await db.from("basket_kit_template_items").select("product_id").in("kit_template_id",kitIds).limit(10000);
    if(ki.error)throw ki.error;
    for(const x of ki.data||[])if(x.product_id)out.add(String(x.product_id));
  }
  return out;
}
async function productOperationalMetaMap(ids:string[]){
  const out=new Map<string,any>(),clean=[...new Set((ids||[]).filter(Boolean))];if(!clean.length)return out;
  for(const pid of clean)out.set(String(pid),{next_expiration_date:null,active_lot_count:0,linked_kits:[]});
  const [lots,items]=await Promise.all([
    db.from("product_inventory_lots").select("product_id,expiration_date,quantity_on_hand,quantity_reserved,status").in("product_id",clean),
    db.from("basket_kit_template_items").select("product_id,kit_template_id").in("product_id",clean)
  ]);
  if(lots.error)throw lots.error;if(items.error)throw items.error;
  for(const l of lots.data||[]){const pid=String(l.product_id||"");const o=out.get(pid);if(!o||String(l.status||"")!=="active")continue;const available=Number(l.quantity_on_hand||0)-Number(l.quantity_reserved||0);if(available<=0)continue;o.active_lot_count+=1;if(l.expiration_date&&(!o.next_expiration_date||String(l.expiration_date)<String(o.next_expiration_date)))o.next_expiration_date=String(l.expiration_date)}
  const kitIds=[...new Set((items.data||[]).map((x:any)=>String(x.kit_template_id||"")).filter(Boolean))];let kits:any[]=[];if(kitIds.length){const kr=await db.from("basket_kit_templates").select("id,name,kind,is_active,basket_id").in("id",kitIds);if(kr.error)throw kr.error;kits=kr.data||[]}
  const kitMap=new Map(kits.map((k:any)=>[String(k.id),k]));
  for(const x of items.data||[]){const o=out.get(String(x.product_id||"")),k:any=kitMap.get(String(x.kit_template_id||""));if(!o||!k)continue;if(!o.linked_kits.some((z:any)=>String(z.id)===String(k.id)))o.linked_kits.push({id:k.id,basket_id:k.basket_id||null,name:k.name||"Kit",kind:k.kind||null,active:k.is_active!==false})}
  for(const o of out.values())o.linked_kits.sort((a:any,b:any)=>String(a.name||"").localeCompare(String(b.name||""),"pt-BR"));
  return out;
}
function productSortKey(v:any){
  const x=tx(v,30);return new Set(["name_asc","name_desc","updated_desc","updated_asc","expiry_asc","expiry_desc","gondola_asc","gondola_desc"]).has(x)?x:"";
}
function productRowsSort(rows:any[],sort:string,lotStatus:string,memberIds:Set<string>|null){
  return rows.sort((a:any,b:any)=>{
    if(!sort&&lotStatus==="pending"){
      const ax=Number(a.stock||0)>0?0:1,bx=Number(b.stock||0)>0?0:1;if(ax!==bx)return ax-bx;
      const aa=memberIds?.has(String(a.id))?0:1,bb=memberIds?.has(String(b.id))?0:1;if(aa!==bb)return aa-bb;
      const ad=dt(a.validity_date)||"9999-12-31",bd=dt(b.validity_date)||"9999-12-31";if(ad!==bd)return ad.localeCompare(bd);
      if((a.is_active!==false)!==(b.is_active!==false))return a.is_active!==false?-1:1;
    }
    if(sort==="updated_desc"||sort==="updated_asc"){
      const av=String(a.updated_at||""),bv=String(b.updated_at||"");if(av!==bv)return sort==="updated_desc"?bv.localeCompare(av):av.localeCompare(bv);
    }
    if(sort==="expiry_asc"||sort==="expiry_desc"){
      const av=dt(a.validity_date),bv=dt(b.validity_date);if(av!==bv){if(!av)return 1;if(!bv)return -1;return sort==="expiry_desc"?bv.localeCompare(av):av.localeCompare(bv)}
    }
    if(sort==="gondola_asc"||sort==="gondola_desc"){
      const av=/^\d+$/.test(String(a.gondola||""))?Number(a.gondola):null,bv=/^\d+$/.test(String(b.gondola||""))?Number(b.gondola):null;
      if(av!==bv){if(av===null)return 1;if(bv===null)return -1;return sort==="gondola_desc"?bv-av:av-bv}
    }
    const c=String(a.name||"").localeCompare(String(b.name||""),"pt-BR");return sort==="name_desc"?-c:c;
  });
}
async function products(u:URL){
  const off=Math.floor(nm(u.searchParams.get("offset"),0,100000)),lim=Math.floor(nm(u.searchParams.get("limit")||60,1,100));
  const qv=tx(u.searchParams.get("q"),100).replace(/[,%()]/g," "),cat=tx(u.searchParams.get("category"),120),sub=tx(u.searchParams.get("subcategory"),120),act=tx(u.searchParams.get("active"),12),basketKit=tx(u.searchParams.get("basket_kit"),12)==="true",lotStatus=tx(u.searchParams.get("lot_status"),20),sort=productSortKey(u.searchParams.get("sort"));
  let rows:any[]=[];
  const manual=Boolean(cat||basketKit||lotStatus||sort==="gondola_asc"||sort==="gondola_desc");
  if(manual){
    const memberIds=(basketKit||lotStatus==="pending")?await basketKitProductIds():null;
    const all:any[]=[];
    for(let pos=0;pos<10000;pos+=1000){
      let q=db.from("products").select("*").order("id").range(pos,pos+999);
      if(sub)q=q.eq("subcategory",sub);if(act==="true")q=q.eq("is_active",true);if(act==="false")q=q.eq("is_active",false);
      if(qv)q=q.or("name.ilike.%"+qv+"%,gtin.ilike.%"+qv+"%,sku.ilike.%"+qv+"%");
      const r=await q;if(r.error)throw r.error;all.push(...(r.data||[]));if((r.data||[]).length<1000)break;
    }
    const wanted=cat?inventorySheetCanonicalCategory(cat):"";
    const filtered=productRowsSort(all.filter((x:any)=>{
      if(wanted&&inventorySheetCanonicalCategory(x.sales_category||x.storefront_category||x.category)!==wanted)return false;
      if(basketKit&&memberIds&&!memberIds.has(String(x.id)))return false;
      const complete=meta(x.metadata).lot_tracking_complete===true||meta(x.metadata).lot_tracking_complete==="true";
      if(lotStatus==="complete"&&!complete)return false;if(lotStatus==="pending"&&complete)return false;return true;
    }),sort,lotStatus,memberIds);
    rows=filtered.slice(off,off+lim);const [sm,om]=await Promise.all([stockBreakdownMap(rows.map((x:any)=>x.id)),productOperationalMetaMap(rows.map((x:any)=>x.id))]);
    return {products:rows.map((x:any)=>{const s:any=sm.get(String(x.id))||{},o:any=om.get(String(x.id))||{};return mp({...x,stock:s.effective_stock??0,__stock_breakdown:s,__ops_meta:o})}),next_offset:off+lim<filtered.length?off+lim:null,total:filtered.length};
  }
  let q=db.from("products").select("*");
  if(sort==="updated_desc")q=q.order("updated_at",{ascending:false}).order("name");
  else if(sort==="updated_asc")q=q.order("updated_at",{ascending:true}).order("name");
  else if(sort==="expiry_asc")q=q.order("validity_date",{ascending:true,nullsFirst:false}).order("name");
  else if(sort==="expiry_desc")q=q.order("validity_date",{ascending:false,nullsFirst:false}).order("name");
  else q=q.order("name",{ascending:sort!=="name_desc"});
  q=q.range(off,off+lim-1);if(sub)q=q.eq("subcategory",sub);if(act==="true")q=q.eq("is_active",true);if(act==="false")q=q.eq("is_active",false);
  if(qv)q=q.or("name.ilike.%"+qv+"%,gtin.ilike.%"+qv+"%,sku.ilike.%"+qv+"%");
  const r=await q;if(r.error)throw r.error;rows=r.data||[];const [sm,om]=await Promise.all([stockBreakdownMap(rows.map((x:any)=>x.id)),productOperationalMetaMap(rows.map((x:any)=>x.id))]);
  return {products:rows.map((x:any)=>{const s:any=sm.get(String(x.id))||{},o:any=om.get(String(x.id))||{};return mp({...x,stock:s.effective_stock??0,__stock_breakdown:s,__ops_meta:o})}),next_offset:rows.length===lim?off+lim:null};
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
async function saveProduct(p:any){
  const authority=await stockAuthority(),pid=id(p?.id),duplicateFromId=!pid?id(p?.duplicate_from_id):"";
  const name=tx(p?.name,300);if(!name)return {error:"name_required",status:400};
  const b=pid?await one(pid):null;
  const source=duplicateFromId?await one(duplicateFromId):null;
  if(duplicateFromId&&!source)return {error:"duplicate_source_not_found",status:404};
  const editorCheck=await validateProductEditorExtras(pid,p);if(editorCheck)return editorCheck;

  const sourceMeta=meta(source?.metadata),baseMeta=pid?meta(b?.metadata):duplicateFromId?{...sourceMeta}:{};
  if(duplicateFromId){
    for(const k of ["auto_expiry_offer_enabled","deactivation_reason","deactivated_at","offer_source","offer_discount_percent","offer_duration_mode","offer_starts_at","offer_ends_at","offer_effective_expiration","expiry_basis","lot_tracking_complete"]){
      delete (baseMeta as any)[k];
    }
    (baseMeta as any).duplicated_from_product_id=duplicateFromId;
    (baseMeta as any).duplicated_at=new Date().toISOString();
    (baseMeta as any).duplicated_by=tx(p?.operator,80)||"Operação";
  }

  const exp=Object.prototype.hasOwnProperty.call(p||{},"expiration_date")?dt(p.expiration_date):(pid?b?.validity_date:null);
  if(p?.expiration_date&&!exp)return {error:"invalid_expiration_date",status:400};
  let active=Object.prototype.hasOwnProperty.call(p||{},"active")?p.active!==false:(pid?b?.is_active!==false:false);
  let stock=Number(p?.stock_quantity??(pid?b?.stock:0)??0);
  let io=pid?b?.is_offer===true:false,op=pid?(b?.offer_price??null):null;
  let nmeta={...baseMeta,auto_expiry_offer_enabled:p?.auto_expiry_offer_enabled===true};

  if(exp&&days(today(),exp)<0){
    active=false;stock=0;io=false;op=null;
    nmeta={...nmeta,deactivation_reason:"expired",deactivated_at:new Date().toISOString(),offer_source:null};
  }else if(active&&meta(b?.metadata).deactivation_reason==="expired"){
    nmeta={...nmeta,deactivation_reason:null,deactivated_at:null};
  }

  const inherited:any=duplicateFromId?{
    ncm:source?.ncm??null,
    cost:source?.cost??null,
    brand:source?.brand??null,
    subsubcategory:source?.subsubcategory??null,
    supplier:source?.supplier??null,
    unit:source?.unit??null,
    tags:Array.isArray(source?.tags)?source.tags:[],
    min_stock:source?.min_stock??null,
    sort_order:Number(source?.sort_order||0),
    desired_bling_status:source?.desired_bling_status||"A",
    is_whatsapp_active:source?.is_whatsapp_active!==false,
    whatsapp_category:source?.whatsapp_category??null,
    storefront_featured:source?.storefront_featured===true,
    customer_category:source?.customer_category??null,
    customer_subcategory:source?.customer_subcategory??null,
    customer_subsubcategory:source?.customer_subsubcategory??null,
    customer_taxonomy_version:source?.customer_taxonomy_version??null,
    customer_taxonomy_confidence:source?.customer_taxonomy_confidence??null,
    customer_taxonomy_review_status:source?.customer_taxonomy_review_status??null
  }:{};

  const fiscalInput=p?.fiscal&&typeof p.fiscal==="object"?normalizedFiscal(p.fiscal):null;
  const patch:any={
    ...inherited,
    name,
    sku:tx(p?.sku,120)||null,
    gtin:dg(p?.gtin)||null,
    price:Number(p?.sale_price_cents||0)/100,
    ...(own(p,"cost_cents")?{cost:Number(p.cost_cents||0)/100}:{}),
    ...(authority==="bling"&&pid?{}:{stock}),
    is_active:active,
    validity_date:exp,
    sales_category:tx(p?.category,120)||null,
    storefront_category:tx(p?.category,120)||null,
    category:tx(p?.category,120)||null,
    subcategory:tx(p?.subcategory,120)||null,
    ...(own(p,"subsubcategory")?{subsubcategory:tx(p.subsubcategory,120)||null}:{}),
    packaging:tx(p?.packaging,120)||null,
    ...(own(p,"brand")?{brand:tx(p.brand,160)||null}:{}),
    ...(own(p,"supplier")?{supplier:tx(p.supplier,240)||null}:{}),
    ...(own(p,"unit")?{unit:tx(p.unit,30)||null}:{}),
    ...(own(p,"min_stock")?{min_stock:nullableEditorNumber(p.min_stock)}:{}),
    ...(own(p,"gondola")?{gondola:tx(p.gondola,10)||null}:{}),
    ...(own(p,"shelf")?{shelf:tx(p.shelf,40)||null}:{}),
    ...(own(p,"tags")?{tags:editorTags(p.tags)}:{}),
    ...(own(p,"storefront_featured")?{storefront_featured:p.storefront_featured===true}:{}),
    ...(own(p,"is_upsell")?{is_upsell:p.is_upsell===true}:{}),
    ...(own(p,"is_whatsapp_active")?{is_whatsapp_active:p.is_whatsapp_active===true}:{}),
    ...(own(p,"whatsapp_category")?{whatsapp_category:tx(p.whatsapp_category,120)||null}:{}),
    ...(own(p,"customer_category")?{customer_category:tx(p.customer_category,120)||null}:{}),
    ...(own(p,"customer_subcategory")?{customer_subcategory:tx(p.customer_subcategory,120)||null}:{}),
    ...(own(p,"customer_subsubcategory")?{customer_subsubcategory:tx(p.customer_subsubcategory,120)||null}:{}),
    ...(fiscalInput?{ncm:fiscalInput.ncm}:{}),
    image_url:tx(p?.image_url,1200)||null,
    description_short:tx(p?.description,1000)||null,
    is_offer:io,
    offer_price:op,
    metadata:nmeta,
    updated_at:new Date().toISOString()
  };

  let r:any;
  if(pid){
    r=await db.from("products").update(patch).eq("id",pid).select("*").single();
  }else{
    r=await db.from("products").insert({
      ...patch,
      source_system:duplicateFromId?"admin_duplicate":"admin_registration",
      sync_status:"local",
      bling_product_id:null,
      firebase_key:null,
      physically_verified:false,
      physically_verified_at:null,
      physically_verified_by:null,
      gondola:null,
      shelf:null,
      last_counted_at:null,
      last_bling_sync_at:null,
      sync_error:null
    }).select("*").single();
  }
  if(r.error){
    const msg=String(r.error.message||"");
    if(msg.includes("products_gtin")||msg.includes("gtin"))return {error:"gtin_already_exists",status:409};
    if(msg.includes("products_sku")||msg.includes("sku"))return {error:"sku_already_exists",status:409};
    throw r.error;
  }
  if(own(p,"additional_gtins")){const sr=await syncProductEditorIdentifiers(r.data.id,p?.gtin,p.additional_gtins,p?.operator);if(sr?.error)return sr;}
  if(p?.fiscal&&typeof p.fiscal==="object")await saveProductEditorFiscal(r.data.id,p.fiscal,p?.operator);
  if(b)await aud(b,r.data,p,"product_save");
  await rec();
  const fr=await one(r.data.id);
  return {product_id:r.data.id,product:await mappedProduct(fr),duplicated_from_product_id:duplicateFromId||null};
}

async function quickProductSave(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const pid=id(p?.product_id);if(!pid)return {error:"invalid_product",status:400};
  const before=await one(pid);if(!before)return {error:"product_not_found",status:404};
  const patch:any={},m={...meta(before.metadata)},now=new Date().toISOString();let metaChanged=false;
  if(Object.prototype.hasOwnProperty.call(p||{},"sale_price_cents")){
    const cents=Number(p.sale_price_cents);if(!Number.isFinite(cents)||cents<0)return {error:"invalid_price",status:400};patch.price=Math.round(cents)/100;
  }
  if(Object.prototype.hasOwnProperty.call(p||{},"cost_cents")){
    const cents=Number(p.cost_cents);if(!Number.isFinite(cents)||cents<0)return {error:"invalid_cost",status:400};patch.cost=Math.round(cents)/100;
  }
  if(Object.prototype.hasOwnProperty.call(p||{},"gondola_number")){
    if(p.gondola_number===null||p.gondola_number==="")patch.gondola=null;
    else{const g=Number(p.gondola_number);if(!Number.isInteger(g)||g<1||g>30)return {error:"invalid_gondola",status:400};patch.gondola=String(g)}
  }
  if(Object.prototype.hasOwnProperty.call(p||{},"expiration_date")){
    const exp=p.expiration_date?dt(p.expiration_date):null;if(p.expiration_date&&!exp)return {error:"invalid_expiration_date",status:400};patch.validity_date=exp;
    if(exp&&days(today(),exp)<0){patch.is_active=false;patch.is_offer=false;patch.offer_price=null;m.deactivation_reason="expired";m.deactivated_at=now;m.offer_source=null;metaChanged=true}
  }
  const effectiveExp=Object.prototype.hasOwnProperty.call(patch,"validity_date")?patch.validity_date:(before.validity_date||null);
  if(Object.prototype.hasOwnProperty.call(p||{},"active")){
    const next=p.active!==false;if(next&&effectiveExp&&days(today(),effectiveExp)<0)return {error:"expired_product_cannot_activate",status:409};patch.is_active=next;
    if(next&&m.deactivation_reason==="expired"){m.deactivation_reason=null;m.deactivated_at=null;metaChanged=true}
  }
  const nextPrice=Object.prototype.hasOwnProperty.call(patch,"price")?Number(patch.price):Number(before.price||0),nextActive=Object.prototype.hasOwnProperty.call(patch,"is_active")?patch.is_active:before.is_active!==false;
  if((Object.prototype.hasOwnProperty.call(patch,"price")||Object.prototype.hasOwnProperty.call(patch,"validity_date"))&&m.auto_expiry_offer_enabled===true){
    const d=effectiveExp?days(today(),effectiveExp):null,pc=nextActive&&d!==null&&d>=0&&d<=90?(d<30?40:d<60?20:10):null;
    if(pc){patch.is_offer=true;patch.offer_price=Math.round(nextPrice*(100-pc))/100;m.offer_source="expiry_auto";m.offer_discount_percent=pc;metaChanged=true}
    else if(m.offer_source==="expiry_auto"){patch.is_offer=false;patch.offer_price=null;m.offer_source=null;m.offer_discount_percent=null;metaChanged=true}
  }
  if(!Object.keys(patch).length&&!metaChanged)return {product:await mappedProduct(before)};
  if(metaChanged)patch.metadata=m;patch.updated_at=now;
  const r=await db.from("products").update(patch).eq("id",pid).select("*").single();if(r.error)throw r.error;
  await aud(before,r.data,p,"product_quick_save");return {product:await mappedProduct(r.data)};
}

async function ensureProductLinkedForStock(pid:string,operator:string){
  const existing=await db.from("bling_hub_entity_links_v2")
    .select("bling_id,status")
    .eq("source_system","vitrine_qx").eq("entity_type","product").eq("source_id",pid).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data?.status==="matched"&&Number(existing.data?.bling_id)>0){
    return {ok:true,bling_id:Number(existing.data.bling_id),created:false,linked:true};
  }

  const local=await one(pid);
  if(!local)return {ok:false,error:"product_not_found",status:404};
  const gtin=dg(local.gtin,32);
  if(!gtin)return {ok:false,error:"valid_gtin_required_for_bling_link",status:409};

  const lookup=await hub("product_gtin_lookup_readonly",{gtin});
  if(lookup.error)return {ok:false,error:lookup.error,status:lookup.status||409,detail:lookup.data||lookup.detail||null};

  if(lookup.data?.lookup_status==="matched"&&Number(lookup.data?.bling_id)>0){
    const blingId=Number(lookup.data.bling_id),now=new Date().toISOString();
    const up=await db.from("bling_hub_entity_links_v2").upsert({
      source_system:"vitrine_qx",entity_type:"product",source_id:pid,bling_id:blingId,
      identity_kind:"gtin",identity_value:gtin,status:"matched",last_verified_at:now,updated_at:now,
      metadata:{method:"admin_stock_gtin_exact",gtin,verified:true,make_used:false,operator}
    },{onConflict:"source_system,entity_type,source_id"});
    if(up.error)throw up.error;
    await db.from("products").update({
      bling_product_id:blingId,sync_status:"synced",last_bling_sync_at:now,sync_error:null,updated_at:now
    }).eq("id",pid);
    return {ok:true,bling_id:blingId,created:false,linked:true};
  }

  if(lookup.data?.lookup_status!=="not_found"){
    return {ok:false,error:"bling_product_identity_unsafe",status:409,detail:lookup.data};
  }

  const idem="admin-stock-auto-link:"+pid+":"+gtin;
  const enq=await hub("enqueue_job",{
    domain:"product",operation:"create_product",source_id:pid,idempotency_key:idem,
    payload:{product:local,source:"admin_product_stock_set",operator_label:operator}
  });
  if(enq.error)return {ok:false,error:enq.error,status:enq.status||502,detail:enq.data||enq.detail||null};
  const jobId=id(enq.data?.job_id);
  if(!jobId)return {ok:false,error:"product_link_job_missing",status:502};

  let job:any=null;
  for(let attempt=0;attempt<6;attempt++){
    const proc=await hub("process_product_jobs",{limit:10});
    if(proc.error)return {ok:false,error:proc.error,status:proc.status||502,detail:proc.data||proc.detail||null};
    const jq=await db.from("bling_hub_jobs_v2")
      .select("id,status,result,error_code,error_message,updated_at")
      .eq("id",jobId).maybeSingle();
    if(jq.error)throw jq.error;
    job=jq.data||null;
    if(["synced","review_required","failed"].includes(String(job?.status||"")))break;
  }

  if(job?.status!=="synced"){
    return {
      ok:false,error:"product_bling_link_not_synced",status:409,job_id:jobId,
      job_status:job?.status||"pending",error_code:job?.error_code||null,error_message:job?.error_message||null
    };
  }

  const blingId=Number(job?.result?.bling_id||0);
  if(!blingId)return {ok:false,error:"product_bling_id_missing_after_sync",status:502,job_id:jobId};
  const now=new Date().toISOString();
  await db.from("products").update({
    bling_product_id:blingId,sync_status:"synced",last_bling_sync_at:now,sync_error:null,updated_at:now
  }).eq("id",pid);
  return {ok:true,bling_id:blingId,created:job?.result?.created===true,linked:true,job_id:jobId};
}

async function setProductStockOfficial(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const pid=id(p?.product_id),target=Number(p?.stock_quantity);
  if(!pid)return {error:"invalid_product",status:400};
  if(!Number.isFinite(target)||target<0)return {error:"invalid_stock",status:400};
  const operator=tx(p?.operator,80)||"Operação";
  const authority=await stockAuthority();
  if(authority!=="bling")return {error:"bling_stock_authority_not_active",status:409};

  let before=await hub("preview_stock_sync",{source_id:pid,stock_quantity:target});
  let autoLink:any=null;
  if(before.error==="product_not_linked"){
    autoLink=await ensureProductLinkedForStock(pid,operator);
    if(!autoLink.ok)return {
      error:autoLink.error||"product_not_linked",status:autoLink.status||409,
      detail:autoLink.detail||null,job_id:autoLink.job_id||null,job_status:autoLink.job_status||null,
      error_code:autoLink.error_code||null,error_message:autoLink.error_message||null
    };
    before=await hub("preview_stock_sync",{source_id:pid,stock_quantity:target});
  }
  if(before.error)return {error:before.error||"stock_preview_failed",status:before.status||409,detail:before.data||before.detail||null};

  if(before.data?.change_required!==true){
    const product=await one(pid);
    return {
      stock_updated:false,already_target:true,verified:true,current_stock:Number(before.data?.current_stock??target),
      target_stock:target,product:product?await mappedProduct(product):null,
      product_auto_linked:Boolean(autoLink),bling_product_id:Number(before.data?.bling_id||autoLink?.bling_id||0)||null
    };
  }

  const idem="admin-product-stock:"+pid+":"+String(target)+":"+crypto.randomUUID();
  const enq=await hub("enqueue_job",{
    domain:"stock",operation:"set_stock",source_id:pid,idempotency_key:idem,
    payload:{stock_quantity:target,source:"admin_product_editor",operator_label:operator}
  });
  if(enq.error)return {error:enq.error||"stock_enqueue_failed",status:enq.status||502,detail:enq.data||enq.detail||null};
  const jobId=id(enq.data?.job_id);
  if(!jobId)return {error:"stock_job_missing",status:502};

  let job:any=null;
  for(let attempt=0;attempt<5;attempt++){
    const proc=await hub("process_stock_jobs",{limit:10});
    if(proc.error)return {error:proc.error||"stock_process_failed",status:proc.status||502,detail:proc.data||proc.detail||null};
    const jq=await db.from("bling_hub_jobs_v2").select("id,status,result,error_code,error_message,updated_at").eq("id",jobId).maybeSingle();
    if(jq.error)throw jq.error;
    job=jq.data||null;
    if(["synced","review_required","failed"].includes(String(job?.status||"")))break;
  }
  if(job?.status!=="synced"){
    return {error:"stock_update_not_synced",status:409,job_id:jobId,job_status:job?.status||"pending",error_code:job?.error_code||null,error_message:job?.error_message||null};
  }

  const verify=await hub("preview_stock_sync",{source_id:pid,stock_quantity:target});
  if(verify.error||verify.data?.change_required===true){
    return {error:"stock_update_unverified",status:409,job_id:jobId,detail:verify.data||verify.detail||null};
  }

  const product=await one(pid);
  await opsEvent("product.stock_set","Estoque ajustado no Bling pelo cadastro do produto.","product",pid,
    {target_stock:target,previous_stock:Number(before.data?.current_stock??0),job_id:jobId,verified:true,
     product_auto_linked:Boolean(autoLink),bling_product_id:Number(verify.data?.bling_id||autoLink?.bling_id||0)||null},
    operator,"human","bling","product-stock:"+jobId);
  return {
    stock_updated:true,verified:true,job_id:jobId,
    previous_stock:Number(before.data?.current_stock??0),current_stock:target,target_stock:target,
    product_auto_linked:Boolean(autoLink),bling_product_id:Number(verify.data?.bling_id||autoLink?.bling_id||0)||null,
    product:product?await mappedProduct(product):null
  };
}
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
  const itemRows:any[]=[];
  for(let offset=0;;offset+=1000){
    const page=await db.from("order_items").select("order_id,product_id,quantity,metadata")
      .in("order_id",orderIds).not("product_id","is",null).order("id",{ascending:true}).range(offset,offset+999);
    if(page.error)throw page.error;
    itemRows.push(...(page.data||[]));
    if((page.data||[]).length<1000)break;
  }
  const items={data:itemRows};
  const alloc=await db.from("basket_stock_allocations").select("order_id,status").in("order_id",orderIds).in("status",["allocated","consumed"]);if(alloc.error)throw alloc.error;
  const hasKitAlloc=new Set((alloc.data||[]).map((x:any)=>String(x.order_id)));
  const demand=new Map<string,Map<string,number>>(),pids=new Set<string>();
  for(const r of items.data||[]){
    const im=meta(r.metadata),raw=Number(r.quantity||0);
    const q=im.history_kind==="basket_component"
      ?Math.max(0,raw-Number(im.preassembled_units||0))
      :raw;
    if(q<=0)continue;
    if(!demand.has(r.order_id))demand.set(r.order_id,new Map());
    const d=demand.get(r.order_id)!;d.set(r.product_id,(d.get(r.product_id)||0)+q);pids.add(r.product_id)
  }
  const ids=[...pids];if(!ids.length){for(const oid of orderIds)out.set(oid,{ok:hasKitAlloc.has(oid),shortage_count:0,shortages:[],demand_lines:0,reserved_lines:0,error:hasKitAlloc.has(oid)?null:"empty_order_stock",preassembled_only:hasKitAlloc.has(oid)});return out}
  // Keep UUID filters below the gateway URL limit as the order history grows.
  const readStockRows=async()=>{
    const products:any[]=[],reservations:any[]=[];
    for(let i=0;i<ids.length;i+=80){
      const batch=ids.slice(i,i+80);
      const pr=await db.from("products").select("id,name,sku,gtin,is_active,gondola,shelf").in("id",batch);
      if(pr.error)throw pr.error;
      products.push(...(pr.data||[]));
      for(let offset=0;;offset+=1000){
        const rr=await db.from("vitrine_stock_reservations").select("order_id,product_id,quantity,status,expires_at")
          .in("product_id",batch).order("id",{ascending:true}).range(offset,offset+999);
        if(rr.error)throw rr.error;
        reservations.push(...(rr.data||[]));
        if((rr.data||[]).length<1000)break;
      }
    }
    return [{data:products},{data:reservations}];
  };
  const [[pr,rr],sm,authority]=await Promise.all([
    readStockRows(),
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
async function publicOrderCodeMap(ids:string[]){
  const out=new Map<string,string>(),cleanIds=[...new Set((ids||[]).filter(Boolean))];
  for(let i=0;i<cleanIds.length;i+=100){
    const q=await db.from("order_public_snapshots_v1").select("order_id,public_code").in("order_id",cleanIds.slice(i,i+100));
    if(q.error)throw q.error;
    for(const row of q.data||[]){const code=tx(row.public_code,5);if(/^[A-Z]{2}[0-9]{3}$/.test(code))out.set(String(row.order_id),code)}
  }
  return out;
}
async function separationSummaryMap(ids:string[]){
  const out=new Map<string,any>(),cleanIds=[...new Set((ids||[]).filter(Boolean))];
  if(!cleanIds.length)return out;
  const assignments:any[]=[],completions:any[]=[],items:any[]=[];
  for(let i=0;i<cleanIds.length;i+=80){
    const batch=cleanIds.slice(i,i+80);
    const [a,cp,it]=await Promise.all([
      db.from("order_separation_assignments_v1").select("order_id,separator_key,separator_label,assigned_at,updated_at").in("order_id",batch),
      db.from("order_separation_completions_v1").select("order_id,phase,separator_key,missing_subtotal,final_total,completed_at,metadata,updated_at").in("order_id",batch),
      db.from("order_separation_items_v1").select("order_id,state,line_total").in("order_id",batch)
    ]);
    if(a.error)throw a.error;if(cp.error)throw cp.error;if(it.error)throw it.error;
    assignments.push(...(a.data||[]));completions.push(...(cp.data||[]));items.push(...(it.data||[]));
  }
  const am=new Map(assignments.map((x:any)=>[String(x.order_id),x]));
  const cm=new Map(completions.map((x:any)=>[String(x.order_id),x]));
  const counts=new Map<string,any>();
  for(const x of items){
    const oid=String(x.order_id),row=counts.get(oid)||{pending:0,separated:0,missing:0,total:0,missing_subtotal:0};
    const state=String(x.state||"pending");
    if(state==="separated")row.separated++;
    else if(state==="missing"){row.missing++;row.missing_subtotal+=Number(x.line_total||0)}
    else row.pending++;
    row.total++;
    counts.set(oid,row);
  }
  for(const oid of cleanIds){
    const assignment:any=am.get(String(oid))||null,completion:any=cm.get(String(oid))||null;
    const row=counts.get(String(oid))||{pending:0,separated:0,missing:0,total:0,missing_subtotal:0};
    row.missing_subtotal=Math.round(Number(row.missing_subtotal||0)*100)/100;
    out.set(String(oid),{
      assignment,
      counts:row,
      phase:completion?.phase||null,
      completed_at:completion?.completed_at||null,
      missing_subtotal:completion?.missing_subtotal==null?row.missing_subtotal:Number(completion.missing_subtotal||0),
      final_total:completion?.final_total==null?null:Number(completion.final_total||0),
      completion_metadata:completion?.metadata||null
    });
  }
  return out;
}
async function activeSeparationBoard(){
  const q=await db.from("orders").select("id,status").in("status",["confirmed","processing","ready"]).order("created_at",{ascending:false}).limit(500);
  if(q.error)throw q.error;
  const rows=q.data||[],sm=await separationSummaryMap(rows.map((x:any)=>x.id));
  return rows.map((x:any)=>({order_id:x.id,status:uiStatus(x.status),separation_summary:sm.get(String(x.id))||null}));
}
async function mapOrders(rows:any[]){
  const ids=rows.map((o:any)=>o.id);
  const separationIds=rows.filter((o:any)=>["confirmed","processing","ready","out_for_delivery"].includes(uiStatus(o.status))).map((o:any)=>o.id);
  const [rmap,ready,smap,dmap,pmap,separationMap]=await Promise.all([reservationRows(ids),stockReadiness(ids),paymentSettlementMap(ids),deliveryReturnMap(ids),publicOrderCodeMap(ids),separationSummaryMap(separationIds)]);
  const cids=[...new Set(rows.map((o:any)=>o.customer_id).filter(Boolean))],cm=new Map<string,any>();
  if(cids.length){
    const cq=await db.from("ops2_admin_customer_registration_v1")
      .select("customer_id,customer_name,primary_whatsapp_e164,bling_contact_id,registration_complete,flow_required,document_only_pending,bling_ready,bling_linked,missing_fields,current_address")
      .in("customer_id",cids);
    if(cq.error)throw cq.error;
    for(const c of cq.data||[])cm.set(c.customer_id,c);
  }
  return rows.map((o:any)=>{
    const c=cm.get(o.customer_id)||{},orderAddress=meta(o.delivery_address),currentAddress=meta(c.current_address),address:any={...currentAddress};
    for(const [k,v] of Object.entries(orderAddress)){
      if(v!==null&&v!==undefined&&(typeof v!=="string"||v.trim()!==""))address[k]=v;
    }
    return {
      id:o.id,public_code:pmap.get(String(o.id))||null,order_number:o.order_number,status:uiStatus(o.status),total_cents:Math.round(Number(o.total||0)*100),
      payment_method_snapshot:paySnap(o,rmap.get(o.id)||[],smap.get(o.id)||null),delivery_return:dmap.get(o.id)||null,
      delivery_address_snapshot:address,
      whatsapp_phone_e164:o.phone_e164||address.phone||c.primary_whatsapp_e164||"",
      customer_id:o.customer_id,created_at:o.created_at,confirmed_at:o.confirmed_at,delivered_at:o.delivered_at,cancelled_at:o.cancelled_at,
      customer_name:c.customer_name||o.customer_snapshot?.name||address.customer_name||address.recipient_name||"",
      registration_complete:c.registration_complete===true,
      registration_missing_fields:Array.isArray(c.missing_fields)?c.missing_fields:[],
      flow_required:c.flow_required===true,
      document_only_pending:c.document_only_pending===true,
      bling_ready:c.bling_ready===true,
      bling_linked:c.bling_linked===true,
      bling_contact_id:c.bling_contact_id||null,
      history_sync:{state:"synced",canonical:true},stock_readiness:ready.get(o.id)||null,separation_summary:separationMap.get(String(o.id))||null,source:o.source
    };
  });
}
async function ordersList(){const rows:any[]=[];for(let pos=0;pos<5000;pos+=1000){const q=await db.from("orders").select("*").order("created_at",{ascending:false}).range(pos,pos+999);if(q.error)throw q.error;rows.push(...(q.data||[]));if((q.data||[]).length<1000)break}return await mapOrders(rows)}
async function orderDetailCanonical(orderId:any){
  const oid=id(orderId);if(!oid)return {error:"invalid_order",status:400};const oq=await db.from("orders").select("*").eq("id",oid).maybeSingle();if(oq.error)throw oq.error;if(!oq.data)return {error:"order_not_found",status:404};
  const iq=await db.from("order_items").select("*").eq("order_id",oid).order("created_at");if(iq.error)throw iq.error;const itemRows=iq.data||[],pids=[...new Set(itemRows.map((x:any)=>x.product_id).filter(Boolean))],pm=new Map<string,any>();
  if(pids.length){const pq=await db.from("products").select("id,name,image_url,sku,gtin,gondola,shelf").in("id",pids);if(pq.error)throw pq.error;for(const p of pq.data||[])pm.set(p.id,p)}
  const compsByBasket=new Map<string,any[]>();for(const it of itemRows){const im=meta(it.metadata);if(im.history_kind==="basket_component"){const k=tx(im.parent_basket_name||im.basket_name,220)||"Cesta";if(!compsByBasket.has(k))compsByBasket.set(k,[]);compsByBasket.get(k)!.push(it)}}
  const result:any[]=[],seenBaskets=new Set<string>();
  for(const it of itemRows){const im=meta(it.metadata);if(im.history_kind==="basket_component")continue;const p=pm.get(it.product_id);if(im.history_kind==="basket"){const k=tx(it.name_snapshot,220)||"Cesta";if(seenBaskets.has(k))continue;seenBaskets.add(k);const baskets=itemRows.filter((z:any)=>meta(z.metadata).history_kind==="basket"&&tx(z.name_snapshot,220)===k),qty=baskets.reduce((s:number,z:any)=>s+Number(z.quantity||0),0),sum=baskets.reduce((s:number,z:any)=>s+Math.round(Number(z.line_total||0)*100),0),grouped=new Map<string,any>();for(const c of compsByBasket.get(k)||[]){const cp=pm.get(c.product_id),key=String(c.product_id||c.name_snapshot),old=grouped.get(key);if(old)old.quantity+=Number(c.quantity||0);else grouped.set(key,{id:c.id,product_id:c.product_id,name_snapshot:c.name_snapshot,sku_snapshot:c.sku_snapshot,gtin:cp?.gtin||"",quantity:Number(c.quantity||0),image_url:cp?.image_url||meta(c.metadata).image_url||"",gondola_number:cp?.gondola&&/^\d+$/.test(String(cp.gondola))?Number(cp.gondola):null,shelf_label:cp?.shelf||null,metadata:c.metadata})}result.push({...it,item_kind:"basket",quantity:1,name_snapshot:k+(qty>1?" ("+qty+" cestas)":""),total_cents:sum,image_url:im.image_url||"",gondola_number:null,shelf_label:null,components:[...grouped.values()]});continue}result.push({...it,item_kind:"product",total_cents:Math.round(Number(it.line_total||0)*100),gtin:p?.gtin||"",image_url:p?.image_url||im.image_url||"",gondola_number:p?.gondola&&/^\d+$/.test(String(p.gondola))?Number(p.gondola):null,shelf_label:p?.shelf||null,components:[]})}
  for(const [k,components] of compsByBasket){
    if(seenBaskets.has(k)||!components.length)continue;
    const grouped=new Map<string,any>();let basketQty=1;
    for(const c of components){
      const cm=meta(c.metadata),cp=pm.get(c.product_id),key=String(c.product_id||c.name_snapshot),old=grouped.get(key);
      basketQty=Math.max(basketQty,Math.max(1,Number(cm.basket_quantity||1)));
      if(old)old.quantity+=Number(c.quantity||0);
      else grouped.set(key,{id:c.id,product_id:c.product_id,name_snapshot:c.name_snapshot,sku_snapshot:c.sku_snapshot,gtin:cp?.gtin||"",quantity:Number(c.quantity||0),image_url:cp?.image_url||cm.image_url||"",gondola_number:cp?.gondola&&/^\d+$/.test(String(cp.gondola))?Number(cp.gondola):null,shelf_label:cp?.shelf||null,metadata:c.metadata});
    }
    const first=components[0],fm=meta(first.metadata),sum=components.reduce((total:number,z:any)=>total+Math.round(Number(z.line_total||0)*100),0);
    const syntheticAdjustmentCents=compsByBasket.size===1?Math.round(Number(oq.data.other_expenses||0)*100):0,syntheticCommercialTotal=sum+syntheticAdjustmentCents;
    result.push({...first,product_id:null,item_kind:"basket",quantity:1,unit_price:syntheticCommercialTotal/100,line_total:syntheticCommercialTotal/100,name_snapshot:k+(basketQty>1?" ("+basketQty+" cestas)":""),total_cents:syntheticCommercialTotal,image_url:fm.basket_image_url||fm.image_url||"",gondola_number:null,shelf_label:null,metadata:{...fm,history_kind:"basket",synthetic_from_components:true,componentTotalCents:sum,commercialAdjustmentCents:syntheticAdjustmentCents},components:[...grouped.values()]});
    seenBaskets.add(k);
  }
  let customer:any=null;const cid=oq.data.customer_id||oq.data.customer_snapshot?.customer_id||oq.data.delivery_address?.source_customer_id;
  if(id(cid)){const cq=await db.from("customers").select("*").eq("id",cid).maybeSingle();if(cq.error)throw cq.error;if(cq.data){const aq=await db.from("customer_addresses").select("*").eq("customer_id",cid).eq("is_active",true).order("is_default",{ascending:false}).limit(1).maybeSingle();if(aq.error)throw aq.error;customer={id:cq.data.id,display_name:cq.data.name,phone:cq.data.primary_whatsapp_e164||"",cpf:cq.data.cpf_cnpj||"",email:"",status:cq.data.is_active===false?"inactive":"active",address:aq.data||null}}}
  if(!customer){const a=oq.data.delivery_address||{},cs=oq.data.customer_snapshot||{};customer={id:null,source_customer_id:a.source_customer_id||cs.customer_id||null,display_name:cs.name||a.customer_name||a.recipient_name||"",phone:oq.data.phone_e164||a.phone||"",cpf:cs.cpf||a.cpf||"",email:cs.email||a.email||"",status:"active",address:a}}
  const aq=await db.from("basket_stock_allocations").select("basket_id,lot_id,quantity,status,allocation_role,metadata,lot:basket_stock_lots(short_code,lot_code,lot_kind)").eq("order_id",oid).order("created_at");
  if(aq.error)throw aq.error;
  const separation_plan=(aq.data||[]).map((a:any)=>{const lot:any=Array.isArray(a.lot)?a.lot[0]:a.lot;return {basket_id:a.basket_id,lot_id:a.lot_id,quantity:Number(a.quantity||0),status:a.status,role:a.allocation_role,short_code:lot?.short_code||meta(a.metadata).short_code||null,lot_code:lot?.lot_code||null,lot_kind:lot?.lot_kind||a.allocation_role}});
  const mapped=(await mapOrders([oq.data]))[0];let bl:any=null;try{const h=await hub("order_link_status",{source_order_id:oid});if(!h.error)bl=h.data}catch{}
  let publicLink:any=null;try{const q=await db.rpc("ops2_order_public_link_v1",{p_order_id:oid});if(!q.error)publicLink=q.data||null}catch{}
  return {order:{...mapped,subtotal_cents:Math.round(Number(oq.data.subtotal||0)*100),discount_cents:Math.round(Number(oq.data.discount||0)*100),delivery_cents:0,public_order_url:publicLink?.public_url||null,public_order_code:publicLink?.public_code||null,public_code:publicLink?.public_code||mapped.public_code||null},customer,history_sync:{state:"synced",canonical:true},stock_readiness:mapped.stock_readiness,bling_link:bl,items:result,separation_plan,checkout_separation_plan:oq.data.checkout_snapshot?.separation_plan||[]};
}
async function guardOrder(oid:string){const c=await cutover(),q=await db.from("orders").select("id,created_at,source").eq("id",oid).maybeSingle();if(q.error)throw q.error;if(!q.data)return {error:"order_not_found",status:404};if(!OP_SOURCES.includes(String(q.data.source||""))||(c.legacy_orders_read_only&&Date.parse(q.data.created_at)<Date.parse(c.live_orders_since)))return {error:"legacy_order_read_only",status:409};return {ok:true}}
function transitionAllowed(a:string,b:string){if(a===b)return true;const m:any={created:["confirmed","cancelled"],confirmed:["processing","cancelled"],processing:["ready","cancelled"],ready:["cancelled"],out_for_delivery:["ready","delivered","cancelled"],delivered:[],cancelled:[]};return (m[a]||[]).includes(b)}
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

function orderFiscalBlockers(...groups:any[]){return [...new Set(groups.flatMap((g:any)=>Array.isArray(g)?g:[]).map((x:any)=>tx(x,180)).filter(Boolean))]}
async function orderFiscalStatusV4(rawId:any){
  const oid=id(rawId);if(!oid)return {error:"invalid_order",status:400};
  const [oq,elig,ctl]=await Promise.all([
    db.from("orders").select("id,status,order_number,total").eq("id",oid).maybeSingle(),
    db.rpc("preview_bling_invoice_eligibility_v1",{p_order_id:oid}),
    db.from("order_fiscal_controls").select("fiscal_status,fiscal_block_reason,payment_status,payment_method,payment_source,settled_amount,payment_confirmed_at,dispatch_fiscal_status,dispatch_fiscal_authorized_at,bling_invoice_id,bling_invoice_number,sefaz_status,issued_at,dispatch_started_at").eq("order_id",oid).maybeSingle()
  ]);
  if(oq.error)throw oq.error;if(!oq.data)return {error:"order_not_found",status:404};
  if(elig.error)throw elig.error;if(ctl.error)throw ctl.error;
  const h=await hub("fiscal_dispatch_preview",{source_order_id:oid});
  if(h.error)return {error:h.error||"fiscal_status_unavailable",status:h.status||502,detail:h.detail||h.data||null};
  const remote:any=h.data||{},control:any=ctl.data||{},invoice:any=remote.invoice||{};
  const authorized=control.dispatch_fiscal_status==="authorized"||control.dispatch_fiscal_status==="not_required"||invoice?.situation?.authorized===true||remote.already_authorized===true;
  const hard=orderFiscalBlockers(remote.hard_blockers);
  if(elig.data?.eligible!==true&&elig.data?.reason)hard.push(tx(elig.data.reason,180));
  const uniqueHard=[...new Set(hard.filter(Boolean))];
  const productionIssueEnabled=remote.config?.human_issue_enabled===true&&remote.config?.dispatch_gate_mode==="enforce";
  const selectedCanary=remote.config?.canary_enabled===true&&remote.config?.canary_selected===true;
  const issueEnabled=productionIssueEnabled||selectedCanary;
  const canIssue=oq.data.status==="ready"&&elig.data?.eligible===true&&!authorized&&uniqueHard.length===0&&issueEnabled;
  const canDispatch=oq.data.status==="ready"&&authorized;
  const danfeAvailable=authorized&&Boolean(invoice?.chaveAcesso||remote.job?.access_key||control.bling_invoice_id);
  const terminalFailed=invoice?.situation?.failed===true;
  const invoiceId=Number(control.bling_invoice_id||remote.invoice_id||invoice?.id||0)||null;
  let stage="blocked";
  if(authorized)stage="authorized";
  else if(terminalFailed)stage="rejected";
  else if(invoiceId)stage="processing";
  else if(oq.data.status==="ready"&&elig.data?.eligible===true)stage="pending";
  const blockers=orderFiscalBlockers(uniqueHard,issueEnabled?[]:["fiscal_human_issue_not_enabled"]);
  return {
    order_id:oid,order_number:oq.data.order_number||null,order_status:oq.data.status,stage,authorized,can_issue:canIssue,can_dispatch:canDispatch,
    invoice_id:invoiceId,invoice_number:control.bling_invoice_number||invoice?.numero||remote.job?.bling_invoice_number||null,
    sefaz_status:control.sefaz_status||invoice?.situation?.label||remote.job?.sefaz_status||null,danfe_available:danfeAvailable,
    dispatch_started_at:control.dispatch_started_at||null,blockers,hard_blockers:uniqueHard,issue_enabled:issueEnabled,
    fiscal_status:control.fiscal_status||stage,fiscal_block_reason:control.fiscal_block_reason||null,
    payment_status:control.payment_status||"pending",payment_method:control.payment_method||null,payment_source:control.payment_source||null,
    settled_amount_cents:control.settled_amount==null?null:Math.round(Number(control.settled_amount||0)*100),payment_confirmed_at:control.payment_confirmed_at||null,
    bling_invoice_id:invoiceId,bling_invoice_number:control.bling_invoice_number||invoice?.numero||remote.job?.bling_invoice_number||null,
    dispatch_gate:remote.dispatch_gate||null,config:remote.config||null,readiness:elig.data||null,provider:remote
  };
}
async function orderFiscalIssueV4(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};
  if(tx(p?.confirmation,40)!=="EMITIR_NFE")return {error:"fiscal_human_confirmation_required",status:409};
  const pf=await db.rpc("ops2_fiscal_dispatch_preflight_v1",{p_order_id:oid});if(pf.error)throw pf.error;
  if(pf.data?.ready!==true)return {error:"fiscal_dispatch_preflight_failed",status:409,blockers:pf.data?.blockers||[],preflight:pf.data};
  const before:any=await orderFiscalStatusV4(oid);if(before.error)return before;
  if(before.authorized===true)return {issued:false,idempotent_replay:true,fiscal:before};
  if((before.hard_blockers||[]).length)return {error:"fiscal_dispatch_not_eligible",status:409,blockers:before.hard_blockers,fiscal:before};
  const h=await hub("fiscal_dispatch_canary_human_execute",{source_order_id:oid,confirmation:"EMITIR_NFE"});
  if(h.error)return {error:h.error||"fiscal_issue_failed",status:h.status||409,detail:h.detail||h.data||null,fiscal:before};
  try{await hub("fiscal_dispatch_reconcile",{source_order_id:oid})}catch{}
  const after:any=await orderFiscalStatusV4(oid);
  return {issued:true,result:h.data||null,fiscal:after};
}
async function orderDispatchStartV4(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};
  const ret=await db.from("order_delivery_return_cases").select("id,status").eq("order_id",oid).in("status",["returning","returned_review"]).limit(1).maybeSingle();
  if(ret.error)throw ret.error;if(ret.data?.id)return {error:"delivery_return_open",status:409,delivery_return_case_id:ret.data.id};
  const fiscal:any=await orderFiscalStatusV4(oid);if(fiscal.error)return fiscal;
  if(fiscal.authorized!==true)return {error:"fiscal_authorization_required_before_dispatch",status:409,fiscal};
  let physical_stock:any={attempted:false,ok:true,authority:await stockAuthority()};
  if(physical_stock.authority==="bling"){
    const snap=await buildSnapshot(oid,"dispatch_physical_stock");
    const launch=await hub("ops2_launch_physical_stock",{payload:snap});
    if(launch.error)return {error:launch.error||"physical_stock_launch_failed",status:launch.status||409,detail:launch.detail||launch.data||null,fiscal};
    physical_stock={attempted:true,ok:true,authority:"bling",result:launch.data||null};
  }
  const operator=tx(p?.operator,80)||"Operação";
  const key=tx(p?.idempotency_key,160)||("dispatch-v4:"+oid);
  const q=await db.rpc("ops4_start_dispatch_v1",{p_order_id:oid,p_operator_label:operator,p_idempotency_key:key});
  if(q.error)return {error:tx(q.error.message,260)||"dispatch_start_failed",status:409,detail:q.error.details||null,fiscal,physical_stock};
  try{await db.rpc("ops_sync_delivery_stop_v1",{p_order_id:oid,p_order_status:"out_for_delivery"})}catch{}
  return {dispatch:q.data,fiscal,physical_stock};
}
async function rejectCriticalStatusBypass(p:any){
  const requested=p?.status!==undefined?uiStatus(p.status):"";
  if(requested==="out_for_delivery")return {
    error:"canonical_dispatch_required",status:409,
    required_action:"order_dispatch_start_v4",
    message:"Use o comando canônico de saída para entrega."
  };
  if(requested==="delivered")return {
    error:"canonical_delivery_required",status:409,
    required_action:"order_delivery_complete_v3",
    message:"Use o comando canônico de conclusão da entrega."
  };
  return null;
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
async function buildSnapshot(oid:string,reason="first_separation",options:any={}){
  const oq=await db.from("orders").select("*").eq("id",oid).maybeSingle();if(oq.error)throw oq.error;if(!oq.data)throw new Error("order_not_found");
  const iq=await db.from("order_items").select("*").eq("order_id",oid).order("created_at");if(iq.error)throw iq.error;
  const cq=options?.include_all_items===true?{data:null,error:null}:await db.from("order_separation_completions_v1").select("deliverable_order_item_ids,phase").eq("order_id",oid).maybeSingle();if(cq.error)throw cq.error;
  const allRows=iq.data||[],deliverableIds=new Set<string>(Array.isArray(cq.data?.deliverable_order_item_ids)?cq.data.deliverable_order_item_ids.map(String):[]),rows=cq.data?allRows.filter((z:any)=>deliverableIds.has(String(z.id))):allRows,pids=[...new Set(rows.map((z:any)=>z.product_id).filter(Boolean))],pm=new Map<string,any>();
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
  const splitQ=await db.from("basket_templates").select("id,split_kits_enabled").eq("is_active",true);
  if(splitQ.error)throw splitQ.error;
  const splitReady=(splitQ.data||[]).length>0&&(splitQ.data||[]).every((x:any)=>x.split_kits_enabled===true);
  const q=splitReady
    ?await db.rpc("create_vitrine_cart_order_v3",{p_phone:phone,p_payment_method:payment,p_items:items,p_customer_snapshot:snapshot,p_delivery:delivery})
    :await db.rpc("create_canonical_cart_order_v2",{
      p_source:"manual_whatsapp",p_phone:phone,p_payment_method:payment,p_items:items,
      p_customer_snapshot:snapshot,p_delivery:delivery
    });
  if(q.error){const e=tx(q.error.message,180).split("\n")[0];return {error:e||"order_failed",status:["insufficient_stock","product_unavailable","basket_unavailable","basket_product_unavailable","basket_kit_lot_unavailable","basket_kit_lot_insufficient","basket_component_not_in_selected_kit","minimum_order"].includes(e)?409:400}}
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
  const [legacy,bridge,identity]=await Promise.all([
    db.rpc("get_papoai_webhook_capture_status_v2"),
    db.rpc("get_ops2_papoai_bridge_health_v1"),
    db.rpc("ops2_customer_identity_summary_v1")
  ]);
  if(legacy.error)throw legacy.error;
  if(bridge.error)throw bridge.error;
  if(identity.error)throw identity.error;
  const a=legacy.data||{},b=bridge.data||{},i=identity.data||{};
  const identityAttention=Number(i.site_orders_without_customer_with_phone_31d||0)>0;
  return {
    ...a,...b,
    identity:i,
    captured_24h:Number(b.events_24h??a.captured_24h??0),
    review_required:Number(b.events_review??a.review_required??0),
    bridge_state:b.capture_enabled===true?(b.last_error||identityAttention?"attention":"online"):"offline"
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
  // Consulta somente os IDs pedidos em blocos pequenos. Evita tanto URL excessiva
  // quanto truncamento pelo limite máximo de linhas do Data API.
  for(let i=0;i<clean.length;i+=60){
    const q=await db.from("ops2_loose_sellable_stock_v1")
      .select("product_id,sellable_physical,effective_sellable_stock,basket_locked_quantity,loose_sellable_stock,bling_stock_ready")
      .in("product_id",clean.slice(i,i+60));
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
  const sameSub=Boolean(baseSub&&sub&&baseSub===sub),sameSub2=Boolean(baseSub2&&sub2&&baseSub2===sub2),sameMeasure=Boolean(bm&&cm&&bm===cm);
  const priceDiff=bp>0&&cp>0?Math.abs(cp-bp)/bp:999,priceClose=priceDiff<=.40;
  if(sameSub){score+=90;reasons.push("mesma subcategoria")}
  if(sameSub2){score+=45;reasons.push("mesmo tipo")}
  if(baseCat&&cat&&baseCat===cat){score+=22;reasons.push("mesma categoria")}
  if(sameMeasure){score+=65;reasons.push("mesma embalagem")}
  if(basketNorm(base?.unit)&&basketNorm(base?.unit)===basketNorm(c?.unit)){score+=8}
  if(priceDiff<=.1)score+=20;else if(priceDiff<=.25)score+=10;
  if(saved)reasons.unshift("alternativa cadastrada");
  const compatible=saved||((sameSub||sameSub2)&&(sameMeasure||priceClose));
  return {score,reasons,compatible};
}

function basketKitPackageCompatible(base:any,candidate:any){
  const measure=(p:any)=>{
    const text=basketNorm(String(p?.packaging||"")+" "+String(p?.name||"")).replace(/,/g,".");
    const m=text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
    if(!m)return null;
    return {value:Number(m[1])*(m[2]==="kg"||m[2]==="l"?1000:1),kind:m[2]==="kg"||m[2]==="g"?"mass":"volume"};
  };
  const a=measure(base),b=measure(candidate);
  if(a&&b)return a.kind===b.kind&&b.value>=a.value*.80&&b.value<=a.value*1.25;
  const pack=basketNorm(base?.packaging);
  return Boolean(pack)&&pack===basketNorm(candidate?.packaging);
}
async function basketKitSuggestions(base:any,products:any[],loose:Map<string,any>,qty:number,catalog:Map<string,string>,priceVariation=15){
  const family=catalog.get(String(base?.id));if(!family)return [];
  const basePrice=Number(base?.price||0),scored:any[]=[];
  for(const cand of products){
    if(String(cand.id)===String(base?.id)||catalog.get(String(cand.id))!==family)continue;
    const available=Number(loose.get(String(cand.id))?.loose_sellable_stock||0),candidatePrice=Number(cand.price||0);
    scored.push({...cand,loose_stock:available,price_cents:Math.round(candidatePrice*100),capacity:qty>0?Math.floor(available/qty):0,price_delta_pct:basePrice>0?Math.abs(candidatePrice-basePrice)/basePrice*100:null});
  }
  scored.sort((a:any,b:any)=>{const aa=Number(a.loose_stock||0)>0?1:0,bb=Number(b.loose_stock||0)>0?1:0,ad=Number.isFinite(Number(a.price_delta_pct))?Number(a.price_delta_pct):Number.POSITIVE_INFINITY,bd=Number.isFinite(Number(b.price_delta_pct))?Number(b.price_delta_pct):Number.POSITIVE_INFINITY;return bb-aa||Number(b.loose_stock||0)-Number(a.loose_stock||0)||ad-bd||String(a.name).localeCompare(String(b.name),"pt-BR")});
  return scored;
}
async function basketKitProductSuggestions(u:URL){
  const pid=id(u.searchParams.get("product_id"));if(!pid)return {error:"invalid_product",status:400};
  const quantity=Number(u.searchParams.get("quantity_per_kit")||1);
  if(!Number.isInteger(quantity)||quantity<1||quantity>100)return {error:"invalid_quantity",status:400};
  const membership=await db.from("basket_lot_substitution_products").select("family_key").eq("product_id",pid).maybeSingle();
  if(membership.error)throw membership.error;
  const family=membership.data?.family_key;if(!family)return {family_key:null,suggestions:[]};
  const [rule,members]=await Promise.all([
    db.from("basket_lot_substitution_rules").select("enabled,label").eq("family_key",family).maybeSingle(),
    db.from("basket_lot_substitution_products").select("product_id").eq("family_key",family).order("product_id")
  ]);
  if(rule.error)throw rule.error;if(members.error)throw members.error;
  if(rule.data?.enabled!==true)return {family_key:family,family_label:rule.data?.label||family,suggestions:[]};
  const ids=(members.data||[]).map((m:any)=>String(m.product_id)),products:any[]=[];
  for(let i=0;i<ids.length;i+=60){
    const q=await db.from("products").select("id,name,sku,gtin,image_url,price,packaging,unit,brand").eq("is_active",true).in("id",ids.slice(i,i+60));
    if(q.error)throw q.error;products.push(...(q.data||[]));
  }
  const base=products.find(p=>String(p.id)===pid);if(!base)return {family_key:family,family_label:rule.data?.label||family,suggestions:[]};
  const loose=await basketLooseStockMap(products.map(p=>p.id));
  const basePrice=Number(base.price||0);
  const suggestions=products.filter(p=>String(p.id)!==pid).map((cand:any)=>{
    const available=Number(loose.get(String(cand.id))?.loose_sellable_stock||0),candidatePrice=Number(cand.price||0);
    return {...cand,loose_stock:available,price_cents:Math.round(candidatePrice*100),capacity:quantity>0?Math.floor(available/quantity):0,price_delta_pct:basePrice>0?Math.abs(candidatePrice-basePrice)/basePrice*100:null};
  });
  suggestions.sort((a:any,b:any)=>{
    const aa=Number(a.loose_stock||0)>0?1:0,bb=Number(b.loose_stock||0)>0?1:0;
    const ad=Number.isFinite(Number(a.price_delta_pct))?Number(a.price_delta_pct):Number.POSITIVE_INFINITY;
    const bd=Number.isFinite(Number(b.price_delta_pct))?Number(b.price_delta_pct):Number.POSITIVE_INFINITY;
    return bb-aa||Number(b.loose_stock||0)-Number(a.loose_stock||0)||ad-bd||String(a.name).localeCompare(String(b.name),"pt-BR");
  });
  return {family_key:family,family_label:rule.data?.label||family,suggestions};
}
function nextBasketKitShortCodeFromLots(prefix:string,lots:any[]){
  const used=new Set((lots||[]).filter((l:any)=>["draft","ready"].includes(String(l.status))).map((l:any)=>String(l.short_code||"")));
  for(const digit of ["1","2","3","4","5","6","7","8","9","0"]){const code=String(prefix||"")+digit;if(!used.has(code))return code}
  return null;
}
async function basketCommercialCreate(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const name=tx(p?.name,220),categoryId=id(p?.category_id),priceCents=Number(p?.base_price_cents);
  if(!name)return {error:"name_required",status:400};
  if(!categoryId)return {error:"category_required",status:400};
  if(!Number.isFinite(priceCents)||priceCents<0)return {error:"price_invalid",status:400};
  const operator=tx(p?.operator,80)||"Operação";
  const q=await db.rpc("create_basket_commercial_model_v1",{
    p_name:name,p_category_id:categoryId,p_base_price:Math.round(priceCents)/100,p_operator:operator
  });
  if(q.error){
    const m=String(q.error.message||"");
    const code=m.includes("basket_category_required")?"category_required":m.includes("basket_price_invalid")?"price_invalid":m.includes("basket_name_required")?"name_required":"basket_commercial_create_failed";
    return {error:code,status:400};
  }
  const model=q.data||{};
  await opsEvent("basket.commercial_created","Cesta/Kit criada.","basket",model.basket_id||null,{...model},operator,"human","dona_antonia");
  return {model};
}
async function basketCommercialAdmin(){
  const [catalogQ,availabilityQ,categoriesQ,kitMapQ]=await Promise.all([
    db.from("basket_commercial_catalog_v1").select("*").order("category_sort_order").order("model_name"),
    db.from("basket_lot_public_availability_v1").select("lot_id,basket_id,kit_template_id,status,short_code,public_name,sale_price_override,public_available,availability_reason,built_at,created_at,sale_enabled,linked_lot_id").order("built_at",{ascending:true}),
    db.from("basket_categories").select("id,name,slug,sort_order,is_active").eq("is_active",true).order("sort_order"),
    db.from("basket_kit_templates").select("id,basket_id,kind,is_active").eq("is_active",true)
  ]);
  if(catalogQ.error)throw catalogQ.error;if(availabilityQ.error)throw availabilityQ.error;if(categoriesQ.error)throw categoriesQ.error;if(kitMapQ.error)throw kitMapQ.error;
  const availability=availabilityQ.data||[],kitMap=kitMapQ.data||[];
  const models=(catalogQ.data||[]).map((m:any)=>{
    const cid=String(m.commercial_id||"");
    const lots=availability.filter((l:any)=>m.source_kind==="basket"?String(l.basket_id||"")===cid:(String(l.kit_template_id||"")===cid&&!l.basket_id));
    const ready=lots.filter((l:any)=>l.status==="ready"),drafts=lots.filter((l:any)=>l.status==="draft");
    const publicLot=lots.find((l:any)=>String(l.lot_id)===String(m.public_lot_id||""))||null;
    const operational=publicLot||ready.find((l:any)=>l.availability_reason==="paused")||ready.find((l:any)=>l.availability_reason!=="depleted")||ready[0]||drafts[0]||lots[0]||null;
    const editorKit=m.source_kind==="basket"?kitMap.find((k:any)=>String(k.basket_id||"")===cid&&k.kind==="food"):kitMap.find((k:any)=>String(k.id)===cid);
    const editorLots=editorKit?availability.filter((l:any)=>String(l.kit_template_id||"")===String(editorKit.id)):[];
    const duplicate=[...editorLots].filter((l:any)=>["draft","ready"].includes(String(l.status))).sort((a:any,b:any)=>Date.parse(b.built_at||b.created_at||0)-Date.parse(a.built_at||a.created_at||0))[0]||null;
    const reason=String(publicLot?.availability_reason||operational?.availability_reason||m.availability_reason||"depleted");
    const state=reason==="draft"?"Em edição":reason==="paused"?"Pausado":reason==="depleted"?"Esgotado":["model_inactive","category_inactive"].includes(reason)?"Indisponível":"Montado";
    return {
      commercial_id:m.commercial_id,source_kind:m.source_kind,name:m.public_name||m.model_name,
      category_id:m.category_id,category_name:m.category_name,category_slug:m.category_slug,
      price:Number(m.sale_price??m.default_price??0),image_url:m.image_url||"",
      public_lot_id:m.public_lot_id||null,public_lot_code:m.public_lot_code||null,
      public_available:Number(m.public_available||0),availability_reason:reason,state,
      operational_lot_id:operational?.lot_id||null,operational_lot_code:operational?.short_code||null,
      editor_kit_template_id:editorKit?.id||null,duplicate_lot_id:duplicate?.lot_id||null,
      lot_count:lots.length,ready_lot_count:ready.length,draft_lot_count:drafts.length,
      ready_units:ready.reduce((n:number,l:any)=>n+Number(l.public_available||0),0),
      model_active:m.model_active===true,category_active:m.category_active===true
    };
  });
  return {categories:categoriesQ.data||[],models};
}
async function basketKitsAdmin(){
  const [kq,iq,lq]=await Promise.all([
    db.from("basket_kit_templates").select("id,kind,basket_id,name,code_prefix,is_active,sort_order,metadata,basket:basket_templates(id,name,image_url,base_price,category_id,uses_hygiene_kit,split_kits_enabled)").eq("is_active",true).order("sort_order").order("name"),
    db.from("basket_kit_template_items").select("id,kit_template_id,product_id,quantity").order("sort_order"),
    db.from("basket_stock_lots").select("id,kit_template_id,basket_id,lot_kind,short_code,status,sale_enabled,quantity_built,quantity_available,built_at,built_by,duplicated_from_lot_id,sale_price_override,component_sum_snapshot,hidden_adjustment_snapshot,public_name,linked_hygiene_lot_id,business_type,linked_lot_id,own_sale_price_override,own_component_sum_snapshot,own_hidden_adjustment_snapshot,own_cost_sum_snapshot,cost_sum_snapshot").not("kit_template_id","is",null).order("built_at",{ascending:true})
  ]);
  if(kq.error)throw kq.error;if(iq.error)throw iq.error;if(lq.error)throw lq.error;
  const items=iq.data||[],lots=lq.data||[],stock=await basketLooseStockMap(items.map((x:any)=>x.product_id));
  const kits=[];
  for(const k of kq.data||[]){
    const ki=items.filter((x:any)=>x.kit_template_id===k.id),demand=new Map<string,number>();
    for(const x of ki)demand.set(String(x.product_id),(demand.get(String(x.product_id))||0)+Number(x.quantity||0));
    let cap=999999;
    for(const [pid,qty] of demand){const s:any=stock.get(pid)||{};if(qty>0)cap=Math.min(cap,Math.floor(Number(s.loose_sellable_stock||0)/qty))}
    if(cap===999999)cap=0;
    const kitLots=lots.filter((x:any)=>x.kit_template_id===k.id);
    const ready=kitLots.filter((x:any)=>x.status==="ready"&&Number(x.quantity_available||0)>0);
    const drafts=kitLots.filter((x:any)=>x.status==="draft");
    const saleReady=ready.filter((x:any)=>x.sale_enabled===true);
    const current=saleReady[0]||null;
    kits.push({...k,basket:Array.isArray(k.basket)?k.basket[0]:k.basket,template_item_count:ki.length,
      ready_quantity:ready.reduce((sum:number,x:any)=>sum+Number(x.quantity_available||0),0),ready_lot_count:ready.length,
      draft_quantity:drafts.reduce((sum:number,x:any)=>sum+Number(x.quantity_built||0),0),draft_lot_count:drafts.length,
      sale_ready_quantity:saleReady.reduce((sum:number,x:any)=>sum+Number(x.quantity_available||0),0),sale_ready_lot_count:saleReady.length,
      current_lot:current,next_short_code:nextBasketKitShortCodeFromLots(k.code_prefix,kitLots),max_build_from_template:Math.max(0,cap)});
  }
  return {kits,summary:{kit_templates:kits.length,ready_units:kits.reduce((sum:number,k:any)=>sum+Number(k.ready_quantity||0),0),ready_lots:kits.reduce((sum:number,k:any)=>sum+Number(k.ready_lot_count||0),0),draft_units:kits.reduce((sum:number,k:any)=>sum+Number(k.draft_quantity||0),0),draft_lots:kits.reduce((sum:number,k:any)=>sum+Number(k.draft_lot_count||0),0)}};
}
async function basketKitAdminDetail(rawId:any){
  const kid=id(rawId);if(!kid)return {error:"invalid_kit_template",status:400};
  const kq=await db.from("basket_kit_templates")
    .select("*,basket:basket_templates(id,name,image_url,base_price,category_id,uses_hygiene_kit,split_kits_enabled)")
    .eq("id",kid).eq("is_active",true).maybeSingle();
  if(kq.error)throw kq.error;if(!kq.data)return {error:"kit_template_not_found",status:404};
  const [iq,lq]=await Promise.all([
    db.from("basket_kit_template_items").select("*,product:products(id,name,sku,gtin,image_url,price,cost,packaging,unit,brand,category,sales_category,storefront_category,subcategory,customer_subcategory,subsubcategory,customer_subsubcategory,is_active)").eq("kit_template_id",kid).order("sort_order").order("created_at"),
    db.from("basket_stock_lots").select("id,basket_id,kit_template_id,lot_kind,short_code,lot_code,status,sale_enabled,quantity_built,quantity_available,composition_hash,built_at,built_by,notes,source,duplicated_from_lot_id,metadata,created_at,sale_price_override,component_sum_snapshot,hidden_adjustment_snapshot,public_name,linked_hygiene_lot_id,business_type,linked_lot_id,own_sale_price_override,own_component_sum_snapshot,own_hidden_adjustment_snapshot,own_cost_sum_snapshot,cost_sum_snapshot").eq("kit_template_id",kid).order("built_at",{ascending:false}).limit(40)
  ]);
  if(iq.error)throw iq.error;if(lq.error)throw lq.error;
  const lots=lq.data||[],templateItems=iq.data||[];
  const lotIds=lots.map((x:any)=>x.id);
  const liq=lotIds.length?await db.from("basket_stock_lot_items")
    .select("id,lot_id,kit_template_item_id,source_template_item_id,product_id,quantity_per_basket,position_order,substitution_reason,metadata,product:products(id,name,sku,gtin,image_url,price,cost,packaging,unit,brand)")
    .in("lot_id",lotIds).order("position_order"):{data:[],error:null} as any;
  if(liq.error)throw liq.error;
  const loose=await basketLooseStockMap([
    ...templateItems.map((x:any)=>x.product_id),
    ...(liq.data||[]).map((x:any)=>x.product_id)
  ]);
  const items=[];
  for(const i of templateItems){
    const base:any=Array.isArray(i.product)?i.product[0]:i.product,ss:any=loose.get(String(i.product_id))||{};
    items.push({...i,product:base,quantity:Number(i.quantity||0),loose_stock:Number(ss.loose_sellable_stock||0),
      basket_locked:Number(ss.basket_locked_quantity||0),effective_stock:Number(ss.effective_sellable_stock||0),
      suggestions:[]});
  }
  const lotItems=liq.data||[];
  const lotRows=lots.map((l:any)=>({...l,quantity_built:Number(l.quantity_built||0),quantity_available:Number(l.quantity_available||0),
    items:lotItems.filter((x:any)=>x.lot_id===l.id).map((x:any)=>{const p:any=Array.isArray(x.product)?x.product[0]:x.product,s:any=loose.get(String(x.product_id))||{};return {...x,product:p,quantity_per_kit:Number(x.quantity_per_basket||0),loose_stock:Number(s.loose_sellable_stock||0)}})}));
  const mountedLots=[...lotRows].filter((x:any)=>x.status==="ready").sort((a:any,b:any)=>Date.parse(a.built_at)-Date.parse(b.built_at));
  const ready=mountedLots.filter((x:any)=>x.quantity_available>0);
  const drafts=lotRows.filter((x:any)=>x.status==="draft");
  const saleReady=ready.filter((x:any)=>x.sale_enabled===true);
  let linkableLots:any[]=[];
  const basket:any=Array.isArray(kq.data.basket)?kq.data.basket[0]:kq.data.basket;
  const hq=await db.from("basket_stock_lots").select("id,kit_template_id,lot_kind,short_code,lot_code,status,sale_enabled,quantity_built,quantity_available,built_at,public_name,business_type,linked_lot_id,sale_price_override,component_sum_snapshot,hidden_adjustment_snapshot,own_sale_price_override,own_component_sum_snapshot,own_hidden_adjustment_snapshot,own_cost_sum_snapshot,cost_sum_snapshot").not("kit_template_id","is",null).in("status",["draft","ready"]).order("built_at",{ascending:true});
  if(hq.error)throw hq.error;linkableLots=hq.data||[];
  if(linkableLots.length){
    const hi=await db.from("basket_stock_lot_items")
      .select("lot_id,product_id,quantity_per_basket,position_order,product:products(id,name,sku,image_url,price,cost,packaging)")
      .in("lot_id",linkableLots.map((x:any)=>x.id)).order("position_order");
    if(hi.error)throw hi.error;
    const linkedStock=await basketLooseStockMap((hi.data||[]).map((x:any)=>x.product_id));
    linkableLots=linkableLots.map((h:any)=>({...h,items:(hi.data||[]).filter((x:any)=>String(x.lot_id)===String(h.id)).map((x:any)=>{const s:any=linkedStock.get(String(x.product_id))||{};return {...x,quantity_per_kit:Number(x.quantity_per_basket||0),loose_stock:Number(s.loose_sellable_stock||0)}})}));
  }
  const nx=await db.rpc("next_basket_kit_short_code_v1",{p_kit_template_id:kid});
  return {kit:{...kq.data,basket},items,lots:lotRows,linkable_lots:linkableLots,hygiene_lots:linkableLots.filter((x:any)=>x.lot_kind==="hygiene"),default_hygiene_lot_id:null,
    current_lot:saleReady[0]||null,last_lot:lotRows[0]||null,ready_quantity:ready.reduce((sum:number,x:any)=>sum+x.quantity_available,0),ready_lot_count:mountedLots.length,
    existing_lot_count:mountedLots.length+drafts.length,draft_quantity:drafts.reduce((sum:number,x:any)=>sum+Number(x.quantity_built||0),0),draft_lot_count:drafts.length,
    sale_ready_quantity:saleReady.reduce((sum:number,x:any)=>sum+x.quantity_available,0),
    next_short_code:nx.error?null:nx.data};
}
async function basketKitTemplateSave(p:any,auth:any){
  const kid=id(p?.kit_template_id||p?.id),items=Array.isArray(p?.items)?p.items.slice(0,120):[];
  if(!kid)return {error:"invalid_kit_template",status:400};
  const q=await db.rpc("save_basket_kit_template_admin_v1",{p_kit_template_id:kid,p_name:tx(p?.name,180),p_code_prefix:tx(p?.code_prefix,2).toUpperCase(),p_items:items,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error){const m=String(q.error.message||"").split("\n")[0];const code=["kit_template_not_found","kit_template_name_invalid","kit_template_prefix_invalid","kit_template_items_invalid","kit_template_product_invalid","kit_template_product_duplicate","kit_template_product_unavailable","kit_template_quantity_invalid","kit_template_item_invalid","kit_template_source_item_invalid"].find(x=>m.includes(x))||"kit_template_save_failed";return {error:code,status:code==="kit_template_not_found"?404:400}}
  await opsEvent("basket.kit_template_updated","Modelo de kit atualizado.","basket",kid,{kit_template_id:kid,item_count:q.data?.item_count},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {template:q.data};
}
async function basketKitTemplateArchive(p:any,auth:any){
  const kid=id(p?.kit_template_id||p?.id);if(!kid)return {error:"invalid_kit_template",status:400};
  const q=await db.rpc("archive_basket_kit_template_admin_v1",{p_kit_template_id:kid,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error){const m=String(q.error.message||"");if(m.includes("kit_template_has_live_lots"))return {error:"kit_template_has_live_lots",status:409};if(m.includes("kit_template_not_found"))return {error:"kit_template_not_found",status:404};throw q.error}
  await opsEvent("basket.kit_template_archived","Modelo de kit arquivado.","basket",kid,{kit_template_id:kid},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {template:q.data};
}
async function basketKitLotCreate(p:any,auth:any){
  const kid=id(p?.kit_template_id),quantity=Math.floor(Number(p?.quantity||0)),items=Array.isArray(p?.items)?p.items.slice(0,120):[];
  if(!kid||quantity<=0||!items.length)return {error:"invalid_kit_lot",status:400};
  const clean=items.map((x:any,i:number)=>({
    kit_template_item_id:id(x?.kit_template_item_id)||null,
    source_template_item_id:id(x?.source_template_item_id)||null,
    template_product_id:id(x?.template_product_id)||null,
    product_id:id(x?.product_id),
    quantity_per_kit:Number(x?.quantity_per_kit||0),
    position_order:Number(x?.position_order??i),
    is_changed:x?.is_changed===true,
    change_note:tx(x?.change_note,300)||null
  }));
  if(clean.some((x:any)=>!x.product_id||!Number.isFinite(x.quantity_per_kit)||x.quantity_per_kit<=0))return {error:"invalid_kit_lot_items",status:400};
  const q=await db.rpc("create_basket_kit_lot_v4",{
    p_kit_template_id:kid,p_quantity:quantity,p_items:clean,p_operator:tx(p?.operator,80)||"Operação",
    p_notes:tx(p?.notes,800)||null,p_short_code:tx(p?.short_code,3).toUpperCase()||null,
    p_duplicated_from_lot_id:id(p?.duplicated_from_lot_id)||null,
    p_public_name:tx(p?.public_name,120)||null,p_sale_price:p?.sale_price==null?null:Number(p.sale_price),
    p_business_type:tx(p?.business_type,40)||null,p_linked_lot_id:id(p?.linked_lot_id)||null
  });
  if(q.error){
    const m=String(q.error.message||"").split("\n")[0];
    const code=m.includes("insufficient_loose_stock")?"insufficient_loose_stock":
      m.includes("kit_short_code_in_use")?"kit_short_code_in_use":
      m.includes("invalid_kit_short_code")?"invalid_kit_short_code":
      m.includes("kit_short_code_exhausted")?"kit_short_code_exhausted":tx(m,240)||"kit_lot_create_failed";
    return {error:code,status:code==="insufficient_loose_stock"||code==="kit_short_code_in_use"?409:400};
  }
  const kit=await db.from("basket_kit_templates").select("kind,basket_id,name").eq("id",kid).maybeSingle();
  await opsEvent("basket.kit_lot_built","Lote pré-montado criado e mantido fora do site até ativação manual.","basket",kit.data?.basket_id||kid,
    {kit_template_id:kid,kit_name:kit.data?.name,kind:kit.data?.kind,lot_id:q.data?.lot_id,short_code:q.data?.short_code,quantity,duplicated_from_lot_id:id(p?.duplicated_from_lot_id)||null,sale_enabled:false},
    tx(p?.operator,80)||"Operação","human","dona_antonia","basket-kit-lot:"+String(q.data?.lot_id||""));
  return {lot:{...q.data,sale_enabled:false}};
}

async function basketKitLotDraftSave(p:any,auth:any){
  const kid=id(p?.kit_template_id),lid=id(p?.draft_lot_id)||null,quantity=Math.floor(Number(p?.quantity||0));
  const items=Array.isArray(p?.items)?p.items.slice(0,120):[];
  if(!kid||quantity<=0)return {error:"invalid_kit_lot_draft",status:400};
  const clean=items.map((x:any,i:number)=>({
    kit_template_item_id:id(x?.kit_template_item_id)||null,
    source_template_item_id:id(x?.source_template_item_id)||null,
    template_product_id:id(x?.template_product_id)||null,
    product_id:id(x?.product_id),
    quantity_per_kit:Number(x?.quantity_per_kit||0),
    position_order:Number(x?.position_order??i),
    is_changed:x?.is_changed===true,
    change_note:tx(x?.change_note,300)||null
  }));
  if(clean.some((x:any)=>!x.product_id||!Number.isFinite(x.quantity_per_kit)||x.quantity_per_kit<=0))return {error:"invalid_kit_lot_items",status:400};
  const q=await db.rpc("save_basket_kit_lot_draft_v4",{
    p_lot_id:lid,p_kit_template_id:kid,p_quantity:quantity,p_items:clean,
    p_operator:tx(p?.operator,80)||"Operação",p_notes:tx(p?.notes,800)||null,
    p_short_code:tx(p?.short_code,3).toUpperCase()||null,
    p_duplicated_from_lot_id:id(p?.duplicated_from_lot_id)||null,
    p_public_name:tx(p?.public_name,120)||null,p_sale_price:p?.sale_price==null?null:Number(p.sale_price),
    p_business_type:tx(p?.business_type,40)||null,p_linked_lot_id:id(p?.linked_lot_id)||null
  });
  if(q.error){
    const m=String(q.error.message||"").split("\n")[0];
    const code=m.includes("kit_short_code_in_use")?"kit_short_code_in_use":
      m.includes("invalid_kit_short_code")?"invalid_kit_short_code":
      m.includes("draft_lot_not_found")?"draft_lot_not_found":
      m.includes("duplicate_product_in_kit_lot")?"duplicate_product_in_kit_lot":
      tx(m,240)||"kit_lot_draft_save_failed";
    return {error:code,status:code==="kit_short_code_in_use"?409:400};
  }
  await opsEvent("basket.kit_lot_draft_saved","Rascunho de lote salvo.","basket",kid,
    {kit_template_id:kid,lot_id:q.data?.lot_id,short_code:q.data?.short_code,quantity,
     duplicated_from_lot_id:id(p?.duplicated_from_lot_id)||null},
    tx(p?.operator,80)||"Operação","human","dona_antonia","basket-kit-draft:"+String(q.data?.lot_id||""));
  return {draft:q.data};
}
async function basketKitLotDraftActivate(p:any,auth:any){
  const lid=id(p?.lot_id);if(!lid)return {error:"invalid_lot",status:400};
  const q=await db.rpc("activate_basket_kit_lot_draft_v2",{p_lot_id:lid,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error){
    const m=String(q.error.message||"").split("\n")[0];
    const code=m.includes("insufficient_loose_stock")?"insufficient_loose_stock":
      m.includes("draft_lot_not_found")?"draft_lot_not_found":
      m.includes("draft_lot_required")?"draft_lot_required":
      m.includes("empty_lot_composition")?"empty_lot_composition":
      m.includes("lot_product_unavailable")?"lot_product_unavailable":m.includes("linked_lot_unavailable")?"linked_lot_unavailable":
      tx(m,240)||"kit_lot_draft_activate_failed";
    return {error:code,status:["insufficient_loose_stock","lot_product_unavailable","linked_lot_unavailable"].includes(code)?409:400};
  }
  await opsEvent("basket.kit_lot_built","Rascunho concluído como lote real, ainda fora do site.","basket",lid,
    {lot_id:lid,short_code:q.data?.short_code,quantity:q.data?.quantity_built,sale_enabled:false},
    tx(p?.operator,80)||"Operação","human","dona_antonia","basket-kit-activate:"+lid);
  return {lot:q.data};
}
async function basketKitLotReopen(p:any,auth:any){
  const lid=id(p?.lot_id);if(!lid)return {error:"invalid_lot",status:400};
  const q=await db.rpc("reopen_basket_kit_lot_for_edit_v1",{p_lot_id:lid,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error){
    const m=String(q.error.message||"");
    for(const code of ["lot_sale_must_be_disabled","lot_has_order_history","lot_already_changed","lot_is_dependency","lot_not_editable","kit_lot_required"]){if(m.includes(code))return {error:code,status:409}}
    if(m.includes("lot_not_found"))return {error:"lot_not_found",status:404};throw q.error;
  }
  await opsEvent("basket.kit_lot_reopened","Lote reaberto para edição antes de novo fechamento da montagem.","basket",lid,{lot_id:lid,short_code:q.data?.short_code},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {draft:q.data};
}
async function basketKitLotDraftDelete(p:any,auth:any){
  const lid=id(p?.lot_id);if(!lid)return {error:"invalid_lot",status:400};
  const q=await db.rpc("delete_basket_kit_lot_draft_v1",{p_lot_id:lid});
  if(q.error){
    const m=String(q.error.message||"");
    return {error:m.includes("draft_lot_not_found")?"draft_lot_not_found":"kit_lot_draft_delete_failed",status:404};
  }
  await opsEvent("basket.kit_lot_draft_deleted","Rascunho de lote excluído.","basket",lid,{lot_id:lid},
    tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {deleted:true,lot_id:lid};
}

async function basketKitLotDelete(p:any,auth:any){
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
async function basketKitLotCancel(p:any,auth:any){
  const lid=id(p?.lot_id);if(!lid)return {error:"invalid_lot",status:400};
  const l=await db.from("basket_stock_lots").select("id,basket_id,kit_template_id,lot_kind,short_code,status,quantity_available,metadata").eq("id",lid).maybeSingle();
  if(l.error)throw l.error;if(!l.data||!l.data.kit_template_id)return {error:"kit_lot_not_found",status:404};
  const a=await db.from("basket_stock_allocations").select("id",{count:"exact",head:true}).eq("lot_id",lid).eq("status","allocated");
  if(a.error)throw a.error;if(Number(a.count||0)>0)return {error:"lot_has_allocated_orders",status:409};
  if(l.data.status==="cancelled")return {cancelled:true,already_done:true};
  const u=await db.from("basket_stock_lots").update({status:"cancelled",quantity_available:0,updated_at:new Date().toISOString(),
    metadata:{...meta(l.data.metadata),cancelled_reason:tx(p?.reason,500)||"Cancelado no Admin",cancelled_at:new Date().toISOString()}}).eq("id",lid);
  if(u.error)throw u.error;
  await opsEvent("basket.kit_lot_cancelled","Lote pré-montado cancelado.","basket",l.data.basket_id||l.data.kit_template_id,
    {lot_id:lid,short_code:l.data.short_code,remaining_quantity:l.data.quantity_available,kind:l.data.lot_kind},
    tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {cancelled:true};
}


async function basketSalesRuntime(){
  const [rt,lots,bq,avq,legacyq]=await Promise.all([
    db.from("basket_sales_runtime_v1").select("*").eq("id",1).maybeSingle(),
    db.from("basket_stock_lots").select("id,basket_id,kit_template_id,lot_kind,short_code,lot_code,status,sale_enabled,quantity_available").in("status",["ready","depleted"]),
    db.from("basket_templates").select("id,name,uses_hygiene_kit,is_active,sort_order").eq("is_active",true).order("sort_order"),
    db.from("basket_split_availability_v1").select("basket_id,food_lot_id,hygiene_lot_id,split_available"),
    db.from("basket_current_lot_v1").select("basket_id,lot_id")
  ]);
  if(rt.error)throw rt.error;if(lots.error)throw lots.error;if(bq.error)throw bq.error;if(avq.error)throw avq.error;if(legacyq.error)throw legacyq.error;
  const av=new Map((avq.data||[]).map((x:any)=>[String(x.basket_id),x]));
  const legacy=new Set((legacyq.data||[]).map((x:any)=>String(x.basket_id)));
  const missingSplit=(bq.data||[]).filter((b:any)=>{const a:any=av.get(String(b.id));return !a?.food_lot_id||Number(a?.split_available||0)<=0}).map((b:any)=>b.name);
  const missingLegacy=(bq.data||[]).filter((b:any)=>!legacy.has(String(b.id))).map((b:any)=>b.name);
  const rows=lots.data||[];
  return {
    sales_mode:rt.data?.sales_mode||"legacy",
    changed_at:rt.data?.changed_at||null,
    changed_by:rt.data?.changed_by||null,
    missing_split:missingSplit,
    missing_legacy:missingLegacy,
    legacy:{ready_lots:rows.filter((x:any)=>x.lot_kind==="legacy_full"&&x.status==="ready"&&Number(x.quantity_available||0)>0).length,
      enabled_lots:rows.filter((x:any)=>x.lot_kind==="legacy_full"&&x.status==="ready"&&Number(x.quantity_available||0)>0&&x.sale_enabled===true).length},
    split:{ready_lots:rows.filter((x:any)=>x.kit_template_id&&x.status==="ready"&&Number(x.quantity_available||0)>0).length,
      enabled_lots:rows.filter((x:any)=>x.kit_template_id&&x.status==="ready"&&Number(x.quantity_available||0)>0&&x.sale_enabled===true).length}
  };
}
async function basketLotSaleToggle(p:any,auth:any){
  const lid=id(p?.lot_id);if(!lid)return {error:"invalid_lot",status:400};
  const enabled=p?.enabled===true;
  const q=await db.rpc("set_basket_lot_sale_enabled_v1",{p_lot_id:lid,p_enabled:enabled,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error){
    const m=String(q.error.message||"");
    const code=m.includes("linked_lot_unavailable")?"linked_lot_unavailable":m.includes("linked_hygiene_lot_required")?"linked_hygiene_lot_required":m.includes("linked_hygiene_lot_unavailable")?"linked_hygiene_lot_unavailable":m.includes("lot_not_available_for_sale")?"lot_not_available_for_sale":m.includes("lot_not_found")?"lot_not_found":"lot_sale_toggle_failed";
    return {error:code,status:code==="lot_not_found"?404:409};
  }
  await opsEvent(enabled?"basket.lot_sale_enabled":"basket.lot_sale_disabled",enabled?"Lote liberado para venda no site.":"Lote retirado da venda no site.","basket",lid,
    {lot_id:lid,sale_enabled:enabled},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {lot:q.data,runtime:await basketSalesRuntime()};
}
async function basketLotsSaleBulk(p:any,auth:any){
  const scope=tx(p?.scope,20).toLowerCase(),enabled=p?.enabled===true;
  if(!["legacy","split"].includes(scope))return {error:"invalid_lot_scope",status:400};
  const q=await db.rpc("set_basket_lots_sale_enabled_bulk_v1",{p_scope:scope,p_enabled:enabled,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error)throw q.error;
  await opsEvent(enabled?"basket.lots_sale_enabled":"basket.lots_sale_disabled",
    (enabled?"Lotes liberados":"Lotes retirados")+" da venda no site.","basket",null,
    {scope,sale_enabled:enabled,updated_lots:q.data?.updated_lots||0},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {result:q.data,runtime:await basketSalesRuntime()};
}
async function basketSalesModeSet(p:any,auth:any){
  const mode=tx(p?.mode,20).toLowerCase();
  if(!["legacy","split"].includes(mode))return {error:"invalid_basket_sales_mode",status:400};
  const q=await db.rpc("set_basket_sales_mode_v1",{p_mode:mode,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error){
    const m=String(q.error.message||"");
    if(m.includes("split_kits_not_ready"))return {error:"split_kits_not_ready",status:409};
    if(m.includes("legacy_baskets_not_ready"))return {error:"legacy_baskets_not_ready",status:409};
    throw q.error;
  }
  await opsEvent("basket.sales_mode_changed",mode==="split"?"Site passou a vender pelos lotes separados de Alimentos + Limpeza/Higiene.":"Site voltou a vender pelas cestas completas antigas.","basket",null,
    {sales_mode:mode},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {result:q.data,runtime:await basketSalesRuntime()};
}

async function basketProductSearch(u:URL){
  const qv=tx(u.searchParams.get("q"),100).replace(/[,()%]/g," "),lim=Math.floor(nm(u.searchParams.get("limit")||15,1,30));
  if(qv.length<2)return {products:[]};
  let q=db.from("products").select("id,name,sku,gtin,image_url,price,cost,packaging,unit,brand,sales_category,storefront_category,category,subcategory,customer_subcategory,subsubcategory,customer_subsubcategory").eq("is_active",true);
  for(const term of qv.split(/\s+/).filter(Boolean).slice(0,4))q=q.or("name.ilike.%"+term+"%,gtin.ilike.%"+term+"%,sku.ilike.%"+term+"%,brand.ilike.%"+term+"%");
  const r=await q.order("name").limit(lim);if(r.error)throw r.error;
  const rows=r.data||[],sm=await basketLooseStockMap(rows.map((x:any)=>x.id));
  return {products:rows.map((p:any)=>{const s:any=sm.get(String(p.id))||{};return {...p,price_cents:Math.round(Number(p.price||0)*100),loose_stock:Number(s.loose_sellable_stock||0),basket_locked:Number(s.basket_locked_quantity||0),effective_stock:Number(s.effective_sellable_stock||0)}})};
}
async function basketsAdminList(){
  const [bq,iq,lq]=await Promise.all([
    db.from("basket_templates").select("id,sku,name,description,image_url,base_price,is_active,sort_order,is_whatsapp_active,is_featured,internal_notes,uses_hygiene_kit,split_kits_enabled,updated_at").order("sort_order").order("name"),
    db.from("basket_template_items").select("id,basket_id,product_id,quantity").order("sort_order"),
    db.from("basket_stock_lots").select("id,basket_id,lot_code,lot_kind,short_code,status,sale_enabled,quantity_built,quantity_available,quantity_dismantled,built_at,built_by,source,metadata").eq("lot_kind","legacy_full").order("built_at",{ascending:true})
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
      ready_quantity:readyQty,current_lot:current?{id:current.id,lot_code:current.lot_code,sale_enabled:current.sale_enabled===true,quantity_available:Number(current.quantity_available||0),built_at:current.built_at,source:current.source,gap_items:gap}:null,
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
    db.from("basket_stock_lots").select("id,basket_id,lot_code,lot_kind,short_code,status,sale_enabled,quantity_built,quantity_available,quantity_dismantled,composition_hash,built_at,built_by,notes,source,metadata,created_at").eq("basket_id",bid).eq("lot_kind","legacy_full").order("built_at",{ascending:false}).limit(20),
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
      if(!sc.compatible)continue;
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
function basketCategorySlug(v:any){
  return tx(v,80).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,90);
}
async function basketCategoriesAdmin(){
  const [cq,sq,bq,kq]=await Promise.all([
    db.from("basket_categories").select("id,name,slug,sort_order,is_active,created_at,updated_at").order("sort_order").order("name"),
    db.from("basket_subcategories").select("id,category_id,name,sort_order,is_active").order("sort_order").order("name"),
    db.from("basket_templates").select("id,name,category_id,subcategory_id"),
    db.from("basket_kit_templates").select("id,name,category_id,subcategory_id")
  ]);
  if(cq.error)throw cq.error;if(sq.error)throw sq.error;if(bq.error)throw bq.error;if(kq.error)throw kq.error;
  const baskets=[...(bq.data||[]).map((x:any)=>({...x,kind:"basket"})),...(kq.data||[]).map((x:any)=>({...x,kind:"kit"}))];
  return {categories:(cq.data||[]).map((c:any)=>({...c,subcategories:(sq.data||[]).filter((s:any)=>String(s.category_id)===String(c.id)).map((s:any)=>({...s,item_count:baskets.filter((b:any)=>String(b.subcategory_id||"")===String(s.id)).length})),item_count:baskets.filter((b:any)=>String(b.category_id||"")===String(c.id)).length}))};
}
async function basketSubcategorySave(p:any,auth:any){
  const sid=id(p?.id),categoryId=id(p?.category_id),name=tx(p?.name,80);if(!categoryId)return {error:"subcategory_category_required",status:400};if(!name)return {error:"subcategory_name_required",status:400};
  const cat=await db.from("basket_categories").select("id").eq("id",categoryId).maybeSingle();if(cat.error)throw cat.error;if(!cat.data)return {error:"category_not_found",status:404};
  const patch={category_id:categoryId,name,sort_order:Math.round(nm(p?.sort_order,0,9999)),is_active:p?.is_active===true,updated_at:new Date().toISOString()};
  const q=sid?await db.from("basket_subcategories").update(patch).eq("id",sid).select("*").maybeSingle():await db.from("basket_subcategories").insert(patch).select("*").single();
  if(q.error){if(String(q.error.code)==="23505")return {error:"subcategory_name_exists",status:409};throw q.error}
  if(sid&&!q.data)return {error:"subcategory_not_found",status:404};
  await opsEvent("basket.subcategory_saved","Subdivisão da vitrine salva.","basket_subcategory",q.data?.id||sid,{name,category_id:categoryId},tx(p?.operator,80)||auth?.user?.email||"Operação","human","dona_antonia");
  return {subcategory:q.data};
}
async function basketSubcategoryDelete(p:any,auth:any){
  const sid=id(p?.id);if(!sid)return {error:"invalid_subcategory",status:400};
  const [b,k]=await Promise.all([db.from("basket_templates").select("id,name",{count:"exact"}).eq("subcategory_id",sid).limit(20),db.from("basket_kit_templates").select("id,name",{count:"exact"}).eq("subcategory_id",sid).limit(20)]);
  if(b.error)throw b.error;if(k.error)throw k.error;const count=Number(b.count||0)+Number(k.count||0);
  if(count)return {error:"subcategory_in_use",status:409,item_count:count,items:[...(b.data||[]),...(k.data||[])]};
  const q=await db.from("basket_subcategories").delete().eq("id",sid).select("id,name").maybeSingle();if(q.error)throw q.error;if(!q.data)return {error:"subcategory_not_found",status:404};
  await opsEvent("basket.subcategory_deleted","Subdivisão da vitrine excluída.","basket_subcategory",sid,{name:q.data.name},tx(p?.operator,80)||auth?.user?.email||"Operação","human","dona_antonia");
  return {deleted:true,id:sid};
}
async function basketCategorySave(p:any,auth:any){
  const cid=id(p?.id),name=tx(p?.name,80);if(!name)return {error:"category_name_required",status:400};
  const slug=basketCategorySlug(name);if(!slug)return {error:"category_name_invalid",status:400};
  const patch={name,slug,sort_order:Math.round(nm(p?.sort_order,0,9999)),is_active:p?.is_active===true,updated_at:new Date().toISOString()};
  const q=cid?await db.from("basket_categories").update(patch).eq("id",cid).select("*").maybeSingle():await db.from("basket_categories").insert(patch).select("*").single();
  if(q.error){if(String(q.error.code)==="23505")return {error:"category_name_exists",status:409};throw q.error}
  if(cid&&!q.data)return {error:"category_not_found",status:404};
  await opsEvent("basket.category_saved","Categoria de cestas salva.","basket_category",q.data?.id||cid,{name,slug},tx(p?.operator,80)||auth?.user?.email||"Operação","human","dona_antonia");
  return {category:q.data};
}
async function basketCategoryDelete(p:any,auth:any){
  const cid=id(p?.id);if(!cid)return {error:"invalid_category",status:400};
  const [used,kits]=await Promise.all([
    db.from("basket_templates").select("id,name",{count:"exact"}).eq("category_id",cid).limit(20),
    db.from("basket_kit_templates").select("id,name",{count:"exact"}).eq("category_id",cid).limit(20)
  ]);
  if(used.error)throw used.error;if(kits.error)throw kits.error;
  const count=Number(used.count||0)+Number(kits.count||0);
  if(count>0)return {error:"category_in_use",status:409,basket_count:count,baskets:[...(used.data||[]),...(kits.data||[])]};
  const q=await db.from("basket_categories").delete().eq("id",cid).select("id,name").maybeSingle();if(q.error)throw q.error;if(!q.data)return {error:"category_not_found",status:404};
  await opsEvent("basket.category_deleted","Categoria de cestas excluída.","basket_category",cid,{name:q.data.name},tx(p?.operator,80)||auth?.user?.email||"Operação","human","dona_antonia");
  return {deleted:true,id:cid};
}
async function basketCategoryAssign(p:any,auth:any){
  const bid=id(p?.basket_id);if(!bid)return {error:"invalid_basket",status:400};
  const raw=p?.category_id,categoryId=raw===null||raw===""?null:id(raw);if(raw&& !categoryId)return {error:"invalid_category",status:400};
  const rawSub=p?.subcategory_id,subcategoryId=rawSub===null||rawSub===""?null:id(rawSub);if(rawSub&&!subcategoryId)return {error:"invalid_subcategory",status:400};
  if(categoryId){const c=await db.from("basket_categories").select("id,name").eq("id",categoryId).eq("is_active",true).maybeSingle();if(c.error)throw c.error;if(!c.data)return {error:"category_not_found",status:404}}
  if(subcategoryId){const s=await db.from("basket_subcategories").select("id").eq("id",subcategoryId).eq("category_id",categoryId).eq("is_active",true).maybeSingle();if(s.error)throw s.error;if(!s.data)return {error:"subcategory_not_found",status:404}}
  const q=await db.from("basket_templates").update({category_id:categoryId,subcategory_id:subcategoryId,updated_at:new Date().toISOString(),updated_by:auth.user.id}).eq("id",bid).select("id,name,category_id,subcategory_id").maybeSingle();if(q.error)throw q.error;if(!q.data)return {error:"basket_not_found",status:404};
  await opsEvent("basket.category_assigned","Categoria e subdivisão da cesta atualizadas.","basket",bid,{category_id:categoryId,subcategory_id:subcategoryId},tx(p?.operator,80)||auth?.user?.email||"Operação","human","dona_antonia");
  return {basket:q.data};
}
async function basketArchive(p:any,auth:any){
  const bid=id(p?.basket_id||p?.id);if(!bid)return {error:"invalid_basket",status:400};
  const q=await db.rpc("archive_basket_template_admin_v1",{p_basket_id:bid,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error){const m=String(q.error.message||"");if(m.includes("basket_has_active_kit_templates"))return {error:"basket_has_active_kit_templates",status:409};if(m.includes("basket_has_live_lots"))return {error:"basket_has_live_lots",status:409};if(m.includes("basket_not_found"))return {error:"basket_not_found",status:404};throw q.error}
  await opsEvent("basket.template_archived","Modelo de cesta arquivado.","basket",bid,{basket_id:bid},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {basket:q.data};
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

async function basketLegacyLotRelease(p:any,auth:any){
  const lid=id(p?.lot_id),quantity=Math.floor(Number(p?.quantity||0));
  if(!lid||quantity<=0)return {error:"invalid_release_quantity",status:400};
  const q=await db.rpc("release_legacy_basket_lot_units_v1",{
    p_lot_id:lid,p_quantity:quantity,p_operator:tx(p?.operator,80)||"Operação",
    p_note:tx(p?.note,500)||"Migração para kits separados"
  });
  if(q.error){
    const m=String(q.error.message||"").split("\n")[0];
    const code=m.includes("release_exceeds_available")?"release_exceeds_available":
      m.includes("legacy_lot_required")?"legacy_lot_required":
      m.includes("lot_not_releasable")?"lot_not_releasable":
      m.includes("lot_not_found")?"lot_not_found":"legacy_lot_release_failed";
    return {error:code,status:code==="release_exceeds_available"?409:400};
  }
  await opsEvent("basket.legacy_units_dismantled","Cestas completas antigas foram liberadas para remontagem em kits.","basket",lid,
    {lot_id:lid,released_quantity:quantity,remaining_quantity:q.data?.quantity_available??null},
    tx(p?.operator,80)||"Operação","human","dona_antonia","basket-legacy-release:"+lid+":"+new Date().toISOString());
  return {release:q.data};
}
async function basketLotCancel(p:any,auth:any){
  const lid=id(p?.lot_id);if(!lid)return {error:"invalid_lot",status:400};
  const l=await db.from("basket_stock_lots").select("id,basket_id,lot_code,status,quantity_available,metadata").eq("id",lid).maybeSingle();if(l.error)throw l.error;if(!l.data)return {error:"lot_not_found",status:404};
  const a=await db.from("basket_stock_allocations").select("id",{count:"exact",head:true}).eq("lot_id",lid).eq("status","allocated");if(a.error)throw a.error;if(Number(a.count||0)>0)return {error:"lot_has_allocated_orders",status:409};
  if(l.data.status==="cancelled")return {cancelled:true,already_done:true};
  const q=await db.from("basket_stock_lots").update({status:"cancelled",quantity_available:0,updated_at:new Date().toISOString(),metadata:{...meta(l.data.metadata),cancelled_reason:tx(p?.reason,500)||"Cancelado no Admin",cancelled_at:new Date().toISOString()}}).eq("id",lid);if(q.error)throw q.error;
  await opsEvent("basket.lot_cancelled","Lote de cestas cancelado.","basket",l.data.basket_id,{lot_id:lid,lot_code:l.data.lot_code,remaining_quantity:l.data.quantity_available},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {cancelled:true};
}

const QUOTE_STATUSES=new Set(["draft","sent","accepted","rejected","expired","cancelled"]);
function quoteStatus(v:any){const s=tx(v,20).toLowerCase();return QUOTE_STATUSES.has(s)?s:"draft"}
function quoteSummaryRow(x:any){return {id:x.id,quote_number:x.quote_number,customer_id:x.customer_id||null,client_name:x.client_name||"",client_document:x.client_document||"",status:x.status||"draft",issued_on:x.issued_on||null,valid_until:x.valid_until||null,subtotal_cents:Number(x.subtotal_cents||0),total_cents:Number(x.total_cents||0),item_count:Number(x.item_count||0),created_at:x.created_at,updated_at:x.updated_at}}
async function quoteHistory(u:URL){
  const lim=Math.floor(nm(u.searchParams.get("limit")||60,1,100)),status=tx(u.searchParams.get("status"),20).toLowerCase();
  const qv=tx(u.searchParams.get("q"),100).replace(/[,()%]/g," ");
  let q=db.from("sales_quotes").select("id,quote_number,customer_id,client_name,client_document,status,issued_on,valid_until,subtotal_cents,total_cents,item_count,created_at,updated_at").is("archived_at",null);
  if(status&&QUOTE_STATUSES.has(status))q=q.eq("status",status);
  if(qv)q=q.or("quote_number.ilike.%"+qv+"%,client_name.ilike.%"+qv+"%,client_document.ilike.%"+qv+"%");
  const r=await q.order("updated_at",{ascending:false}).limit(lim);if(r.error)throw r.error;
  return {quotes:(r.data||[]).map(quoteSummaryRow)};
}
async function quoteGet(rawId:any){
  const qid=id(rawId);if(!qid)return {error:"invalid_quote",status:400};
  const r=await db.from("sales_quotes").select("*").eq("id",qid).is("archived_at",null).maybeSingle();
  if(r.error)throw r.error;if(!r.data)return {error:"quote_not_found",status:404};
  return {quote:{...quoteSummaryRow(r.data),snapshot:meta(r.data.snapshot)}};
}
async function quoteSave(p:any,auth:any){
  const snapshot=meta(p?.snapshot),fields=meta(snapshot.fields),items=Array.isArray(snapshot.items)?snapshot.items:[];
  const qid=id(p?.id),quoteNumber=tx(p?.quote_number||fields.quoteNumber,80);if(!quoteNumber)return {error:"quote_number_required",status:400};
  const activeClient=tx(snapshot.activeClientId,80),customerId=id(p?.customer_id)||id(activeClient.startsWith("db:")?activeClient.slice(3):"");
  const issued=dt(p?.issued_on||fields.issueDate),valid=dt(p?.valid_until||fields.validUntil);
  const subtotal=Math.round(nm(p?.subtotal_cents,0,999999999999)),total=Math.round(nm(p?.total_cents,0,999999999999));
  const payload:any={quote_number:quoteNumber,customer_id:customerId||null,client_name:tx(p?.client_name||fields.clientName,300)||null,client_document:tx(p?.client_document||fields.document,40)||null,status:quoteStatus(p?.status),issued_on:issued,valid_until:valid,subtotal_cents:subtotal,total_cents:total,item_count:items.length,snapshot,updated_by:auth?.user_id||null,updated_at:new Date().toISOString()};
  if(qid){
    const before=await db.from("sales_quotes").select("id").eq("id",qid).is("archived_at",null).maybeSingle();if(before.error)throw before.error;if(!before.data)return {error:"quote_not_found",status:404};
    const r=await db.from("sales_quotes").update(payload).eq("id",qid).select("*").single();if(r.error)throw r.error;
    await opsEvent("quote.updated","Orçamento atualizado.","quote",qid,{quote_number:quoteNumber,total_cents:total,status:payload.status},tx(fields.seller,80)||"Operação","human","dona_antonia");
    return {quote:{...quoteSummaryRow(r.data),snapshot:meta(r.data.snapshot)},created:false};
  }
  const r=await db.from("sales_quotes").insert({...payload,created_by:auth?.user_id||null}).select("*").single();if(r.error)throw r.error;
  await opsEvent("quote.created","Orçamento salvo.","quote",r.data.id,{quote_number:quoteNumber,total_cents:total,status:payload.status},tx(fields.seller,80)||"Operação","human","dona_antonia");
  return {quote:{...quoteSummaryRow(r.data),snapshot:meta(r.data.snapshot)},created:true};
}
async function quoteStatusSet(p:any,auth:any){
  const qid=id(p?.id);if(!qid)return {error:"invalid_quote",status:400};
  const requested=tx(p?.status,20).toLowerCase();if(!QUOTE_STATUSES.has(requested))return {error:"invalid_quote_status",status:400};
  const r=await db.from("sales_quotes").update({status:requested,updated_by:auth?.user_id||null,updated_at:new Date().toISOString()}).eq("id",qid).is("archived_at",null).select("*").maybeSingle();
  if(r.error)throw r.error;if(!r.data)return {error:"quote_not_found",status:404};
  await opsEvent("quote.status_changed","Status do orçamento atualizado.","quote",qid,{quote_number:r.data.quote_number,status:requested},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {quote:quoteSummaryRow(r.data)};
}


function cleanCnpjLookup(v:any){return String(v??"").toUpperCase().replace(/[^0-9A-Z]/g,"").slice(0,14)}
function normalizeCnpjLookup(raw:any){
  const ies=Array.isArray(raw?.inscricoes_estaduais)?raw.inscricoes_estaduais:[];
  const ie=ies.find((x:any)=>x&&x.ativo!==false&&tx(x.uf||x.estado,2).toUpperCase()===tx(raw?.uf,2).toUpperCase())
    ||ies.find((x:any)=>x&&x.ativo!==false)||ies[0]||{};
  const secondaries=Array.isArray(raw?.cnaes_secundarios)?raw.cnaes_secundarios:[];
  const partners=Array.isArray(raw?.qsa)?raw.qsa:[];
  return {
    cnpj:tx(raw?.cnpj,30),
    razao_social:tx(raw?.razao_social||raw?.nome,300),
    nome_fantasia:tx(raw?.nome_fantasia||raw?.fantasia,300),
    situacao:tx(raw?.descricao_situacao_cadastral||raw?.situacao,120),
    data_inicio_atividade:tx(raw?.data_inicio_atividade||raw?.abertura,30),
    natureza_juridica:tx(raw?.natureza_juridica,240),
    porte:tx(raw?.porte,120),
    tipo_logradouro:tx(raw?.descricao_tipo_de_logradouro||raw?.tipo_logradouro,80),
    logradouro:tx(raw?.logradouro,300),
    numero:tx(raw?.numero,60),
    complemento:tx(raw?.complemento,200),
    bairro:tx(raw?.bairro,180),
    cep:tx(raw?.cep,20),
    municipio:tx(raw?.municipio,180),
    uf:tx(raw?.uf,2).toUpperCase(),
    telefone_1:tx(raw?.ddd_telefone_1||raw?.telefone,60),
    telefone_2:tx(raw?.ddd_telefone_2,60),
    email:tx(raw?.email,240),
    inscricao_estadual:tx(ie?.inscricao_estadual||ie?.numero||ie?.ie,80),
    cnae_principal_codigo:tx(raw?.cnae_fiscal||raw?.atividade_principal?.[0]?.code,30),
    cnae_principal_descricao:tx(raw?.cnae_fiscal_descricao||raw?.atividade_principal?.[0]?.text,300),
    atividades_secundarias:secondaries.slice(0,50).map((x:any)=>({codigo:tx(x?.codigo||x?.code,30),descricao:tx(x?.descricao||x?.text,300)})),
    socios:partners.slice(0,100).map((x:any)=>({nome:tx(x?.nome_socio||x?.nome,300),qualificacao:tx(x?.qualificacao_socio||x?.qual,180)}))
  };
}
async function cnpjLookup(u:URL){
  const cnpj=cleanCnpjLookup(u.searchParams.get("cnpj"));
  if(!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj))return {error:"invalid_cnpj",message:"Informe um CNPJ com 14 caracteres.",status:400};
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    let res:Response;
    try{
      res=await fetch("https://brasilapi.com.br/api/cnpj/v1/"+encodeURIComponent(cnpj),{
        headers:{"Accept":"application/json","User-Agent":"DonaAntoniaAdmin/1.0"},
        signal:controller.signal
      });
    }finally{clearTimeout(timer)}
    const raw=await res.json().catch(()=>null);
    if(res.status===404)return {error:"cnpj_not_found",message:"CNPJ não encontrado na base consultada.",status:404};
    if(!res.ok||!raw)return {error:"cnpj_provider_error",message:"A consulta de CNPJ está temporariamente indisponível.",status:502};
    return {company:normalizeCnpjLookup(raw),source:"BrasilAPI / Minha Receita"};
  }catch(e){
    return {error:"cnpj_lookup_failed",message:e instanceof DOMException&&e.name==="AbortError"?"A consulta demorou demais. Tente novamente.":"Não foi possível consultar o CNPJ agora.",status:502};
  }
}

async function orderWhatsappGatewayReadiness(){
  try{
    const res=await fetch(U+"/functions/v1/admin-orders-v1",{
      method:"GET",headers:{"apikey":K,"x-internal-key":K},signal:AbortSignal.timeout(8000)
    });
    const data=await res.json().catch(()=>({ok:false,error:"invalid_gateway_response"}));
    return {ready:res.ok&&data?.ready===true,providers:data?.providers||{},error:res.ok?null:(data?.error||"gateway_unavailable")};
  }catch(e){return {ready:false,providers:{},error:"gateway_unreachable"}}
}
async function orderWhatsappRegistrationStatus(rawId:any){
  const oid=id(rawId);if(!oid)return {error:"invalid_order",status:400};
  const oq=await db.from("orders").select("id,customer_id,phone_e164,conversation_id").eq("id",oid).maybeSingle();
  if(oq.error)throw oq.error;if(!oq.data?.id)return {error:"order_not_found",status:404};
  let phone=tx(oq.data.phone_e164,40),registrationComplete=false;
  if(oq.data.customer_id){
    const cq=await db.from("ops2_admin_customer_registration_v1").select("primary_whatsapp_e164,registration_complete").eq("customer_id",oq.data.customer_id).maybeSingle();
    if(cq.error)throw cq.error;phone=phone||tx(cq.data?.primary_whatsapp_e164,40);registrationComplete=cq.data?.registration_complete===true;
  }
  const [wq,lq,gateway]=await Promise.all([
    db.from("ops2_whatsapp_outbox_v1").select("recipient_kind,status,attempt_count,sent_at,last_error,channel_origin,phone_e164,updated_at").eq("order_id",oid).eq("message_kind","order_received").order("created_at",{ascending:false}),
    db.from("ops2_order_registration_links_v1").select("id,phone_e164,expires_at,consumed_at,consumed_customer_id,revoked_at,created_at").eq("order_id",oid).order("created_at",{ascending:false}).limit(1),
    orderWhatsappGatewayReadiness()
  ]);
  if(wq.error)throw wq.error;if(lq.error)throw lq.error;
  const whatsapp:any={};for(const row of wq.data||[])if(!whatsapp[row.recipient_kind])whatsapp[row.recipient_kind]=row;
  const link:any=(lq.data||[])[0]||null;
  let linkState="none";
  if(link){
    if(link.consumed_at)linkState="consumed";
    else if(link.revoked_at)linkState="revoked";
    else if(Date.parse(link.expires_at)<=Date.now())linkState="expired";
    else linkState="active";
  }
  return {order_id:oid,phone_e164:phone,registration_complete:registrationComplete,whatsapp_ready:gateway.ready===true,whatsapp_provider:gateway,whatsapp,registration_link:link?{...link,state:linkState}:null};
}
async function dispatchOrderWhatsapp(oid:string){
  const deliveries:any[]=[];
  for(let i=0;i<2;i++){
    try{
      const res=await fetch(U+"/functions/v1/admin-orders-v1",{
        method:"POST",headers:{"Content-Type":"application/json","apikey":K,"x-internal-key":K},
        body:JSON.stringify({order_id:oid}),signal:AbortSignal.timeout(20000)
      });
      const data=await res.json().catch(()=>({ok:false,error:"invalid_gateway_response"}));
      deliveries.push({...data,http_status:res.status});
    }catch(e){deliveries.push({ok:false,error:"gateway_unreachable",detail:tx((e as Error)?.message||e,180)})}
  }
  return deliveries;
}
async function orderWhatsappSend(p:any){
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};
  const gateway=await orderWhatsappGatewayReadiness();
  if(gateway.ready!==true)return {error:"order_whatsapp_provider_not_configured",status:409,provider:gateway};
  const q=await db.rpc("ops2_enqueue_admin_order_whatsapp_v1",{p_order_id:oid});
  if(q.error)throw q.error;if(q.data?.ok!==true)return {error:q.data?.error||"whatsapp_enqueue_failed",status:409};
  const deliveries=await dispatchOrderWhatsapp(oid),current:any=await orderWhatsappRegistrationStatus(oid);
  const relevant=deliveries.filter(x=>x?.status!=="idle");
  return {queued:q.data,deliveries,delivery_ok:relevant.length>0&&relevant.every(x=>x?.ok===true),status_snapshot:current};
}
async function orderRegistrationLinkIssue(p:any,adminAuthorization:string){
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};
  const q=await db.rpc("ops2_issue_order_registration_link_v1",{p_order_id:oid});
  if(q.error)throw q.error;if(q.data?.ok!==true)return {error:q.data?.error||"registration_link_failed",status:409};
  const link=q.data||{};
  const order=await db.from("orders").select("id,conversation_id,phone_e164").eq("id",oid).maybeSingle();
  if(order.error)throw order.error;
  let conversationId=order.data?.conversation_id||null;
  const targetDigits=dg(link.phone_e164||order.data?.phone_e164,20);
  if(!conversationId&&targetDigits){
    const conv=await db.from("conversations").select("id,wa_contact_e164,updated_at").not("whatsapp_account_id","is",null).order("updated_at",{ascending:false}).limit(120);
    if(conv.error)throw conv.error;
    const match=(conv.data||[]).find((x:any)=>dg(x.wa_contact_e164,20)===targetDigits);conversationId=match?.id||null;
  }
  let papoaiSend:any={ok:false,error:"conversation_not_found"};
  if(conversationId&&adminAuthorization){
    try{
      const text="Olá! Para concluir seu cadastro da Dona Antônia e vincular ao seu pedido, acesse: "+String(link.registration_url||"");
      const res=await fetch(U+"/functions/v1/admin-whatsapp-ops-v1?action=send_text",{
        method:"POST",headers:{"Content-Type":"application/json","Authorization":adminAuthorization,"apikey":K},
        body:JSON.stringify({conversation_id:conversationId,text,idempotency_key:"order-registration:"+oid+":"+String(link.link_id||"")}),
        signal:AbortSignal.timeout(20000)
      });
      const data=await res.json().catch(()=>({ok:false,error:"invalid_papoai_response"}));
      papoaiSend={...data,http_status:res.status,ok:res.ok&&data?.ok!==false&&data?.dispatch?.ok!==false};
    }catch(e){papoaiSend={ok:false,error:"papoai_unreachable",detail:tx((e as Error)?.message||e,180)}}
  }
  return {link_id:link.link_id,registration_url:link.registration_url,expires_at:link.expires_at,phone_e164:link.phone_e164,conversation_id:conversationId,papoai_send:papoaiSend};
}

async function orderSeparationGet(rawId:any){
  const oid=id(rawId);if(!oid)return {error:"invalid_order",status:400};
  const q=await db.rpc("ops2_get_order_separation_v2",{p_order_id:oid});if(q.error)throw q.error;
  if(q.data?.ok!==true)return {error:String(q.data?.error||"separation_unavailable"),status:q.data?.error==="order_not_found"?404:409,...q.data};
  return {separation:q.data};
}
async function orderSeparationAssign(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id||p?.order_id);if(!oid)return {error:"invalid_order",status:400};
  const key=tx(p?.separator_key,30).toLowerCase()||null;
  const q=await db.rpc("ops2_set_order_separator_v2",{p_order_id:oid,p_separator_key:key});if(q.error)throw q.error;
  if(q.data?.ok!==true)return {error:String(q.data?.error||"separator_update_failed"),status:409,...q.data};
  return {assignment:q.data};
}
async function orderSeparationItemSet(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id||p?.order_id),itemId=id(p?.order_item_id);if(!oid||!itemId)return {error:"invalid_order_item",status:400};
  const requested=tx(p?.state,20).toLowerCase(),expected=tx(p?.expected_order_updated_at,80),requestedSeparator=tx(p?.separator_key,30).toLowerCase()||null;
  if(!["separated","missing"].includes(requested))return {error:"invalid_separation_state",status:400};
  if(!expected||!Number.isFinite(Date.parse(expected)))return {error:"order_version_required",status:409};
  const assignmentQ=await db.from("order_separation_assignments_v1").select("separator_key,separator_label,assigned_at").eq("order_id",oid).maybeSingle();
  if(assignmentQ.error)throw assignmentQ.error;
  const separator=tx(assignmentQ.data?.separator_key,30).toLowerCase()||null;
  if(!separator)return {error:"separator_required",status:409};
  if(requestedSeparator&&requestedSeparator!==separator)return {error:"separator_assignment_changed",status:409,separator_key:separator,separator_label:assignmentQ.data?.separator_label||null};
  let oq=await db.from("orders").select("id,status,updated_at").eq("id",oid).maybeSingle();if(oq.error)throw oq.error;if(!oq.data)return {error:"order_not_found",status:404};
  if(String(oq.data.updated_at)!==expected)return {error:"stale_order_version",conflict:"order_version_conflict",status:409,order_updated_at:oq.data.updated_at};

  const q=await db.rpc("ops2_set_order_separation_item_v2",{p_order_id:oid,p_order_item_id:itemId,p_state:requested,p_expected_order_updated_at:oq.data.updated_at,p_separator_key:separator});if(q.error)throw q.error;
  if(q.data?.ok!==true){const conflict=["stale_order_version","order_version_conflict"].includes(String(q.data?.error||q.data?.conflict||""));return {error:String(q.data?.error||"separation_item_update_failed"),status:conflict?409:400,...q.data}}

  let blingSync:any=null,warning:string|null=null,orderUpdatedAt=q.data?.order_updated_at||null;
  if(uiStatus(oq.data.status)==="confirmed"){
    try{blingSync=await syncConfirmedOrderToBling(oid,separator||tx(p?.operator,80)||"Separação")}
    catch(e){blingSync={attempted:true,ok:false,error:tx((e as Error)?.message||e,300)}}
    if(blingSync?.ok){
      const moved=await db.from("orders").update({status:"processing",updated_at:new Date().toISOString()}).eq("id",oid).eq("status","confirmed").select("updated_at").maybeSingle();if(moved.error)throw moved.error;
      orderUpdatedAt=moved.data?.updated_at||orderUpdatedAt;
    }else{
      warning="bling_approval_pending";
      await openSeparationIntegrationAttention(
        oid,"order_bling_approval_pending",
        "Item da separação foi salvo; aprovação do pedido no Bling está pendente.",
        "Regularize a sincronização com o Bling antes de concluir a separação.",
        {item_state:requested,order_item_id:itemId,bling_sync:blingSync}
      );
    }
  }
  try{await db.rpc("ops2_refresh_order_public_snapshot_v1",{p_order_id:oid})}catch{}
  try{await opsEvent("order.separation_item_recorded","Item da separação registrado no Supabase.","order",oid,{order_item_id:itemId,state:requested,separator_key:separator,bling_sync:blingSync,warning},assignmentQ.data?.separator_label||separator,"human","dona_antonia","order-separation-item:"+oid+":"+itemId+":"+requested+":"+String(q.data?.order_updated_at||""))}catch{}
  return {item:q.data,persisted:true,order_updated_at:orderUpdatedAt,bling_sync:blingSync,warning};
}
async function markSeparationNeedsAttention(oid:string,resumeFrom:string,error:any,detail:any=null){
  try{await db.rpc("ops2_mark_order_separation_completion_v2",{p_order_id:oid,p_phase:"needs_attention",p_metadata:{resume_from:resumeFrom,last_error:String(error||"separation_completion_failed"),last_error_detail:detail||null,last_error_at:new Date().toISOString()}})}catch{}
}
async function openSeparationIntegrationAttention(oid:string,type:string,summary:string,action:string,evidence:any={}){
  try{
    await db.rpc("ops_open_attention_v1",{
      p_type:type,p_summary:summary,p_entity_type:"order",p_entity_id:oid,p_correlation_id:oid,
      p_priority:"high",p_owner_role:"supervisor",p_recommended_action:action,
      p_evidence:evidence||{},p_source_system:"bling",p_idempotency_key:"orders-v4:"+type+":"+oid,p_due_at:null
    });
  }catch{}
}
async function autoIssueFiscalAfterSeparation(oid:string){
  const pf=await db.rpc("ops2_fiscal_dispatch_preflight_v1",{p_order_id:oid});
  if(pf.error)return {attempted:false,ok:false,error:"fiscal_preflight_unavailable",detail:pf.error.message||null};
  if(pf.data?.ready!==true)return {attempted:false,ok:false,error:"fiscal_preflight_blocked",blockers:pf.data?.blockers||[],preflight:pf.data};
  const before:any=await orderFiscalStatusV4(oid);
  if(before.error)return {attempted:false,ok:false,error:before.error,detail:before.detail||null};
  if(before.authorized===true)return {attempted:false,ok:true,authorized:true,stage:"authorized",idempotent_replay:true,fiscal:before};
  if((before.hard_blockers||[]).length)return {attempted:false,ok:false,error:"fiscal_dispatch_not_eligible",blockers:before.hard_blockers,fiscal:before};
  if(before.issue_enabled!==true)return {attempted:false,ok:false,error:"fiscal_auto_issue_not_enabled",fiscal:before};

  const h=await hub("fiscal_dispatch_canary_human_execute",{source_order_id:oid,confirmation:"EMITIR_NFE"});
  if(h.error)return {attempted:true,ok:false,error:h.error||"fiscal_issue_failed",detail:h.detail||h.data||null,fiscal:before};

  let after:any=null,reconcile:any=null;
  for(let attempt=1;attempt<=5;attempt++){
    try{reconcile=await hub("fiscal_dispatch_reconcile",{source_order_id:oid})}catch{}
    after=await orderFiscalStatusV4(oid);
    if(after?.authorized===true||after?.stage==="authorized"){
      return {attempted:true,ok:true,authorized:true,stage:"authorized",attempts:attempt,result:h.data||null,reconcile:reconcile?.data||null,fiscal:after};
    }
    if(after?.stage==="rejected"){
      return {attempted:true,ok:false,authorized:false,stage:"rejected",attempts:attempt,error:"fiscal_rejected",result:h.data||null,reconcile:reconcile?.data||null,fiscal:after};
    }
    if(attempt<5)await new Promise(resolve=>setTimeout(resolve,2000));
  }
  if(after?.error)return {attempted:true,ok:true,authorized:false,stage:"processing",attempts:5,result:h.data||null};
  const accepted=after?.stage==="processing"||after?.stage==="pending";
  return {attempted:true,ok:accepted,authorized:false,stage:after?.stage||"processing",attempts:5,result:h.data||null,reconcile:reconcile?.data||null,fiscal:after};
}
async function runSeparationPostCompletionIntegrations(oid:string,operator:string){
  let blingVerified:any={attempted:true,ok:false};
  try{
    const snap=await buildSnapshot(oid,"separation_completed");
    const verified=await hub("ops2_ensure_order_state",{payload:snap,target_key:"verified",canary:false});
    if(verified.error){
      blingVerified={attempted:true,ok:false,error:verified.error,detail:verified.data||verified.detail||null};
      await db.rpc("ops2_mark_order_separation_completion_v2",{p_order_id:oid,p_phase:"completed",p_metadata:{bling_verified:false,bling_verify_error:String(verified.error||"bling_verified_failed"),bling_verify_failed_at:new Date().toISOString()}});
      await openSeparationIntegrationAttention(oid,"order_bling_verified_pending","Separação concluída; sincronização Verificado no Bling está pendente.","Revisar a integração do pedido com o Bling. A separação física já está concluída.",blingVerified);
      return {bling_verified:blingVerified,fiscal_auto:{attempted:false,ok:false,error:"bling_not_verified"}};
    }
    blingVerified={attempted:true,ok:true,bling_order_id:verified.data?.bling_order_id||null,result:verified.data||null};
    await db.rpc("ops2_mark_order_separation_completion_v2",{p_order_id:oid,p_phase:"completed",p_metadata:{bling_verified:true,bling_order_id:verified.data?.bling_order_id||null,verified_at:new Date().toISOString()}});
  }catch(e){
    blingVerified={attempted:true,ok:false,error:tx((e as Error)?.message||e,300)};
    await openSeparationIntegrationAttention(oid,"order_bling_verified_pending","Separação concluída; sincronização Verificado no Bling está pendente.","Revisar a integração do pedido com o Bling. A separação física já está concluída.",blingVerified);
    return {bling_verified:blingVerified,fiscal_auto:{attempted:false,ok:false,error:"bling_not_verified"}};
  }

  let fiscalAuto:any;
  try{fiscalAuto=await autoIssueFiscalAfterSeparation(oid)}
  catch(e){fiscalAuto={attempted:true,ok:false,error:tx((e as Error)?.message||e,300)}}
  try{
    await db.rpc("ops2_mark_order_separation_completion_v2",{p_order_id:oid,p_phase:"completed",p_metadata:{
      fiscal_auto_attempted:fiscalAuto?.attempted===true,
      fiscal_auto_ok:fiscalAuto?.ok===true,
      fiscal_auto_authorized:fiscalAuto?.authorized===true,
      fiscal_auto_stage:fiscalAuto?.stage||null,
      fiscal_auto_error:fiscalAuto?.ok===true?null:String(fiscalAuto?.error||""),
      fiscal_auto_at:new Date().toISOString()
    }});
  }catch{}
  if(fiscalAuto?.ok!==true){
    await openSeparationIntegrationAttention(
      oid,"order_fiscal_auto_issue_pending",
      "Pedido separado; NF-e automática precisa de atenção.",
      "Abra o pedido e revise a pendência fiscal. A expedição continuará bloqueada até a autorização da NF-e.",
      fiscalAuto
    );
  }
  try{
    await opsEvent(
      fiscalAuto?.authorized===true?"order.fiscal_auto_authorized":"order.fiscal_auto_processed",
      fiscalAuto?.authorized===true?"NF-e autorizada automaticamente após a separação.":"Emissão fiscal automática processada após a separação.",
      "order",oid,{bling_verified:blingVerified,fiscal_auto:fiscalAuto},operator||"Separação","automation","bling","order-fiscal-auto-v4:"+oid
    );
  }catch{}
  return {bling_verified:blingVerified,fiscal_auto:fiscalAuto};
}
async function orderSeparationComplete(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id||p?.order_id);if(!oid)return {error:"invalid_order",status:400};
  const expected=tx(p?.expected_order_updated_at,80);if(!expected||!Number.isFinite(Date.parse(expected)))return {error:"order_version_required",status:409};
  let completionOrder=await db.from("orders").select("id,status,updated_at").eq("id",oid).maybeSingle();if(completionOrder.error)throw completionOrder.error;if(!completionOrder.data)return {error:"order_not_found",status:404};
  if(String(completionOrder.data.updated_at)!==expected)return {error:"stale_order_version",conflict:"order_version_conflict",status:409,order_updated_at:completionOrder.data.updated_at};
  const assignmentQ=await db.from("order_separation_assignments_v1").select("separator_key,separator_label,assigned_at").eq("order_id",oid).maybeSingle();
  if(assignmentQ.error)throw assignmentQ.error;
  if(!tx(assignmentQ.data?.separator_key,30))return {error:"separator_required",status:409};

  const prep=await db.rpc("ops2_prepare_order_separation_completion_v2",{p_order_id:oid,p_expected_order_updated_at:expected});if(prep.error){
    const message=String(prep.error.message||"");
    if(message.includes("separator_required_before_completion"))return {error:"separator_required",status:409};
    throw prep.error;
  }
  if(prep.data?.ok!==true){const conflict=["stale_order_version","order_version_conflict"].includes(String(prep.data?.error||prep.data?.conflict||""));return {error:String(prep.data?.error||"separation_prepare_failed"),status:conflict?409:400,...prep.data}}
  const stock=await db.rpc("ops2_apply_order_separation_stock_v2",{p_order_id:oid});if(stock.error)throw stock.error;
  if(stock.data?.ok!==true){await markSeparationNeedsAttention(oid,"stock_applied",stock.data?.error,stock.data);return {error:String(stock.data?.error||"separation_stock_failed"),status:409,recovery_scheduled:true}}

  const oq=await db.from("orders").select("id,status,updated_at").eq("id",oid).maybeSingle();if(oq.error)throw oq.error;
  if(uiStatus(oq.data?.status)!=="ready"){await markSeparationNeedsAttention(oid,"stock_applied","ready_transition_failed",oq.data);return {error:"ready_transition_failed",status:409,recovery_scheduled:true}}
  try{await db.rpc("ops_sync_delivery_stop_v1",{p_order_id:oid,p_order_status:"ready"})}catch{}

  const operator=tx(assignmentQ.data?.separator_label,80)||tx(p?.operator,80)||"Separação";
  const done=await db.rpc("ops2_mark_order_separation_completion_v2",{p_order_id:oid,p_phase:"completed",p_metadata:{
    completed_by:auth?.user_id||null,
    separated_at:new Date().toISOString(),
    separator_key:assignmentQ.data?.separator_key||null,
    separator_label:assignmentQ.data?.separator_label||null,
    operational_completion:true,
    external_integrations_pending:true,
    physical_stock_launch_point:"dispatch"
  }});if(done.error)throw done.error;
  try{await db.rpc("ops2_refresh_order_public_snapshot_v1",{p_order_id:oid})}catch{}

  let customerNotification:any={attempted:true,ok:false};
  try{
    const notifyResponse=await fetch(`${U}/functions/v1/order-separation-notify-v1`,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-internal-key":K},
      body:JSON.stringify({order_id:oid}),
      signal:AbortSignal.timeout(18000)
    });
    customerNotification={attempted:true,ok:notifyResponse.ok,status:notifyResponse.status};
    if(!notifyResponse.ok){const detail=await notifyResponse.text().catch(()=>"");customerNotification.detail=tx(detail,300);console.error("order_separation_customer_notify",oid,notifyResponse.status,tx(detail,300))}
  }catch(error){customerNotification={attempted:true,ok:false,error:tx((error as Error)?.message||error,300)};console.error("order_separation_customer_notify",oid,customerNotification.error)}
  try{await db.rpc("ops2_mark_order_separation_completion_v2",{p_order_id:oid,p_phase:"completed",p_metadata:{customer_notification_ok:customerNotification.ok===true,customer_notification_at:new Date().toISOString()}})}catch{}

  const integrationTask=runSeparationPostCompletionIntegrations(oid,operator).catch(async error=>{
    await openSeparationIntegrationAttention(oid,"order_post_separation_integration_pending","Separação concluída; integrações posteriores precisam de atenção.","Revisar Bling/NF-e. Não refaça a separação física.",{error:tx((error as Error)?.message||error,300)});
    return null;
  });
  const edgeRuntime=(globalThis as any).EdgeRuntime;
  let integrationsQueued=false,integrations:any=null;
  if(edgeRuntime&&typeof edgeRuntime.waitUntil==="function"){edgeRuntime.waitUntil(integrationTask);integrationsQueued=true}
  else integrations=await integrationTask;

  await opsEvent("order.separation_completed","Separação concluída. Pedido pronto; integrações fiscais seguem em segundo plano.","order",oid,{
    missing_subtotal:prep.data?.missing_subtotal||0,final_total:prep.data?.final_total||null,status:"ready",
    separator_key:assignmentQ.data?.separator_key||null,separator_label:assignmentQ.data?.separator_label||null,
    customer_notification:customerNotification,integrations_queued:integrationsQueued
  },operator,"human","dona_antonia","order-separation-v4-complete:"+oid);
  return {
    order_id:oid,order_number:prep.data?.order_number||null,status:"ready",completion:done.data,
    missing_subtotal:prep.data?.missing_subtotal||0,final_total:prep.data?.final_total||null,
    separator:assignmentQ.data||null,customer_notification:customerNotification,
    integrations_queued:integrationsQueued,integrations,recovery_scheduled:false
  };
}

async function completeDeliveryV3(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id||p?.order_id);if(!oid)return {error:"invalid_order",status:400};
  const method=tx(p?.method,40).toLowerCase(),amount=Math.round(Number(p?.amount_cents||0));
  const q=await db.rpc("ops3_complete_delivery_v1",{p_order_id:oid,p_method:method,p_amount_cents:amount,p_operator_label:tx(p?.operator,80)||"Entrega",p_idempotency_key:tx(p?.idempotency_key,120)||("delivery-v3:"+oid)});
  if(q.error){const m=String(q.error.message||"");for(const code of ["invalid_payment_method","payment_total_mismatch","payment_already_captured","order_not_ready_for_delivery","separation_not_completed","delivery_return_open"]){if(m.includes(code))return {error:code,status:code.startsWith("invalid_")?400:409}}throw q.error}
  try{await db.rpc("ops_sync_delivery_stop_v1",{p_order_id:oid,p_order_status:"delivered"})}catch{}
  try{await db.rpc("ops2_refresh_order_public_snapshot_v1",{p_order_id:oid})}catch{}

  let bling_completion:any=null;
  try{
    try{await hub("fiscal_status",{source_order_id:oid})}catch{}
    const h=await hub("ops2_ensure_delivered_attended",{source_order_id:oid});
    if(h.error){
      await db.from("orders").update({sync_status:"review_bling",sync_error:tx(h.error||"bling_attended_failed",300),updated_at:new Date().toISOString()}).eq("id",oid);
      try{await db.rpc("ops_open_attention_v1",{p_type:"bling_delivery_sync_review",p_summary:"Entrega confirmada; Bling precisa de revisão.",p_entity_type:"order",p_entity_id:oid,p_correlation_id:oid,p_priority:"high",p_owner_role:"supervisor",p_recommended_action:"Abra o pedido entregue e revise a situação no Bling.",p_evidence:{error:h.error,detail:h.detail||h.data||null},p_source_system:"bling",p_idempotency_key:"ops3:bling_delivery_review:"+oid,p_due_at:null})}catch{}
      bling_completion={attempted:true,ok:false,error:h.error,detail:h.detail||h.data||null,recovery_scheduled:true};
    }else{
      bling_completion={attempted:true,ok:true,result:h.data};
      await opsEvent("order.bling_attended","Pedido entregue confirmado como Atendido no Bling.","order",oid,{bling_completion},tx(p?.operator,80)||"Entrega","automation","bling","order-bling-attended-v3:"+oid);
    }
  }catch(e){
    await db.from("orders").update({sync_status:"review_bling",sync_error:tx((e as Error)?.message||e,300),updated_at:new Date().toISOString()}).eq("id",oid);
    bling_completion={attempted:true,ok:false,error:tx((e as Error)?.message||e,300),recovery_scheduled:true};
  }
  return {...(q.data||{ok:true,order_id:oid,status:"delivered"}),bling_completion};
}

async function finalizeCapturedDeliveryV4(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id||p?.order_id);if(!oid)return {error:"invalid_order",status:400};
  const operator=tx(p?.operator,80)||"Entrega";
  const ret=await db.from("order_delivery_return_cases").select("id,status").eq("order_id",oid).in("status",["returning","returned_review"]).limit(1).maybeSingle();
  if(ret.error)throw ret.error;if(ret.data?.id)return {error:"delivery_return_open",status:409,delivery_return_case_id:ret.data.id};
  const oq=await db.from("orders").select("id,status,total").eq("id",oid).maybeSingle();if(oq.error)throw oq.error;if(!oq.data)return {error:"order_not_found",status:404};
  if(uiStatus(oq.data.status)!=="out_for_delivery")return {error:"order_not_in_delivery",status:409};
  const pay=await db.from("order_payment_settlements").select("id,status,source,expected_total_cents,captured_total_cents").eq("order_id",oid).in("status",["captured","synced","needs_review"]).limit(1).maybeSingle();
  if(pay.error)throw pay.error;if(!pay.data?.id||pay.data.source!=="delivery")return {error:"delivery_payment_required",status:409};
  const expected=Math.round(Number(oq.data.total||0)*100);
  if(Number(pay.data.expected_total_cents)!==expected||Number(pay.data.captured_total_cents)!==expected)return {error:"delivery_payment_mismatch",status:409};
  const u=await db.from("orders").update({status:"delivered",delivered_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",oid).eq("status","out_for_delivery").select("id,updated_at").maybeSingle();
  if(u.error)throw u.error;if(!u.data?.id)return {error:"delivery_state_conflict",status:409};
  try{await db.rpc("ops_sync_delivery_stop_v1",{p_order_id:oid,p_order_status:"delivered"})}catch{}
  try{await db.rpc("ops2_refresh_order_public_snapshot_v1",{p_order_id:oid})}catch{}
  await opsEvent("order.status_changed","Pedido alterado de out_for_delivery para delivered.","order",oid,{from:"out_for_delivery",to:"delivered",canonical_action:"order_delivery_finalize_v4"},operator,"human","dona_antonia","delivery-finalize-v4:"+oid);
  let bling_completion:any=null;
  try{
    try{await hub("fiscal_status",{source_order_id:oid})}catch{}
    const h=await hub("ops2_ensure_delivered_attended",{source_order_id:oid});
    if(h.error){
      await db.from("orders").update({sync_status:"review_bling",sync_error:tx(h.error||"bling_attended_failed",300),updated_at:new Date().toISOString()}).eq("id",oid);
      try{await db.rpc("ops_open_attention_v1",{p_type:"bling_delivery_sync_review",p_summary:"Entrega confirmada; Bling precisa de revisão.",p_entity_type:"order",p_entity_id:oid,p_correlation_id:oid,p_priority:"high",p_owner_role:"supervisor",p_recommended_action:"Abra o pedido entregue e revise a situação no Bling.",p_evidence:{error:h.error,detail:h.detail||h.data||null},p_source_system:"bling",p_idempotency_key:"ops4:bling_delivery_review:"+oid,p_due_at:null})}catch{}
      bling_completion={attempted:true,ok:false,error:h.error,detail:h.detail||h.data||null,recovery_scheduled:true};
    }else{
      bling_completion={attempted:true,ok:true,result:h.data};
      await opsEvent("order.bling_attended","Pedido entregue confirmado como Atendido no Bling.","order",oid,{bling_completion},operator,"automation","bling","order-bling-attended-v4:"+oid);
    }
  }catch(e){
    await db.from("orders").update({sync_status:"review_bling",sync_error:tx((e as Error)?.message||e,300),updated_at:new Date().toISOString()}).eq("id",oid);
    bling_completion={attempted:true,ok:false,error:tx((e as Error)?.message||e,300),recovery_scheduled:true};
  }
  return {ok:true,order_id:oid,status:"delivered",payment_settlement_id:pay.data.id,bling_completion};
}

async function reopenOrderV3(p:any,auth:any){
  if(auth?.role==="viewer")return {error:"forbidden",status:403};
  const oid=id(p?.id||p?.order_id);if(!oid)return {error:"invalid_order",status:400};
  const q=await db.rpc("ops3_reopen_order_v1",{p_order_id:oid,p_operator_label:tx(p?.operator,80)||"Operação"});
  if(q.error){const m=String(q.error.message||"");for(const code of ["order_not_confirmed","separation_already_started","stock_release_failed"]){if(m.includes(code))return {error:code,status:409}}throw q.error}
  return q.data||{ok:true,order_id:oid,status:"storefront_received"};
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
Deno.serve(async(r:Request)=>{if(r.method==="OPTIONS")return new Response(null,{status:204,headers:cors(r)});const u=new URL(r.url),a=tx(u.searchParams.get("action")||(r.method==="GET"?"health":""),80);if(!LOCAL.has(a))return js(r,{ok:false,error:"not_found"},404);try{if(a==="health")return js(r,{ok:true,service:"admin-products-live-v1",mode:"canonical-admin-gateway",version:61,legacy_proxy:false});if(a==="ops2_recover_ean_verified"){
  if(r.method!=="POST")return js(r,{ok:false,error:"method_not_allowed"},405);
  const expected=await db.rpc("get_bling_hub_key_v2");
  if(expected.error||!expected.data)return js(r,{ok:false,error:"internal_auth_unavailable"},503);
  const provided=tx(r.headers.get("x-dona-antonia-bling-hub-key"),500);
  if(!provided||provided!==String(expected.data))return js(r,{ok:false,error:"internal_auth_required"},401);
  let internalBody:any={};try{internalBody=await r.json()}catch{}
  const out=await recoverPendingEanVerified(internalBody?.limit??3);
  return js(r,out,out.ok===false?500:200);
}
const auth:any=await adminAuth(r);if(!auth.ok)return js(r,{ok:false,error:auth.error},auth.status||401);if(r.method==="POST"&&auth.role==="viewer"&&WRITE_ACTIONS.has(a))return js(r,{ok:false,error:"forbidden"},403);if(r.method==="GET"&&a==="cnpj_lookup"){const x:any=await cnpjLookup(u);return x.error?js(r,{ok:false,error:x.error,message:x.message},x.status||400):js(r,{ok:true,company:x.company,source:x.source})}if(r.method==="GET"&&a==="quotes")return js(r,{ok:true,...await quoteHistory(u)});if(r.method==="GET"&&a==="quote"){const x:any=await quoteGet(u.searchParams.get("id"));return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="basket_sales_runtime")return js(r,{ok:true,runtime:await basketSalesRuntime()});if(r.method==="GET"&&a==="basket_product_search")return js(r,{ok:true,...await basketProductSearch(u)});if(r.method==="GET"&&a==="basket_kit_product_suggestions"){const x:any=await basketKitProductSuggestions(u);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="basket_commercial_admin")return js(r,{ok:true,...await basketCommercialAdmin()});if(r.method==="GET"&&a==="basket_kits_admin")return js(r,{ok:true,...await basketKitsAdmin()});if(r.method==="GET"&&a==="basket_kit_admin"){const x:any=await basketKitAdminDetail(u.searchParams.get("id"));return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="baskets_admin")return js(r,{ok:true,...await basketsAdminList()});if(r.method==="GET"&&a==="basket_categories_admin")return js(r,{ok:true,...await basketCategoriesAdmin()});if(r.method==="GET"&&a==="basket_admin"){const x:any=await basketAdminDetail(u.searchParams.get("id"));return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="ops_summary")return js(r,{ok:true,summary:await opsSummary()});if(r.method==="GET"&&a==="ops_shadow_readiness")return js(r,{ok:true,readiness:await opsShadowReadiness()});if(r.method==="GET"&&a==="ops_print_queue")return js(r,{ok:true,queue:await opsPrintQueue(u.searchParams.get("limit"))});if(r.method==="GET"&&a==="ops_papoai_capture_status")return js(r,{ok:true,papoai:await opsPapoAiCaptureStatus()});if(r.method==="GET"&&a==="ops_timeline")return js(r,{ok:true,events:await opsTimeline(u.searchParams.get("limit"))});if(r.method==="GET"&&a==="ops_delivery_runs")return js(r,{ok:true,delivery:await opsDeliveryRuns()});if(r.method==="GET"&&a==="ops_attention")return js(r,{ok:true,attention:await opsAttention(u.searchParams.get("limit"))});if(r.method==="GET"&&a==="product_detail"){const x:any=await productDetail(id(u.searchParams.get("id")));return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="products")return js(r,{ok:true,...await products(u)});if(r.method==="GET"&&a==="product_facets")return js(r,{ok:true,...await facets(tx(u.searchParams.get("category"),120),tx(u.searchParams.get("active"),12))});if(r.method==="GET"&&a==="expirations")return js(r,{ok:true,...await exps()});if(r.method==="GET"&&a==="expiry_alerts"){const x=await exps();return js(r,{ok:true,summary:x.summary,products:x.products.slice(0,12),expired_deactivated:x.expired_deactivated})}if(r.method==="GET"&&a==="product_lots"){const x:any=await productLots(u.searchParams.get("id"));return x.error?js(r,{ok:false,error:x.error},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="product_fefo_preview"){const x:any=await fefoPreview(u.searchParams.get("id"),u.searchParams.get("quantity"));return x.error?js(r,{ok:false,error:x.error},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="product_lifecycle_audit")return js(r,{ok:true,audit:await auditList(Math.floor(nm(u.searchParams.get("limit")||40,1,100)))});if(r.method==="GET"&&a==="inventory_incidents")return js(r,{ok:true,inventory:await inventoryIncidents(u.searchParams.get("limit"))});if(r.method==="GET"&&a==="stock_recount_queue")return js(r,{ok:true,recount:await stockRecountQueue()});if(r.method==="GET"&&a==="inventory_balance_resolve_ean"){const x:any=await resolveInventoryBalanceEan({ean:u.searchParams.get("ean"),operator:u.searchParams.get("operator")},auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="inventory_balance_status"){const x:any=await inventoryBalanceStatus({product_id:u.searchParams.get("product_id")});return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="ean_lookup"){const x:any=await ean(u.searchParams.get("ean"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="gondolas")return js(r,{ok:true,...await glist()});if(r.method==="GET"&&a==="gondola"){const x:any=await gone(u.searchParams.get("id"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="orders")return js(r,{ok:true,orders:await ordersList()});if(r.method==="GET"&&a==="order"){const x:any=await orderDetailCanonical(u.searchParams.get("id"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="order_separation_get"){const x:any=await orderSeparationGet(u.searchParams.get("id"));return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="order_separation_board")return js(r,{ok:true,board:await activeSeparationBoard()});if(r.method==="GET"&&a==="order_registration_link_status"){const x:any=await orderWhatsappRegistrationStatus(u.searchParams.get("id"));return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="order_stock_shortages")return js(r,{ok:true,...await orderShortages()});if(r.method==="GET"&&a==="closure_orders")return js(r,{ok:true,...await closureOrders()});if(r.method==="GET"&&a==="bling_status"){const h=await hub("readiness");return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,bling:h.data?.readiness??h.data})}if(r.method==="POST"&&a==="bling_status_catalog_probe"){const x:any=await blingStatusCatalogProbe(auth);return x.error?js(r,{ok:false,...x},x.status||502):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="bling_oauth_begin"){const x:any=await blingOauthBegin(auth);return x.error?js(r,{ok:false,...x},x.status||500):js(r,{ok:true,...x})}let p:any={};try{p=await r.json()}catch{}if(r.method==="POST"&&a==="order_separation_assign"){const x:any=await orderSeparationAssign(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_separation_item_set"){const x:any=await orderSeparationItemSet(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_separation_complete"){const x:any=await orderSeparationComplete(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_delivery_complete_v3"){const x:any=await completeDeliveryV3(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_delivery_finalize_v4"){const x:any=await finalizeCapturedDeliveryV4(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_reopen_v3"){const x:any=await reopenOrderV3(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="quote_save"){const x:any=await quoteSave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="quote_status_set"){const x:any=await quoteStatusSet(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_commercial_create"){const x:any=await basketCommercialCreate(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_lot_sale_toggle"){const x:any=await basketLotSaleToggle(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_lots_sale_bulk"){const x:any=await basketLotsSaleBulk(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_sales_mode_set"){const x:any=await basketSalesModeSet(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_kit_lot_draft_save"){const x:any=await basketKitLotDraftSave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_kit_lot_draft_activate"){const x:any=await basketKitLotDraftActivate(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_kit_lot_reopen"){const x:any=await basketKitLotReopen(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_kit_template_save"){const x:any=await basketKitTemplateSave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_kit_template_archive"){const x:any=await basketKitTemplateArchive(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_kit_lot_draft_delete"){const x:any=await basketKitLotDraftDelete(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_kit_lot_create"){const x:any=await basketKitLotCreate(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_legacy_lot_release"){const x:any=await basketLegacyLotRelease(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_kit_lot_cancel"){const x:any=await basketKitLotCancel(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_kit_lot_delete"){const x:any=await basketKitLotDelete(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_category_save"){const x:any=await basketCategorySave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_category_delete"){const x:any=await basketCategoryDelete(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_category_assign"){const x:any=await basketCategoryAssign(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_subcategory_save"){const x:any=await basketSubcategorySave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_subcategory_delete"){const x:any=await basketSubcategoryDelete(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_archive"){const x:any=await basketArchive(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_save"){const x:any=await basketSave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_item_save"){const x:any=await basketItemSave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_item_delete"){const x:any=await basketItemDelete(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_alternative_save"){const x:any=await basketAlternativeSave(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_alternative_delete"){const x:any=await basketAlternativeDelete(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_lot_create"){const x:any=await basketLotCreate(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_lot_cancel"){const x:any=await basketLotCancel(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_whatsapp_send"){const x:any=await orderWhatsappSend(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_registration_link_issue"){const x:any=await orderRegistrationLinkIssue(p,r.headers.get("Authorization")||"");return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="papoai_issue_catalog_link"){const x:any=await opsPapoAiIssueCatalogLink(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="inventory_sheet_options"){return js(r,{ok:true,...await inventorySheetOptions()})}if(r.method==="GET"&&a==="inventory_sheet_batches"){return js(r,{ok:true,...await inventorySheetBatches()})}if(r.method==="POST"&&a==="inventory_sheet_manifest"){const x:any=await inventorySheetManifest(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="inventory_sheet_pending_manual"){return js(r,{ok:true,...await inventorySheetPendingManual()})}if(r.method==="POST"&&a==="inventory_sheet_cancel_scan"){const x:any=await inventorySheetCancelScan(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="inventory_sheet_preview"){return js(r,{ok:true,...await inventorySheetPreview(p)})}if(r.method==="POST"&&a==="inventory_sheet_create"){const x:any=await inventorySheetCreate(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="inventory_sheet_analyze"){const x:any=await inventorySheetAnalyze(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="inventory_sheet_apply"){const x:any=await inventorySheetApply(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="product_lot_save"){const x:any=await saveProductLot(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="product_lot_tracking_complete"){const x:any=await setLotTrackingComplete(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="history_sync_retry"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const g:any=await guardOrder(oid);return g.error?js(r,{ok:false,...g},g.status||409):js(r,{ok:true,order_id:oid,history_synced:true,canonical:true})}
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
  if(r.method==="POST"&&a==="order_update"){const bypass:any=await rejectCriticalStatusBypass(p);if(bypass)return js(r,{ok:false,...bypass},bypass.status||409);const x:any=await updateOrderCanonical(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_consume_stock"){const x:any=await consumeOrder(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="bling_probe_readonly"){const h=await hub("probe_readonly");return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,probe:h.data})}if(r.method==="POST"&&a==="bling_reconcile_catalog_readonly"){const h=await reconcileCatalog();return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="bling_reconcile_customers_readonly"){const h=await hub("reconcile_customers_readonly",{limit:p?.limit??650});return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="bling_preview_order_sync"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const x:any=await previewOrder(oid);return x.error?js(r,{ok:false,error:x.error,detail:x.detail},x.status||502):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="bling_reconcile_order_dependencies_readonly"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);return js(r,{ok:true,...await reconcileDeps(oid)})}if(r.method==="POST"&&a==="bling_create_order_customer"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const x:any=await ensureOrderCustomer(oid);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="bling_create_order_products"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const x:any=await createOrderProducts(oid);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_fiscal_status"){const x:any=await orderFiscalStatusV4(p?.id);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_fiscal_issue_v4"){const x:any=await orderFiscalIssueV4(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_dispatch_start_v4"){const x:any=await orderDispatchStartV4(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_fiscal_dispatch_canary_execute"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);if(tx(p?.confirmation,40)!=="EMITIR_NFE")return js(r,{ok:false,error:"fiscal_human_confirmation_required"},409);const pf=await db.rpc("ops2_fiscal_dispatch_preflight_v1",{p_order_id:oid});if(pf.error)throw pf.error;if(pf.data?.ready!==true)return js(r,{ok:false,error:"fiscal_dispatch_preflight_failed",preflight:pf.data,detail:"Pedido ainda não está pronto para emissão fiscal."},409);const h=await hub("fiscal_dispatch_canary_human_execute",{source_order_id:oid,confirmation:"EMITIR_NFE"});return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="order_fiscal_document_pdf"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const h=await hub("fiscal_document_pdf",{source_order_id:oid});return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="order_fiscal_confirm_payment"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);return js(r,{ok:false,error:"fiscal_payment_confirmation_deprecated",detail:"O pagamento fiscal agora vem do settlement real da entrega. Esta ação antiga foi desativada para evitar conflito com o gate de NF-e antes da expedição."},409)}if(r.method==="POST"&&a==="bling_finance_overview"){const auth=r.headers.get("Authorization")||"",h=await hub("finance_overview",{},auth);return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="bling_finance_action"){const auth=r.headers.get("Authorization")||"",h=await hub("finance_action",p||{},auth);return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="GET"&&a==="stock_cutover_preflight"){const z=await db.rpc("get_ops2_stock_cutover_preflight_v1");if(z.error)throw z.error;return js(r,{ok:true,preflight:z.data})}if(r.method==="POST"&&a==="stock_reconciliation_classify"){const z:any=await classifyStockReconciliation(p,auth);return z.error?js(r,{ok:false,...z},z.status||400):js(r,{ok:true,...z})}if(r.method==="POST"&&a==="inventory_incident_create"){const z:any=await createInventoryIncident(p,auth);return z.error?js(r,{ok:false,...z},z.status||400):js(r,{ok:true,...z})}if(r.method==="POST"&&a==="inventory_balance_prepare_unknown"){const z:any=await prepareInventoryBalanceUnknown(p,auth);return z.error?js(r,{ok:false,...z},z.status||400):js(r,{ok:true,...z})}if(r.method==="POST"&&a==="inventory_balance_commit"){const z:any=await commitInventoryBalance(p,auth);return z.error?js(r,{ok:false,...z},z.status||400):js(r,{ok:true,...z})}let x:any;if(a==="product_save")x=await saveProduct(p);else if(a==="product_quick_save")x=await quickProductSave(p,auth);else if(a==="product_stock_set")x=await setProductStockOfficial(p,auth);else if(a==="offer_save")x=await saveOffer(p);else if(a==="expiration_save")x=await expSave(p);else if(a==="balance_confirm")x=await bal(p);else if(a==="gondola_create")x=await gcreate(p);else if(a==="gondola_assign")x=await gassign(p);else if(a==="gondola_shelf_update")x=await gshelf(p);else if(a==="gondola_remove")x=await grem(p);else if(a==="gondola_clear")x=await gclear(p);else if(a==="gondola_assign_count")x=await gassignCount(p);else return js(r,{ok:false,error:"method_not_allowed"},405);return x?.error?js(r,{ok:false,error:x.error},x.status||400):js(r,{ok:true,...x})}catch(e){console.error("canonical_admin_error",a,String(e?.message||e));return js(r,{ok:false,error:"service_error",detail:String(e?.message||e)},500)}});
