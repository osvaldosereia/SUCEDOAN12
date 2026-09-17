import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';

const MODEL='gpt-image-2.5-sunburst',IMAGE_URL='https://api.openai.com/v1/images/edits',BUCKET='creative-storyboards';
const PRICE={textInputPerM:5,imageInputPerM:8,imageOutputPerM:30,checkedAt:'2026-09-16'};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
const clean=(v:any,n=8000)=>String(v??'').trim().slice(0,n);
function b64bytes(s:string){const r=atob(s),a=new Uint8Array(r.length);for(let i=0;i<r.length;i++)a[i]=r.charCodeAt(i);return a}
function usageCost(u:any){if(!u)return null;const textIn=Number(u?.input_tokens_details?.text_tokens||0),imageIn=Number(u?.input_tokens_details?.image_tokens||0),imageOut=Number(u?.output_tokens_details?.image_tokens||u?.output_tokens||0);return Number((((textIn*PRICE.textInputPerM)+(imageIn*PRICE.imageInputPerM)+(imageOut*PRICE.imageOutputPerM))/1_000_000).toFixed(6))}
async function fetchImage(url:string){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`reference_http_${r.status}`);return{bytes:new Uint8Array(await r.arrayBuffer()),type:(r.headers.get('content-type')||'image/webp').split(';')[0]}}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('',{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type'}});
  if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);

  let key=Deno.env.get('OPENAI_API_KEY')||'';
  const url=Deno.env.get('SUPABASE_URL')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!service)return json({ok:false,error:'server_config'},500);
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)return json({ok:false,error:'missing_token'},401);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  if(!key){const{data:vaultKey,error:vaultError}=await sb.rpc('get_conversation_worker_provider_secret_v1');if(!vaultError&&typeof vaultKey==='string')key=vaultKey}
  if(!key)return json({ok:false,error:'openai_key_missing'},500);
  const{data:ud,error:ue}=await sb.auth.getUser(token);
  if(ue||!ud?.user?.id)return json({ok:false,error:'invalid_user'},401);
  const{data:admin,error:ae}=await sb.from('admin_users').select('role,is_active').eq('user_id',ud.user.id).maybeSingle();
  if(ae)return json({ok:false,error:'admin_lookup_failed'},500);
  if(!admin?.is_active||!['owner','operator'].includes(admin.role))return json({ok:false,error:'admin_not_authorized'},403);

  let b:any={};try{b=await req.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  const second=Number(b.second_mark);
  if(!b.project_id||!Number.isFinite(second)||second<0||second%10!==0||!b.visual_prompt)return json({ok:false,error:'invalid_request'},400);

  let previousApproved:string|null=null;
  if(second>0){
    const[prev,proj]=await Promise.all([
      sb.from('creative_storyboard_keyframes').select('approved_image_url,status').eq('project_id',b.project_id).eq('second_mark',second-10).maybeSingle(),
      sb.from('creative_video_projects').select('creative_plan').eq('id',b.project_id).single()
    ]);
    if(!prev.data?.approved_image_url||prev.data?.status!=='approved')return json({ok:false,error:'previous_image_required'},409);
    if(!proj.data?.creative_plan?.visual_bible?.locked)return json({ok:false,error:'visual_identity_required'},409);
    previousApproved=prev.data.approved_image_url;
  }

  const current=await sb.from('creative_storyboard_keyframes').select('id,status,updated_at').eq('project_id',b.project_id).eq('second_mark',second).maybeSingle();
  if(current.error)return json({ok:false,error:'frame_lookup_failed',detail:current.error.message},500);
  if(!current.data)return json({ok:false,error:'frame_not_found'},404);
  const state=String(current.data.status||'planned'),lockAge=Date.now()-new Date(current.data.updated_at||0).getTime(),staleGenerating=state==='generating'&&lockAge>5*60*1000;
  if(state==='review'||state==='ready')return json({ok:false,error:'frame_in_review'},409);
  if(state==='approved')return json({ok:false,error:'frame_already_approved'},409);
  if(state==='generating'&&!staleGenerating)return json({ok:false,error:'generation_in_progress'},409);
  if(!['planned','stale','error','generating'].includes(state))return json({ok:false,error:'generation_state_invalid',detail:state},409);

  const now=new Date().toISOString();
  let claim:any=sb.from('creative_storyboard_keyframes').update({status:'generating',updated_at:now}).eq('id',current.data.id).eq('status',state);
  if(state==='generating')claim=claim.eq('updated_at',current.data.updated_at);
  const claimed=await claim.select('id').maybeSingle();
  if(claimed.error)return json({ok:false,error:'generation_claim_failed',detail:claimed.error.message},500);
  if(!claimed.data)return json({ok:false,error:'generation_in_progress'},409);
  const fail=async(stage:string,status=502,detail?:string)=>{await sb.from('creative_storyboard_keyframes').update({status:'error',updated_at:new Date().toISOString()}).eq('id',current.data.id);return json({ok:false,error:'generation_failed',stage,detail},status)};

  try{
    const refs:string[]=[];
    if(previousApproved)refs.push(previousApproved);
    for(const x of(Array.isArray(b.product_images)?b.product_images:[]))if(x&&!refs.includes(x))refs.push(x);
    const role=clean(b.image_role||'progression',80);
    const prompt=`Crie UMA imagem-chave vertical para um vídeo social em stop motion artesanal, visualmente sofisticada e não fotorrealista.\n\nSTYLE LOCK\nMantenha exatamente o universo visual definido na Bíblia Visual: material artesanal, personagem, roupa, cenário, paleta, iluminação, escala, textura e linguagem de câmera. A imagem deve parecer parte da mesma produção, não uma nova campanha.\n\nPRODUCT LOCK\nAs referências do produto são autoridade absoluta para embalagem. Preserve formato, proporções, tampa, cores, rótulo, logotipo, nome, tipografia principal, ilustrações, selos e distribuição gráfica. Não invente versão, não redesenhe rótulo, não altere marca e não substitua o produto por algo parecido.\n\nCONTINUITY\n${previousApproved?'A PRIMEIRA referência é a imagem-chave anterior APROVADA. Preserve personagem, roupa, cenário, direção espacial, escala, iluminação e lógica de composição. Avance a história de forma clara sem dar sensação de outro vídeo.':'Esta é a primeira imagem-chave. Defina com clareza a identidade visual que será mantida nas próximas imagens.'}\nBíblia Visual: ${JSON.stringify(b.continuity_lock||{})}\n\nIMAGE ROLE\nPapel narrativo: ${role}. Objetivo desta imagem: ${clean(b.visual_prompt)}. Ela deve funcionar como uma âncora visual forte para o Gemini/Veo animar até a próxima imagem-chave.\n\nNEGATIVE CONSTRAINTS\nNão criar texto aleatório; não alterar embalagem, logo ou marca; não duplicar/deformar produto; não trocar personagem; não mudar roupa ou cenário sem motivo narrativo; não fazer morphing; não transformar em fotografia real; não inserir objetos sem função; não quebrar a continuidade; não cortar o produto de forma acidental. Composição limpa, hierarquia visual clara e produto integrado naturalmente.`;

    const form=new FormData();
    form.append('model',MODEL);form.append('quality','low');form.append('size','1024x1536');form.append('output_format','webp');form.append('output_compression','80');form.append('background','opaque');form.append('prompt',prompt);
    let i=0;for(const ref of refs.slice(0,4)){const im=await fetchImage(ref),ext=im.type.includes('png')?'png':im.type.includes('jpeg')?'jpg':'webp';form.append('image[]',new Blob([im.bytes],{type:im.type}),`${i===0&&previousApproved?'previous-approved':'product'}-${i++}.${ext}`)}
    const r=await fetch(IMAGE_URL,{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(120000)});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)return await fail('image_provider_error',502,data?.error?.message||`HTTP ${r.status}`);
    const raw=clean(data?.data?.[0]?.b64_json,30000000);if(!raw)return await fail('image_empty',502);
    const cost=usageCost(data.usage),providerUsage={...(data.usage||{}),estimated_cost_usd:cost,pricing:PRICE,image_role:role,image_index:Number(b.image_index||0)||null};
    const bytes=b64bytes(raw),path=`${b.project_id}/${String(second).padStart(3,'0')}s-${Date.now()}.webp`;
    const up=await sb.storage.from(BUCKET).upload(path,bytes,{contentType:'image/webp',cacheControl:'31536000',upsert:false});
    if(up.error)return await fail('storage_error',500,up.error.message);
    const publicUrl=sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const event=await sb.from('creative_storyboard_generation_events').insert({project_id:b.project_id,second_mark:second,model:MODEL,quality:'low',image_url:publicUrl,provider_usage:providerUsage,estimated_cost_usd:cost}).select().single();
    const saved=await sb.from('creative_storyboard_keyframes').update({visual_prompt:clean(b.visual_prompt),continuity_lock:b.continuity_lock||{},image_path:path,image_url:publicUrl,candidate_image_url:publicUrl,approved_image_url:null,status:'review',provider_usage:providerUsage,actual_cost_brl:0,updated_at:new Date().toISOString()}).eq('id',current.data.id).select().single();
    if(saved.error)return await fail('persist_error',500,saved.error.message);
    return json({ok:true,keyframe:saved.data,generation_event:event.data||null,model:MODEL,quality:'low',size:'1024x1536',reference_source:previousApproved?'previous_approved_image':'product_only',estimated_cost_usd:cost});
  }catch(e){return await fail('unexpected_error',502,e instanceof Error?e.message:String(e))}
});
