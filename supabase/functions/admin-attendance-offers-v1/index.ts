import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);

const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"GET,OPTIONS"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const integer=(value:unknown,fallback:number,min:number,max:number)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.trunc(n))):fallback};

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};
  const row=await db.from("admin_users").select("user_id,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed"};
  if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized"};
  return {ok:true as const,status:200,user_id:user.data.user.id};
}

async function sellableStockMap(productIds:string[]){
  const out=new Map<string,number>();
  const ids=[...new Set(productIds.filter(Boolean))];
  for(let i=0;i<ids.length;i+=100){
    const result=await db.from("ops2_loose_sellable_stock_v1").select("product_id,effective_sellable_stock").in("product_id",ids.slice(i,i+100));
    if(result.error)throw result.error;
    for(const row of result.data||[])out.set(String(row.product_id),Math.max(0,Number(row.effective_sellable_stock||0)));
  }
  return out;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);
  if(req.method!=="GET")return json(req,{ok:false,error:"method_not_allowed"},405);
  const auth=await adminAuth(req);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
  try{
    const url=new URL(req.url),limit=integer(url.searchParams.get("limit"),300,1,500);
    const result=await db.from("products")
      .select("id,name,gtin,image_url,image_ai_url,price,is_offer,offer_price,is_active")
      .eq("is_active",true)
      .eq("is_offer",true)
      .not("offer_price","is",null)
      .order("name")
      .limit(limit);
    if(result.error)throw result.error;
    const rows=(result.data||[]).filter((product:any)=>Number.isFinite(Number(product.offer_price))&&Number(product.offer_price)>0);
    const stock=await sellableStockMap(rows.map((product:any)=>String(product.id||"")));
    const items=rows.map((product:any)=>({
      id:product.id,
      name:product.name||"",
      gtin:product.gtin||null,
      image_url:product.image_ai_url||product.image_url||null,
      sale_price:Number(product.price||0),
      sellable_stock:stock.get(String(product.id))??0,
      offer:{active:true,price:Number(product.offer_price)}
    }));
    return json(req,{ok:true,items});
  }catch(error){console.error("admin-attendance-offers-v1",error);return json(req,{ok:false,error:"attendance_offers_backend_error"},500)}
});
