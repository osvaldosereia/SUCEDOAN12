import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizeFlags } from "../_shared/chat-intelligence-config.js";

const ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const cors=(req:Request)=>{const o=req.headers.get('origin');if(o&&!ORIGINS.has(o))return null;return {'Access-Control-Allow-Origin':o||'https://donaantonia.com.br','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...(cors(req)||{}),'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v:unknown,max=200)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const tokenOk=(v:unknown)=>/^[a-f0-9]{64}$/i.test(clean(v,80));
const uuidOk=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));
const TAXONOMY_VERSION='v2_2026_09';
const validCustomerCategories=new Set(['Para Você','Para Casa']);
const sortPt=(a:{label:string},b:{label:string})=>a.label.localeCompare(b.label,'pt-BR');

Deno.serve(async(req:Request)=>{
  const ch=cors(req);if(!ch)return new Response('forbidden',{status:403});
  if(req.method==='OPTIONS')return new Response('ok',{headers:ch});
  if(req.method!=='POST')return json(req,{ok:false,error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return json(req,{ok:false,error:'server_config'},500);
  let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:'invalid_json'},400)}
  const token=clean(body?.token,80);if(!tokenOk(token))return json(req,{ok:false,error:'invalid_token'},400);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const [{data:session,error:se},{data:runtime}]=await Promise.all([
    sb.from('catalog_sessions').select('id,cart_id,customer_id,conversation_id,status,expires_at').eq('public_token',token).maybeSingle(),
    sb.from('service_simple_runtime_config').select('config_level,integration_flags').eq('id',1).maybeSingle(),
  ]);
  if(se)return json(req,{ok:false,error:'room_lookup_failed'},500);if(!session)return json(req,{ok:false,error:'room_not_found'},404);if(session.status!=='open'||new Date(session.expires_at).getTime()<=Date.now())return json(req,{ok:false,error:'room_inactive'},410);
  const flags=normalizeFlags(runtime?.integration_flags,runtime?.config_level||'recommended');
  if(flags.products===false)return json(req,{ok:false,error:'feature_disabled',feature:'products'},409);
  const action=clean(body?.action||'page',30).toLowerCase();
  const requestedCategory=clean(body?.customer_category,40);
  const customerCategory=validCustomerCategories.has(requestedCategory)?requestedCategory:'';
  const offers=body?.offers===true;
  if(offers&&flags.offers===false)return json(req,{ok:false,error:'feature_disabled',feature:'offers'},409);

  if(action==='track'){
    const eventType=clean(body?.event_type,40).toLowerCase();
    if(!['catalog_search','product_view'].includes(eventType))return json(req,{ok:false,error:'invalid_catalog_interaction'},400);
    const productId=clean(body?.product_id,80)||null;
    if(eventType==='product_view'&&!uuidOk(productId))return json(req,{ok:false,error:'invalid_product_id'},400);
    const eventData=eventType==='catalog_search'
      ?{
          source:'comprar',
          surface:clean(body?.surface||'products_browser',80),
          query:clean(body?.q,100),
          customer_category:customerCategory||null,
          customer_subcategory:clean(body?.customer_subcategory,80)||null,
          customer_subsubcategory:clean(body?.customer_subsubcategory,80)||null,
          offers,
        }
      :{
          source:'comprar',
          surface:clean(body?.surface||'product_detail',80),
          query:clean(body?.q,100)||null,
          customer_category:customerCategory||null,
          customer_subcategory:clean(body?.customer_subcategory,80)||null,
          customer_subsubcategory:clean(body?.customer_subsubcategory,80)||null,
          offers,
        };
    const {data,error}=await sb.rpc('record_catalog_interaction_v1',{
      p_catalog_session_id:session.id,
      p_event_type:eventType,
      p_product_id:eventType==='product_view'?productId:null,
      p_event_data:eventData,
      p_dedupe_seconds:eventType==='product_view'?900:20,
    });
    if(error)return json(req,{ok:false,error:'catalog_interaction_failed',detail:error.message},400);
    return json(req,{ok:true,event:data||null,external_side_effect:false});
  }

  if(action==='filters'){
    let q=sb.from('products')
      .select('customer_subcategory,customer_subsubcategory')
      .eq('is_active',true)
      .gt('stock',0)
      .eq('customer_taxonomy_version',TAXONOMY_VERSION)
      .not('customer_subcategory','is',null)
      .not('customer_subsubcategory','is',null)
      .limit(2000);
    if(customerCategory)q=q.eq('customer_category',customerCategory);
    if(offers)q=q.eq('is_offer',true);
    const {data,error}=await q;
    if(error)return json(req,{ok:false,error:'filters_failed',detail:error.message},400);

    const subcategoryMap=new Map<string,{key:string,label:string}>();
    const leafMap=new Map<string,Map<string,{key:string,label:string}>>();
    for(const p of data||[]){
      const sub=clean((p as any).customer_subcategory,80),leaf=clean((p as any).customer_subsubcategory,80);
      if(!sub||!leaf)continue;
      const subKey=sub.toLocaleLowerCase('pt-BR');
      if(!subcategoryMap.has(subKey))subcategoryMap.set(subKey,{key:sub,label:sub});
      if(!leafMap.has(sub))leafMap.set(sub,new Map());
      const leafKey=leaf.toLocaleLowerCase('pt-BR');
      const leaves=leafMap.get(sub)!;
      if(!leaves.has(leafKey))leaves.set(leafKey,{key:leaf,label:leaf});
    }
    const subcategories=[...subcategoryMap.values()].sort(sortPt);
    const subsubcategories:Record<string,{key:string,label:string}[]>={};
    for(const sub of subcategories)subsubcategories[sub.key]=[...(leafMap.get(sub.key)?.values()||[])].sort(sortPt);
    return json(req,{ok:true,subcategories,subsubcategories});
  }

  if(action==='page'){
    const offset=Math.max(0,Math.min(Number(body?.offset)||0,5000));
    const limit=Math.max(6,Math.min(Number(body?.limit)||12,30));
    const customerSubcategory=clean(body?.customer_subcategory,80);
    const customerSubsubcategory=clean(body?.customer_subsubcategory,80);
    const search=clean(body?.q,80).replace(/[,%()]/g,' ').trim();
    const personalizationEligible=offers&&!customerCategory&&!customerSubcategory&&!customerSubsubcategory&&!search&&!!session.customer_id&&!!session.conversation_id;
    let personalizedOffers=false;
    if(personalizationEligible){
      const {count:historyCount}=await sb.from('customer_product_stats').select('product_id',{count:'exact',head:true}).eq('customer_id',session.customer_id);
      personalizedOffers=Number(historyCount||0)>0;
    }
    let q=sb.from('products')
      .select('id,name,price,offer_price,image_url,brand,packaging,description_short,stock,is_offer,customer_category,customer_subcategory,customer_subsubcategory')
      .eq('is_active',true)
      .gt('stock',0)
      .eq('customer_taxonomy_version',TAXONOMY_VERSION);
    if(customerCategory)q=q.eq('customer_category',customerCategory);
    if(offers)q=q.eq('is_offer',true);
    if(customerSubcategory)q=q.eq('customer_subcategory',customerSubcategory);
    if(customerSubsubcategory)q=q.eq('customer_subsubcategory',customerSubsubcategory);
    if(search)q=q.or(`name.ilike.%${search}%,brand.ilike.%${search}%,packaging.ilike.%${search}%,customer_subcategory.ilike.%${search}%,customer_subsubcategory.ilike.%${search}%`);
    q=q.order('name',{ascending:true});
    q=personalizedOffers?q.limit(500):q.range(offset,offset+limit-1);

    const recommendationsPromise=personalizedOffers
      ? sb.rpc('get_personalized_offers_v1',{p_conversation_id:session.conversation_id,p_limit:100})
      : Promise.resolve({data:[],error:null});
    const [{data,error},{data:recommendations,error:recommendationError}]=await Promise.all([q,recommendationsPromise]);
    if(error)return json(req,{ok:false,error:'products_failed',detail:error.message},400);

    let rows=[...(data||[])];
    const recMap=new Map<string,any>();
    if(personalizedOffers&&!recommendationError){
      (recommendations||[]).forEach((r:any,index:number)=>recMap.set(String(r.product_id),{...r,rank:index}));
      rows.sort((a:any,b:any)=>{
        const ra=recMap.get(String(a.id)),rb=recMap.get(String(b.id));
        if(ra&&rb)return Number(rb.score||0)-Number(ra.score||0)||Number(ra.rank||0)-Number(rb.rank||0)||String(a.name||'').localeCompare(String(b.name||''),'pt-BR');
        if(ra)return -1;
        if(rb)return 1;
        return String(a.name||'').localeCompare(String(b.name||''),'pt-BR');
      });
    }

    const totalRows=rows.length;
    if(personalizedOffers)rows=rows.slice(offset,offset+limit);
    const ids=rows.map((p:any)=>p.id);
    let current:any[]=[];
    if(session.cart_id&&ids.length){const {data:items}=await sb.from('cart_items').select('product_id,quantity').eq('cart_id',session.cart_id).in('product_id',ids).gt('quantity',0);current=items||[]}
    const qty=new Map(current.map((x:any)=>[x.product_id,Number(x.quantity||0)]));
    const products=rows.map((p:any)=>{
      const rec=recMap.get(String(p.id));
      return {...p,quantity:qty.get(p.id)||0,personalized_reason:rec?.reason||null,personalized_score:rec?Number(rec.score||0):null,bought_before:rec?.bought_before===true,purchase_count:rec?Number(rec.purchase_count||0):0};
    });
    return json(req,{ok:true,products,next_offset:offset+products.length,has_more:personalizedOffers?offset+products.length<totalRows:products.length===limit,personalized:personalizedOffers&&recMap.size>0});
  }
  return json(req,{ok:false,error:'unknown_action'},400);
});