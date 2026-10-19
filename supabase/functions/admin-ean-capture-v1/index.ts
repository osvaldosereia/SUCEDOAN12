import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const base=Deno.env.get("SUPABASE_URL")||"";
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(r:Request)=>{
  const o=r.headers.get("origin")||"";
  return {
    "Access-Control-Allow-Origin":origins.has(o)?o:"https://donaantonia.com.br",
    "Access-Control-Allow-Headers":"authorization,apikey,content-type",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Vary":"Origin"
  };
};
const reply=(r:Request,v:unknown,status=200)=>new Response(JSON.stringify(v),{
  status,headers:{...cors(r),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const idOk=(x:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(x||""));
const eanOk=(x:unknown)=>/^\d{8,14}$/.test(String(x||""));
const qty=(x:unknown)=>{
  const n=Number(x);
  return Number.isFinite(n)&&n>0&&n<=999999&&Math.round(n*1000)===n*1000?n:null;
};
const validDate=(x:unknown)=>{
  if(x===null||x===undefined||x==="")return null;
  const s=String(x);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error("data_invalida");
  const d=new Date(s+"T12:00:00Z");
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw new Error("data_invalida");
  return s;
};
async function authorized(r:Request){
  const t=(r.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!t)return null;
  const {data:user,error}=await db.auth.getUser(t);
  if(error||!user?.user?.id)return null;
  const admin=await db.from("admin_users").select("role,is_active").eq("user_id",user.user.id).maybeSingle();
  if(admin.error||admin.data?.is_active!==true)return null;
  return {id:user.user.id,role:admin.data.role};
}
Deno.serve(async (r:Request)=>{
  if(r.method==="OPTIONS")return new Response(null,{status:204,headers:cors(r)});
  if(!base||!key)return reply(r,{ok:false,error:"servico_indisponivel"},503);
  if(!["GET","POST"].includes(r.method))return reply(r,{ok:false,error:"metodo_invalido"},405);
  const origin=r.headers.get("origin")||"";
  if(origin&&!origins.has(origin))return reply(r,{ok:false,error:"origem_nao_permitida"},403);
  try{
    const actor=await authorized(r);
    if(!actor)return reply(r,{ok:false,error:"sessao_admin_invalida"},401);
    const url=new URL(r.url);
    const action=url.searchParams.get("action")||(r.method==="GET"?"list":"add");
    if(r.method==="GET"&&action==="list"){
      const limit=Math.max(1,Math.min(100,Number(url.searchParams.get("limit"))||60));
      const offset=Math.max(0,Math.min(2000000,Number(url.searchParams.get("offset"))||0));
      const filter=url.searchParams.get("filter")||"all";
      if(!["all","pending","found","not_found"].includes(filter))return reply(r,{ok:false,error:"filtro_invalido"},400);
      let query=db.from("ean_capture_records_v1")
        .select("id,ean,quantity,expires_on,sync_status,matched_product_id,created_at,updated_at,synced_at",{count:"exact"})
        .order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+limit-1);
      if(filter!=="all")query=query.eq("sync_status",filter);
      const [records,stats]=await Promise.all([query,db.rpc("ean_capture_stats_v1")]);
      if(records.error||stats.error)throw records.error||stats.error;
      return reply(r,{ok:true,rows:records.data||[],count:records.count||0,summary:stats.data||{},next_offset:offset+(records.data||[]).length,
        has_more:offset+(records.data||[]).length<(records.count||0)});
    }
    if(r.method!=="POST")return reply(r,{ok:false,error:"metodo_invalido"},405);
    const input=await r.json().catch(()=>null);
    if(!input||typeof input!=="object"||Array.isArray(input))return reply(r,{ok:false,error:"dados_invalidos"},400);
    if(action==="add"){
      if(!eanOk(input.ean)||!idOk(input.client_entry_id)||qty(input.quantity)===null)
        return reply(r,{ok:false,error:"ean_quantidade_ou_id_invalido"},400);
      const expires=validDate(input.expires_on);
      const inserted=await db.from("ean_capture_records_v1").upsert({
        client_entry_id:input.client_entry_id,ean:input.ean,quantity:qty(input.quantity),
        expires_on:expires,created_by:actor.id
      },{onConflict:"client_entry_id",ignoreDuplicates:true}).select("id,ean,quantity,expires_on,sync_status,created_at").maybeSingle();
      if(inserted.error)throw inserted.error;
      let record=inserted.data;
      if(!record){
        const existing=await db.from("ean_capture_records_v1")
          .select("id,ean,quantity,expires_on,sync_status,created_at")
          .eq("client_entry_id",input.client_entry_id).single();
        if(existing.error)throw existing.error;
        if(existing.data.ean!==input.ean)return reply(r,{ok:false,error:"id_reutilizado"},409);
        record=existing.data;
      }
      return reply(r,{ok:true,row:record},201);
    }
    if(action==="edit"){
      if(!idOk(input.id)||qty(input.quantity)===null)return reply(r,{ok:false,error:"quantidade_invalida"},400);
      const expires=validDate(input.expires_on);
      const edited=await db.from("ean_capture_records_v1").update({
        quantity:qty(input.quantity),expires_on:expires,updated_at:new Date().toISOString()
      }).eq("id",input.id).select("id,ean,quantity,expires_on,sync_status,created_at").maybeSingle();
      if(edited.error)throw edited.error;
      if(!edited.data)return reply(r,{ok:false,error:"leitura_nao_encontrada"},404);
      return reply(r,{ok:true,row:edited.data});
    }
    if(action==="sync"){
      const synced=await db.rpc("ean_capture_sync_v1");
      if(synced.error)throw synced.error;
      return reply(r,{ok:true,summary:synced.data});
    }
    return reply(r,{ok:false,error:"acao_invalida"},404);
  }catch(e){
    if(String(e instanceof Error?e.message:e)==="data_invalida")return reply(r,{ok:false,error:"data_invalida"},400);
    console.error("ean_capture_error",e);
    return reply(r,{ok:false,error:"operacao_falhou"},500);
  }
});