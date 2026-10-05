import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"POST,OPTIONS"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(value:unknown,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(value:unknown)=>{const text=clean(value,64);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)?text:""};
const integer=(value:unknown,min=1,max=500)=>{const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:null};
const money=(value:unknown)=>{if(value===null||value===undefined||value==="")return null;const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=9999999?Math.round(n*100)/100:null};
const list=(value:unknown,max=120)=>Array.isArray(value)?value.slice(0,max):null;

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};
  const row=await db.from("admin_users").select("user_id,role,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed"};
  if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized"};
  if(String(row.data.role||"viewer")==="viewer")return {ok:false as const,status:403,error:"forbidden"};
  return {ok:true as const,status:200,user_id:user.data.user.id,role:row.data.role||"viewer"};
}

const DOMAIN_ERRORS=[
  "basket_not_found","basket_kit_template_not_found","lot_not_found","guided_reserved_lot_required",
  "basket_positions_invalid","position_product_invalid","position_product_unavailable","position_family_invalid","position_product_not_in_family",
  "position_label_invalid","position_quantity_invalid","position_quantity_out_of_bounds","duplicate_product_confirmation_required",
  "invalid_lot_quantity","empty_lot_composition","invalid_lot_product","invalid_kit_template_item","invalid_lot_component_quantity",
  "fixed_position_quantity_changed","required_position_missing","insufficient_loose_stock","invalid_sale_price","invalid_public_name",
  "invalid_linked_lot","linked_price_exceeds_total","kit_short_code_in_use","invalid_kit_short_code","reserved_lot_not_editable",
  "reserved_lot_not_mountable","lot_sale_must_be_disabled","lot_has_order_history","lot_is_dependency","lot_already_changed",
  "lot_not_editable","kit_lot_required","lot_not_cancellable","lot_reservation_mismatch","linked_lot_unavailable"
];
function rpcError(error:any){
  const message=clean(error?.message||error,1000);
  const code=DOMAIN_ERRORS.find(x=>message.includes(x))||"guided_basket_operation_failed";
  if(code.endsWith("_not_found")||code==="lot_not_found"||code==="basket_not_found")return {error:code,status:404,message};
  if(["insufficient_loose_stock","duplicate_product_confirmation_required","lot_sale_must_be_disabled","lot_has_order_history","lot_is_dependency","lot_already_changed","lot_not_editable","reserved_lot_not_editable","reserved_lot_not_mountable","lot_not_cancellable","lot_reservation_mismatch","linked_lot_unavailable","guided_reserved_lot_required","kit_short_code_in_use"].includes(code))return {error:code,status:409,message};
  if(code==="guided_basket_operation_failed")return {error:code,status:500,message};
  return {error:code,status:400,message};
}
const operator=(body:any)=>clean(body?.operator,80)||"Operação";

