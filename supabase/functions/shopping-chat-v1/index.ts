import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const cors=(req:Request)=>{const o=req.headers.get('origin');if(o&&!ORIGINS.has(o))return null;return {'Access-Control-Allow-Origin':o||'https://donaantonia.com.br','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...(cors(req)||{}),'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v:unknown,max=1000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const digits=(v:unknown)=>String(v??'').replace(/\D/g,'');
const tokenOk=(v:unknown)=>/^[a-f0-9]{64}$/i.test(clean(v,80));
const uuidOk=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));
const qty=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(999,n)):null};
const norm=(v:unknown)=>clean(v,500).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const PAYMENT=new Set(['pix','credit_card','meal_card','cash']);
const MIME={audio:new Set(['audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/aac']),image:new Set(['image/jpeg','image/png','image/webp'])};
const EXT:Record<string,string>={'audio/webm':'webm','audio/ogg':'ogg','audio/mpeg':'mp3','audio/mp4':'m4a','audio/aac':'aac','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};

function simpleIntent(input:string){
  const s=norm(input);
  if(/\b(finalizar|fechar|concluir|confirmar pedido|terminar compra)\b/.test(s))return {type:'checkout'};
  if(/\b(cesta|cestas|cesta basica|cestas basicas)\b/.test(s))return {type:'baskets'};
  if(/\b(oferta|ofertas|promocao|promocoes)\b/.test(s))return {type:'products',offers:true};
  if(/\b(limpeza|lavanderia|sabao|amaciante|desinfetante)\b/.test(s))return {type:'products',category:'limpeza_lavanderia'};
  if(/\b(higiene|beleza|shampoo|sabonete|desodorante|creme)\b/.test(s))return {type:'products',category:'higiene_beleza'};
  if(/\b(pet|cachorro|gato|vassoura|rodo|balde)\b/.test(s))return {type:'products',category:'casa_pet'};
  if(/\b(mercearia|arroz|feijao|cafe|macarrao|molho|tempero)\b/.test(s))return {type:'products',category:'mercearia'};
  return {type:'ai'};
}

Deno.serve(async(req:Request)=>{
  const ch=cors(req);if(!ch)return new Response('forbidden',{status:403});
  if(req.method==='OPTIONS')return new Response('ok',{headers:ch});
  if(req.method!=='POST')return json(req,{ok:false,error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return json(req,{ok:false,error:'server_config'},500);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});

  const ct=req.headers.get('content-type')||'';let body:any={},file:File|null=null;
  if(ct.includes('multipart/form-data')){try{const f=await req.formData();body={action:f.get('action'),token:f.get('token'),kind:f.get('kind'),duration_ms:f.get('duration_ms')};const x=f.get('file');if(x instanceof File)file=x}catch{return json(req,{ok:false,error:'invalid_form'},400)}}
  else{try{body=await req.json()}catch{return json(req,{ok:false,error:'invalid_json'},400)}}
  const action=clean(body?.action||'open',60).toLowerCase();

  if(action==='create_web_room'){
    const {data,error}=await sb.rpc('room_start_web_session');
    if(error)return json(req,{ok:false,error:'room_create_failed',detail:error.message},400);
    return json(req,{ok:true,...data,room_url:`https://donaantonia.com.br/comprar/?s=${data.token}`});
  }

  const token=clean(body?.token,80);if(!tokenOk(token))return json(req,{ok:false,error:'invalid_token'},400);
  const {data:session,error:se}=await sb.from('catalog_sessions').select('id,public_token,customer_id,conversation_id,cart_id,status,expires_at,created_at,current_view,metadata,completed_at').eq('public_token',token).maybeSingle();
  if(se)return json(req,{ok:false,error:'room_lookup_failed'},500);if(!session)return json(req,{ok:false,error:'room_not_found'},404);
  if(new Date(session.expires_at).getTime()<=Date.now()&&session.status!=='closed')return json(req,{ok:false,error:'room_expired'},410);
  if(session.status==='closed'&&!['open','messages'].includes(action))return json(req,{ok:false,error:'room_closed'},409);

  const cart=async()=>{const {data:s}=await sb.from('catalog_sessions').select('cart_id').eq('id',session.id).single();if(!s?.cart_id)return null;const {data:c}=await sb.from('carts').select('id,status,total,fiscal_subtotal,other_expenses,discount,version,basket_id').eq('id',s.cart_id).maybeSingle();if(!c)return null;const {data:items}=await sb.from('cart_items').select('product_id,source,quantity,base_quantity,commercial_delta,product:products(id,name,price,image_url,brand,packaging,category)').eq('cart_id',c.id).gt('quantity',0).order('created_at');return {...c,items:items||[]}};
  const messages=async()=>{if(!session.conversation_id)return [];const {data}=await sb.from('messages').select('id,direction,message_type,body_text,transcript,ai_interpretation,created_at,raw_event').eq('conversation_id',session.conversation_id).gte('created_at',session.created_at).in('message_type',['text','audio','image','system']).order('created_at',{ascending:true}).limit(40);return (data||[]).map((m:any)=>({id:m.id,direction:m.direction,message_type:m.message_type,body_text:m.body_text,transcript:m.transcript,created_at:m.created_at,ui:m.ai_interpretation?.ui||null,source:m.raw_event?.source||null}))};

  if(action==='open'){
    await sb.from('catalog_sessions').update({last_opened_at:new Date().toISOString(),last_activity_at:new Date().toISOString(),experience:'shopping_room'}).eq('id',session.id);
    let customer:any=null;if(session.customer_id){const {data:c}=await sb.from('customers').select('id,name,primary_whatsapp_e164,cpf_cnpj,bling_contact_id,preferred_reply').eq('id',session.customer_id).maybeSingle();customer=c||null}
    const {data:baskets}=await sb.from('basket_templates').select('id,name,description,image_url,base_price,sort_order').eq('is_active',true).eq('is_whatsapp_active',true).order('sort_order').limit(12);
    return json(req,{ok:true,session:{id:session.id,current_view:session.current_view,entry_intent:session.metadata?.entry_intent||null,entry_message:session.metadata?.entry_message||null,entry_source:session.metadata?.entry_source||null,expires_at:session.expires_at},customer:customer?{id:customer.id,name:customer.name,phone:customer.primary_whatsapp_e164,has_document:!!digits(customer.cpf_cnpj),has_bling_contact:!!customer.bling_contact_id,preferred_reply:customer.preferred_reply}:null,baskets:baskets||[],cart:await cart(),messages:await messages()});
  }

  if(action==='messages')return json(req,{ok:true,messages:await messages()});

  if(action==='baskets'){
    const {data,error}=await sb.from('basket_templates').select('id,name,description,image_url,base_price,sort_order').eq('is_active',true).eq('is_whatsapp_active',true).order('sort_order').limit(20);
    if(error)return json(req,{ok:false,error:'baskets_failed'},400);return json(req,{ok:true,baskets:data||[]});
  }

  if(action==='products'){
    const q=clean(body?.q,100).replace(/[,%()]/g,' ').trim(),category=clean(body?.category,40),offers=body?.offers===true,limit=Math.max(1,Math.min(Number(body?.limit)||18,30));
    let query=sb.from('products').select('id,name,price,image_url,brand,packaging,category,sales_category,stock,is_offer,sort_order').eq('physically_verified',true).eq('is_active',true).eq('is_whatsapp_active',true).gt('stock',0).order('sort_order').order('name').limit(limit);
    if(category&&['mercearia','limpeza_lavanderia','higiene_beleza','casa_pet'].includes(category))query=query.eq('sales_category',category);
    if(offers)query=query.eq('is_offer',true);
    if(q)query=query.or(`name.ilike.%${q}%,brand.ilike.%${q}%,category.ilike.%${q}%,packaging.ilike.%${q}%`);
    const {data,error}=await query;if(error)return json(req,{ok:false,error:'products_failed',detail:error.message},400);
    const current=await cart(),map=new Map((current?.items||[]).map((i:any)=>[i.product_id,Number(i.quantity||0)]));
    return json(req,{ok:true,products:(data||[]).map((p:any)=>({...p,quantity:map.get(p.id)||0}))});
  }

  if(action==='start_basket'){
    const id=clean(body?.basket_id,80);if(!uuidOk(id))return json(req,{ok:false,error:'invalid_basket'},400);
    const {data,error}=await sb.rpc('room_start_basket',{p_public_token:token,p_basket_id:id});if(error)return json(req,{ok:false,error:'basket_start_failed',detail:error.message},400);
    const {data:items}=await sb.from('cart_items').select('product_id,source,quantity,base_quantity,commercial_delta,product:products(id,name,image_url,stock)').eq('cart_id',data.cart_id).order('created_at');
    await sb.from('catalog_sessions').update({current_view:'basket',last_activity_at:new Date().toISOString()}).eq('id',session.id);
    return json(req,{ok:true,result:data,items:items||[],cart:await cart()});
  }

  if(action==='set_quantity'){
    const id=clean(body?.product_id,80),n=qty(body?.quantity);if(!uuidOk(id)||n===null)return json(req,{ok:false,error:'invalid_quantity'},400);
    const {data,error}=await sb.rpc('room_set_product_quantity',{p_public_token:token,p_product_id:id,p_quantity:n});if(error)return json(req,{ok:false,error:'quantity_failed',detail:error.message},400);return json(req,{ok:true,...data,cart:await cart()});
  }

  if(action==='set_basket_quantity'){
    const id=clean(body?.product_id,80),n=qty(body?.quantity);if(!uuidOk(id)||n===null)return json(req,{ok:false,error:'invalid_quantity'},400);
    const {data,error}=await sb.rpc('room_set_basket_quantity',{p_public_token:token,p_product_id:id,p_quantity:n});if(error)return json(req,{ok:false,error:'basket_quantity_failed',detail:error.message},400);return json(req,{ok:true,cart:await cart()});
  }

  if(action==='checkout_preview'){
    const {data,error}=await sb.rpc('room_checkout_preview',{p_public_token:token});if(error)return json(req,{ok:false,error:'checkout_failed',detail:error.message},400);
    return json(req,{ok:true,checkout:data,payment_method:session.metadata?.payment_method||null});
  }

  if(action==='identify'){
    const {data,error}=await sb.rpc('room_identify_customer',{p_public_token:token,p_name:clean(body?.name,120),p_phone:clean(body?.phone,40),p_document:clean(body?.document,30)||null});if(error)return json(req,{ok:false,error:'identify_failed',detail:error.message},400);return json(req,{ok:true,customer:data});
  }

  if(action==='save_address'){
    const address=body?.delivery_address&&typeof body.delivery_address==='object'?body.delivery_address:{};const {data,error}=await sb.rpc('room_save_address',{p_public_token:token,p_address:address});if(error)return json(req,{ok:false,error:'address_failed',detail:error.message},400);return json(req,{ok:true,address:data});
  }

  if(action==='set_payment'){
    const method=clean(body?.payment_method,30);if(!PAYMENT.has(method))return json(req,{ok:false,error:'invalid_payment_method'},400);
    await sb.from('catalog_sessions').update({metadata:{...(session.metadata||{}),payment_method:method},last_activity_at:new Date().toISOString()}).eq('id',session.id);
    if(session.conversation_id)await sb.from('whatsapp_sales_state').upsert({conversation_id:session.conversation_id,pending_payment_method:method,updated_at:new Date().toISOString()},{onConflict:'conversation_id'});
    return json(req,{ok:true,payment_method:method});
  }

  if(action==='preferences'){
    const {data,error}=await sb.rpc('room_save_customer_preferences',{p_public_token:token,p_day:body?.birthday_day??null,p_month:body?.birthday_month??null,p_marketing_opt_in:typeof body?.marketing_opt_in==='boolean'?body.marketing_opt_in:null});if(error)return json(req,{ok:false,error:'preferences_failed',detail:error.message},400);return json(req,{ok:true,preferences:data});
  }

  if(action==='confirm_order'){
    const method=clean(body?.payment_method||session.metadata?.payment_method,30);if(!PAYMENT.has(method))return json(req,{ok:false,error:'payment_method_required'},400);
    const address=body?.delivery_address&&typeof body.delivery_address==='object'?body.delivery_address:{};
    const locator=body?.delivery_locator&&typeof body.delivery_locator==='object'?body.delivery_locator:null;
    const finalAddress=locator?{...address,locator}:address;
    const {data,error}=await sb.rpc('room_confirm_order',{p_public_token:token,p_delivery_address:finalAddress});if(error)return json(req,{ok:false,error:'confirm_failed',detail:error.message},400);
    if(data?.order_id)await sb.from('orders').update({payment_method:method,updated_at:new Date().toISOString()}).eq('id',data.order_id);
    await sb.from('catalog_sessions').update({metadata:{...(session.metadata||{}),payment_method:method,light_chat_completed:true},last_activity_at:new Date().toISOString()}).eq('id',session.id);
    return json(req,{ok:true,order:data,payment_method:method});
  }

  if(action==='send_text'){
    const message=clean(body?.message,800);if(!message)return json(req,{ok:false,error:'message_required'},400);
    if(!session.conversation_id)return json(req,{ok:false,error:'conversation_missing'},400);
    const {data:inbound,error}=await sb.from('messages').insert({conversation_id:session.conversation_id,direction:'inbound',message_type:'text',body_text:message,raw_event:{source:'shopping_room',surface:'light_chat',session_id:session.id}}).select('id').single();if(error)return json(req,{ok:false,error:'message_save_failed'},500);
    const intent=simpleIntent(message);
    if(intent.type!=='ai')return json(req,{ok:true,reply:null,ui:intent,message_id:inbound.id});
    const {data:cfg}=await sb.from('automation_config').select('automation_enabled,ai_enabled,conversation_worker_enabled').eq('id',1).maybeSingle();
    if(cfg?.automation_enabled&&cfg?.ai_enabled&&cfg?.conversation_worker_enabled){const {data:job,error:qe}=await sb.rpc('queue_ai_job_for_message',{p_message_id:inbound.id,p_job_type:'conversation',p_input:{source:'shopping_room',surface:'light_chat'}});if(qe)return json(req,{ok:false,error:'message_queue_failed',detail:qe.message},500);return json(req,{ok:true,reply:null,ui:{type:'none'},ai_job:job,message_id:inbound.id});}
    return json(req,{ok:true,reply:'Me diga o produto ou a cesta que você procura.',ui:{type:'none'},message_id:inbound.id});
  }

  if(action==='upload_media'){
    if(!file)return json(req,{ok:false,error:'file_required'},400);const kind=clean(body?.kind,20);if(kind!=='audio'&&kind!=='image')return json(req,{ok:false,error:'invalid_media_kind'},400);
    const mime=file.type.split(';')[0].trim().toLowerCase();if(!MIME[kind as 'audio'|'image'].has(mime))return json(req,{ok:false,error:'unsupported_media_type'},415);if(file.size<=0||file.size>8*1024*1024)return json(req,{ok:false,error:'media_too_large'},413);
    const path=`sessions/${session.id}/${kind}/${new Date().toISOString().slice(0,7)}/${crypto.randomUUID()}.${EXT[mime]||'bin'}`;
    const {error:up}=await sb.storage.from('shopping-room-media').upload(path,file,{contentType:mime,upsert:false});if(up)return json(req,{ok:false,error:'media_upload_failed',detail:up.message},400);
    const {data:msg,error:me}=await sb.from('messages').insert({conversation_id:session.conversation_id,direction:'inbound',message_type:kind,media_id:path,raw_event:{source:'shopping_room',surface:'light_chat',session_id:session.id,mime_type:mime,size:file.size}}).select('id,direction,message_type,created_at').single();if(me)return json(req,{ok:false,error:'media_message_failed'},400);
    const duration=Math.max(0,Math.min(Number(body?.duration_ms)||0,10*60*1000))||null;const {data:rm,error:re}=await sb.from('room_media').insert({catalog_session_id:session.id,conversation_id:session.conversation_id,customer_id:session.customer_id,message_id:msg.id,kind,bucket:'shopping-room-media',object_path:path,mime_type:mime,bytes:file.size,duration_ms:duration,processing_status:'uploaded'}).select('id').single();if(re)return json(req,{ok:false,error:'media_record_failed'},400);
    const {data:job}=await sb.rpc('queue_ai_job_for_message',{p_message_id:msg.id,p_job_type:kind==='audio'?'transcription':'vision',p_input:{room_media_id:rm.id,object_path:path,mime_type:mime,source:'shopping_room',surface:'light_chat'}});await sb.from('room_media').update({processing_status:job?.status==='pending'?'queued':'held'}).eq('id',rm.id);
    return json(req,{ok:true,message:msg,ai_job:job||null});
  }

  return json(req,{ok:false,error:'unknown_action'},400);
});
