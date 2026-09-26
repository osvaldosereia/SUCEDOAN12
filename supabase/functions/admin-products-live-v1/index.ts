import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const O=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const OP_SOURCES=["vitrine","manual_whatsapp","papoai","reorder"];
const LOCAL=new Set(["health","products","product_facets","product_save","offer_save","expirations","expiration_save","expiry_alerts","product_lifecycle_audit","ean_lookup","balance_confirm","inventory_incidents","inventory_incident_create","stock_recount_queue","stock_reconciliation_classify","gondolas","gondola","gondola_create","gondola_assign","gondola_shelf_update","gondola_remove","orders","order","closure_orders","order_stock_shortages","order_update","order_payment_capture","delivery_fail_register","delivery_return_confirm","delivery_return_resolve","order_consume_stock","bling_status","bling_status_catalog_probe","bling_oauth_begin","bling_probe_readonly","bling_reconcile_catalog_readonly","bling_reconcile_customers_readonly","bling_preview_order_sync","bling_reconcile_order_dependencies_readonly","bling_create_order_customer","bling_create_order_products","order_fiscal_status","order_fiscal_dispatch_canary_execute","order_fiscal_document_pdf","order_fiscal_confirm_payment","bling_finance_overview","bling_finance_action","history_sync_retry","order_component_replace","ops_summary","ops_attention","ops_shadow_readiness","ops_print_queue","ops_print_presented","manual_order_create","ops_papoai_capture_status","ops_timeline","ops_delivery_runs","ops_delivery_plan"]);
const WRITE_ACTIONS=new Set(["product_save","offer_save","expiration_save","balance_confirm","inventory_incident_create","stock_reconciliation_classify","gondola_create","gondola_assign","gondola_shelf_update","gondola_remove","ops_print_presented","ops_delivery_plan","manual_order_create","order_payment_capture","delivery_fail_register","delivery_return_confirm","delivery_return_resolve","order_update","order_consume_stock","bling_create_order_customer","bling_create_order_products","order_fiscal_dispatch_canary_execute","order_fiscal_confirm_payment","bling_finance_action"]);
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
async function rec(){const t=today(),q=await db.from("products").select("id,name,price,stock,is_active,is_offer,offer_price,validity_date,metadata").not("validity_date","is",null).limit(5000);if(q.error)throw q.error;for(const p of q.data||[]){const m=meta(p.metadata),d=days(t,String(p.validity_date));if(d<0&&p.is_active!==false){const r=await db.from("products").update({is_active:false,stock:0,is_offer:false,offer_price:null,metadata:{...m,deactivation_reason:"expired",deactivated_at:new Date().toISOString(),offer_source:null,offer_discount_percent:null},updated_at:new Date().toISOString()}).eq("id",p.id).select("*").single();if(!r.error)await aud(p,r.data,{operator:"Sistema"},"expiry_reconcile");continue}if(p.is_active===false)continue;const auto=m.auto_expiry_offer_enabled===true;if(auto&&d>=0&&d<=90){const pc=d<30?40:d<60?20:10,op=Math.round(Number(p.price||0)*(100-pc))/100;if(p.is_offer!==true||Number(p.offer_price)!==op||m.offer_source!=="expiry_auto"||Number(m.offer_discount_percent)!==pc)await db.from("products").update({is_offer:true,offer_price:op,metadata:{...m,offer_source:"expiry_auto",offer_discount_percent:pc,offer_duration_mode:"validity"},updated_at:new Date().toISOString()}).eq("id",p.id)}else if(m.offer_source==="expiry_auto"&&(p.is_offer||p.offer_price!=null))await db.from("products").update({is_offer:false,offer_price:null,metadata:{...m,offer_source:null,offer_discount_percent:null},updated_at:new Date().toISOString()}).eq("id",p.id)}}
async function products(u:URL){const off=Math.floor(nm(u.searchParams.get("offset"),0,100000)),lim=Math.floor(nm(u.searchParams.get("limit")||60,1,100)),qv=tx(u.searchParams.get("q"),100).replace(/[,%()]/g," "),cat=tx(u.searchParams.get("category"),120),sub=tx(u.searchParams.get("subcategory"),120),act=tx(u.searchParams.get("active"),12);let q=db.from("products").select("*").order("name").range(off,off+lim-1);if(cat)q=q.eq("sales_category",cat);if(sub)q=q.eq("subcategory",sub);if(act==="true")q=q.eq("is_active",true);if(act==="false")q=q.eq("is_active",false);if(qv)q=q.or("name.ilike.%"+qv+"%,gtin.ilike.%"+qv+"%,sku.ilike.%"+qv+"%");const r=await q;if(r.error)throw r.error;return {products:(r.data||[]).map(mp),next_offset:(r.data||[]).length===lim?off+lim:null}}
async function facets(c:string){const r=await db.from("products").select("sales_category,storefront_category,category,subcategory").limit(5000);if(r.error)throw r.error;const cm=new Map(),sm=new Map();for(const p of r.data||[]){const x=tx(p.sales_category||p.storefront_category||p.category,120),s=tx(p.subcategory,120);if(x)cm.set(x,(cm.get(x)||0)+1);if(s&&(!c||x===c))sm.set(s,(sm.get(s)||0)+1)}return {categories:[...cm].map(([value,count])=>({value,label:value,count})).sort((a,b)=>a.label.localeCompare(b.label,"pt-BR")),subcategories:[...sm].map(([value,count])=>({value,label:value,count})).sort((a,b)=>a.label.localeCompare(b.label,"pt-BR"))}}
async function saveProduct(p:any){const pid=id(p?.id),name=tx(p?.name,300);if(!name)return {error:"name_required",status:400};const b=pid?await one(pid):null,m=meta(b?.metadata),exp=Object.prototype.hasOwnProperty.call(p||{},"expiration_date")?dt(p.expiration_date):b?.validity_date||null;if(p?.expiration_date&&!exp)return {error:"invalid_expiration_date",status:400};let active=Object.prototype.hasOwnProperty.call(p||{},"active")?p.active!==false:(b?.is_active!==false),stock=Number(p?.stock_quantity??b?.stock??0),io=b?.is_offer===true,op=b?.offer_price??null,nmeta={...m,auto_expiry_offer_enabled:p?.auto_expiry_offer_enabled===true};if(exp&&days(today(),exp)<0){active=false;stock=0;io=false;op=null;nmeta={...nmeta,deactivation_reason:"expired",deactivated_at:new Date().toISOString(),offer_source:null}}else if(active&&m.deactivation_reason==="expired")nmeta={...nmeta,deactivation_reason:null,deactivated_at:null};const patch:any={name,sku:tx(p?.sku,120)||null,gtin:dg(p?.gtin)||null,price:Number(p?.sale_price_cents||0)/100,stock,is_active:active,validity_date:exp,sales_category:tx(p?.category,120)||null,storefront_category:tx(p?.category,120)||null,category:tx(p?.category,120)||null,subcategory:tx(p?.subcategory,120)||null,packaging:tx(p?.packaging,120)||null,image_url:tx(p?.image_url,1200)||null,description_short:tx(p?.description,1000)||null,is_offer:io,offer_price:op,metadata:nmeta,updated_at:new Date().toISOString()};let r:any;if(pid)r=await db.from("products").update(patch).eq("id",pid).select("*").single();else r=await db.from("products").insert({...patch,source_system:"admin_registration",sync_status:"local"}).select("*").single();if(r.error)throw r.error;if(b)await aud(b,r.data,p,"product_save");await rec();const fr=await one(r.data.id);return {product_id:r.data.id,product:mp(fr)}}
async function saveOffer(p:any){const pid=id(p?.product_id);if(!pid)return {error:"invalid_product",status:400};const x=await one(pid);if(!x)return {error:"product_not_found",status:404};const m=meta(x.metadata),active=p?.active===true,price=Number(x.price||0),sale=Number(p?.sale_price_cents||0)/100,disc=Number(p?.discount_percent||0),dur=tx(p?.duration,20)||"stock_zero";let end:any=null;if(["5","10","15"].includes(dur))end=new Date(Date.now()+Number(dur)*86400000).toISOString();const op=sale>0?sale:(disc>0&&disc<100?Math.round(price*(100-disc))/100:null),nmeta={...m,auto_expiry_offer_enabled:false,offer_source:active?"manual":null,offer_discount_percent:active?disc:null,offer_duration_mode:dur,offer_starts_at:active?new Date().toISOString():null,offer_ends_at:active?end:null};const r=await db.from("products").update({is_offer:active,offer_price:active?op:null,metadata:nmeta,updated_at:new Date().toISOString()}).eq("id",pid).select("*").single();if(r.error)throw r.error;return {product_id:pid,product:mp(r.data),offer:offer(r.data)}}
async function exps(){await rec();const t=today(),h=add(t,90),r=await db.from("products").select("*").eq("is_active",true).not("validity_date","is",null).lte("validity_date",h).order("validity_date").limit(5000);if(r.error)throw r.error;const rows=(r.data||[]).map((p:any)=>{const d=days(t,String(p.validity_date));return {...mp(p),days_left:d,suggested_discount_percent:d<30?40:d<60?20:10}}),all=await db.from("products").select("id,is_active,validity_date,metadata").limit(5000);if(all.error)throw all.error;const ac=(all.data||[]).filter((p:any)=>p.is_active!==false),ex=(all.data||[]).filter((p:any)=>p.is_active===false&&meta(p.metadata).deactivation_reason==="expired"),e=await db.from("products").select("*").eq("is_active",false).limit(5000);if(e.error)throw e.error;return {active_only:true,products:rows,summary:{expired_deactivated:ex.length,under_30:rows.filter((x:any)=>x.days_left<30).length,days_30_59:rows.filter((x:any)=>x.days_left>=30&&x.days_left<60).length,days_60_90:rows.filter((x:any)=>x.days_left>=60&&x.days_left<=90).length,without_expiration:ac.filter((p:any)=>!p.validity_date).length,auto_enabled:ac.filter((p:any)=>meta(p.metadata).auto_expiry_offer_enabled===true).length,total_products:ac.length},expired_deactivated:(e.data||[]).filter((p:any)=>meta(p.metadata).deactivation_reason==="expired").slice(0,30).map(mp)}}
async function expSave(p:any){const pid=id(p?.product_id);if(!pid)return {error:"invalid_product",status:400};const b=await one(pid);if(!b)return {error:"product_not_found",status:404};const exp=p?.expiration_date?dt(p.expiration_date):null;if(p?.expiration_date&&!exp)return {error:"invalid_expiration_date",status:400};let m={...meta(b.metadata),auto_expiry_offer_enabled:p?.auto_expiry_offer_enabled===true},patch:any={validity_date:exp,metadata:m,updated_at:new Date().toISOString()};if(exp&&days(today(),exp)<0)patch={...patch,is_active:false,stock:0,is_offer:false,offer_price:null,metadata:{...m,deactivation_reason:"expired",deactivated_at:new Date().toISOString(),offer_source:null}};else if(meta(b.metadata).deactivation_reason==="expired")patch.metadata={...m,deactivation_reason:null,deactivated_at:null};const r=await db.from("products").update(patch).eq("id",pid).select("*").single();if(r.error)throw r.error;await aud(b,r.data,p,"expiration_save");await rec();return {product:mp(await one(pid))}}
async function auditList(l:number){const r=await db.from("product_lifecycle_audit").select("*").order("created_at",{ascending:false}).limit(l);if(r.error)throw r.error;const ids=[...new Set((r.data||[]).map((x:any)=>x.product_id))],m=new Map();if(ids.length){const p=await db.from("products").select("id,name,sku,gtin").in("id",ids);for(const x of p.data||[])m.set(x.id,x)}return (r.data||[]).map((x:any)=>({...x,product:m.get(x.product_id)||null}))}
async function ean(v:any){const d=dg(v);if(!d)return {error:"invalid_ean",status:400};const r=await db.from("products").select("*").eq("gtin",d).limit(1).maybeSingle();if(r.error)throw r.error;if(!r.data)return {error:"product_not_found",status:404};return {product:mp(r.data)}}
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
  return {product:mp(product),count:r.data,recount};
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
async function glist(){const g=await db.from("vitrine_gondolas").select("*").eq("active",true).order("number"),p=await db.from("products").select("gondola").not("gondola","is",null).limit(5000);if(g.error)throw g.error;if(p.error)throw p.error;const c=new Map();for(const x of p.data||[])c.set(String(x.gondola),(c.get(String(x.gondola))||0)+1);return {gondolas:(g.data||[]).map((x:any)=>({...x,product_count:c.get(String(x.number))||0}))}}
async function gone(v:any){const gid=id(v);if(!gid)return {error:"invalid_gondola",status:400};const g=await db.from("vitrine_gondolas").select("*").eq("id",gid).eq("active",true).maybeSingle();if(g.error)throw g.error;if(!g.data)return {error:"gondola_not_found",status:404};const p=await db.from("products").select("*").eq("gondola",String(g.data.number)).order("name").limit(5000);if(p.error)throw p.error;return {gondola:g.data,products:(p.data||[]).map(mp)}}
async function gcreate(p:any){const n=Math.floor(Number(p?.number));if(!Number.isInteger(n)||n<1||n>9999)return {error:"invalid_gondola",status:400};let g=await db.from("vitrine_gondolas").select("*").eq("number",n).maybeSingle();if(g.error)throw g.error;if(g.data){if(!g.data.active)g=await db.from("vitrine_gondolas").update({active:true,updated_at:new Date().toISOString()}).eq("id",g.data.id).select("*").single();return {gondola:g.data,reused:true}}g=await db.from("vitrine_gondolas").insert({number:n}).select("*").single();if(g.error)throw g.error;return {gondola:g.data,reused:false}}
async function gassign(p:any){const gid=id(p?.gondola_id);if(!gid)return {error:"invalid_gondola",status:400};const g=await db.from("vitrine_gondolas").select("*").eq("id",gid).eq("active",true).maybeSingle();if(g.error)throw g.error;if(!g.data)return {error:"gondola_not_found",status:404};const e:any=await ean(p?.ean);if(e.error)return e;const b=await one(e.product.id),prev=b?.gondola&&/^\d+$/.test(String(b.gondola))?Number(b.gondola):null,r=await db.from("products").update({gondola:String(g.data.number),updated_at:new Date().toISOString()}).eq("id",e.product.id).select("*").single();if(r.error)throw r.error;return {product:mp(r.data),previous_gondola_number:prev}}
async function gshelf(p:any){const gid=id(p?.gondola_id),pid=id(p?.product_id);if(!gid||!pid)return {error:"invalid_request",status:400};const g=await db.from("vitrine_gondolas").select("*").eq("id",gid).maybeSingle();if(g.error)throw g.error;if(!g.data)return {error:"gondola_not_found",status:404};const s=tx(p?.shelf_label,24)||null,r=await db.from("products").update({shelf:s,updated_at:new Date().toISOString()}).eq("id",pid).eq("gondola",String(g.data.number)).select("id").maybeSingle();if(r.error)throw r.error;if(!r.data)return {error:"product_not_in_gondola",status:404};return {product_id:pid,shelf_label:s}}
async function grem(p:any){const gid=id(p?.gondola_id),pid=id(p?.product_id);if(!gid||!pid)return {error:"invalid_request",status:400};const g=await db.from("vitrine_gondolas").select("*").eq("id",gid).maybeSingle();if(g.error)throw g.error;if(!g.data)return {error:"gondola_not_found",status:404};const r=await db.from("products").update({gondola:null,shelf:null,updated_at:new Date().toISOString()}).eq("id",pid).eq("gondola",String(g.data.number));if(r.error)throw r.error;return {product_id:pid,removed:true}}

