import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const READ_ACTIONS=new Set(["status","search","editor"]);
const WRITE_ACTIONS=new Set(["reconcile","link","create","save"]);

const clean=(value:unknown,max=200)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const validUuid=(value:unknown)=>{const v=String(value??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)?v:null};
const digits=(value:unknown,max=14)=>String(value??"").replace(/\D+/g,"").slice(0,max);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
  "Vary":"Origin",
  "Access-Control-Allow-Headers":"content-type,authorization,apikey",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};
  const row=await db.from("admin_users").select("user_id,role,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed"};
  if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized"};
  return {ok:true as const,status:200,user_id:user.data.user.id,role:row.data.role||"viewer"};
}

async function conversationIdentity(conversationId:string){
  const row=await db.from("conversations").select("id,customer_id,wa_contact_e164").eq("id",conversationId).maybeSingle();
  if(row.error)throw row.error;
  if(!row.data)return {ok:false as const,error:"conversation_not_found"};
  const normalized=await db.rpc("canonical_whatsapp_e164_br_v2",{p_phone:row.data.wa_contact_e164});
  if(normalized.error)throw normalized.error;
  return {ok:true as const,conversation:row.data,phone_e164:clean(normalized.data,30)||null};
}

function customerPayload(input:any,{id=null,phone=null}:{id?:string|null,phone?:string|null}={}){
  const address=input?.address&&typeof input.address==="object"?input.address:{};
  return {
    id,
    display_name:clean(input?.display_name??input?.name,180),
    phone:phone||null,
    cpf:digits(input?.cpf??input?.cpf_cnpj,14)||null,
    email:clean(input?.email,180)||null,
    status:input?.status==="inactive"?"inactive":"active",
    birthday_day:input?.birthday_day??null,
    birthday_month:input?.birthday_month??null,
    address:{
      postal_code:digits(address?.postal_code??address?.cep,8)||null,
      street:clean(address?.street??address?.logradouro,180)||null,
      number:clean(address?.number??address?.numero,40)||null,
      district:clean(address?.district??address?.neighborhood??address?.bairro,140)||null,
      complement:clean(address?.complement??address?.complemento,140)||null,
      city:clean(address?.city??address?.cidade,120)||null,
      state:clean(address?.state??address?.uf,2).toUpperCase()||null,
      raw_text:clean(address?.raw_text??address?.reference??address?.referencia,400)||null
    }
  };
}

