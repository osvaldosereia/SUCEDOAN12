import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const HUB_API="https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1";
const CARDS_PER_PAGE=20;

const clean=(v:any,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const digits=(v:any,n=30)=>String(v??"").replace(/\D+/g,"").slice(0,n);
const uuid=(v:any)=>{const s=clean(v,64);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const json=(req:Request,body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
function cors(req:Request){const o=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(o)?o:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}}
function localDay(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Cuiaba",year:"2-digit",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/-/g,"")}
function outputText(data:any){return Array.isArray(data?.output)?data.output.flatMap((x:any)=>Array.isArray(x?.content)?x.content:[]).filter((x:any)=>x?.type==="output_text").map((x:any)=>String(x?.text||"")).join("").trim():""}

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false,status:401,error:"admin_auth_required"};
  const u=await db.auth.getUser(token);
  if(u.error||!u.data?.user?.id)return {ok:false,status:401,error:"admin_session_invalid"};
  const q=await db.from("admin_users").select("role,is_active").eq("user_id",u.data.user.id).maybeSingle();
  if(q.error)return {ok:false,status:500,error:"admin_lookup_failed"};
  if(!q.data?.is_active)return {ok:false,status:403,error:"admin_not_authorized"};
  return {ok:true,status:200,user_id:u.data.user.id,role:q.data.role||"viewer"};
}

async function openAiKey(){
  let key=Deno.env.get("OPENAI_API_KEY")||"";
  if(!key){
    try{
      const q=await db.rpc("get_conversation_worker_provider_secret_v1");
      if(typeof q.data==="string")key=q.data;
    }catch{}
  }
  return key;
}

async function queryProducts(filters:any){
  const rows:any[]=[];
  const qv=clean(filters?.q,100).replace(/[,()%]/g," ");
  const category=clean(filters?.category,120);
  const subcategory=clean(filters?.subcategory,120);
  const active=String(filters?.active??"true");
  for(let offset=0;offset<5000;offset+=1000){
    let q=db.from("products")
      .select("id,name,gtin,image_url,validity_date,is_active,sales_category,subcategory")
      .order("name")
      .range(offset,offset+999);
    if(category)q=q.eq("sales_category",category);
    if(subcategory)q=q.eq("subcategory",subcategory);
    if(active==="true")q=q.eq("is_active",true);
    if(active==="false")q=q.eq("is_active",false);
    if(qv)q=q.or("name.ilike.%"+qv+"%,gtin.ilike.%"+qv+"%");
    const r=await q;
    if(r.error)throw r.error;
    rows.push(...(r.data||[]));
    if((r.data||[]).length<1000)break;
  }
  return rows;
}

async function createBatch(body:any,auth:any){
  const products=await queryProducts(body?.filters||{});
  if(!products.length)return {error:"no_products",status:404};
  const rand=[...crypto.getRandomValues(new Uint8Array(3))].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
  const batchCode="BAL-"+localDay()+"-"+rand;
  const pageCount=Math.ceil(products.length/CARDS_PER_PAGE);
  const b=await db.from("inventory_sheet_batches").insert({
    batch_code:batchCode,created_by:auth.user_id,operator_label:clean(body?.operator,80)||null,
    filters:body?.filters||{},product_count:products.length,page_count:pageCount,cards_per_page:CARDS_PER_PAGE
  }).select("*").single();
  if(b.error)throw b.error;

  const items=products.map((p:any,index:number)=>({
    batch_id:b.data.id,
    page_number:Math.floor(index/CARDS_PER_PAGE)+1,
    slot_number:(index%CARDS_PER_PAGE)+1,
    printed_index:index+1,
    product_id:p.id,
    product_name_snapshot:p.name||"",
    gtin_snapshot:digits(p.gtin)||null,
    expiration_date_snapshot:p.validity_date||null,
    image_url_snapshot:p.image_url||null
  }));
  for(let i=0;i<items.length;i+=400){
    const ins=await db.from("inventory_sheet_items").insert(items.slice(i,i+400));
    if(ins.error){await db.from("inventory_sheet_batches").delete().eq("id",b.data.id);throw ins.error}
  }
  return {
    batch:{id:b.data.id,batch_code:batchCode,product_count:products.length,page_count:pageCount,cards_per_page:CARDS_PER_PAGE},
    items:items.map((x:any)=>({
      page_number:x.page_number,slot_number:x.slot_number,printed_index:x.printed_index,
      product_id:x.product_id,name:x.product_name_snapshot,gtin:x.gtin_snapshot||"",
      expiration_date:x.expiration_date_snapshot,image_url:x.image_url_snapshot||""
    }))
  };
}

const scanSchema={
  type:"object",additionalProperties:false,
  properties:{
    batch_code:{type:"string"},
    page_number:{type:["integer","null"]},
    page_confidence:{type:"number",minimum:0,maximum:1},
    page_complete:{type:"boolean"},
    items:{
      type:"array",maxItems:20,
      items:{
        type:"object",additionalProperties:false,
        properties:{
          slot_number:{type:"integer",minimum:1,maximum:20},
          printed_index:{type:["integer","null"],minimum:1},
          ean:{type:"string"},
          product_name_visible:{type:"string"},
          quantity:{type:["integer","null"],minimum:0},
          marked_box:{type:["integer","null"],minimum:0,maximum:10},
          written_quantity:{type:["integer","null"],minimum:0},
          mark_kind:{type:"string",enum:["box","written","none","ambiguous"]},
          ambiguous:{type:"boolean"},
          confidence:{type:"number",minimum:0,maximum:1},
          note:{type:"string"}
        },
        required:["slot_number","printed_index","ean","product_name_visible","quantity","marked_box","written_quantity","mark_kind","ambiguous","confidence","note"]
      }
    }
  },
  required:["batch_code","page_number","page_confidence","page_complete","items"]
};

async function analyzeImage(imageDataUrl:string){
  const key=await openAiKey();
  if(!key)return {error:"openai_not_configured",status:503};
  if(!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl))return {error:"invalid_image",status:400};
  if(imageDataUrl.length>14_000_000)return {error:"image_too_large",status:413};

  const models=[clean(Deno.env.get("INVENTORY_SHEET_VISION_MODEL"),80)||"gpt-6-sol","gpt-5.6-sol"];
  let last:any=null;
  for(const model of [...new Set(models)]){
    try{
      const res=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
        body:JSON.stringify({
          model,store:false,max_output_tokens:6000,reasoning:{effort:"low"},
          instructions:[
            "Você lê uma FOTO ÚNICA de uma folha A4 vertical inteira de balanço físico da Dona Antônia.",
            "A página tem exatamente 5 colunas e no máximo 4 linhas de cards, portanto no máximo 20 produtos.",
            "No cabeçalho existem o código do lote BAL-...... e o número Página X/Y.",
            "Cada card tem REF (índice impresso), foto, nome, EAN, validade e caixas 0 a 10 mais um campo largo para quantidade escrita.",
            "A contagem é: um X claramente marcado em uma caixa 0..10 significa aquela quantidade. Se o campo largo tiver um número manuscrito, use esse número.",
            "Nunca adivinhe. Se houver duas marcas, rabisco duvidoso, número ilegível, card cortado, reflexo, sombra forte ou dúvida, marque ambiguous=true e quantity=null.",
            "Leia a página inteira, da esquerda para a direita e de cima para baixo. slot_number é a posição física 1..20 nessa ordem.",
            "Copie EAN e REF visíveis. Não corrija EAN por conhecimento do produto.",
            "Se um card não tiver marcação de contagem, mark_kind=none, ambiguous=true e quantity=null."
          ].join(" "),
          input:[{role:"user",content:[
            {type:"input_text",text:"Extraia todas as contagens desta folha A4 inteira. Priorize precisão e sinalize qualquer dúvida."},
            {type:"input_image",image_url:imageDataUrl,detail:"original"}
          ]}],
          text:{format:{type:"json_schema",name:"inventory_sheet_scan",strict:true,schema:scanSchema}}
        }),
        signal:AbortSignal.timeout(90000)
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok){
        last={error:"openai_http_"+res.status,status:502,detail:clean(data?.error?.message||data?.error||"",500),model};
        if([400,403,404].includes(res.status))continue;
        return last;
      }
      const text=outputText(data);
      if(!text)return {error:"openai_empty_output",status:502,model};
      let parsed:any;try{parsed=JSON.parse(text)}catch{return {error:"openai_invalid_json",status:502,model}};
      return {parsed,response_id:data?.id||null,model,usage:data?.usage||null};
    }catch(e){
      last={error:"openai_request_failed",status:502,detail:clean((e as Error)?.message,300),model};
    }
  }
  return last||{error:"openai_failed",status:502};
}

