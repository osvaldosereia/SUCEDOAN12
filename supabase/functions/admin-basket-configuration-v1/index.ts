import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const A=Deno.env.get("SUPABASE_ANON_KEY")||"";
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br","http://localhost:3000","http://127.0.0.1:3000"]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,max=120)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const dbFor=(req:Request)=>createClient(U,A,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:req.headers.get("Authorization")||""}}});
const RPCS:Record<string,string>={
  list:"admin_basket_configuration_v1",
  types_save:"admin_basket_configuration_types_save_v1",
  quantities_save:"admin_basket_configuration_quantities_save_v1",
  product_type_save:"admin_basket_configuration_product_type_save_v1"
};
function rpcError(error:any){
  const detail=clean(error?.message||error,300);
  if(detail.includes("admin_not_authorized"))return {error:"admin_not_authorized",status:403,message:"Usuário sem permissão para editar Cestas."};
  if(detail.includes("not_found"))return {error:"record_not_found",status:404,message:"O cadastro selecionado não existe mais."};
  if(detail.includes("duplicate"))return {error:"duplicate_value",status:409,message:"Já existe um cadastro com esse nome ou produto."};
  if(detail.includes("invalid"))return {error:"invalid_data",status:400,message:"Revise os dados informados."};
  return {error:"basket_configuration_failed",status:500,message:"Não foi possível salvar a configuração das cestas."};
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(!["GET","POST"].includes(req.method))return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!U||!A)return json(req,{ok:false,error:"server_config"},500);
  const authorization=req.headers.get("Authorization")||"";
  if(!/^Bearer\s+\S+/i.test(authorization))return json(req,{ok:false,error:"admin_auth_required"},401);
  let body:any={};
  if(req.method==="POST"){try{body=await req.json()}catch{return json(req,{ok:false,error:"invalid_json"},400)}}
  const input:any={...Object.fromEntries(new URL(req.url).searchParams.entries()),...body};
  const action=clean(input.action,40),db=dbFor(req);
  if(action==="products"){
    const query=clean(input.q,80)||null,limit=Math.min(40,Math.max(1,Number(input.limit)||24));
    const result=await db.rpc("admin_basket_mold_products_v1",{p_query:query,p_limit:limit});
    if(result.error)return json(req,{ok:false,...rpcError(result.error)},Number(rpcError(result.error).status));
    return json(req,{ok:true,products:result.data?.products||[]});
  }
  const rpc=RPCS[action];
  if(!rpc)return json(req,{ok:false,error:"action_invalid"},400);
  const args=action==="types_save"?{p_types:input.types}
    :action==="quantities_save"?{p_quantities:input.quantities}
    :action==="product_type_save"?{p_product_type:input.product_type}:{};
  const result=await db.rpc(rpc,args);
  if(result.error){const mapped=rpcError(result.error);return json(req,{ok:false,...mapped},Number(mapped.status||500))}
  return json(req,{ok:true,...(action==="list"?result.data:{configuration:result.data})});
});