const HUB_API="https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1";
async function hub(subaction:string,extra:any={},authorization=""){
  const key=await db.rpc("get_bling_hub_key_v2");
  if(key.error||!key.data)return {error:"bling_bridge_not_configured",status:503};
  const res=await fetch(HUB_API,{method:"POST",headers:{"Content-Type":"application/json","x-dona-antonia-bling-hub-key":String(key.data),...(authorization?{"Authorization":authorization}:{})},body:JSON.stringify({action:"vitrine_bling_hub_internal",subaction,...extra}),signal:AbortSignal.timeout(120000)});
  const data=await res.json().catch(()=>({ok:false,error:"invalid_bling_response"}));
  if(!res.ok||data?.ok===false)return {error:String(data?.error||"bling_hub_unavailable"),status:res.status||502,detail:data?.detail||null,data};
  return {data};
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
  const [pr,rr]=await Promise.all([db.from("products").select("id,name,sku,gtin,stock,is_active,gondola,shelf").in("id",ids),db.from("vitrine_stock_reservations").select("order_id,product_id,quantity,status,expires_at").in("product_id",ids)]);
  if(pr.error)throw pr.error;if(rr.error)throw rr.error;
  const pm=new Map((pr.data||[]).map((p:any)=>[p.id,p])),active=(rr.data||[]).filter((r:any)=>r.status==="reserved"&&(!r.expires_at||Date.parse(r.expires_at)>Date.now()));
  for(const oid of orderIds){const lines=demand.get(oid)||new Map(),short:any[]=[];let protectedLines=0;for(const [pid,qty] of lines){const own=active.filter((r:any)=>r.order_id===oid&&r.product_id===pid).reduce((s:number,r:any)=>s+Number(r.quantity||0),0),consumed=(rr.data||[]).filter((r:any)=>r.order_id===oid&&r.product_id===pid&&r.status==="consumed").reduce((s:number,r:any)=>s+Number(r.quantity||0),0);if(own+consumed+0.0001>=qty){protectedLines++;continue}const p=pm.get(pid),other=active.filter((r:any)=>r.order_id!==oid&&r.product_id===pid).reduce((s:number,r:any)=>s+Number(r.quantity||0),0),free=Math.max(0,Number(p?.stock||0)-other),need=Math.max(0,qty-own-consumed),lack=Math.max(0,need-free);if(!p||p.is_active===false||lack>0)short.push({product_id:pid,name:p?.name||"Produto indisponível",sku:p?.sku||"",gtin:p?.gtin||"",required:qty,available:p&&p.is_active!==false?free:0,shortage:p&&p.is_active!==false?lack:need,gondola_number:p?.gondola&&/^\d+$/.test(String(p.gondola))?Number(p.gondola):null,shelf_label:p?.shelf||null})}out.set(oid,{ok:short.length===0&&lines.size>0,shortage_count:short.length,shortages:short.slice(0,8),demand_lines:lines.size,reserved_lines:protectedLines,error:lines.size?"":"empty_order_stock"})}
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

async function resolveDeliveryReturnReview(p:any,auth:any){
  if(!["owner","supervisor"].includes(String(auth?.role||"")))return {error:"supervisor_required",status:403};
  const cid=id(p?.case_id);if(!cid)return {error:"invalid_delivery_return_case",status:400};
  const action=tx(p?.resolution_action,40).toLowerCase();
  const q=await db.rpc("ops_resolve_delivery_return_review_v1",{p_case_id:cid,p_action:action,p_operator_label:tx(p?.operator,80)||"Supervisão"});
  if(q.error){
    const m=String(q.error.message||"");
    if(m.includes("delivery_return_case_not_found"))return {error:"delivery_return_case_not_found",status:404};
    if(m.includes("delivery_return_not_in_review"))return {error:"delivery_return_not_in_review",status:409};
    if(m.includes("invalid_return_review_action"))return {error:"invalid_return_review_action",status:400};
    if(m.includes("return_has_captured_payment"))return {error:"return_has_captured_payment",status:409};
    if(m.includes("stock_restore_failed"))return {error:"stock_restore_failed",status:409};
    throw q.error;
  }
  return {resolution:q.data};
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
    if(next==="confirmed"&&cur==="created"){const r=await db.rpc("reserve_vitrine_order_stock_v1",{p_order_id:oid});if(r.error)throw r.error;if(r.data?.ok!==true)return {error:String(r.data?.error||"insufficient_stock"),status:409,...r.data};patch.confirmed_at=new Date().toISOString()}
    if(next==="cancelled"&&cur!=="cancelled"){const r=await db.rpc("release_vitrine_order_stock_v1",{p_order_id:oid});if(r.error)throw r.error;if(r.data?.ok===false)return {error:String(r.data?.error||"stock_release_failed"),status:409};patch.cancelled_at=new Date().toISOString()}
    if(next==="out_for_delivery"&&cur==="ready"){const ret=await db.from("order_delivery_return_cases").select("id,status").eq("order_id",oid).eq("status","returned_review").limit(1).maybeSingle();if(ret.error)throw ret.error;if(ret.data?.id)return {error:"delivery_return_review_open",status:409,delivery_return_case_id:ret.data.id};const h=await hub("fiscal_dispatch_gate",{source_order_id:oid});if(h.error)return {error:"fiscal_dispatch_gate_unavailable",status:h.status||503,detail:h.detail||null};if(h.data?.allowed!==true)return {error:"fiscal_dispatch_not_authorized",status:409,fiscal_dispatch_gate:h.data}}
    if(next==="delivered"){const ret=await db.from("order_delivery_return_cases").select("id,status").eq("order_id",oid).in("status",["returning","returned_review"]).limit(1).maybeSingle();if(ret.error)throw ret.error;if(ret.data?.id)return {error:"delivery_return_open",status:409,delivery_return_case_id:ret.data.id};const pay=await db.from("order_payment_settlements").select("id,status,source,expected_total_cents,captured_total_cents").eq("order_id",oid).in("status",["captured","synced","needs_review"]).limit(1).maybeSingle();if(pay.error)throw pay.error;if(!pay.data?.id||pay.data.source!=="delivery")return {error:"delivery_payment_required",status:409};const expected=Math.round(Number(o.total||0)*100);if(Number(pay.data.expected_total_cents)!==expected||Number(pay.data.captured_total_cents)!==expected)return {error:"delivery_payment_mismatch",status:409};patch.delivered_at=new Date().toISOString()}patch.status=next;
  }
  const u=await db.from("orders").update(patch).eq("id",oid).select("id,updated_at").single();if(u.error)throw u.error;if(next&&next!==cur)await opsEvent("order.status_changed","Pedido alterado de "+cur+" para "+next+".","order",oid,{from:cur,to:next,source:o.source||null},tx(p?.operator,80)||"Operação", "human","dona_antonia","order-status:"+oid+":"+next+":"+String(u.data.updated_at));if(next&&next!==cur&&["ready","out_for_delivery","delivered","cancelled"].includes(next)){try{await db.rpc("ops_sync_delivery_stop_v1",{p_order_id:oid,p_order_status:next})}catch{}}let print_queued:null|boolean=null;if(next==="confirmed"&&cur==="created")print_queued=await enqueuePickingPrint(oid,o,String(patch.confirmed_at||u.data.updated_at));if(next==="cancelled"&&cur!=="cancelled")await cancelPendingPrints(oid);if(next==="delivered"||next==="cancelled"){try{await hub("fiscal_status",{source_order_id:oid})}catch{}}return {order_id:oid,history_synced:true,print_queued};
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
async function consumeOrder(p:any){const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};const g=await guardOrder(oid);if(g.error)return g;const o=await db.from("orders").select("status,updated_at").eq("id",oid).maybeSingle();if(o.error)throw o.error;if(!o.data)return {error:"order_not_found",status:404};const st=uiStatus(o.data.status);if(!["confirmed","processing"].includes(st))return {error:"order_not_ready_for_separation",status:409,current_status:st};const x=await db.rpc("consume_vitrine_order_stock_v1",{p_order_id:oid});if(x.error)throw x.error;if(x.data?.ok!==true)return {error:String(x.data?.error||"stock_consume_failed"),status:409,...x.data};let queued=false;try{const q=await queueOrder(oid,"first_separation");queued=!q.error}catch{}const blingAuthority=x.data?.status==="bling_authority"||x.data?.local_consume_skipped===true;if(blingAuthority)await opsEvent("order.separation_started","Separação iniciada sob autoridade de estoque Bling; nenhuma baixa local foi executada.","order",oid,{stock_status:"bling_authority",bling_order_queued:queued,legacy_stock_model:false,local_consume_skipped:true},tx(p?.operator,80)||"Operação","human","dona_antonia","order-separation:"+oid+":"+String(o.data.updated_at));else if(!x.data?.already_consumed)await opsEvent("order.separation_started","Separação iniciada e estoque local consumido no fluxo legado.","order",oid,{stock_status:"consumed",bling_order_queued:queued,legacy_stock_model:true},tx(p?.operator,80)||"Operação","human","dona_antonia","order-separation:"+oid+":"+String(o.data.updated_at));return {order_id:oid,stock_status:blingAuthority?"bling_authority":"consumed",already_consumed:Boolean(x.data?.already_consumed),local_consume_skipped:Boolean(x.data?.local_consume_skipped),history_synced:true,bling_order_queued:queued}}
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
  const r=await db.rpc("get_papoai_webhook_capture_status_v2");
  if(r.error)throw r.error;
  return r.data||{};
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
Deno.serve(async(r:Request)=>{if(r.method==="OPTIONS")return new Response(null,{status:204,headers:cors(r)});const u=new URL(r.url),a=tx(u.searchParams.get("action")||(r.method==="GET"?"health":""),80);if(!LOCAL.has(a))return js(r,{ok:false,error:"not_found"},404);try{if(a==="health")return js(r,{ok:true,service:"admin-products-live-v1",mode:"canonical-admin-gateway",version:37,legacy_proxy:false});const auth:any=await adminAuth(r);if(!auth.ok)return js(r,{ok:false,error:auth.error},auth.status||401);if(r.method==="POST"&&auth.role==="viewer"&&WRITE_ACTIONS.has(a))return js(r,{ok:false,error:"forbidden"},403);if(r.method==="GET"&&a==="ops_summary")return js(r,{ok:true,summary:await opsSummary()});if(r.method==="GET"&&a==="ops_shadow_readiness")return js(r,{ok:true,readiness:await opsShadowReadiness()});if(r.method==="GET"&&a==="ops_print_queue")return js(r,{ok:true,queue:await opsPrintQueue(u.searchParams.get("limit"))});if(r.method==="GET"&&a==="ops_papoai_capture_status")return js(r,{ok:true,papoai:await opsPapoAiCaptureStatus()});if(r.method==="GET"&&a==="ops_timeline")return js(r,{ok:true,events:await opsTimeline(u.searchParams.get("limit"))});if(r.method==="GET"&&a==="ops_delivery_runs")return js(r,{ok:true,delivery:await opsDeliveryRuns()});if(r.method==="GET"&&a==="ops_attention")return js(r,{ok:true,attention:await opsAttention(u.searchParams.get("limit"))});if(r.method==="GET"&&a==="products")return js(r,{ok:true,...await products(u)});if(r.method==="GET"&&a==="product_facets")return js(r,{ok:true,...await facets(tx(u.searchParams.get("category"),120))});if(r.method==="GET"&&a==="expirations")return js(r,{ok:true,...await exps()});if(r.method==="GET"&&a==="expiry_alerts"){const x=await exps();return js(r,{ok:true,summary:x.summary,products:x.products.slice(0,12),expired_deactivated:x.expired_deactivated})}if(r.method==="GET"&&a==="product_lifecycle_audit")return js(r,{ok:true,audit:await auditList(Math.floor(nm(u.searchParams.get("limit")||40,1,100)))});if(r.method==="GET"&&a==="inventory_incidents")return js(r,{ok:true,inventory:await inventoryIncidents(u.searchParams.get("limit"))});if(r.method==="GET"&&a==="stock_recount_queue")return js(r,{ok:true,recount:await stockRecountQueue()});if(r.method==="GET"&&a==="ean_lookup"){const x:any=await ean(u.searchParams.get("ean"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="gondolas")return js(r,{ok:true,...await glist()});if(r.method==="GET"&&a==="gondola"){const x:any=await gone(u.searchParams.get("id"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="orders")return js(r,{ok:true,orders:await ordersList()});if(r.method==="GET"&&a==="order"){const x:any=await orderDetailCanonical(u.searchParams.get("id"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="order_stock_shortages")return js(r,{ok:true,...await orderShortages()});if(r.method==="GET"&&a==="closure_orders")return js(r,{ok:true,...await closureOrders()});if(r.method==="GET"&&a==="bling_status"){const h=await hub("readiness");return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,bling:h.data?.readiness??h.data})}if(r.method==="POST"&&a==="bling_status_catalog_probe"){const x:any=await blingStatusCatalogProbe(auth);return x.error?js(r,{ok:false,...x},x.status||502):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="bling_oauth_begin"){const x:any=await blingOauthBegin(auth);return x.error?js(r,{ok:false,...x},x.status||500):js(r,{ok:true,...x})}let p:any={};try{p=await r.json()}catch{}if(r.method==="POST"&&a==="history_sync_retry"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const g:any=await guardOrder(oid);return g.error?js(r,{ok:false,...g},g.status||409):js(r,{ok:true,order_id:oid,history_synced:true,canonical:true})}
  if(r.method==="POST"&&a==="order_component_replace"){const oid=id(p?.order_id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const g:any=await guardOrder(oid);if(g.error)return js(r,{ok:false,...g},g.status||409);return js(r,{ok:false,error:"order_component_edit_requires_unreserved_order",canonical:true},409)}
  if(r.method==="POST"&&a==="ops_print_presented"){const x:any=await opsPrintPresented(p?.id);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="ops_delivery_plan"){const x:any=await opsDeliveryPlan(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="manual_order_create"){const x:any=await createManualWhatsappOrder(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_payment_capture"){const x:any=await captureDeliveryPayment(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="delivery_fail_register"){const x:any=await registerFailedDelivery(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="delivery_return_confirm"){const x:any=await confirmDeliveryReturn(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="delivery_return_resolve"){const x:any=await resolveDeliveryReturnReview(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_update"){const x:any=await updateOrderCanonical(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_consume_stock"){const x:any=await consumeOrder(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="bling_probe_readonly"){const h=await hub("probe_readonly");return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,probe:h.data})}if(r.method==="POST"&&a==="bling_reconcile_catalog_readonly"){const h=await reconcileCatalog();return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="bling_reconcile_customers_readonly"){const h=await hub("reconcile_customers_readonly",{limit:p?.limit??650});return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="bling_preview_order_sync"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const x:any=await previewOrder(oid);return x.error?js(r,{ok:false,error:x.error,detail:x.detail},x.status||502):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="bling_reconcile_order_dependencies_readonly"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);return js(r,{ok:true,...await reconcileDeps(oid)})}if(r.method==="POST"&&a==="bling_create_order_customer"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const x:any=await ensureOrderCustomer(oid);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="bling_create_order_products"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const x:any=await createOrderProducts(oid);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_fiscal_status"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const h=await hub("fiscal_status",{source_order_id:oid});return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="order_fiscal_dispatch_canary_execute"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);if(tx(p?.confirmation,40)!=="EMITIR_NFE")return js(r,{ok:false,error:"fiscal_human_confirmation_required"},409);const h=await hub("fiscal_dispatch_canary_human_execute",{source_order_id:oid,confirmation:"EMITIR_NFE"});return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="order_fiscal_document_pdf"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const h=await hub("fiscal_document_pdf",{source_order_id:oid});return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="order_fiscal_confirm_payment"){const oid=id(p?.id);if(!oid)return js(r,{ok:false,error:"invalid_order"},400);const h=await hub("fiscal_confirm_payment",{source_order_id:oid,payment_method:tx(p?.payment_method,80)});return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="bling_finance_overview"){const auth=r.headers.get("Authorization")||"",h=await hub("finance_overview",{},auth);return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="bling_finance_action"){const auth=r.headers.get("Authorization")||"",h=await hub("finance_action",p||{},auth);return h.error?js(r,{ok:false,error:h.error,detail:h.detail},h.status||502):js(r,{ok:true,...(h.data||{})})}if(r.method==="POST"&&a==="stock_reconciliation_classify"){const z:any=await classifyStockReconciliation(p,auth);return z.error?js(r,{ok:false,...z},z.status||400):js(r,{ok:true,...z})}if(r.method==="POST"&&a==="inventory_incident_create"){const z:any=await createInventoryIncident(p,auth);return z.error?js(r,{ok:false,...z},z.status||400):js(r,{ok:true,...z})}let x:any;if(a==="product_save")x=await saveProduct(p);else if(a==="offer_save")x=await saveOffer(p);else if(a==="expiration_save")x=await expSave(p);else if(a==="balance_confirm")x=await bal(p);else if(a==="gondola_create")x=await gcreate(p);else if(a==="gondola_assign")x=await gassign(p);else if(a==="gondola_shelf_update")x=await gshelf(p);else if(a==="gondola_remove")x=await grem(p);else return js(r,{ok:false,error:"method_not_allowed"},405);return x?.error?js(r,{ok:false,error:x.error},x.status||400):js(r,{ok:true,...x})}catch(e){console.error("canonical_admin_error",a,String(e?.message||e));return js(r,{ok:false,error:"service_error",detail:String(e?.message||e)},500)}});