function makeReview(expected:any[],parsed:any){
  const bySlot=new Map<number,any>();
  for(const x of Array.isArray(parsed?.items)?parsed.items:[]){
    const slot=Number(x?.slot_number);
    if(Number.isInteger(slot)&&slot>=1&&slot<=20&&!bySlot.has(slot))bySlot.set(slot,x);
  }
  const pageOk=Number(parsed?.page_confidence||0)>=0.90&&parsed?.page_complete===true;
  return expected.map((item:any)=>{
    const ai=bySlot.get(Number(item.slot_number))||null;
    const expectedEan=digits(item.gtin_snapshot);
    const aiEan=digits(ai?.ean);
    const eanMatch=expectedEan?aiEan===expectedEan:true;
    const indexMatch=Number(ai?.printed_index||0)===Number(item.printed_index);
    const q=ai?.quantity;
    const validQty=Number.isInteger(q)&&q>=0&&q<=100000;
    const confidence=Number(ai?.confidence||0);
    const ready=Boolean(ai)&&pageOk&&indexMatch&&eanMatch&&validQty&&ai?.ambiguous===false&&confidence>=0.95;
    const reasons:string[]=[];
    if(!ai)reasons.push("card_nao_lido");
    if(ai&&!indexMatch)reasons.push("ref_nao_confere");
    if(ai&&expectedEan&&!eanMatch)reasons.push("ean_nao_confere");
    if(ai&&!validQty)reasons.push("quantidade_duvidosa");
    if(ai?.ambiguous===true)reasons.push("marcacao_ambigua");
    if(ai&&confidence<0.95)reasons.push("baixa_confianca");
    if(!pageOk)reasons.push("pagina_incompleta_ou_duvidosa");
    return {
      sheet_item_id:item.id,product_id:item.product_id,page_number:item.page_number,slot_number:item.slot_number,
      printed_index:item.printed_index,name:item.product_name_snapshot,gtin:expectedEan||"",expiration_date:item.expiration_date_snapshot||null,
      ai_ean:aiEan||"",ai_quantity:validQty?q:null,quantity:validQty?q:null,
      confidence,mark_kind:clean(ai?.mark_kind,30)||"none",note:clean(ai?.note,300),
      review_state:ready?"ready":"review",reason:ready?"":reasons.join(",")
    };
  });
}

