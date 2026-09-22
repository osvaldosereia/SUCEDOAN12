import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SECRET_KEYS=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}")}catch{return {}}})();
const SERVER_KEY=SECRET_KEYS.default??Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const db=createClient(SUPABASE_URL,SERVER_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);

function cors(req:Request){
  const origin=req.headers.get("origin")??"";
  return {
    "Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
    "Access-Control-Allow-Headers":"content-type",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Vary":"Origin"
  };
}
function json(req:Request,data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
}
const text=(v:unknown,max=500)=>String(v??"").trim().slice(0,max);
const maybe=(v:unknown,max=500)=>{const x=text(v,max);return x||null};
const digits=(v:unknown,max=30)=>String(v??"").replace(/\D+/g,"").slice(0,max);
function uuid(v:unknown){
  const x=text(v,64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)?x:"";
}
function normalizePhone(v:unknown){
  let d=digits(v,20);
  if(!d)return "";
  if((d.length===10||d.length===11)&&!d.startsWith("55"))d="55"+d;
  return d;
}
function day(v:unknown){const n=Number(v);return Number.isInteger(n)&&n>=1&&n<=31?n:null}
function month(v:unknown){const n=Number(v);return Number.isInteger(n)&&n>=1&&n<=12?n:null}

async function bundles(ids:string[]){
  if(!ids.length)return new Map<string,any>();
  const [emailsRes,addrRes]=await Promise.all([
    db.from("customer_emails")
      .select("customer_id,email,is_primary,verification_status,created_at")
      .in("customer_id",ids)
      .order("is_primary",{ascending:false})
      .order("created_at",{ascending:false}),
    db.from("customer_addresses")
      .select("id,customer_id,label,street,number,complement,neighborhood,city,state,postal_code,reference,is_default,is_active,google_maps_url,block,latitude,longitude,updated_at")
      .in("customer_id",ids)
      .eq("is_active",true)
      .order("is_default",{ascending:false})
      .order("updated_at",{ascending:false})
  ]);
  if(emailsRes.error)throw emailsRes.error;
  if(addrRes.error)throw addrRes.error;
  const out=new Map<string,any>();
  for(const id of ids)out.set(id,{emails:[],addresses:[]});
  for(const r of emailsRes.data??[])out.get(r.customer_id)?.emails.push(r);
  for(const r of addrRes.data??[])out.get(r.customer_id)?.addresses.push(r);
  return out;
}

function publicCustomer(c:any,b:any){
  const email=b?.emails?.[0]?.email??"";
  const a=b?.addresses?.[0]??null;
  return {
    id:c.id,
    display_name:c.name??"",
    phone:c.primary_whatsapp_e164??"",
    cpf:c.cpf_cnpj??"",
    email,
    status:c.is_active?"active":"inactive",
    is_active:Boolean(c.is_active),
    birthday_day:c.birthday_day??null,
    birthday_month:c.birthday_month??null,
    orders_count:Number(c.order_count??0),
    lifetime_value:Number(c.lifetime_value??0),
    created_at:c.created_at,
    updated_at:c.updated_at,
    address:a?{
      id:a.id,
      label:a.label,
      street:a.street,
      number:a.number,
      complement:a.complement,
      district:a.neighborhood,
      city:a.city,
      state:a.state,
      postal_code:a.postal_code,
      raw_text:a.reference,
      google_maps_url:a.google_maps_url,
      block:a.block,
      latitude:a.latitude,
      longitude:a.longitude
    }:null
  };
}

