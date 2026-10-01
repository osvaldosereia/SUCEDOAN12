import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(r:Request)=>{const o=r.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(o)?o:"https://donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"GET,OPTIONS"}};
const json=(r:Request,v:any,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{...cors(r),"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=60"}});
const clean=(v:any,n=120)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const slug=(v:any)=>clean(v,80).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const cents=(v:any)=>Math.round(Number(v||0)*100);
const SEGMENT_SUBCATEGORY:Record<string,string>={bebe:"Bebê",cabelos:"Cabelos",beleza:"Beleza e Cuidados",higiene:"Higiene Pessoal",limpeza:"Limpeza",lavanderia:"Lavanderia",pet:"Pets",casa:"Casa e Utilidades"};
const SNACKS=["Biscoitos","Chocolates e Doces","Balas e Chicletes","Salgadinhos e Petiscos","Bebidas","Cereais e Barras"];
async function sellable(ids:string[]){const out=new Map<string,number>();for(let i=0;i<ids.length;i+=100){const r=await db.from("ops2_loose_sellable_stock_v1").select("product_id,loose_sellable_stock").in("product_id",ids.slice(i,i+100));if(r.error)throw r.error;for(const x of r.data||[])out.set(String(x.product_id),Math.max(0,Number(x.loose_sellable_stock||0)));}return out;}
function pub(p:any,stock:number){const offer=p.is_offer===true&&p.offer_price!=null&&Number(p.offer_price)>=0;return {id:p.id,product_id:p.id,name:p.name,image_url:p.image_url||"",price_cents:cents(offer?p.offer_price:p.price),regular_price_cents:offer?cents(p.price):null,packaging:p.packaging||"",subcategory:p.customer_subcategory||p.subcategory||"",subsubcategory:p.customer_subsubcategory||p.subsubcategory||"",brand:p.brand||"",stock_quantity:stock};}
async function rules(){const r=await db.from("marketing_campaign_brand_rules_v1").select("brand_key,display_name,is_enabled,sort_order").eq("is_enabled",true).order("sort_order");if(r.error)throw r.error;return r.data||[];}
async function products(url:URL){const segment=slug(url.searchParams.get("segment")),brandKey=slug(url.searchParams.get("brand")),limit=Math.max(1,Math.min(36,Number(url.searchParams.get("limit")||24))),offset=Math.max(0,Math.min(5000,Number(url.searchParams.get("offset")||0)));let q=db.from("products").select("id,name,image_url,price,offer_price,is_offer,packaging,brand,customer_subcategory,customer_subsubcategory,subcategory,subsubcategory,sort_order").eq("is_active",true);let title="Produtos";
  if(brandKey){const r=await db.from("marketing_campaign_brand_rules_v1").select("display_name,is_enabled").eq("brand_key",brandKey).maybeSingle();if(r.error)throw r.error;if(!r.data||r.data.is_enabled!==true)return {ok:true,title:"Marca indisponível",products:[],next_offset:null};q=q.ilike("brand",r.data.display_name);title=r.data.display_name;}
  else if(segment==="doces-lanches"){q=q.in("customer_subsubcategory",SNACKS);title="Doces e lanches";}
  else if(SEGMENT_SUBCATEGORY[segment]){q=q.eq("customer_subcategory",SEGMENT_SUBCATEGORY[segment]);title=SEGMENT_SUBCATEGORY[segment];}
  else return {ok:true,title:"Produtos",products:[],next_offset:null};
  const r=await q.order("sort_order").order("name").range(offset,offset+limit-1);if(r.error)throw r.error;const rows=r.data||[],sm=await sellable(rows.map((p:any)=>p.id)),list=rows.map((p:any)=>pub(p,sm.get(String(p.id))||0)).filter((p:any)=>p.stock_quantity>0);return {ok:true,title,products:list,next_offset:rows.length===limit?offset+limit:null};}
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});try{const u=new URL(req.url),action=slug(u.searchParams.get("action"))||"config";if(action==="config")return json(req,{ok:true,brands:await rules(),segments:Object.keys(SEGMENT_SUBCATEGORY).concat(["doces-lanches"])});if(action==="products")return json(req,await products(u));return json(req,{ok:false,error:"not_found"},404)}catch(e){console.error(e);return json(req,{ok:false,error:"internal_error"},500)}});
