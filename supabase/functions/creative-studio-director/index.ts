import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {CREATIVE_STUDIO_MODEL,creativePlanSchema,buildDirectorInstructions,buildDirectorInput} from './prompt.ts';
import {extractOutputText} from './response.mjs';

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
  if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!serviceKey)return json({ok:false,error:'server_config'},500);
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)return json({ok:false,error:'missing_token'},401);
  const sb=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  let caller='authenticated_admin';
  if(token===serviceKey){
    caller='internal_service_role';
  }else{
    const {data:userData}=await sb.auth.getUser(token);
    if(!userData?.user?.id)return json({ok:false,error:'invalid_user'},401);
    const {data:admin}=await sb.from('admin_users').select('role,is_active').eq('user_id',userData.user.id).maybeSingle();
    if(!admin?.is_active||!['owner','operator'].includes(admin.role))return json({ok:false,error:'admin_not_authorized'},403);
  }
  let body:any;try{body=await req.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  if(!body?.product?.name)return json({ok:false,error:'product_required'},400);
  let key=Deno.env.get('OPENAI_API_KEY')||'';
  if(!key){
    const {data:vaultKey,error:vaultError}=await sb.rpc('get_conversation_worker_provider_secret_v1');
    if(!vaultError&&typeof vaultKey==='string')key=vaultKey;
  }
  if(!key)return json({ok:false,error:'openai_not_configured'},503);
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:CREATIVE_STUDIO_MODEL,instructions:buildDirectorInstructions(),input:buildDirectorInput(body),text:{format:{type:'json_schema',name:'creative_plan',strict:true,schema:creativePlanSchema}},max_output_tokens:2200})});
  if(!response.ok)return json({ok:false,error:'director_provider_failed',status:response.status},502);
  const data=await response.json();
  const output=clean(extractOutputText(data),20000);let plan:any;try{plan=JSON.parse(output)}catch{return json({ok:false,error:'director_invalid_json'},502)}
  return json({ok:true,plan,provider:'openai',model:CREATIVE_STUDIO_MODEL,usage:data?.usage||null,response_id:data?.id||null,caller,auto_render:false,paid_generation:false});
});