async function editorData(conversationId:string){
  const identity=await conversationIdentity(conversationId);
  if(!identity.ok)return identity;
  const customerId=validUuid(identity.conversation.customer_id);
  if(!customerId)return {ok:false as const,error:"customer_not_linked"};
  const customer=await db.from("customers").select("id,name,primary_whatsapp_e164,cpf_cnpj,is_active,birthday_day,birthday_month").eq("id",customerId).maybeSingle();
  if(customer.error)throw customer.error;
  if(!customer.data)return {ok:false as const,error:"customer_not_found"};
  const [email,address]=await Promise.all([
    db.from("customer_emails").select("email").eq("customer_id",customerId).order("is_primary",{ascending:false}).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("customer_addresses").select("street,number,complement,neighborhood,city,state,postal_code,reference,is_default,is_active").eq("customer_id",customerId).eq("is_active",true).order("is_default",{ascending:false}).order("updated_at",{ascending:false}).limit(1).maybeSingle()
  ]);
  if(email.error)throw email.error;if(address.error)throw address.error;
  return {ok:true as const,conversation_id:conversationId,conversation_phone_e164:identity.phone_e164,customer:{
    id:customer.data.id,
    display_name:customer.data.name||"",
    phone_e164:customer.data.primary_whatsapp_e164||null,
    cpf:customer.data.cpf_cnpj||null,
    email:email.data?.email||null,
    status:customer.data.is_active===false?"inactive":"active",
    birthday_day:customer.data.birthday_day||null,
    birthday_month:customer.data.birthday_month||null,
    address:address.data?{
      street:address.data.street||null,number:address.data.number||null,complement:address.data.complement||null,
      district:address.data.neighborhood||null,city:address.data.city||null,state:address.data.state||null,
      postal_code:address.data.postal_code||null,raw_text:address.data.reference||null
    }:{}
  }};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(!["GET","POST"].includes(req.method))return json(req,{ok:false,error:"method_not_allowed"},405);
  const auth=await adminAuth(req);
  if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);

  try{
    const url=new URL(req.url);
    const action=clean(url.searchParams.get("action"),40);
    if(!READ_ACTIONS.has(action)&&!WRITE_ACTIONS.has(action))return json(req,{ok:false,error:"action_not_supported"},404);
    if(READ_ACTIONS.has(action)&&req.method!=="GET")return json(req,{ok:false,error:"method_not_allowed"},405);
    if(WRITE_ACTIONS.has(action)&&req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
    if(WRITE_ACTIONS.has(action)&&auth.role==="viewer")return json(req,{ok:false,error:"admin_write_forbidden"},403);

    if(action==="search"){
      const q=clean(url.searchParams.get("q"),180);
      if(q.length<2)return json(req,{ok:true,items:[]});
      const r=await db.rpc("ops2_admin_attendance_customer_search_v1",{p_query:q,p_limit:10});
      if(r.error)throw r.error;
      return json(req,{ok:true,items:r.data||[]});
    }

    if(action==="status"){
      const conversationId=validUuid(url.searchParams.get("conversation_id"));
      if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
      const identity=await conversationIdentity(conversationId);
      if(!identity.ok)return json(req,identity,404);
      if(identity.conversation.customer_id)return json(req,{ok:true,linked:true,match_status:"linked",customer_id:identity.conversation.customer_id,phone_e164:identity.phone_e164});
      if(!identity.phone_e164)return json(req,{ok:true,linked:false,match_status:"invalid",phone_e164:null});
      const resolved=await db.rpc("resolve_customer_by_phone_v1",{p_phone:identity.phone_e164});
      if(resolved.error)throw resolved.error;
      return json(req,{ok:true,linked:false,phone_e164:identity.phone_e164,...(resolved.data||{})});
    }

    if(action==="editor"){
      const conversationId=validUuid(url.searchParams.get("conversation_id"));
      if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
      const data=await editorData(conversationId);
      return json(req,data,data.ok?200:data.error==="customer_not_linked"?409:404);
    }

    const body=await req.json().catch(()=>({}));
    const conversationId=validUuid(body?.conversation_id);
    if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);

    if(action==="reconcile"){
      const r=await db.rpc("ops2_admin_attendance_reconcile_customer_v1",{p_conversation_id:conversationId});
      if(r.error)throw r.error;
      const data=r.data||{ok:false,error:"reconcile_failed"};
      return json(req,data,data.ok===false?400:200);
    }

    if(action==="link"){
      const customerId=validUuid(body?.customer_id);
      if(!customerId)return json(req,{ok:false,error:"invalid_customer_id"},400);
      const r=await db.rpc("ops2_admin_attendance_link_customer_v1",{p_conversation_id:conversationId,p_customer_id:customerId});
      if(r.error)throw r.error;
      const data=r.data||{ok:false,error:"link_failed"};
      const status=data.ok===true?200:data.error==="conversation_already_linked"?409:data.error==="customer_not_found"||data.error==="conversation_not_found"?404:400;
      return json(req,data,status);
    }

    if(action==="create"){
      const identity=await conversationIdentity(conversationId);
      if(!identity.ok)return json(req,identity,404);
      if(identity.conversation.customer_id)return json(req,{ok:false,error:"conversation_already_linked",customer_id:identity.conversation.customer_id},409);
      if(!identity.phone_e164)return json(req,{ok:false,error:"invalid_phone"},400);

      const input=body?.customer&&typeof body.customer==="object"?body.customer:{};
      const payload=customerPayload(input,{id:null,phone:identity.phone_e164});
      if(!payload.display_name)return json(req,{ok:false,error:"name_required"},400);
      const saved=await db.rpc("ops2_admin_customer_save_v2",{p_payload:payload});
      if(saved.error)throw saved.error;
      if(saved.data?.ok!==true){
        const error=String(saved.data?.error||"customer_save_failed");
        return json(req,saved.data||{ok:false,error},["phone_already_in_use","cpf_already_in_use","duplicate_customer_identity"].includes(error)?409:400);
      }
      const customerId=validUuid(saved.data.customer_id);
      if(!customerId)return json(req,{ok:false,error:"customer_save_failed"},500);
      const linked=await db.rpc("ops2_admin_attendance_link_customer_v1",{p_conversation_id:conversationId,p_customer_id:customerId});
      if(linked.error)throw linked.error;
      if(linked.data?.ok!==true)return json(req,{...linked.data,created_customer_id:customerId},linked.data?.error==="conversation_already_linked"?409:400);
      return json(req,{ok:true,created:true,linked:true,customer_id:customerId,phone_e164:identity.phone_e164});
    }

    if(action==="save"){
      const current=await editorData(conversationId);
      if(!current.ok)return json(req,current,current.error==="customer_not_linked"?409:404);
      const customerId=validUuid(current.customer.id);
      if(!customerId)return json(req,{ok:false,error:"customer_not_found"},404);
      const input=body?.customer&&typeof body.customer==="object"?body.customer:{};
      const payload=customerPayload(input,{id:customerId,phone:current.customer.phone_e164});
      if(!payload.display_name)return json(req,{ok:false,error:"name_required"},400);
      const saved=await db.rpc("ops2_admin_customer_save_v2",{p_payload:payload});
      if(saved.error)throw saved.error;
      if(saved.data?.ok!==true){
        const error=String(saved.data?.error||"customer_save_failed");
        return json(req,saved.data||{ok:false,error},["phone_already_in_use","cpf_already_in_use","duplicate_customer_identity"].includes(error)?409:400);
      }
      return json(req,{ok:true,saved:true,customer_id:customerId});
    }

    return json(req,{ok:false,error:"action_not_supported"},404);
  }catch(error){
    console.error("admin-attendance-customer-v1",error);
    return json(req,{ok:false,error:"internal_error"},500);
  }
});