async function listCustomers(url:URL){
  const q=text(url.searchParams.get("q"),80);
  const limit=Math.max(1,Math.min(150,Number(url.searchParams.get("limit")??120)||120));
  let rows:any[]=[];

  if(!q){
    const {data,error}=await db.from("customers")
      .select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,birthday_day,birthday_month,order_count,lifetime_value,created_at,updated_at")
      .order("updated_at",{ascending:false})
      .limit(limit);
    if(error)throw error;
    rows=data??[];
  }else{
    const qText=q.replace(/[%_,()]/g," ").trim();
    const qDigits=digits(q,20);
    const queries=[
      db.from("customers")
        .select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,birthday_day,birthday_month,order_count,lifetime_value,created_at,updated_at")
        .ilike("name",`%${qText}%`)
        .limit(limit)
    ];
    if(qDigits){
      queries.push(
        db.from("customers")
          .select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,birthday_day,birthday_month,order_count,lifetime_value,created_at,updated_at")
          .ilike("primary_whatsapp_e164",`%${qDigits}%`)
          .limit(limit),
        db.from("customers")
          .select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,birthday_day,birthday_month,order_count,lifetime_value,created_at,updated_at")
          .ilike("cpf_cnpj",`%${qDigits}%`)
          .limit(limit)
      );
    }
    const results=await Promise.all(queries);
    for(const r of results)if(r.error)throw r.error;
    const map=new Map<string,any>();
    for(const r of results)for(const row of r.data??[])map.set(row.id,row);
    rows=[...map.values()].slice(0,limit);
  }

  const b=await bundles(rows.map(r=>r.id));
  return rows.map(r=>publicCustomer(r,b.get(r.id)));
}

async function getCustomer(id:string){
  const {data,error}=await db.from("customers")
    .select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,birthday_day,birthday_month,order_count,lifetime_value,created_at,updated_at")
    .eq("id",id)
    .maybeSingle();
  if(error)throw error;
  if(!data)return null;
  const b=await bundles([id]);
  return publicCustomer(data,b.get(id));
}