async function analyzePage(body:any,auth:any){
  const ai:any=await analyzeImage(String(body?.image_data_url||""));
  if(ai?.error)return ai;
  const parsed=ai.parsed||{};
  const batchCode=clean(parsed.batch_code,40).toUpperCase();
  const pageNumber=Number(parsed.page_number||0);
  if(!batchCode||!Number.isInteger(pageNumber)||pageNumber<1)return {error:"sheet_header_not_read",status:422,ai:parsed};
  const b=await db.from("inventory_sheet_batches").select("*").eq("batch_code",batchCode).maybeSingle();
  if(b.error)throw b.error;
  if(!b.data)return {error:"sheet_batch_not_found",status:404,batch_code:batchCode,page_number:pageNumber};
  if(pageNumber>Number(b.data.page_count))return {error:"sheet_page_out_of_range",status:422,batch_code:batchCode,page_number:pageNumber};
  const it=await db.from("inventory_sheet_items").select("*").eq("batch_id",b.data.id).eq("page_number",pageNumber).order("slot_number");
  if(it.error)throw it.error;
  const review=makeReview(it.data||[],parsed);
  const s=await db.from("inventory_sheet_page_scans").insert({
    batch_id:b.data.id,page_number:pageNumber,uploaded_by:auth.user_id,model:ai.model||null,ai_response_id:ai.response_id||null,
    page_confidence:Number(parsed.page_confidence||0),raw_result:parsed,
    review_result:{ready:review.filter((x:any)=>x.review_state==="ready").length,review:review.filter((x:any)=>x.review_state!=="ready").length},
    status:"analyzed"
  }).select("*").single();
  if(s.error)throw s.error;
  const resultRows=review.map((r:any)=>({
    scan_id:s.data.id,sheet_item_id:r.sheet_item_id,ai_ean:r.ai_ean||null,ai_quantity:r.ai_quantity,
    ai_confidence:r.confidence,ai_mark_kind:r.mark_kind,ai_note:r.note||null,review_state:r.review_state
  }));
  if(resultRows.length){
    const ins=await db.from("inventory_sheet_item_results").insert(resultRows);
    if(ins.error)throw ins.error;
  }
  const dbResults=await db.from("inventory_sheet_item_results").select("id,sheet_item_id,review_state").eq("scan_id",s.data.id);
  if(dbResults.error)throw dbResults.error;
  const rid=new Map((dbResults.data||[]).map((x:any)=>[String(x.sheet_item_id),x]));
  return {
    scan_id:s.data.id,batch_code:batchCode,page_number:pageNumber,page_count:b.data.page_count,
    page_confidence:Number(parsed.page_confidence||0),page_complete:parsed.page_complete===true,
    model:ai.model,usage:ai.usage||null,
    rows:review.map((r:any)=>({...r,result_id:rid.get(String(r.sheet_item_id))?.id||null}))
  };
}

