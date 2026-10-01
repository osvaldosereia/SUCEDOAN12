import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(r:Request)=>{const o=r.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(o)?o:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}};
const json=(r:Request,v:any,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{...cors(r),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:any,n=180)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const key=(v:any)=>clean(v,80).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");

const SEGMENTS=["BEBE","CABELOS","BELEZA","HIGIENE","LIMPEZA","LAVANDERIA","PET","CASA","DOCES_LANCHES","CESTAS"];
function segmentForProduct(p:any){
  const sub=key(p?.customer_subcategory||p?.subcategory||"");
  const leaf=key(p?.customer_subsubcategory||p?.subsubcategory||"");
  if(sub==="bebe"||leaf.includes("fralda")||leaf.includes("bebe"))return "BEBE";
  if(sub==="cabelos"||["shampoo","condicionador","creme-de-pentear","tratamentos-capilares","coloracao-capilar","oleos-e-seruns-capilares","acessorios-de-cabelo","escovas-e-pentes","kits-de-shampoo-e-condicionador"].includes(leaf))return "CABELOS";
  if(sub==="beleza-e-cuidados"||["unhas","labios","cuidados-corporais","cuidados-com-o-rosto","protecao-da-pele","acessorios-de-beleza"].includes(leaf))return "BELEZA";
  if(sub==="higiene-pessoal")return "HIGIENE";
  if(sub==="limpeza")return "LIMPEZA";
  if(sub==="lavanderia")return "LAVANDERIA";
  if(sub==="pets"||["caes","gatos","petiscos-para-pets","higiene-pet"].includes(leaf))return "PET";
  if(sub==="casa-e-utilidades")return "CASA";
  if(["biscoitos","chocolates-e-doces","balas-e-chicletes","salgadinhos-e-petiscos","bebidas","cereais-e-barras"].includes(leaf))return "DOCES_LANCHES";
  return "";
}

async function brandRules(){
  const r=await db.from("marketing_campaign_brand_rules_v1").select("brand_key,display_name,is_enabled,notes,sort_order,updated_at").order("sort_order").order("display_name");
  if(r.error)throw r.error;return r.data||[];
}

async function overview(){
  const [pr,cr,rr]=await Promise.all([
    db.from("products").select("id,name,brand,stock,is_offer,offer_price,price,customer_subcategory,customer_subsubcategory,subcategory,subsubcategory,is_active").eq("is_active",true).limit(5000),
    db.from("customers").select("id,marketing_opt_in,is_active").eq("is_active",true).limit(5000),
    brandRules()
  ]);
  if(pr.error)throw pr.error;if(cr.error)throw cr.error;
  const products=pr.data||[],rules=rr||[],byId=new Map(products.map((p:any)=>[String(p.id),p]));
  const seg=new Map<string,any>();for(const s of SEGMENTS)seg.set(s,{key:s,active_products:0,in_stock:0,offers:0,stock_qty:0,buyers:new Set<string>(),revenue:0});
  for(const p of products){const s=segmentForProduct(p);if(!s)continue;const x=seg.get(s);x.active_products++;const stock=Math.max(0,Number(p.stock||0));if(stock>0)x.in_stock++;x.stock_qty+=stock;if(p.is_offer===true&&p.offer_price!=null)x.offers++;}

  const since=new Date(Date.now()-180*86400000).toISOString();
  const or=await db.from("orders").select("id,customer_id,status,created_at").gte("created_at",since).not("status","in","(cancelled,returned)").limit(5000);
  if(or.error)throw or.error;const orders=or.data||[],orderMap=new Map(orders.map((o:any)=>[String(o.id),o]));
  const orderIds=orders.map((o:any)=>o.id),items:any[]=[];
  for(let i=0;i<orderIds.length;i+=150){const ir=await db.from("order_items").select("order_id,product_id,quantity,line_total,metadata").in("order_id",orderIds.slice(i,i+150)).limit(5000);if(ir.error)throw ir.error;items.push(...(ir.data||[]));}
  const enabledRules=rules.filter((r:any)=>r.is_enabled===true),brandStats=new Map(enabledRules.map((r:any)=>[r.brand_key,{...r,active_products:0,in_stock:0,offers:0,stock_qty:0,buyers:new Set<string>(),revenue:0}]));
  const ruleByDisplay=new Map(enabledRules.map((r:any)=>[key(r.display_name),r.brand_key]));
  for(const p of products){const rk=ruleByDisplay.get(key(p.brand));if(!rk)continue;const x=brandStats.get(rk);x.active_products++;const stock=Math.max(0,Number(p.stock||0));if(stock>0)x.in_stock++;x.stock_qty+=stock;if(p.is_offer===true&&p.offer_price!=null)x.offers++;}
  for(const it of items){if(String(it?.metadata?.history_kind||"")==="basket_component")continue;const p=byId.get(String(it.product_id||""));if(!p)continue;const order=orderMap.get(String(it.order_id||"")),customer=String(order?.customer_id||"");const revenue=Number(it.line_total||0);const s=segmentForProduct(p);if(s){const x=seg.get(s);if(customer)x.buyers.add(customer);x.revenue+=revenue;}const rk=ruleByDisplay.get(key(p.brand));if(rk){const x=brandStats.get(rk);if(customer)x.buyers.add(customer);x.revenue+=revenue;}}
  const segments=[...seg.values()].filter((x:any)=>x.active_products>0).map((x:any)=>({...x,buyers_180d:x.buyers.size,revenue_180d:Number(x.revenue.toFixed(2)),score:x.offers*8+x.buyers.size*3+Math.min(x.stock_qty,1000)/100,buyers:undefined})).sort((a:any,b:any)=>b.score-a.score);
  const brands=[...brandStats.values()].map((x:any)=>({...x,buyers_180d:x.buyers.size,revenue_180d:Number(x.revenue.toFixed(2)),score:x.offers*8+x.buyers.size*3+Math.min(x.stock_qty,1000)/100,buyers:undefined})).sort((a:any,b:any)=>b.score-a.score);
  const activeCustomers=cr.data||[],opted=activeCustomers.filter((c:any)=>c.marketing_opt_in===true).length;
  return {ok:true,generated_at:new Date().toISOString(),window_days:180,consent:{active_customers:activeCustomers.length,marketing_opt_in:opted},segments,brands,brand_rules:rules};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  try{
    const url=new URL(req.url),action=clean(url.searchParams.get("action"),60)||"overview";
    if(req.method==="GET"&&action==="overview")return json(req,await overview());
    if(req.method==="GET"&&action==="brand_rules")return json(req,{ok:true,brand_rules:await brandRules()});
    if(req.method==="POST"&&action==="brand_rule_save"){
      const body=await req.json().catch(()=>({})),brandKey=key(body?.brand_key);if(!brandKey)return json(req,{ok:false,error:"invalid_brand_key"},400);
      const patch:{is_enabled?:boolean,notes?:string|null,updated_at:string}={updated_at:new Date().toISOString()};
      if(typeof body?.is_enabled==="boolean")patch.is_enabled=body.is_enabled;if("notes" in body)patch.notes=clean(body.notes,500)||null;
      const r=await db.from("marketing_campaign_brand_rules_v1").update(patch).eq("brand_key",brandKey).select("brand_key,display_name,is_enabled,notes,sort_order,updated_at").maybeSingle();
      if(r.error)throw r.error;if(!r.data)return json(req,{ok:false,error:"brand_rule_not_found"},404);return json(req,{ok:true,brand_rule:r.data});
    }
    return json(req,{ok:false,error:"not_found"},404);
  }catch(e){console.error(e);return json(req,{ok:false,error:"internal_error"},500)}
});
