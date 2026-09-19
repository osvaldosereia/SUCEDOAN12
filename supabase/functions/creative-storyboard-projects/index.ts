import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type'};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const cleanSearch=(v:unknown)=>String(v??'').replace(/[,%()]/g,' ').replace(/\s+/g,' ').trim().slice(0,100);
const cleanText=(v:unknown,n=800)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
const arr=(v:unknown)=>Array.isArray(v)?v:[];
function openAiText(data:any){return arr(data?.output).flatMap((x:any)=>arr(x?.content)).filter((x:any)=>x?.type==='output_text').map((x:any)=>String(x.text||'')).join('').trim()}
function normalizeGeminiPackage(x:any,projectId:string,updatedAt?:string){
  const critical=String(x?.critical_reinforcement??'').trim();
  return {
    project_id:projectId,
    package_index:Number(x?.package_index||0),
    start_second:Number(x?.start_second||0),
    middle_second:Number(x?.middle_second||0),
    end_second:Number(x?.end_second||0),
    prompt:String(x?.prompt||''),
    critical_reinforcement:critical||null,
    ...(updatedAt?{updated_at:updatedAt}:{})
  };
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('',{headers:cors});
  if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)return json({ok:false,error:'server_config'},500);
  let b:any={};try{b=await req.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  const action=String(b.action||'');
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});

  if(action==='random_products'){

    const limit=Math.min(60,Math.max(10,Number(b.limit||30)));
    const r=await sb.from('products').select('id,sku,name,gtin,price,stock,image_url,brand,category,subcategory,packaging,is_active,is_offer').eq('is_active',true).not('image_url','is',null).neq('image_url','').limit(300);
    if(r.error)return json({ok:false,error:'products_random_failed',detail:r.error.message},400);
    const rows=(r.data||[]).filter((p:any)=>/^https?:\/\//i.test(String(p.image_url||'')));
    for(let i=rows.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[rows[i],rows[j]]=[rows[j],rows[i]]}
    return json({ok:true,products:rows.slice(0,limit),total:rows.length});
  }


  if(action==='video_search_products'){
    const q=cleanSearch(b.q),limit=Math.min(16,Math.max(1,Number(b.limit||16)));
    if(q.length<2)return json({ok:true,products:[],total:0});
    const r=await sb.from('products')
      .select('id,sku,name,gtin,price,stock,image_url,brand,category,subcategory,packaging,is_active,is_offer',{count:'exact'})
      .eq('is_active',true)
      .not('image_url','is',null)
      .neq('image_url','')
      .or(`name.ilike.%${q}%,gtin.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%,category.ilike.%${q}%,subcategory.ilike.%${q}%`)
      .order('name',{ascending:true})
      .limit(limit);
    if(r.error)return json({ok:false,error:'video_products_search_failed',detail:r.error.message},400);
    const rows=(r.data||[]).filter((p:any)=>/^https?:\/\//i.test(String(p.image_url||'')));
    return json({ok:true,products:rows,total:r.count||rows.length});
  }

  if(action==='video_generate_prompt'){
    const theme=cleanText(b.theme,100)||'variedade de produtos';
    const directions=cleanText(b.directions,800);
    const products=arr(b.products).slice(0,16).map((p:any)=>({
      name:cleanText(p?.name,140),
      brand:cleanText(p?.brand,80),
      category:cleanText(p?.category,80),
      subcategory:cleanText(p?.subcategory,80),
      packaging:cleanText(p?.packaging,80)
    })).filter((p:any)=>p.name);
    const productCount=products.length;
    if(productCount<1||productCount>16)return json({ok:false,error:'video_product_count_invalid'},400);
    const requestedCount=Number(b.product_count??productCount);
    if(!Number.isInteger(requestedCount)||requestedCount!==productCount)return json({ok:false,error:'video_product_count_mismatch',expected:requestedCount,actual:productCount},400);
    const imageCount=Math.ceil(productCount/4);
    const requestedImages=Number(b.image_count??imageCount);
    if(!Number.isInteger(requestedImages)||requestedImages!==imageCount)return json({ok:false,error:'video_image_count_mismatch',expected:requestedImages,actual:imageCount},400);
    let openaiKey=Deno.env.get('OPENAI_API_KEY')||'';
    if(!openaiKey){try{const q=await sb.rpc('get_conversation_worker_provider_secret_v1');if(typeof q.data==='string')openaiKey=q.data}catch{}}
    if(!openaiKey)return json({ok:false,error:'openai_key_missing'},500);

    const variation=Math.max(0,Math.min(9999,Number(b.variation||0)));
    const instructions=`Você é diretor criativo especialista em vídeos curtos de varejo para Instagram Reels e em prompts para Google Flow / Gemini Omni Flash 1.1.
Sua tarefa é produzir SOMENTE o prompt final do vídeo, em português, pronto para copiar no Flow.
O vídeo é sempre UM ÚNICO vídeo vertical 9:16 de EXATAMENTE 10 segundos, independentemente da quantidade de produtos.
DADOS DESTA GERAÇÃO: ${productCount} produto(s) real(is), distribuído(s) em ${imageCount} imagem(ns) de referência, com no máximo 4 produtos por imagem.
Use exatamente os produtos fornecidos. NÃO invente produtos adicionais e NÃO trate espaços vazios de uma referência como produto.
Estrutura fixa e obrigatória: 0–2s abertura; 2–10s produtos. NÃO EXISTE CTA neste vídeo.
O vídeo precisa ter INÍCIO, MEIO E FIM claramente percebidos, mesmo sendo curto.
INÍCIO — 0–2s: abertura com uma chamada curtíssima criada por você e completamente ligada ao TEMA recebido, acompanhada de um gancho visual imediato.
MEIO — aproximadamente 2–8,5s: desenvolver a ideia visual e apresentar TODOS os ${productCount} produto(s) com progressão e ritmo adaptados à quantidade real. Se houver poucos produtos, dê mais tempo, protagonismo e variação de movimento a cada um. Se houver muitos produtos, aumente a cadência e use composições em pequenos grupos para que todos apareçam. Pode reapresentar os mesmos produtos em novos enquadramentos/movimentos, mas nunca criar produtos que não estejam nas referências.
As ${imageCount} imagem(ns) anexada(s) servem somente como referências visuais dos produtos, nunca como slideshow.
FIM — aproximadamente 8,5–10s: criar um ENCERRAMENTO VISUAL NATURAL usando somente os próprios produtos. Nos últimos 1–1,5s, reduzir progressivamente o movimento e conduzir os produtos para uma composição final estável, equilibrada e coerente com o tema. O último movimento deve se completar antes do fim e a composição final estável deve permanecer visível até o frame final.
O encerramento NÃO é CTA: não incluir telefone, WhatsApp, site, preço, promoção, chamada para comprar, slogan comercial, logo ou cartela final.
NÃO use nem solicite a logo da Dona Antônia.
PROIBIDO terminar com objeto ainda em movimento, transição pela metade, corte no meio da ação ou sensação de vídeo interrompido.
Reforce de forma explícita e repetida que os produtos precisam permanecer visualmente idênticos: não alterar rótulo, texto, marca, logotipo, embalagem, formato, proporção, tampa, cor, ilustração ou qualquer detalhe. Se as fotos tiverem fundo cinza, branco ou colorido, remova somente esse fundo e preserve o produto intacto.
Áudio: SOMENTE TRILHA INSTRUMENTAL. Proibido locução, narração, voz, canto, diálogo, vocal chop, sussurro ou palavra falada. A trilha também deve ter INÍCIO, MEIO E FIM: manter o ritmo durante o desenvolvimento e fazer uma resolução musical curta nos segundos finais, sincronizada à estabilização da composição visual, terminando de forma concluída em 10,00s e nunca com corte abrupto.
O criativo inteiro — chamada, direção de arte, movimentos, paleta, elementos gráficos, ritmo e metáforas visuais — deve ser adaptado ao TEMA. Se o tema for uma marca, use os produtos da referência como verdade visual e não invente novo logotipo, slogan ou identidade da marca.
As orientações adicionais são preferências do usuário: incorpore-as quando existirem sem violar as regras fixas.
Faça um prompt forte para retenção em Reels: primeiro frame impactante, mudanças visuais frequentes, stop motion com recortes físicos, movimentos secos, snaps, saltos curtos e match cuts. Evite poluição visual. O prompt final DEVE descrever concretamente a progressão de início, meio e fim e terminar com uma composição final estável dos produtos, nunca com um corte seco ou ação interrompida.
Não enumere os nomes dos produtos no prompt final; use os metadados apenas para entender o tema e o mix.
A cada variation diferente, mude de verdade o conceito criativo, gancho, direção visual e direção musical, mantendo todas as regras fixas.`;

    const input=JSON.stringify({
      theme,
      directions:directions||null,
      variation,
      product_count:productCount,
      image_count:imageCount,
      products,
      fixed:{duration_seconds:10,opening_seconds:2,products_seconds:8,cta_seconds:0,no_cta:true,no_logo:true,narrative_arc:true,stable_product_ending:true,no_abrupt_cut:true}
    });

    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${openaiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'gpt-5.6-luna',
        store:false,
        max_output_tokens:1400,
        reasoning:{effort:'low'},
        instructions,
        input:[{role:'user',content:[{type:'input_text',text:input}]}],
        text:{verbosity:'medium'}
      }),
      signal:AbortSignal.timeout(45000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return json({ok:false,error:'video_prompt_ai_failed',detail:cleanText(data?.error?.message||data?.error?.code||('http_'+response.status),240)},502);
    const prompt=openAiText(data);
    if(!prompt)return json({ok:false,error:'video_prompt_empty'},502);
    return json({ok:true,prompt,creative_label:`Tema: ${theme} · ${productCount} produto${productCount===1?'':'s'}`,model:'gpt-5.6-luna',product_count:productCount,image_count:imageCount});
  }

  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)return json({ok:false,error:'missing_token'},401);
  const{data:ud,error:ue}=await sb.auth.getUser(token);
  if(ue||!ud?.user?.id)return json({ok:false,error:'invalid_user'},401);
  const{data:admin,error:ae}=await sb.from('admin_users').select('role,is_active').eq('user_id',ud.user.id).maybeSingle();
  if(ae)return json({ok:false,error:'admin_lookup_failed'},500);
  if(!admin?.is_active)return json({ok:false,error:'admin_not_authorized'},403);
  const canWrite=admin.role==='owner'||admin.role==='operator';
  if(!canWrite&&!['list','get','search_products'].includes(action))return json({ok:false,error:'read_only'},403);

  if(action==='search_products'){
    const q=cleanSearch(b.q),limit=Math.min(50,Math.max(5,Number(b.limit||20)));
    if(q.length<2)return json({ok:true,products:[],total:0});
    const r=await sb.from('products').select('id,sku,name,gtin,price,stock,image_url,brand,category,subcategory,packaging,is_active,is_offer',{count:'exact'}).eq('is_active',true).or(`name.ilike.%${q}%,gtin.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%`).order('name',{ascending:true}).limit(limit);
    if(r.error)return json({ok:false,error:'products_search_failed',detail:r.error.message},400);
    return json({ok:true,products:r.data||[],total:r.count||0});
  }

  if(action==='create'){
    const products=Array.isArray(b.products)?b.products:[],mode=String(b.plan?.production_mode||'full');
    if(mode!=='institutional'&&!products.length)return json({ok:false,error:'products_required'},400);
    const primary=products[0]||null;
    const ins=await sb.from('creative_video_projects').insert({product_id:primary?.id||null,product_snapshot:primary||{},briefing:b.briefing||'',creative_plan:b.plan||{},status:'draft',created_by:ud.user.id}).select().single();
    if(ins.error)return json({ok:false,error:'project_create',detail:ins.error.message},500);
    if(products.length){
      const ps=await sb.from('creative_video_project_products').insert(products.map((p:any,i:number)=>({project_id:ins.data.id,product_id:p.id,product_snapshot:p,role:i===0?'primary':'support',sort_order:i})));
      if(ps.error)return json({ok:false,error:'products_persist',detail:ps.error.message},500);
    }
    if(b.plan?.keyframes?.length){
      const k=await sb.from('creative_storyboard_keyframes').upsert(b.plan.keyframes.map((x:any)=>({project_id:ins.data.id,second_mark:x.second_mark,visual_prompt:x.visual_prompt,continuity_lock:{continuity_bible:b.plan.continuity_bible||{},visual_bible:b.plan.visual_bible||{}},status:'planned'})),{onConflict:'project_id,second_mark'});
      if(k.error)return json({ok:false,error:'keyframes_persist',detail:k.error.message},500);
    }
    if(b.plan?.gemini_packages?.length){
      const rows=b.plan.gemini_packages.map((x:any)=>normalizeGeminiPackage(x,ins.data.id));
      const g=await sb.from('creative_storyboard_gemini_packages').upsert(rows,{onConflict:'project_id,package_index'});
      if(g.error)return json({ok:false,error:'packages_persist',detail:g.error.message},500);
    }
    return json({ok:true,project:ins.data});
  }

  if(action==='update_plan'){
    if(!b.id||!b.plan)return json({ok:false,error:'id_plan_required'},400);
    const updatedAt=new Date().toISOString();
    const u=await sb.from('creative_video_projects').update({creative_plan:b.plan,status:b.status||'draft',updated_at:updatedAt}).eq('id',b.id).select().single();
    if(u.error)return json({ok:false,error:'plan_update',detail:u.error.message},500);
    for(const x of b.plan?.keyframes||[]){
      const ex=await sb.from('creative_storyboard_keyframes').select('id').eq('project_id',b.id).eq('second_mark',x.second_mark).maybeSingle();
      const continuity_lock={continuity_bible:b.plan.continuity_bible||{},visual_bible:b.plan.visual_bible||{}};
      if(ex.data?.id)await sb.from('creative_storyboard_keyframes').update({visual_prompt:x.visual_prompt,continuity_lock,updated_at:updatedAt}).eq('id',ex.data.id);
      else await sb.from('creative_storyboard_keyframes').insert({project_id:b.id,second_mark:x.second_mark,visual_prompt:x.visual_prompt,continuity_lock,status:'planned'});
    }
    for(const x of b.plan?.gemini_packages||[]){
      const g=await sb.from('creative_storyboard_gemini_packages').upsert(normalizeGeminiPackage(x,b.id,updatedAt),{onConflict:'project_id,package_index'});
      if(g.error)return json({ok:false,error:'packages_persist',detail:g.error.message},500);
    }
    return json({ok:true,project:u.data});
  }

  if(action==='save_frame'){
    if(!b.project_id||b.second_mark===undefined)return json({ok:false,error:'frame_required'},400);
    const second=Number(b.second_mark);
    if((b.status||'planned')==='approved'){
      const cur=await sb.from('creative_storyboard_keyframes').select('candidate_image_url,approved_image_url').eq('project_id',b.project_id).eq('second_mark',second).single();
      if(cur.error)return json({ok:false,error:'frame_not_found'},404);
      const approvedUrl=b.approved_image_url||cur.data?.candidate_image_url;
      if(!approvedUrl)return json({ok:false,error:'candidate_required'},409);
      if(second>0){
        const[prev,proj]=await Promise.all([
          sb.from('creative_storyboard_keyframes').select('approved_image_url,status').eq('project_id',b.project_id).eq('second_mark',second-10).maybeSingle(),
          sb.from('creative_video_projects').select('creative_plan').eq('id',b.project_id).single()
        ]);
        if(!prev.data?.approved_image_url||prev.data?.status!=='approved')return json({ok:false,error:'previous_frame_not_approved'},409);
        if(!proj.data?.creative_plan?.visual_bible?.locked)return json({ok:false,error:'visual_identity_required'},409);
      }
      b.approved_image_url=approvedUrl;
    }
    const patch:any={status:b.status||'planned',updated_at:new Date().toISOString()};
    for(const k of['visual_prompt','candidate_image_url','approved_image_url','approved_at','continuity_version'])if(b[k]!==undefined)patch[k]=b[k];
    if(b.revision_note){const ex=await sb.from('creative_storyboard_keyframes').select('revision_notes').eq('project_id',b.project_id).eq('second_mark',second).single();patch.revision_notes=[...(ex.data?.revision_notes||[]),{text:b.revision_note,at:new Date().toISOString()}]}
    const u=await sb.from('creative_storyboard_keyframes').update(patch).eq('project_id',b.project_id).eq('second_mark',second).select().single();
    return u.error?json({ok:false,error:'frame_save',detail:u.error.message},500):json({ok:true,keyframe:u.data});
  }

  if(action==='invalidate_after'){
    if(!b.project_id||b.second_mark===undefined)return json({ok:false,error:'frame_required'},400);
    const q=await sb.from('creative_storyboard_keyframes').select('id,continuity_version').eq('project_id',b.project_id).gt('second_mark',Number(b.second_mark));
    if(q.error)return json({ok:false,error:'invalidate_query',detail:q.error.message},500);
    for(const f of q.data||[])await sb.from('creative_storyboard_keyframes').update({status:'stale',candidate_image_url:null,approved_image_url:null,approved_at:null,continuity_version:Number(f.continuity_version||1)+1,updated_at:new Date().toISOString()}).eq('id',f.id);
    return json({ok:true,invalidated:(q.data||[]).length});
  }

  if(action==='reopen_frame'){
    if(!b.project_id||b.second_mark===undefined)return json({ok:false,error:'frame_required'},400);
    const second=Number(b.second_mark),t=await sb.from('creative_storyboard_keyframes').select('*').eq('project_id',b.project_id).eq('second_mark',second).single();
    if(t.error)return json({ok:false,error:'frame_not_found'},404);
    const candidate=t.data.approved_image_url||t.data.candidate_image_url||t.data.image_url||null;
    if(!candidate)return json({ok:false,error:'frame_image_missing'},409);
    const opened=await sb.from('creative_storyboard_keyframes').update({status:'review',candidate_image_url:candidate,approved_image_url:null,approved_at:null,continuity_version:Number(t.data.continuity_version||1)+1,updated_at:new Date().toISOString()}).eq('id',t.data.id).select().single();
    if(opened.error)return json({ok:false,error:'reopen_failed',detail:opened.error.message},500);
    const q=await sb.from('creative_storyboard_keyframes').select('id,continuity_version').eq('project_id',b.project_id).gt('second_mark',second);
    for(const f of q.data||[])await sb.from('creative_storyboard_keyframes').update({status:'stale',candidate_image_url:null,approved_image_url:null,approved_at:null,continuity_version:Number(f.continuity_version||1)+1,updated_at:new Date().toISOString()}).eq('id',f.id);
    return json({ok:true,keyframe:opened.data,invalidated:(q.data||[]).length});
  }

  if(action==='delete'){
    const id=String(b.id||'');if(!id)return json({ok:false,error:'id_required'},400);
    const exists=await sb.from('creative_video_projects').select('id').eq('id',id).maybeSingle();
    if(exists.error)return json({ok:false,error:'delete_lookup_failed',detail:exists.error.message},500);
    if(!exists.data)return json({ok:false,error:'not_found'},404);
    let storageRemoved=0;const bucket='creative-storyboards',listed=await sb.storage.from(bucket).list(id,{limit:1000});
    if(!listed.error&&listed.data?.length){const paths=listed.data.filter((x:any)=>x?.name).map((x:any)=>`${id}/${x.name}`);if(paths.length){const rm=await sb.storage.from(bucket).remove(paths);if(!rm.error)storageRemoved=paths.length}}
    for(const table of['creative_storyboard_generation_events','creative_storyboard_gemini_packages','creative_storyboard_keyframes','creative_video_project_products']){const del=await sb.from(table).delete().eq('project_id',id);if(del.error)return json({ok:false,error:'delete_failed',table,detail:del.error.message},500)}
    const del=await sb.from('creative_video_projects').delete().eq('id',id);if(del.error)return json({ok:false,error:'delete_failed',table:'creative_video_projects',detail:del.error.message},500);
    return json({ok:true,deleted:true,id,storage_removed:storageRemoved});
  }

  if(action==='list'){
    const q=await sb.from('creative_video_projects').select('id,product_snapshot,creative_plan,status,created_at,updated_at').order('updated_at',{ascending:false}).limit(Math.min(50,Number(b.limit||20)));
    return q.error?json({ok:false,error:'list_failed',detail:q.error.message},500):json({ok:true,projects:q.data});
  }

  if(action==='get'){
    const id=b.id;if(!id)return json({ok:false,error:'id_required'},400);
    const[p,products,frames,packs,events]=await Promise.all([
      sb.from('creative_video_projects').select('*').eq('id',id).single(),
      sb.from('creative_video_project_products').select('*').eq('project_id',id).order('sort_order'),
      sb.from('creative_storyboard_keyframes').select('*').eq('project_id',id).order('second_mark'),
      sb.from('creative_storyboard_gemini_packages').select('*').eq('project_id',id).order('package_index'),
      sb.from('creative_storyboard_generation_events').select('*').eq('project_id',id).order('created_at')
    ]);
    if(p.error)return json({ok:false,error:'not_found'},404);
    return json({ok:true,project:p.data,products:products.data||[],keyframes:frames.data||[],gemini_packages:packs.data||[],generation_events:events.data||[]});
  }

  return json({ok:false,error:'unknown_action'},400);
});
