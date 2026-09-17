import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';

const MODEL='gpt-5.6-luna';
const URL='https://api.openai.com/v1/responses';
const DURATIONS=[10,20,30,40,50,60];
const imageCount=(d:number)=>d/10+1;
const marks=(d:number)=>Array.from({length:imageCount(d)},(_,i)=>i*10);
const packages=(d:number)=>Array.from({length:d/10},(_,i)=>({package_index:i+1,start_second:i*10,middle_second:i*10+5,end_second:i*10+10}));
const roleFor=(index:number,count:number)=>{if(index===0)return'hook';if(index===count-1)return'payoff';const r=index/(count-1);if(r<.45)return'progression';if(r<.75)return'turn';return'climax'};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
const text=(d:any)=>(d?.output||[]).flatMap((x:any)=>x?.content||[]).filter((x:any)=>x.type==='output_text').map((x:any)=>x.text||'').join('').trim();

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('',{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type'}});
  if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);

  let key=Deno.env.get('OPENAI_API_KEY')||'';
  const url=Deno.env.get('SUPABASE_URL')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!service)return json({ok:false,error:'server_config'},500);
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)return json({ok:false,error:'missing_token'},401);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  if(!key){const{data:v}=await sb.rpc('get_conversation_worker_provider_secret_v1');if(typeof v==='string')key=v}
  if(!key)return json({ok:false,error:'openai_key_missing'},500);
  const{data:ud,error:ue}=await sb.auth.getUser(token);
  if(ue||!ud?.user?.id)return json({ok:false,error:'invalid_user'},401);
  const{data:admin}=await sb.from('admin_users').select('role,is_active').eq('user_id',ud.user.id).maybeSingle();
  if(!admin?.is_active||!['owner','operator'].includes(admin.role))return json({ok:false,error:'admin_not_authorized'},403);

  let b:any={};try{b=await req.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  const products=Array.isArray(b.products)?b.products.filter(Boolean):[];
  const mode=['full','product_only','institutional'].includes(b.production_mode)?b.production_mode:'full';
  if(mode!=='institutional'&&!products.length)return json({ok:false,error:'products_required'},400);
  const duration=DURATIONS.includes(Number(b.duration_seconds))?Number(b.duration_seconds):30;
  const audio=['auto','voiceover','music'].includes(b.audio_mode)?b.audio_mode:'auto';
  const ms=marks(duration),pk=packages(duration),count=imageCount(duration),action=b.action||'create_story';

  const veo=`Cada pacote Gemini/Veo representa EXATAMENTE 10 segundos e deve ser um documento de direção autossuficiente. Estruture obrigatoriamente o campo prompt com estes títulos, nesta ordem: REFERENCE PRIORITY; PRODUCT LOCK; STYLE LOCK; SHOT TIMELINE; CAMERA DIRECTION; AUDIO BLUEPRINT; NEGATIVE CONSTRAINTS; FINAL FRAME REQUIREMENT. REFERENCE PRIORITY: no modo full, a FOTO ORIGINAL DO PRODUTO é autoridade absoluta para produto/embalagem; as duas imagens-chave aprovadas que delimitam o bloco controlam continuidade visual. No modo product_only, somente a foto original será fornecida. No modo institutional, a imagem enviada, quando houver, é a referência principal. PRODUCT LOCK: preserve rigorosamente silhueta, dimensões aparentes, cores, tampa, embalagem, rótulo, logotipo, nome, tipografia principal, ilustrações, selos e distribuição gráfica da foto original; jamais redesenhe embalagem, marca ou textos. STYLE LOCK: fixe material artesanal, personagem, cenário, paleta, luz, escala e textura. SHOT TIMELINE: descreva a animação ao longo dos 10s, fazendo o Veo interpolar movimento contínuo entre a imagem-chave inicial e a final. CAMERA DIRECTION: enquadramento, movimento, velocidade e foco. AUDIO BLUEPRINT: ambiente, SFX, trilha e locução quando aplicável. NEGATIVE CONSTRAINTS: embalagem reinterpretada, logo/texto alterado, produto duplicado/deformado, morphing, personagens aleatórios, mudança incoerente de estilo/cenário/câmera e áudio fora de sincronia. FINAL FRAME REQUIREMENT: o quadro final deve convergir para a próxima imagem-chave aprovada quando houver. Inclua REFORÇO CRÍTICO reiterando fidelidade e continuidade.`;
  const keyImageRules=`Planeje somente ${count} IMAGENS-CHAVE para ${duration}s, exatamente nos tempos ${ms.join(', ')} segundos. Elas são âncoras do vídeo, não frames de animação. Papel narrativo esperado: primeira=hook; intermediárias=progression, turn e climax conforme necessário; última=payoff. Cada imagem precisa ter composição forte, legível em vertical 9:16 e suficientemente diferente para avançar a história, mas sem romper personagem, universo, produto ou linguagem visual. Não crie imagens redundantes.`;
  const system=`Você é Diretor Criativo sênior de Reels/TikTok e especialista em prompts para Google Gemini/Veo. Crie entretenimento antes de publicidade: gancho imediato, curiosidade, progressão causal, retenção e payoff. Prefira visual artesanal não fotorrealista quando adequado: massinha, papel, feltro, colagem, miniatura, tecido ou origami. ${keyImageRules} ${veo} Retorne JSON válido sem markdown.`;

  let task='';
  if(action==='lock_visual_identity')task=`Consolide uma visual_bible rígida a partir da primeira imagem aprovada. locked=true; master_second=${Number(b.master_second||0)}. Preserve história, keyframes e pacotes. Plano atual: ${JSON.stringify(b.plan||{})}`;
  else if(action==='revise_story')task=`Revise a história conforme comentário, preservando o que não foi pedido. Comentário: ${b.comment||''}. Plano atual: ${JSON.stringify(b.plan||{})}`;
  else if(action==='revise_storyboard')task=`Revise o plano visual e os prompts futuros conforme comentário, preservando imagens anteriores que não precisem mudar. Comentário: ${b.comment||''}. Plano atual: ${JSON.stringify(b.plan||{})}`;
  else task=`Crie internamente algumas opções e devolva a melhor por gancho, clareza, micro-história, integração natural do produto e payoff. Tema: ${b.theme||'IA decide'}. Observações: ${b.notes||'nenhuma'}. Objetivo institucional: ${b.institutional_goal||'não aplicável'}. Modo: ${mode}.`;

  const productData=products.map((p:any)=>({id:p.id,name:p.name,brand:p.brand,category:p.category,subcategory:p.subcategory,image_url:p.image_url||p.image_ai_url}));
  const user=`${task}\nProdutos: ${JSON.stringify(productData)}. Referência própria: ${b.reference_image?'será fornecida manualmente':'nenhuma'}. Duração ${duration}s; áudio ${audio}; production_mode=${mode}; skip_visual_generation=${mode!=='full'}. Retorne {concept,title,hook,emotion,craft_style,audio_mode,audio_direction,story,voiceover_script,product_integration,payoff,cta,production_mode,skip_visual_generation,continuity_bible:{characters,world,materials,palette,lighting,product_rules},visual_bible:{locked,master_second,characters,wardrobe,world,materials,palette,lighting,scale,camera_base,product_rules,negative_rules},keyframes:[{image_index,second_mark,role,beat,description,visual_prompt}],gemini_packages:[{package_index,start_second,middle_second,end_second,prompt,critical_reinforcement}]}. Exatamente ${count} keyframes nos tempos ${ms.join(',')} e ${pk.length} pacotes de 10s.`;

  const r=await fetch(URL,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,store:false,reasoning:{effort:'medium'},input:[{role:'system',content:system},{role:'user',content:user}],text:{format:{type:'json_object'}}}),signal:AbortSignal.timeout(90000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)return json({ok:false,error:'director_provider_error',detail:data?.error?.message||`HTTP ${r.status}`},502);
  let out:any;try{out=JSON.parse(text(data))}catch{return json({ok:false,error:'director_invalid_json'},502)}
  if(!Array.isArray(out.keyframes)||out.keyframes.length!==count||!Array.isArray(out.gemini_packages)||out.gemini_packages.length!==pk.length)return json({ok:false,error:'director_contract_invalid'},502);
  out.keyframes=out.keyframes.map((x:any,i:number)=>({...x,image_index:i+1,second_mark:ms[i],role:roleFor(i,count)}));
  out.gemini_packages=out.gemini_packages.map((x:any,i:number)=>({...x,...pk[i]}));
  out.production_mode=mode;
  out.skip_visual_generation=mode!=='full';
  if(!out.visual_bible)out.visual_bible={...(out.continuity_bible||{}),locked:false};
  return json({ok:true,plan:out,usage:data.usage||{},model:MODEL,duration_seconds:duration,frame_count:count,image_count:count});
});
