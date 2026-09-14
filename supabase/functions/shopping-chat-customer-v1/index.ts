import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const WA_NUMBER='556584491018';
const cors=(req:Request)=>{const o=req.headers.get('origin');if(o&&!ORIGINS.has(o))return null;return {'Access-Control-Allow-Origin':o||'https://donaantonia.com.br','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...(cors(req)||{}),'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const tokenOk=(v:unknown)=>/^[a-f0-9]{64}$/i.test(clean(v,80));
const phoneDigits=(v:unknown)=>String(v??'').replace(/\D/g,'');
const verifyUrl=(code:string)=>`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Confirmar meu cadastro na Dona Antônia: DAWEB-${code}`)}`;
const STATES:Record<string,string>={
  'acre':'AC','alagoas':'AL','amapa':'AP','amazonas':'AM','bahia':'BA','ceara':'CE','distrito federal':'DF','espirito santo':'ES','goias':'GO','maranhao':'MA','mato grosso':'MT','mato grosso do sul':'MS','minas gerais':'MG','para':'PA','paraiba':'PB','parana':'PR','pernambuco':'PE','piaui':'PI','rio de janeiro':'RJ','rio grande do norte':'RN','rio grande do sul':'RS','rondonia':'RO','roraima':'RR','santa catarina':'SC','sao paulo':'SP','sergipe':'SE','tocantins':'TO'
};
const fold=(v:unknown)=>clean(v,100).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const stateCode=(address:any)=>{
  const iso=clean(address?.['ISO3166-2-lvl4']||address?.['ISO3166-2-lvl6']||'',20).toUpperCase();
  const m=iso.match(/^BR-([A-Z]{2})$/);if(m)return m[1];
  return STATES[fold(address?.state)]||'';
};

Deno.serve(async(req:Request)=>{
  const ch=cors(req);if(!ch)return new Response('forbidden',{status:403});
  if(req.method==='OPTIONS')return new Response('ok',{headers:ch});
  if(req.method!=='POST')return json(req,{ok:false,error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return json(req,{ok:false,error:'server_config'},500);
  let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:'invalid_json'},400)}
  const action=clean(body?.action,60).toLowerCase(),token=clean(body?.token,80);
  if(!tokenOk(token))return json(req,{ok:false,error:'invalid_token'},400);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:session,error:sessionError}=await sb.from('catalog_sessions').select('id,customer_id,conversation_id,cart_id,status,expires_at,metadata').eq('public_token',token).maybeSingle();
  if(sessionError)return json(req,{ok:false,error:'room_lookup_failed'},500);
  if(!session)return json(req,{ok:false,error:'room_not_found'},404);
  if(session.status!=='open'||new Date(session.expires_at).getTime()<=Date.now())return json(req,{ok:false,error:'room_unavailable'},409);

  if(action==='basket_policies'){
    if(!session.cart_id)return json(req,{ok:true,policies:[]});
    const {data,error}=await sb.from('cart_items').select('product_id,source,quantity,metadata').eq('cart_id',session.cart_id).in('source',['basket','substitution']).order('created_at');
    if(error)return json(req,{ok:false,error:'basket_policies_failed'},500);
    const policies=(data||[]).map((item:any)=>({
      product_id:item.product_id,
      quantity:Number(item.quantity||0),
      quantity_editable:item.metadata?.quantity_editable!==false,
      removable:item.metadata?.removable!==false,
      min_quantity:item.metadata?.min_quantity==null?null:Number(item.metadata.min_quantity),
      max_quantity:item.metadata?.max_quantity==null?null:Number(item.metadata.max_quantity)
    }));
    return json(req,{ok:true,policies});
  }

  if(action==='reverse_geocode'){
    const latitude=Number(body?.latitude),longitude=Number(body?.longitude);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<-90||latitude>90||longitude<-180||longitude>180)return json(req,{ok:false,error:'invalid_coordinates'},400);
    const reverseUrl=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=18&addressdetails=1&countrycodes=br`;
    try{
      const response=await fetch(reverseUrl,{headers:{'Accept':'application/json','Accept-Language':'pt-BR,pt;q=0.9','User-Agent':'DonaAntoniaCheckout/1.0 (https://donaantonia.com.br)'},signal:AbortSignal.timeout(7000)});
      if(!response.ok)return json(req,{ok:false,error:'reverse_geocode_unavailable'},502);
      const data:any=await response.json();
      const a=data?.address||{};
      const address={
        street:clean(a.road||a.pedestrian||a.residential||a.footway||a.path||a.cycleway||a.highway||'',160),
        number:clean(a.house_number||'',30),
        neighborhood:clean(a.suburb||a.neighbourhood||a.quarter||a.city_district||'',120),
        city:clean(a.city||a.town||a.village||a.municipality||'',100),
        state:stateCode(a),
        postal_code:phoneDigits(a.postcode).slice(0,8)
      };
      if(!address.street&&!address.neighborhood&&!address.city)return json(req,{ok:false,error:'address_not_found'},404);
      return json(req,{ok:true,address,display_name:clean(data?.display_name,240)});
    }catch{
      return json(req,{ok:false,error:'reverse_geocode_unavailable'},502);
    }
  }

  if(action==='lookup_customer'){
    const phone=clean(body?.phone,40),digits=phoneDigits(phone);
    if(digits.length<10||digits.length>13)return json(req,{ok:false,error:'valid_whatsapp_required'},400);
    if(session.customer_id){
      const {data:checkout,error:previewError}=await sb.rpc('room_checkout_preview',{p_public_token:token});
      if(previewError)return json(req,{ok:false,error:'checkout_refresh_failed'},500);
      return json(req,{ok:true,found:true,verified:true,checkout});
    }
    const attempts=Math.max(0,Number(session.metadata?.customer_lookup_attempts||0));
    if(attempts>=5)return json(req,{ok:false,error:'lookup_limit_reached'},429);
    const {data:lookup,error:lookupError}=await sb.rpc('lookup_customer_by_phone',{p_phone:phone});
    if(lookupError)return json(req,{ok:false,error:'customer_lookup_failed'},500);
    const match=Array.isArray(lookup)?lookup[0]:lookup;
    const baseMeta={...(session.metadata||{}),customer_lookup_attempts:attempts+1};
    if(!match?.customer_id){
      await sb.from('catalog_sessions').update({metadata:baseMeta,last_activity_at:new Date().toISOString()}).eq('id',session.id);
      return json(req,{ok:true,found:false});
    }
    const code=crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase();
    const expiresAt=new Date(Date.now()+15*60*1000).toISOString();
    const metadata={...baseMeta,web_pending_customer_id:match.customer_id,web_pending_phone:phone,web_verify_code:code,web_verify_expires_at:expiresAt,web_identity_verified_at:null,web_identity_verification_method:null};
    const {error:updateError}=await sb.from('catalog_sessions').update({metadata,last_activity_at:new Date().toISOString()}).eq('id',session.id);
    if(updateError)return json(req,{ok:false,error:'verification_prepare_failed'},500);
    return json(req,{ok:true,found:true,verified:false,verification_required:true,whatsapp_url:verifyUrl(code),verification_expires_at:expiresAt});
  }

  if(action==='verification_status'){
    const {data:current,error:currentError}=await sb.from('catalog_sessions').select('customer_id,metadata').eq('id',session.id).maybeSingle();
    if(currentError||!current)return json(req,{ok:false,error:'room_lookup_failed'},500);
    const verified=!!current.customer_id&&!!current.metadata?.web_identity_verified_at;
    if(!verified)return json(req,{ok:true,verified:false});
    const {data:checkout,error:previewError}=await sb.rpc('room_checkout_preview',{p_public_token:token});
    if(previewError)return json(req,{ok:false,error:'checkout_refresh_failed'},500);
    return json(req,{ok:true,verified:true,checkout});
  }

  return json(req,{ok:false,error:'unknown_action'},400);
});