async function processStockJobs(limit:number){
  const key=await db.rpc("get_bling_hub_key_v2");
  if(key.error||!key.data)return {ok:false,error:"bling_bridge_not_configured"};
  const res=await fetch(HUB_API,{
    method:"POST",
    headers:{"Content-Type":"application/json","x-dona-antonia-bling-hub-key":String(key.data)},
    body:JSON.stringify({action:"vitrine_bling_hub_internal",subaction:"process_stock_jobs",limit}),
    signal:AbortSignal.timeout(90000)
  });
  const data=await res.json().catch(()=>({}));
  return {ok:res.ok&&data?.ok!==false,status:res.status,data};
}

async function resolveCountAttention(countId:string,reference:string){
  try{
    const a=await db.from("ops_attention").select("id").eq("idempotency_key","inventory-count-difference:"+countId).in("status",["open","acknowledged"]).maybeSingle();
    if(!a.error&&a.data?.id){
      await db.rpc("ops_resolve_attention_v1",{p_attention_id:a.data.id,p_resolution:"Balanço físico confirmado pela folha A4 e sincronizado no Bling.",p_resolution_ref:reference});
    }
  }catch{}
}

async function applyItems(body:any,auth:any){
  if(auth.role==="viewer")return {error:"forbidden",status:403};
  const scanId=uuid(body?.scan_id);
  const requested=(Array.isArray(body?.items)?body.items:[]).slice(0,5);
  if(!scanId||!requested.length)return {error:"invalid_apply_request",status:400};
  const scan=await db.from("inventory_sheet_page_scans").select("id,batch_id,page_number,status").eq("id",scanId).maybeSingle();
  if(scan.error)throw scan.error;if(!scan.data)return {error:"scan_not_found",status:404};
  const resultIds=requested.map((x:any)=>uuid(x?.result_id)).filter(Boolean);
  const rr=await db.from("inventory_sheet_item_results").select("*").eq("scan_id",scanId).in("id",resultIds);
  if(rr.error)throw rr.error;
  const resultMap=new Map((rr.data||[]).map((x:any)=>[String(x.id),x]));
  const sheetIds=(rr.data||[]).map((x:any)=>x.sheet_item_id);
  const si=await db.from("inventory_sheet_items").select("*").in("id",sheetIds);
  if(si.error)throw si.error;
  const itemMap=new Map((si.data||[]).map((x:any)=>[String(x.id),x]));
  const rt=await db.from("bling_hub_runtime_v2").select("mode,hub_enabled,stock_enabled,metadata").eq("id",1).maybeSingle();
  if(rt.error)throw rt.error;
  const authority=String(rt.data?.metadata?.ops2_stock_authority||"legacy_shadow");
  if(authority==="bling"&&(rt.data?.mode!=="live"||rt.data?.hub_enabled!==true||rt.data?.stock_enabled!==true))return {error:"bling_stock_runtime_not_ready",status:409};

  const operator=clean(body?.operator,80)||"Balanço por foto";
  const applied:any[]=[];const jobIds:string[]=[];const resultByJob=new Map<string,string>();
  for(const req of requested){
    const rid=uuid(req?.result_id),row:any=resultMap.get(rid);
    if(!row){applied.push({result_id:rid||null,ok:false,error:"result_not_found"});continue}
    if(row.review_state==="applied"){applied.push({result_id:rid,ok:true,already_applied:true,stock_count_id:row.stock_count_id,bling_job_id:row.bling_job_id});continue}
    if(row.review_state==="review"&&req?.manual_confirmed!==true){applied.push({result_id:rid,ok:false,error:"manual_confirmation_required"});continue}
    const quantity=Number(req?.quantity);
    if(!Number.isInteger(quantity)||quantity<0||quantity>100000){applied.push({result_id:rid,ok:false,error:"invalid_quantity"});continue}
    const item:any=itemMap.get(String(row.sheet_item_id));
    if(!item){applied.push({result_id:rid,ok:false,error:"sheet_item_not_found"});continue}

    const count=await db.rpc("ops_record_inventory_count_v1",{p_product_id:item.product_id,p_counted_quantity:quantity,p_operator_label:operator});
    if(count.error){applied.push({result_id:rid,ok:false,error:clean(count.error.message,240)});continue}
    const countId=uuid(count.data?.count_id);
    let blingJobId:string|null=null;
    if(authority==="bling"){
      const key="inventory-sheet:"+scanId+":"+item.id+":"+String(quantity);
      const q=await db.rpc("enqueue_bling_hub_job_v2",{
        p_domain:"stock",p_operation:"set_stock",p_source_system:"vitrine_qx",p_source_id:item.product_id,
        p_idempotency_key:key,p_payload:{stock_quantity:quantity,inventory_sheet_scan_id:scanId,inventory_sheet_result_id:rid,operator_label:operator,count_id:countId||null},p_payload_version:1
      });
      if(q.error){applied.push({result_id:rid,ok:false,error:clean(q.error.message,240),stock_count_id:countId});continue}
      blingJobId=uuid(q.data);
      if(blingJobId){jobIds.push(blingJobId);resultByJob.set(blingJobId,rid)}
    }
    await db.from("inventory_sheet_item_results").update({
      confirmed_quantity:quantity,confirmed_by:auth.user_id,confirmed_at:new Date().toISOString(),
      stock_count_id:countId||null,bling_job_id:blingJobId,review_state:authority==="bling"?"confirmed":"applied",
      apply_error:null,updated_at:new Date().toISOString()
    }).eq("id",rid);
    if(authority!=="bling"&&countId)await resolveCountAttention(countId,"inventory-sheet:"+scanId);
    applied.push({result_id:rid,ok:true,quantity,stock_count_id:countId,bling_job_id:blingJobId,queued:authority==="bling"});
  }

  let worker:any=null;
  if(jobIds.length)worker=await processStockJobs(Math.max(1,jobIds.length));
  if(jobIds.length){
    const jobs=await db.from("bling_hub_jobs_v2").select("id,status,error_code,error_message,result").in("id",jobIds);
    if(jobs.error)throw jobs.error;
    for(const job of jobs.data||[]){
      const rid=resultByJob.get(String(job.id));if(!rid)continue;
      if(job.status==="synced"){
        await db.from("inventory_sheet_item_results").update({review_state:"applied",apply_error:null,updated_at:new Date().toISOString()}).eq("id",rid);
        const row:any=resultMap.get(rid);
        const countId=uuid(row?.stock_count_id)||uuid(applied.find((x:any)=>x.result_id===rid)?.stock_count_id);
        if(countId)await resolveCountAttention(countId,"bling-stock-job:"+job.id);
      }else if(["review_required","failed"].includes(String(job.status))){
        await db.from("inventory_sheet_item_results").update({review_state:"error",apply_error:clean(job.error_code||job.error_message,300)||"bling_sync_failed",updated_at:new Date().toISOString()}).eq("id",rid);
      }
    }
  }

  const all=await db.from("inventory_sheet_item_results").select("review_state").eq("scan_id",scanId);
  if(all.error)throw all.error;
  const states=(all.data||[]).map((x:any)=>String(x.review_state));
  const scanStatus=states.length&&states.every((x:string)=>x==="applied")?"applied":states.some((x:string)=>x==="applied")?"partial":"analyzed";
  await db.from("inventory_sheet_page_scans").update({status:scanStatus,applied_at:scanStatus==="applied"?new Date().toISOString():null}).eq("id",scanId);

  if(scanStatus==="applied"){
    const b=await db.from("inventory_sheet_batches").select("page_count").eq("id",scan.data.batch_id).maybeSingle();
    const pages=await db.from("inventory_sheet_page_scans").select("page_number").eq("batch_id",scan.data.batch_id).eq("status","applied");
    if(!b.error&&!pages.error){
      const done=new Set((pages.data||[]).map((x:any)=>Number(x.page_number))).size;
      if(done>=Number(b.data?.page_count||0))await db.from("inventory_sheet_batches").update({status:"completed",completed_at:new Date().toISOString()}).eq("id",scan.data.batch_id);
    }
  }
  const finalRows=await db.from("inventory_sheet_item_results").select("id,review_state,confirmed_quantity,stock_count_id,bling_job_id,apply_error").eq("scan_id",scanId);
  if(finalRows.error)throw finalRows.error;
  return {scan_id:scanId,status:scanStatus,authority,worker:worker?.data||null,rows:finalRows.data||[],applied};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  const u=new URL(req.url);
  const action=clean(u.searchParams.get("action")||(req.method==="GET"?"health":""),60);
  if(action==="health")return json(req,{ok:true,service:"inventory-sheet-ai-v1",version:1,cards_per_page:CARDS_PER_PAGE});
  if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  const auth:any=await adminAuth(req);
  if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status||401);
  let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:"invalid_json"},400)}
  try{
    let out:any;
    if(action==="create_batch")out=await createBatch(body,auth);
    else if(action==="analyze_page")out=await analyzePage(body,auth);
    else if(action==="apply_items")out=await applyItems(body,auth);
    else return json(req,{ok:false,error:"not_found"},404);
    return json(req,{ok:!out?.error,...out},out?.error?(out.status||400):200);
  }catch(e){
    console.error("inventory_sheet_ai",clean((e as Error)?.message||e,500));
    return json(req,{ok:false,error:"internal_error",detail:clean((e as Error)?.message||e,300)},500);
  }
});