async function saveCustomer(payload:any){
  const id=uuid(payload?.id);
  const name=text(payload?.display_name,180);
  if(!name)return {error:"name_required",status:400};
  const phone=normalizePhone(payload?.phone);
  const cpf=digits(payload?.cpf,14);
  const email=text(payload?.email,180).toLowerCase();
  const isActive=payload?.status!=="inactive"&&payload?.status!=="blocked";
  const birthdayDay=day(payload?.birthday_day);
  const birthdayMonth=month(payload?.birthday_month);

  if(phone){
    const {data,error}=await db.from("customers").select("id").eq("primary_whatsapp_e164",phone).maybeSingle();
    if(error)throw error;
    if(data&&data.id!==id)return {error:"phone_already_in_use",status:409};
  }
  if(cpf){
    const {data,error}=await db.from("customers").select("id").eq("cpf_cnpj",cpf).maybeSingle();
    if(error)throw error;
    if(data&&data.id!==id)return {error:"cpf_already_in_use",status:409};
  }

  let customerId=id;
  const row:any={
    name,
    cpf_cnpj:cpf||null,
    primary_whatsapp_e164:phone||null,
    is_active:isActive,
    birthday_day:birthdayDay,
    birthday_month:birthdayMonth,
    updated_at:new Date().toISOString()
  };

  if(id){
    const {data,error}=await db.from("customers").update(row).eq("id",id).select("id").maybeSingle();
    if(error)throw error;
    if(!data)return {error:"customer_not_found",status:404};
  }else{
    const {data,error}=await db.from("customers").insert(row).select("id").single();
    if(error)throw error;
    customerId=data.id;
  }

  const {data:phoneRows,error:phoneFindErr}=await db.from("customer_phones")
    .select("id,phone_e164")
    .eq("customer_id",customerId)
    .eq("is_primary",true)
    .limit(1);
  if(phoneFindErr)throw phoneFindErr;
  const currentPhone=phoneRows?.[0]??null;
  if(phone){
    const {data:existingPhone,error:existingPhoneErr}=await db.from("customer_phones")
      .select("id,customer_id")
      .eq("phone_e164",phone)
      .maybeSingle();
    if(existingPhoneErr)throw existingPhoneErr;
    if(existingPhone&&existingPhone.customer_id!==customerId)return {error:"phone_already_in_use",status:409};
    await db.from("customer_phones").update({is_primary:false}).eq("customer_id",customerId);
    if(existingPhone){
      const {error}=await db.from("customer_phones").update({is_primary:true,source:"vitrine_admin"}).eq("id",existingPhone.id);
      if(error)throw error;
    }else{
      const {error}=await db.from("customer_phones").insert({customer_id:customerId,phone_e164:phone,source:"vitrine_admin",is_primary:true});
      if(error)throw error;
    }
  }else if(currentPhone){
    const {error}=await db.from("customer_phones").update({is_primary:false}).eq("customer_id",customerId);
    if(error)throw error;
  }

  const {data:emailRows,error:emailFindErr}=await db.from("customer_emails")
    .select("id")
    .eq("customer_id",customerId)
    .order("is_primary",{ascending:false})
    .order("created_at",{ascending:false})
    .limit(1);
  if(emailFindErr)throw emailFindErr;
  const emailId=emailRows?.[0]?.id??null;
  if(email){
    const emailRow:any={email,email_normalized:email,is_primary:true,source:"vitrine_admin",updated_at:new Date().toISOString()};
    if(emailId){
      const {error}=await db.from("customer_emails").update(emailRow).eq("id",emailId);
      if(error)throw error;
    }else{
      const {error}=await db.from("customer_emails").insert({customer_id:customerId,...emailRow});
      if(error)throw error;
    }
  }else if(emailId){
    const {error}=await db.from("customer_emails").update({is_primary:false,updated_at:new Date().toISOString()}).eq("id",emailId);
    if(error)throw error;
  }

  const a=payload?.address??{};
  const hasAddress=[a.street,a.number,a.district,a.city,a.postal_code,a.raw_text].some(Boolean);
  const {data:addrRows,error:addrFindErr}=await db.from("customer_addresses")
    .select("id")
    .eq("customer_id",customerId)
    .eq("is_default",true)
    .eq("is_active",true)
    .order("updated_at",{ascending:false})
    .limit(1);
  if(addrFindErr)throw addrFindErr;
  const addrId=addrRows?.[0]?.id??null;
  if(hasAddress){
    const addressRow:any={
      customer_id:customerId,
      label:"Entrega",
      street:maybe(a.street,180),
      number:maybe(a.number,40),
      complement:maybe(a.complement,140),
      neighborhood:maybe(a.district,140),
      city:maybe(a.city,120)??"Cuiabá",
      state:maybe(a.state,2)??"MT",
      postal_code:maybe(a.postal_code,20),
      reference:maybe(a.raw_text,400),
      is_default:true,
      is_active:true,
      updated_at:new Date().toISOString()
    };
    if(addrId){
      const {error}=await db.from("customer_addresses").update(addressRow).eq("id",addrId);
      if(error)throw error;
    }else{
      const {error}=await db.from("customer_addresses").insert(addressRow);
      if(error)throw error;
    }
  }

  return {customer_id:customerId,customer:await getCustomer(customerId)};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  try{
    const url=new URL(req.url);
    const action=text(url.searchParams.get("action")??"health",40);
    if(req.method==="GET"&&action==="health")return json(req,{ok:true,service:"vitrine-customers-v1"});
    if(req.method==="GET"&&action==="customers")return json(req,{ok:true,customers:await listCustomers(url)});
    if(req.method==="GET"&&action==="customer"){
      const id=uuid(url.searchParams.get("id"));
      if(!id)return json(req,{ok:false,error:"invalid_customer"},400);
      const customer=await getCustomer(id);
      if(!customer)return json(req,{ok:false,error:"customer_not_found"},404);
      return json(req,{ok:true,customer});
    }
    if(req.method==="POST"&&action==="customer_save"){
      const payload=await req.json().catch(()=>({}));
      const result=await saveCustomer(payload);
      if(result.error)return json(req,{ok:false,error:result.error},result.status);
      return json(req,{ok:true,...result});
    }
    return json(req,{ok:false,error:"not_found"},404);
  }catch(error){
    console.error("vitrine-customers-v1",error);
    const msg=String((error as any)?.message??"");
    const status=msg.includes("duplicate key")?409:500;
    return json(req,{ok:false,error:status===409?"duplicate_value":"service_unavailable"},status);
  }
});