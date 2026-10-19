import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const base=Deno.env.get("SUPABASE_URL")||"";
const key=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
const PHOTO_BUCKET="ean-capture-unknown-photos";
const sniffImage=(buf:Uint8Array)=>{
 if(buf.length>=3&&buf[0]===255&&buf[1]===216&&buf[2]===255)return {contentType:"image/jpeg",ext:"jpg"};
 if(buf.length>=8&&buf[0]===137&&buf[1]===80&&buf[2]===78&&buf[3]===71&&buf[4]===13&&buf[5]===10&&buf[6]===26&&buf[7]===10)return {contentType:"image/png",ext:"png"};
 if(buf.length>=12&&String.fromCharCode(...buf.slice(0,4))==="RIFF"&&String.fromCharCode(...buf.slice(8,12))==="WEBP")return {contentType:"image/webp",ext:"webp"};
 return null;
};
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
async function withProductNames(rows:Record<string,unknown>[]){
  const ids=[...new Set(rows.map(row=>String(row.matched_product_id||"")).filter(idOk))];
  const names=new Map<string,string>();
  if(ids.length){
    const products=await db.from("products").select("id,name").in("id",ids);
    if(products.error)throw products.error;
    for(const product of products.data||[])names.set(String(product.id),String(product.name||""));
  }
  return rows.map(row=>({...row,product_name:names.get(String(row.matched_product_id||""))||null}));
}
async function withProductNamesOnRow(payload:Record<string,unknown>){
  if(payload&&payload.row&&typeof payload.row==="object"&&!Array.isArray(payload.row)){
    payload.row=(await withProductNames([payload.row as Record<string,unknown>]))[0];
  }
  return payload;
}
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
    if(r.method==="GET"&&action==="photo_url"){
      const rowId=url.searchParams.get("id")||"";
      if(!idOk(rowId))return reply(r,{ok:false,error:"leitura_invalida"},400);
      const selected=await db.from("ean_capture_records_v1").select("photo_path").eq("id",rowId).maybeSingle();
      if(selected.error)throw selected.error;
      if(!selected.data?.photo_path)return reply(r,{ok:false,error:"foto_nao_encontrada"},404);
      const signed=await db.storage.from(PHOTO_BUCKET).createSignedUrl(selected.data.photo_path,120);
      if(signed.error)throw signed.error;
      return reply(r,{ok:true,url:signed.data.signedUrl});
    }
    if(r.method==="GET"&&action==="list"){
      const limit=Math.max(1,Math.min(100,Number(url.searchParams.get("limit"))||60));
      const offset=Math.max(0,Math.min(2000000,Number(url.searchParams.get("offset"))||0));
      const filter=url.searchParams.get("filter")||"all";
      if(!["all","pending","found","not_found"].includes(filter))return reply(r,{ok:false,error:"filtro_invalido"},400);
      let query=db.from("ean_capture_records_v1")
        .select("id,ean,quantity,expires_on,sync_status,matched_product_id,photo_path,photo_captured_at,created_at,updated_at,synced_at",{count:"exact"})
        .order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+limit-1);
      if(filter!=="all")query=query.eq("sync_status",filter);
      const [records,stats]=await Promise.all([query,db.rpc("ean_capture_stats_v1")]);
      if(records.error||stats.error)throw records.error||stats.error;
      const rows=await withProductNames(records.data||[]);
      return reply(r,{ok:true,rows,count:records.count||0,summary:stats.data||{},next_offset:offset+rows.length,
        has_more:offset+rows.length<(records.count||0)});
    }
    if(r.method!=="POST")return reply(r,{ok:false,error:"metodo_invalido"},405);
    if(action==="photo"){
      const form=await r.formData().catch(()=>null);
      const recordId=String(form?.get("id")||"");
      const file=form?.get("file");
      if(!idOk(recordId)||!(file instanceof File)||file.size<80||file.size>5242880)
        return reply(r,{ok:false,error:"foto_invalida_ate_5mb"},400);
      const existing=await db.from("ean_capture_records_v1")
        .select("id,sync_status,photo_path").eq("id",recordId).maybeSingle();
      if(existing.error)throw existing.error;
      if(!existing.data)return reply(r,{ok:false,error:"leitura_nao_encontrada"},404);
      if(existing.data.sync_status!=="not_found")return reply(r,{ok:false,error:"foto_somente_para_ean_nao_encontrado"},409);
      const bytes=new Uint8Array(await file.arrayBuffer());
      const image=sniffImage(bytes);
      if(!image)return reply(r,{ok:false,error:"formato_de_foto_invalido"},400);
      const path=recordId+"/"+crypto.randomUUID()+"."+image.ext;
      const uploaded=await db.storage.from(PHOTO_BUCKET).upload(path,bytes,{
        contentType:image.contentType,upsert:false,cacheControl:"3600"
      });
      if(uploaded.error)throw uploaded.error;
      const saved=await db.from("ean_capture_records_v1")
       .update({photo_path:path,photo_captured_at:new Date().toISOString(),updated_at:new Date().toISOString()})
       .eq("id",recordId).eq("sync_status","not_found")
       .select("id,ean,quantity,expires_on,sync_status,matched_product_id,photo_path,photo_captured_at,created_at,updated_at,synced_at")
       .maybeSingle();
      if(saved.error||!saved.data){
        await db.storage.from(PHOTO_BUCKET).remove([path]).catch(()=>{});
        if(saved.error)throw saved.error;
        return reply(r,{ok:false,error:"leitura_nao_encontrada_ou_sincronizada"},409);
      }
      if(existing.data.photo_path&&existing.data.photo_path!==path)
       await db.storage.from(PHOTO_BUCKET).remove([existing.data.photo_path]).catch(()=>{});
      return reply(r,{ok:true,row:saved.data});
    }
    const input=await r.json().catch(()=>null);
    if(!input||typeof input!=="object"||Array.isArray(input))return reply(r,{ok:false,error:"dados_invalidos"},400);
    if(action==="search_products"){
      const raw=String(input.query||"").trim();
      const term=raw.replace(/[^a-zA-Z0-9À-ÿ _-]/g," ").replace(/\s+/g," ").trim().slice(0,80);
      if(term.length<2)return reply(r,{ok:false,error:"consulta_muito_curta"},400);
      const pattern="%"+term+"%";
      const found=await db.from("products")
        .select("id,name,gtin,sku,stock,ncm,image_url,is_active,brand,packaging")
        .eq("is_active",true)
        .or("name.ilike."+pattern+",brand.ilike."+pattern+",sku.ilike."+pattern+",gtin.ilike."+pattern)
        .order("name",{ascending:true}).limit(30);
      if(found.error)throw found.error;
      return reply(r,{ok:true,rows:found.data||[]});
    }
    if(action==="repair_ean"){
      if(!idOk(input.id)||!eanOk(input.ean))return reply(r,{ok:false,error:"leitura_ou_ean_invalido"},400);
      const existing=await db.from("ean_capture_records_v1").select("id,sync_status")
        .eq("id",input.id).maybeSingle();
      if(existing.error)throw existing.error;
      if(!existing.data)return reply(r,{ok:false,error:"leitura_nao_encontrada"},404);
      if(existing.data.sync_status!=="not_found")return reply(r,{ok:false,error:"leitura_nao_esta_na_fila"},409);
      const edited=await db.from("ean_capture_records_v1").update({
        ean:input.ean,matched_product_id:null,sync_status:"pending",synced_at:null,updated_at:new Date().toISOString()
      }).eq("id",input.id).eq("sync_status","not_found").select("id").maybeSingle();
      if(edited.error)throw edited.error;
      if(!edited.data)return reply(r,{ok:false,error:"leitura_ja_alterada"},409);
      const synced=await db.rpc("ean_capture_sync_one_v1",{p_capture_id:input.id});
      if(synced.error)throw synced.error;
      if(synced.data?.ok!==true)return reply(r,{ok:false,error:synced.data?.error||"leitura_nao_encontrada"},404);
      return reply(r,await withProductNamesOnRow(synced.data));
    }
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
    if(action==="sync_one"){
      if(!idOk(input.id))return reply(r,{ok:false,error:"leitura_invalida"},400);
      const synced=await db.rpc("ean_capture_sync_one_v1",{p_capture_id:input.id});
      if(synced.error)throw synced.error;
      if(synced.data?.ok!==true)return reply(r,{ok:false,error:synced.data?.error||"leitura_nao_encontrada"},404);
      return reply(r,await withProductNamesOnRow(synced.data));
    }
    if(action==="sync"){
      const synced=await db.rpc("ean_capture_sync_v1");
      if(synced.error)throw synced.error;
      return reply(r,{ok:true,summary:synced.data});
    }
    if(action==="link_product"||action==="create_inactive"){
      if(!idOk(input.id))return reply(r,{ok:false,error:"leitura_invalida"},400);
      const ncm=String(input.ncm||"").replace(/\D/g,"");
      if(ncm&&ncm.length!==8)return reply(r,{ok:false,error:"ncm_invalido"},400);
      if(action==="link_product"&&!idOk(input.product_id))return reply(r,{ok:false,error:"produto_invalido"},400);
      const name=String(input.name||"").trim().slice(0,180);
      if(action==="create_inactive"&&!name)return reply(r,{ok:false,error:"nome_obrigatorio"},400);
      const resolved=await db.rpc("ean_capture_resolve_v1",{
        p_capture_id:input.id,p_mode:action==="link_product"?"link":"create",
        p_product_id:action==="link_product"?input.product_id:null,
        p_name:action==="create_inactive"?name:null,p_ncm:ncm||null
      });
      if(resolved.error)throw resolved.error;
      if(resolved.data?.ok!==true)return reply(r,{ok:false,error:resolved.data?.error||"resolucao_falhou"},409);
      return reply(r,await withProductNamesOnRow(resolved.data));
    }

    return reply(r,{ok:false,error:"acao_invalida"},404);
  }catch(e){
    if(String(e instanceof Error?e.message:e)==="data_invalida")return reply(r,{ok:false,error:"data_invalida"},400);
    console.error("ean_capture_error",e);
    return reply(r,{ok:false,error:"operacao_falhou"},500);
  }
});