import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(origin:string|null)=>({
  ...(origin&&ALLOWED_ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Headers":"apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
});
const json=(body:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,max=160)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");
const codeFor=(name:string)=>{
  const base=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70);
  return base?`GONDOLA-${base}`:"";
};

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({ok:false,error:"origin_not_allowed"},403,null);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405,origin);

  const url=Deno.env.get("SUPABASE_URL"),serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceRole)return json({ok:false,error:"server_config"},500,origin);
  const sb=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400,origin)}
  const action=clean(body?.action||"health",60).toLowerCase();
  const respond=(payload:unknown,status=200)=>json(payload,status,origin);

  const getGondola=async(id:unknown,requireActive=false)=>{
    const gondolaId=clean(id,80);
    if(!gondolaId)return {data:null,error:"gondola_required"};
    let query=sb.from("warehouse_locations").select("id,code,gondola_code,active,created_at,updated_at,metadata").eq("id",gondolaId).contains("metadata",{kind:"admin_gondola"});
    if(requireActive)query=query.eq("active",true);
    const result=await query.maybeSingle();
    if(result.error)return {data:null,error:result.error.message};
    if(!result.data)return {data:null,error:requireActive?"gondola_inactive_or_not_found":"gondola_not_found"};
    return {data:result.data,error:null};
  };

  if(action==="health")return respond({ok:true,version:1});

  if(action==="list_gondolas"){
    const {data,error}=await sb.from("warehouse_locations")
      .select("id,code,gondola_code,active,created_at,updated_at")
      .contains("metadata",{kind:"admin_gondola"})
      .order("gondola_code",{ascending:true});
    if(error)return respond({ok:false,error:"gondolas_failed",detail:error.message},400);
    return respond({ok:true,gondolas:data||[]});
  }

  if(action==="create_gondola"){
    const name=clean(body?.name,100),code=codeFor(name);
    if(!name||!code)return respond({ok:false,error:"gondola_name_required"},400);
    const {data,error}=await sb.from("warehouse_locations").insert({
      code,gondola_code:name,shelf_code:"GERAL",active:true,metadata:{kind:"admin_gondola"},updated_at:new Date().toISOString()
    }).select("id,code,gondola_code,active,created_at,updated_at").single();
    if(error){
      if(error.code==="23505")return respond({ok:false,error:"gondola_exists"},409);
      return respond({ok:false,error:"gondola_create_failed",detail:error.message},400);
    }
    return respond({ok:true,gondola:data});
  }

  if(action==="rename_gondola"){
    const id=clean(body?.id,80),name=clean(body?.name,100),code=codeFor(name);
    if(!id||!name||!code)return respond({ok:false,error:"invalid_gondola"},400);
    const current=await getGondola(id,false);
    if(!current.data)return respond({ok:false,error:current.error},404);
    const oldName=current.data.gondola_code;
    const {data,error}=await sb.from("warehouse_locations").update({code,gondola_code:name,updated_at:new Date().toISOString()}).eq("id",id).select("id,code,gondola_code,active,created_at,updated_at").single();
    if(error){
      if(error.code==="23505")return respond({ok:false,error:"gondola_exists"},409);
      return respond({ok:false,error:"gondola_rename_failed",detail:error.message},400);
    }
    if(oldName!==name){
      const productUpdate=await sb.from("products").update({gondola:name,shelf:null,updated_at:new Date().toISOString()}).eq("gondola",oldName);
      if(productUpdate.error){
        await sb.from("warehouse_locations").update({code:current.data.code,gondola_code:oldName,updated_at:new Date().toISOString()}).eq("id",id);
        return respond({ok:false,error:"gondola_product_sync_failed",detail:productUpdate.error.message},400);
      }
    }
    return respond({ok:true,gondola:data});
  }

  if(action==="set_gondola_active"){
    const id=clean(body?.id,80),active=body?.active===true;
    if(!id)return respond({ok:false,error:"gondola_required"},400);
    const {data,error}=await sb.from("warehouse_locations").update({active,updated_at:new Date().toISOString()}).eq("id",id).contains("metadata",{kind:"admin_gondola"}).select("id,code,gondola_code,active,created_at,updated_at").maybeSingle();
    if(error)return respond({ok:false,error:"gondola_status_failed",detail:error.message},400);
    if(!data)return respond({ok:false,error:"gondola_not_found"},404);
    return respond({ok:true,gondola:data});
  }

  if(action==="get_gondola"){
    const found=await getGondola(body?.id,false);
    if(!found.data)return respond({ok:false,error:found.error},404);
    const {data:products,error}=await sb.from("products").select("id,name,gtin,image_url,gondola").eq("gondola",found.data.gondola_code).order("name",{ascending:true}).range(0,4999);
    if(error)return respond({ok:false,error:"gondola_products_failed",detail:error.message},400);
    return respond({ok:true,gondola:found.data,products:products||[]});
  }

  if(action==="scan_ean"){
    const ean=digits(body?.ean);
    if(!ean)return respond({ok:false,error:"invalid_ean"},400);
    const found=await getGondola(body?.gondola_id,false);
    if(!found.data)return respond({ok:false,error:found.error},404);
    if(found.data.active!==true)return respond({ok:false,error:"gondola_inactive"},409);
    const {data:product,error}=await sb.from("products").select("id,name,gtin,image_url,gondola").eq("gtin",ean).maybeSingle();
    if(error)return respond({ok:false,error:"product_lookup_failed",detail:error.message},400);
    if(!product)return respond({ok:false,error:"product_not_found"},404);
    const previous=clean(product.gondola,100)||null;
    const status=previous===found.data.gondola_code?"already":previous?"moved":"assigned";
    if(status!=="already"){
      const saved=await sb.from("products").update({gondola:found.data.gondola_code,shelf:null,updated_at:new Date().toISOString()}).eq("id",product.id);
      if(saved.error)return respond({ok:false,error:"product_gondola_save_failed",detail:saved.error.message},400);
    }
    return respond({ok:true,status,previous_gondola:previous,gondola:found.data,product:{...product,gondola:found.data.gondola_code}});
  }

  if(action==="remove_product"){
    const productId=clean(body?.product_id,80);
    if(!productId)return respond({ok:false,error:"product_required"},400);
    const {data,error}=await sb.from("products").update({gondola:null,shelf:null,updated_at:new Date().toISOString()}).eq("id",productId).select("id,name,gtin,gondola").maybeSingle();
    if(error)return respond({ok:false,error:"product_gondola_remove_failed",detail:error.message},400);
    if(!data)return respond({ok:false,error:"product_not_found"},404);
    return respond({ok:true,product:data});
  }

  if(action==="set_product_gondola"){
    const productId=clean(body?.product_id,80),gondolaId=clean(body?.gondola_id,80);
    if(!productId)return respond({ok:false,error:"product_required"},400);
    let gondolaName:string|null=null;
    if(gondolaId){
      const found=await getGondola(gondolaId,true);
      if(!found.data)return respond({ok:false,error:found.error},404);
      gondolaName=found.data.gondola_code;
    }
    const {data,error}=await sb.from("products").update({gondola:gondolaName,shelf:null,updated_at:new Date().toISOString()}).eq("id",productId).select("id,name,gtin,gondola").maybeSingle();
    if(error)return respond({ok:false,error:"product_gondola_save_failed",detail:error.message},400);
    if(!data)return respond({ok:false,error:"product_not_found"},404);
    return respond({ok:true,product:data});
  }

  return respond({ok:false,error:"unknown_action"},404);
});
