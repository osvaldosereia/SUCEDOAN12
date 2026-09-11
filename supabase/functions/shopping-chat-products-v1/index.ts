import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const cors=(req:Request)=>{const o=req.headers.get('origin');if(o&&!ORIGINS.has(o))return null;return {'Access-Control-Allow-Origin':o||'https://donaantonia.com.br','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...(cors(req)||{}),'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v:unknown,max=200)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const tokenOk=(v:unknown)=>/^[a-f0-9]{64}$/i.test(clean(v,80));
const validSales=new Set(['mercearia','limpeza_lavanderia','higiene_beleza','casa_pet']);

Deno.serve(async(req:Request)=>{
  const ch=cors(req);if(!ch)return new Response('forbidden',{status:403});
  if(req.method==='OPTIONS')return new Response('ok',{headers:ch});
  if(req.method!=='POST')return json(req,{ok:false,error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return json(req,{ok:false,error:'server_config'},500);
  let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:'invalid_json'},400)}
  const token=clean(body?.token,80);if(!tokenOk(token))return json(req,{ok:false,error:'invalid_token'},400);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:session,error:se}=await sb.from('catalog_sessions').select('id,cart_id,status,expires_at').eq('public_token',token).maybeSingle();
  if(se)return json(req,{ok:false,error:'room_lookup_failed'},500);if(!session)return json(req,{ok:false,error:'room_not_found'},404);
  if(session.status!=='open'||new Date(session.expires_at).getTime()<=Date.now())return json(req,{ok:false,error:'room_inactive'},410);
  const action=clean(body?.action||'page',30).toLowerCase();
  const sales=(Array.isArray(body?.sales_categories)?body.sales_categories:[]).map((x:any)=>clean(x,40)).filter((x:string)=>validSales.has(x)).slice(0,4);
  const offers=body?.offers===true;

  if(action==='filters'){
    let q=sb.from('products').select('category,sales_category').eq('physically_verified',true).eq('is_active',true).eq('is_whatsapp_active',true).gt('stock',0).not('category','is',null).order('category').limit(1000);
    if(sales.length)q=q.in('sales_category',sales);if(offers)q=q.eq('is_offer',true);
    const {data,error}=await q;if(error)return json(req,{ok:false,error:'filters_failed',detail:error.message},400);
    const seen=new Set<string>(),filters:any[]=[];
    for(const p of data||[]){const label=clean((p as any).category,80),key=label.toLocaleLowerCase('pt-BR');if(!label||seen.has(key))continue;seen.add(key);filters.push({key:label,label});if(filters.length>=24)break;}
    return json(req,{ok:true,filters});
  }

  if(action==='page'){
    const offset=Math.max(0,Math.min(Number(body?.offset)||0,5000));const limit=Math.max(6,Math.min(Number(body?.limit)||12,24));
    const subcategory=clean(body?.subcategory,80),search=clean(body?.q,80).replace(/[,%()]/g,' ').trim();
    let q=sb.from('products').select('id,name,price,image_url,brand,packaging,category,sales_category,stock,is_offer').eq('physically_verified',true).eq('is_active',true).eq('is_whatsapp_active',true).gt('stock',0).order('name',{ascending:true}).range(offset,offset+limit-1);
    if(sales.length)q=q.in('sales_category',sales);if(offers)q=q.eq('is_offer',true);if(subcategory)q=q.eq('category',subcategory);if(search)q=q.or(`name.ilike.%${search}%,brand.ilike.%${search}%,category.ilike.%${search}%,packaging.ilike.%${search}%`);
    const {data,error}=await q;if(error)return json(req,{ok:false,error:'products_failed',detail:error.message},400);
    const ids=(data||[]).map((p:any)=>p.id);let current:any[]=[];
    if(session.cart_id&&ids.length){const {data:items}=await sb.from('cart_items').select('product_id,quantity').eq('cart_id',session.cart_id).in('product_id',ids).gt('quantity',0);current=items||[];}
    const qty=new Map(current.map((x:any)=>[x.product_id,Number(x.quantity||0)]));
    const products=(data||[]).map((p:any)=>({...p,quantity:qty.get(p.id)||0}));
    return json(req,{ok:true,products,next_offset:offset+products.length,has_more:products.length===limit});
  }

  return json(req,{ok:false,error:'unknown_action'},400);
});