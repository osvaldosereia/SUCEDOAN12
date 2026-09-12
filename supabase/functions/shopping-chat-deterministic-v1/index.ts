import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";
import {routeDeterministicText} from "./core.mjs";

const ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const cors=(req:Request)=>{const o=req.headers.get('origin');if(o&&!ORIGINS.has(o))return null;return {'Access-Control-Allow-Origin':o||'https://donaantonia.com.br','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...(cors(req)||{}),'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v:unknown,max=1000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const tokenOk=(v:unknown)=>/^[a-f0-9]{64}$/i.test(clean(v,80));
const uuidOk=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));
const qty=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(999,n)):null};
const PAYMENT=new Set(['pix','credit_card','meal_card','cash']);
const mapsUrl=(lat:unknown,lng:unknown)=>Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))?`https://www.google.com/maps?q=${Number(lat)},${Number(lng)}`:null;

Deno.serve(async(req:Request)=>{
  const ch=cors(req);if(!ch)return new Response('forbidden',{status:403});
  if(req.method==='OPTIONS')return new Response('ok',{headers:ch});
  if(req.method!=='POST')return json(req,{ok:false,error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return json(req,{ok:false,error:'server_config'},500);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:'invalid_json'},400)}
  const action=clean(body?.action||'open',60).toLowerCase();

  const {data:cfg,error:cfgError}=await sb.from('shopping_chat_deterministic_config').select('*').eq('id',1).maybeSingle();
  if(cfgError)return json(req,{ok:false,error:'config_lookup_failed'},500);
  if(!cfg?.enabled)return json(req,{ok:false,error:'deterministic_chat_disabled'},503);

  if(action==='create_web_room'){
    const {data,error}=await sb.rpc('deterministic_chat_start_session_v1');
    if(error)return json(req,{ok:false,error:'room_create_failed',detail:error.message},400);
    return json(req,{ok:true,...data,room_url:`https://donaantonia.com.br/comprar/?s=${data.token}`});
  }

  const token=clean(body?.token,80);if(!tokenOk(token))return json(req,{ok:false,error:'invalid_token'},400);
  const {data:session,error:se}=await sb.from('catalog_sessions').select('id,public_token,customer_id,conversation_id,cart_id,status,expires_at,created_at,current_view,metadata,completed_at').eq('public_token',token).maybeSingle();
  if(se)return json(req,{ok:false,error:'room_lookup_failed'},500);if(!session)return json(req,{ok:false,error:'room_not_found'},404);
  if(new Date(session.expires_at).getTime()<=Date.now()&&session.status!=='closed')return json(req,{ok:false,error:'room_expired'},410);
  if(session.status==='closed'&&!['open','messages'].includes(action))return json(req,{ok:false,error:'room_closed'},409);

  const cart=async()=>{const {data:s}=await sb.from('catalog_sessions').select('cart_id').eq('id',session.id).single();if(!s?.cart_id)return null;const {data:c}=await sb.from('carts').select('id,status,total,fiscal_subtotal,other_expenses,discount,version,basket_id').eq('id',s.cart_id).maybeSingle();if(!c)return null;const {data:items}=await sb.from('cart_items').select('product_id,source,quantity,base_quantity,commercial_delta,product:products(id,name,price,image_url,brand,packaging,category)').eq('cart_id',c.id).gt('quantity',0).order('created_at');return {...c,items:items||[]}};
  const messages=async()=>{if(!session.conversation_id)return [];const {data}=await sb.from('messages').select('id,direction,message_type,body_text,created_at,raw_event').eq('conversation_id',session.conversation_id).gte('created_at',session.created_at).in('message_type',['text','system']).order('created_at',{ascending:true}).limit(60);return (data||[]).map((m:any)=>({id:m.id,direction:m.direction,message_type:m.message_type,body_text:m.body_text,created_at:m.created_at,source:m.raw_event?.source||null}))};
  const logTrigger=async(trigger:string,toState:string,payload:any={})=>{const fromState=clean(session.metadata?.state||'MENU',60);await sb.from('shopping_chat_trigger_events').insert({catalog_session_id:session.id,conversation_id:session.conversation_id,customer_id:session.customer_id,trigger,from_state:fromState,to_state:toState,payload});await sb.from('catalog_sessions').update({metadata:{...(session.metadata||{}),state:toState},last_activity_at:new Date().toISOString()}).eq('id',session.id)};

  if(action==='open'){
    await sb.from('catalog_sessions').update({last_opened_at:new Date().toISOString(),last_activity_at:new Date().toISOString(),experience:'shopping_room'}).eq('id',session.id);
    let customer:any=null;if(session.customer_id){const {data:c}=await sb.from('customers').select('id,name,primary_whatsapp_e164,preferred_reply').eq('id',session.customer_id).maybeSingle();customer=c||null}
    const {data:baskets}=await sb.from('basket_templates').select('id,name,description,image_url,base_price,sort_order').eq('is_active',true).order('sort_order').order('name').limit(20);
    return json(req,{ok:true,mode:'deterministic',config:{greeting_text:cfg.greeting_text,composer_enabled:cfg.composer_enabled,media_input_enabled:cfg.media_input_enabled},session:{id:session.id,current_view:session.current_view,state:session.metadata?.state||'MENU',entry_intent:session.metadata?.entry_intent||null,entry_message:session.metadata?.entry_message||null,entry_source:session.metadata?.entry_source||null,expires_at:session.expires_at},customer:customer?{id:customer.id,name:customer.name,phone:customer.primary_whatsapp_e164,preferred_reply:customer.preferred_reply}:null,baskets:baskets||[],cart:await cart(),messages:await messages()});
  }

  if(action==='messages')return json(req,{ok:true,messages:await messages()});
  if(action==='baskets'){
    const {data,error}=await sb.from('basket_templates').select('id,name,description,image_url,base_price,sort_order').eq('is_active',true).order('sort_order').order('name').limit(30);
    if(error)return json(req,{ok:false,error:'baskets_failed'},400);await logTrigger('VIEW_BASKETS','VIEWING_BASKETS');return json(req,{ok:true,baskets:data||[]});
  }
  if(action==='products'){
    const q=clean(body?.q,100).replace(/[,%()]/g,' ').trim(),category=clean(body?.category,40),offers=body?.offers===true,limit=Math.max(1,Math.min(Number(body?.limit)||18,30));
    let query=sb.from('products').select('id,name,price,image_url,brand,packaging,category,sales_category,stock,is_offer,sort_order').eq('physically_verified',true).eq('is_active',true).gt('stock',0).order('sort_order').order('name').limit(limit);
    if(category&&['mercearia','limpeza_lavanderia','higiene_beleza','casa_pet'].includes(category))query=query.eq('sales_category',category);
    if(offers)query=query.eq('is_offer',true);if(q)query=query.or(`name.ilike.%${q}%,brand.ilike.%${q}%,category.ilike.%${q}%,packaging.ilike.%${q}%`);
    const {data,error}=await query;if(error)return json(req,{ok:false,error:'products_failed',detail:error.message},400);const current=await cart(),map=new Map((current?.items||[]).map((i:any)=>[i.product_id,Number(i.quantity||0)]));await logTrigger('VIEW_PRODUCTS','VIEWING_PRODUCTS',{category,offers});return json(req,{ok:true,products:(data||[]).map((p:any)=>({...p,quantity:map.get(p.id)||0}))});
  }
  if(action==='start_basket'){
    const id=clean(body?.basket_id,80);if(!uuidOk(id))return json(req,{ok:false,error:'invalid_basket'},400);const {data,error}=await sb.rpc('room_start_basket',{p_public_token:token,p_basket_id:id});if(error)return json(req,{ok:false,error:'basket_start_failed',detail:error.message},400);const {data:items}=await sb.from('cart_items').select('product_id,source,quantity,base_quantity,commercial_delta,product:products(id,name,image_url,stock)').eq('cart_id',data.cart_id).order('created_at');await sb.from('catalog_sessions').update({current_view:'basket',last_activity_at:new Date().toISOString()}).eq('id',session.id);await logTrigger('SELECT_BASKET','VIEWING_BASKET',{basket_id:id});return json(req,{ok:true,result:data,items:items||[],cart:await cart()});
  }
  if(action==='set_quantity'){
    const id=clean(body?.product_id,80),n=qty(body?.quantity);if(!uuidOk(id)||n===null)return json(req,{ok:false,error:'invalid_quantity'},400);const {data,error}=await sb.rpc('room_set_product_quantity',{p_public_token:token,p_product_id:id,p_quantity:n});if(error)return json(req,{ok:false,error:'quantity_failed',detail:error.message},400);await logTrigger('SET_PRODUCT_QUANTITY','VIEWING_PRODUCTS',{product_id:id,quantity:n});return json(req,{ok:true,...data,cart:await cart()});
  }
  if(action==='set_basket_quantity'){
    const id=clean(body?.product_id,80),n=qty(body?.quantity);if(!uuidOk(id)||n===null)return json(req,{ok:false,error:'invalid_quantity'},400);const {data,error}=await sb.rpc('room_set_basket_quantity',{p_public_token:token,p_product_id:id,p_quantity:n});if(error)return json(req,{ok:false,error:'basket_quantity_failed',detail:error.message},400);await logTrigger('SET_BASKET_QUANTITY','VIEWING_BASKET',{product_id:id,quantity:n});return json(req,{ok:true,cart:await cart()});
  }
  if(action==='checkout_preview'){
    const {data,error}=await sb.rpc('deterministic_chat_checkout_preview_v1',{p_public_token:token});if(error)return json(req,{ok:false,error:'checkout_failed',detail:error.message},400);await logTrigger('START_CHECKOUT','CHECKOUT');return json(req,{ok:true,checkout:data,payment_method:session.metadata?.payment_method||null});
  }
  if(action==='identify'){
    const {data,error}=await sb.rpc('deterministic_chat_identify_customer_v1',{p_public_token:token,p_name:clean(body?.name,120),p_phone:clean(body?.phone,40)});if(error)return json(req,{ok:false,error:'identify_failed',detail:error.message},400);return json(req,{ok:true,customer:data});
  }
  if(action==='save_address'){
    const address=body?.delivery_address&&typeof body.delivery_address==='object'?body.delivery_address:{};const locator=body?.delivery_locator&&typeof body.delivery_locator==='object'?body.delivery_locator:null;const enriched={...address,...(locator?.latitude!=null?{latitude:locator.latitude}:{}),...(locator?.longitude!=null?{longitude:locator.longitude}:{}),...(locator?.google_maps_url?{google_maps_url:locator.google_maps_url}:mapsUrl(locator?.latitude,locator?.longitude)?{google_maps_url:mapsUrl(locator?.latitude,locator?.longitude)}:{})};const {data,error}=await sb.rpc('deterministic_chat_save_address_v1',{p_public_token:token,p_address:enriched});if(error)return json(req,{ok:false,error:'address_failed',detail:error.message},400);return json(req,{ok:true,address:data});
  }
  if(action==='set_payment'){
    const method=clean(body?.payment_method,30);if(!PAYMENT.has(method))return json(req,{ok:false,error:'invalid_payment_method'},400);await sb.from('catalog_sessions').update({metadata:{...(session.metadata||{}),payment_method:method,state:'CHECKOUT'},last_activity_at:new Date().toISOString()}).eq('id',session.id);await logTrigger('SET_PAYMENT','CHECKOUT',{payment_method:method});return json(req,{ok:true,payment_method:method});
  }
  if(action==='preferences'){
    const {data,error}=await sb.rpc('room_save_customer_preferences',{p_public_token:token,p_day:body?.birthday_day??null,p_month:body?.birthday_month??null,p_marketing_opt_in:typeof body?.marketing_opt_in==='boolean'?body.marketing_opt_in:null});if(error)return json(req,{ok:false,error:'preferences_failed',detail:error.message},400);return json(req,{ok:true,preferences:data});
  }
  if(action==='confirm_order'){
    const method=clean(body?.payment_method||session.metadata?.payment_method,30);if(!PAYMENT.has(method))return json(req,{ok:false,error:'payment_method_required'},400);const address=body?.delivery_address&&typeof body.delivery_address==='object'?body.delivery_address:{};const locator=body?.delivery_locator&&typeof body.delivery_locator==='object'?body.delivery_locator:null;const finalAddress={...address,...(locator?.latitude!=null?{latitude:locator.latitude}:{}),...(locator?.longitude!=null?{longitude:locator.longitude}:{}),...(locator?.google_maps_url?{google_maps_url:locator.google_maps_url}:mapsUrl(locator?.latitude,locator?.longitude)?{google_maps_url:mapsUrl(locator?.latitude,locator?.longitude)}:{})};const {data,error}=await sb.rpc('deterministic_chat_confirm_order_v1',{p_public_token:token,p_delivery_address:finalAddress,p_payment_method:method});if(error)return json(req,{ok:false,error:'confirm_failed',detail:error.message},400);return json(req,{ok:true,order:data,payment_method:method});
  }
  if(action==='send_text'){
    const message=clean(body?.message,800);if(!message)return json(req,{ok:false,error:'message_required'},400);if(!session.conversation_id)return json(req,{ok:false,error:'conversation_missing'},400);const {data:inbound,error}=await sb.from('messages').insert({conversation_id:session.conversation_id,direction:'inbound',message_type:'text',body_text:message,raw_event:{source:'deterministic_chat',surface:'web_chat',session_id:session.id}}).select('id').single();if(error)return json(req,{ok:false,error:'message_save_failed'},500);const ui=routeDeterministicText(message);let reply:string|null=null;if(ui.type==='payment')reply=cfg.payment_text;else if(ui.type==='delivery')reply=cfg.delivery_text;else if(ui.type==='menu')reply=cfg.unknown_text;else if(ui.type==='human'){reply=cfg.human_text;await sb.rpc('queue_human_handoff_v1',{p_conversation_id:session.conversation_id,p_reason:'web_chat_customer_request',p_source_message_id:inbound.id,p_priority:2,p_summary:'Cliente pediu atendimento humano no chat próprio.',p_context:{source:'deterministic_chat'}})}await logTrigger(`TEXT_${String(ui.type).toUpperCase()}`,ui.state,{message_id:inbound.id});if(reply){await sb.from('messages').insert({conversation_id:session.conversation_id,direction:'outbound',message_type:'text',body_text:reply,raw_event:{source:'deterministic_chat',surface:'web_chat',trigger:ui.type}})}return json(req,{ok:true,reply,ui,message_id:inbound.id,deterministic:true});
  }
  if(action==='human_handoff'){
    const {data,error}=await sb.rpc('queue_human_handoff_v1',{p_conversation_id:session.conversation_id,p_reason:'web_chat_customer_request',p_source_message_id:null,p_priority:2,p_summary:'Cliente pediu atendimento humano no chat próprio.',p_context:{source:'deterministic_chat'}});if(error)return json(req,{ok:false,error:'handoff_failed',detail:error.message},400);await logTrigger('HUMAN_REQUESTED','HUMAN_SERVICE');return json(req,{ok:true,handoff_id:data,reply:cfg.human_text});
  }
  if(action==='upload_media')return json(req,{ok:false,error:'media_disabled_in_deterministic_chat'},409);
  return json(req,{ok:false,error:'unknown_action'},400);
});