async function modelEditor(body:any){
  const basketId=uuid(body?.basket_id);if(!basketId)return {error:"invalid_basket",status:400};
  const q=await db.rpc("basket_commercial_model_editor_v1",{p_basket_id:basketId});if(q.error)return rpcError(q.error);
  return {model:q.data};
}
async function modelSave(body:any){
  const basketId=uuid(body?.basket_id),positions=list(body?.positions);if(!basketId)return {error:"invalid_basket",status:400};if(!positions||!positions.length)return {error:"basket_positions_invalid",status:400};
  const q=await db.rpc("save_basket_commercial_model_composition_v1",{p_basket_id:basketId,p_positions:positions,p_operator:operator(body)});if(q.error)return rpcError(q.error);
  return {model:q.data};
}
async function lotPreview(body:any){
  const basketId=uuid(body?.basket_id),quantity=integer(body?.quantity),items=list(body?.items);if(!basketId)return {error:"invalid_basket",status:400};if(!quantity)return {error:"invalid_lot_quantity",status:400};if(!items||!items.length)return {error:"empty_lot_composition",status:400};
  const q=await db.rpc("preview_basket_commercial_lot_v1",{p_basket_id:basketId,p_quantity:quantity,p_items:items});if(q.error)return rpcError(q.error);
  return {preview:q.data};
}
async function lotReserve(body:any){
  const basketId=uuid(body?.basket_id),quantity=integer(body?.quantity),items=list(body?.items),linked=body?.linked_lot_id?uuid(body.linked_lot_id):null,price=money(body?.sale_price);
  if(!basketId)return {error:"invalid_basket",status:400};if(!quantity)return {error:"invalid_lot_quantity",status:400};if(!items||!items.length)return {error:"empty_lot_composition",status:400};if(body?.linked_lot_id&&!linked)return {error:"invalid_linked_lot",status:400};if(body?.sale_price!==null&&body?.sale_price!==undefined&&price===null)return {error:"invalid_sale_price",status:400};
  const q=await db.rpc("create_basket_commercial_lot_reserved_v1",{p_basket_id:basketId,p_quantity:quantity,p_items:items,p_public_name:clean(body?.public_name,120)||null,p_sale_price:price,p_operator:operator(body),p_notes:clean(body?.notes,800)||null,p_short_code:clean(body?.short_code,3).toUpperCase()||null,p_linked_lot_id:linked});if(q.error)return rpcError(q.error);
  return {lot:q.data};
}
async function lotUpdate(body:any){
  const lotId=uuid(body?.lot_id),quantity=integer(body?.quantity),items=list(body?.items),linked=body?.linked_lot_id?uuid(body.linked_lot_id):null,price=money(body?.sale_price);
  if(!lotId)return {error:"invalid_lot",status:400};if(!quantity)return {error:"invalid_lot_quantity",status:400};if(!items||!items.length)return {error:"empty_lot_composition",status:400};if(body?.linked_lot_id&&!linked)return {error:"invalid_linked_lot",status:400};if(body?.sale_price!==null&&body?.sale_price!==undefined&&price===null)return {error:"invalid_sale_price",status:400};
  const q=await db.rpc("update_basket_reserved_lot_v1",{p_lot_id:lotId,p_quantity:quantity,p_items:items,p_public_name:clean(body?.public_name,120)||null,p_sale_price:price,p_operator:operator(body),p_notes:clean(body?.notes,800)||null,p_linked_lot_id:linked});if(q.error)return rpcError(q.error);
  return {lot:q.data};
}
async function lotMount(body:any){
  const lotId=uuid(body?.lot_id);if(!lotId)return {error:"invalid_lot",status:400};
  const q=await db.rpc("mark_basket_reserved_lot_mounted_v1",{p_lot_id:lotId,p_operator:operator(body)});if(q.error)return rpcError(q.error);
  return {lot:q.data};
}
async function lotCancel(body:any){
  const lotId=uuid(body?.lot_id);if(!lotId)return {error:"invalid_lot",status:400};
  const q=await db.rpc("cancel_basket_reserved_lot_v1",{p_lot_id:lotId,p_operator:operator(body),p_reason:clean(body?.reason,300)||null});if(q.error)return rpcError(q.error);
  return {lot:q.data};
}
async function lotReopen(body:any){
  const lotId=uuid(body?.lot_id);if(!lotId)return {error:"invalid_lot",status:400};
  const q=await db.rpc("reopen_basket_kit_lot_for_edit_v1",{p_lot_id:lotId,p_operator:operator(body)});if(q.error)return rpcError(q.error);
  return {lot:q.data};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!U||!K)return json(req,{ok:false,error:"server_config"},500);
  try{
    const auth=await adminAuth(req);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
    let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:"invalid_json"},400)}
    const action=clean(body?.action,80);
    let result:any;
    if(action==="model_editor")result=await modelEditor(body);
    else if(action==="model_save")result=await modelSave(body);
    else if(action==="lot_preview")result=await lotPreview(body);
    else if(action==="lot_reserve")result=await lotReserve(body);
    else if(action==="lot_update")result=await lotUpdate(body);
    else if(action==="lot_mount")result=await lotMount(body);
    else if(action==="lot_cancel")result=await lotCancel(body);
    else if(action==="lot_reopen")result=await lotReopen(body);
    else return json(req,{ok:false,error:"unknown_action"},404);
    if(result?.error)return json(req,{ok:false,...result},result.status||400);
    return json(req,{ok:true,...result});
  }catch(error){console.error("admin-basket-guided-v1",error);return json(req,{ok:false,error:"internal_error"},500)}
});
