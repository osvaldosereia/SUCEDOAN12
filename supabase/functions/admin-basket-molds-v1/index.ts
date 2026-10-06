import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const A=Deno.env.get("SUPABASE_ANON_KEY")||"";
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br","http://localhost:3000","http://127.0.0.1:3000"]);
const MUTATIONS=new Set(["save"]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(value:unknown,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(value:unknown)=>{const s=clean(value,64);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const finite=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)&&Math.abs(n)<=9999999?Math.round(n*100)/100:null};
const integer=(value:unknown,min:number,max:number)=>{const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:null};

function dbFor(req:Request){
  const authorization=req.headers.get("Authorization")||"";
  return createClient(U,A,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}});
}

function rpcError(error:any){
  const detail=clean(error?.message||error,1000);
  const known=["admin_not_authorized","basket_mold_name_invalid","basket_mold_basket_not_found","basket_mold_public_composition_count_invalid","basket_mold_positions_required","basket_mold_position_label_required","basket_mold_position_quantity_invalid","basket_mold_position_options_required","basket_mold_product_invalid","basket_mold_product_not_found","basket_mold_duplicate_option","basket_category_invalid"];
  const code=known.find(x=>detail.includes(x))||"basket_mold_operation_failed";
  if(code==="admin_not_authorized")return {error:code,status:403,message:"Usuário sem permissão para Cestas Molde."};
  if(code==="basket_mold_basket_not_found")return {error:code,status:404,message:"Cesta não encontrada."};
  if(code==="basket_mold_duplicate_option")return {error:code,status:409,message:"O mesmo produto não pode aparecer duas vezes na mesma posição."};
  if(code==="basket_mold_operation_failed")return {error:code,status:500,message:"Não foi possível concluir a operação de Cestas Molde."};
  return {error:code,status:400,message:"Revise os dados do molde antes de salvar."};
}

async function list(db:any){const q=await db.rpc("admin_basket_mold_list_v1");if(q.error)return rpcError(q.error);return q.data||{baskets:[]}}
async function editor(db:any,input:any){const id=uuid(input?.basket_id||input?.id);if(!id)return {error:"basket_mold_basket_not_found",status:400,message:"Cesta não encontrada."};const q=await db.rpc("admin_basket_mold_editor_v1",{p_basket_id:id});if(q.error)return rpcError(q.error);return {editor:q.data}}
async function products(db:any,input:any){const limit=integer(input?.limit??24,1,40)||24;const q=await db.rpc("admin_basket_mold_products_v1",{p_query:clean(input?.q,80)||null,p_limit:limit});if(q.error)return rpcError(q.error);return q.data||{products:[]}}
async function save(db:any,input:any){
  const id=uuid(input?.basket_id),categoryId=uuid(input?.category_id),name=clean(input?.name,180),hidden=finite(input?.hidden_adjustment),count=integer(input?.public_composition_count,1,4),positions=Array.isArray(input?.positions)?input.positions.slice(0,80):null;
  if(!id)return {error:"basket_mold_basket_not_found",status:400,message:"Cesta não encontrada."};
  if(!categoryId)return {error:"basket_category_invalid",status:400,message:"Escolha uma categoria da vitrine."};
  if(!name)return {error:"basket_mold_name_invalid",status:400,message:"Informe o nome da cesta."};
  if(hidden===null)return {error:"basket_mold_hidden_adjustment_invalid",status:400,message:"Informe um valor oculto válido."};
  if(!count)return {error:"basket_mold_public_composition_count_invalid",status:400,message:"Escolha entre 1 e 4 composições públicas."};
  if(!positions?.length)return {error:"basket_mold_positions_required",status:400,message:"Adicione pelo menos uma posição ao molde."};
  const q=await db.rpc("admin_save_basket_mold_with_category_v1",{p_basket_id:id,p_name:name,p_hidden_adjustment:hidden,p_public_composition_count:count,p_positions:positions,p_operator:clean(input?.operator,80)||"Operação",p_category_id:categoryId});
  if(q.error)return rpcError(q.error);return {editor:q.data};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(!["GET","POST"].includes(req.method))return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!U||!A)return json(req,{ok:false,error:"server_config"},500);
  const authorization=req.headers.get("Authorization")||"";if(!/^Bearer\s+\S+/i.test(authorization))return json(req,{ok:false,error:"admin_auth_required"},401);
  try{
    const url=new URL(req.url);let body:any={};if(req.method==="POST"){try{body=await req.json()}catch{return json(req,{ok:false,error:"invalid_json"},400)}}
    const input:any={...Object.fromEntries(url.searchParams.entries()),...body},action=clean(input?.action,40),db=dbFor(req);
    let result:any;
    if(action==="list")result=await list(db);
    else if(action==="editor")result=await editor(db,input);
    else if(action==="products")result=await products(db,input);
    else if(action==="save")result=await save(db,input);
    else return json(req,{ok:false,error:"action_invalid"},400);
    if(result?.error)return json(req,{ok:false,...result},Number(result.status||400));
    return json(req,{ok:true,...result});
  }catch(error){console.error("admin-basket-molds-v1",error);return json(req,{ok:false,error:"internal_error",message:"Falha interna em Cestas Molde."},500)}
});
