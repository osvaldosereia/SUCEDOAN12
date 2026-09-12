import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(origin:string|null)=>({
  ...(origin&&ALLOWED_ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Vary":"Origin"
});
const json=(origin:string|null,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,max=1000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80))?clean(v,80):"";
const arr=(v:unknown)=>Array.isArray(v)?v:[];
const clamp=(v:unknown,min:number,max:number,fallback:number)=>{const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.trunc(n))):fallback};
const maskPhone=(v:unknown)=>{const d=String(v??"").replace(/\D/g,"");if(d.length<4)return "—";return `••••••${d.slice(-4)}`};

function strategyAnalysis(metrics:any){
  const findings:any[]=[];
  const recommendations:any[]=[];
  const automation=metrics?.runtime?.automation||{};
  const rules=metrics?.rules||{};
  const uncovered=Number(metrics?.uncovered_intents||0);
  const handoffs=Number(metrics?.human_handoffs||0);
  const automated=Number(metrics?.automated_replies||0);
  const inbound=Number(metrics?.messages_inbound||0);
  const workerOn=Boolean(automation.ai_enabled&&automation.conversation_worker_enabled&&automation.conversation_worker_dispatch_enabled&&automation.whatsapp_auto_reply_enabled);

  if(!workerOn){
    findings.push({severity:"info",key:"runtime_off",title:"Atendimento automático desligado",detail:"O período ainda não serve para medir a eficácia do novo motor simples, porque o worker e a resposta automática estão desligados."});
    recommendations.push({priority:1,key:"controlled_test",title:"Fazer homologação controlada antes de ativar",detail:"Validar os gatilhos publicados e os recursos de resposta em números de teste. Só depois medir cobertura real."});
  }
  if(Number(rules.published||0)<8){
    findings.push({severity:"warning",key:"few_rules",title:"Cobertura inicial pequena",detail:`Há ${Number(rules.published||0)} regra(s) publicada(s). Isso é adequado para começar com segurança, mas ainda cobre poucas intenções comerciais.`});
    recommendations.push({priority:2,key:"grow_from_history",title:"Ampliar somente a partir das conversas reais",detail:"Usar as recorrências dos últimos 7 dias para criar novos gatilhos, evitando regras longas ou genéricas demais."});
  }
  if(uncovered>0){
    findings.push({severity:"warning",key:"uncovered",title:"Há intenções sem orientação",detail:`Foram registrados ${uncovered} fallback(s) por ausência de regra no período.`});
    recommendations.push({priority:1,key:"cover_uncovered",title:"Cobrir as intenções sem regra mais frequentes",detail:"Agrupar mensagens semelhantes, criar uma regra por intenção e testar antes de publicar."});
  }
  if(handoffs>0){
    findings.push({severity:"info",key:"handoffs",title:"Transferências para humano",detail:`Foram ${handoffs} transferência(s) operacional(is) no período, excluindo controles de canário/homologação.`});
  }
  if(workerOn&&inbound>0&&automated===0){
    findings.push({severity:"critical",key:"no_auto_replies",title:"Motor ligado sem respostas automáticas registradas",detail:"Há mensagens recebidas, mas nenhuma resposta do motor simples foi registrada. Isso exige revisão antes de ampliar o tráfego."});
    recommendations.push({priority:1,key:"inspect_dispatch",title:"Revisar classificação e despacho do worker",detail:"Verificar jobs, classificação das regras e fila outbound antes de novos testes."});
  }
  if(!findings.length)findings.push({severity:"ok",key:"stable",title:"Sem alerta estrutural detectado",detail:"As métricas atuais não indicam falha estrutural evidente. Continue comparando cada ajuste com o snapshot anterior."});

  recommendations.sort((a,b)=>Number(a.priority)-Number(b.priority));
  return {findings,recommendations:recommendations.slice(0,5)};
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json(null,{ok:false,error:"origin_not_allowed"},403);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return json(origin,{ok:false,error:"method_not_allowed"},405);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service)return json(origin,{ok:false,error:"server_config"},500);

  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return json(origin,{ok:false,error:"missing_token"},401);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await sb.auth.getUser(token);
  if(userError||!userData?.user?.id)return json(origin,{ok:false,error:"invalid_user"},401);
  const {data:admin,error:adminError}=await sb.from("admin_users").select("role,is_active,display_name").eq("user_id",userData.user.id).maybeSingle();
  if(adminError||!admin?.is_active)return json(origin,{ok:false,error:"admin_not_authorized"},403);

  let body:any={};try{body=await req.json()}catch{return json(origin,{ok:false,error:"invalid_json"},400)}
  const action=clean(body?.action||"dashboard",80).toLowerCase();
  const since=new Date(Date.now()-7*24*60*60*1000).toISOString();

  if(action==="dashboard"){
    const [{data:metrics,error:metricError},{data:latest},{count:snapshotCount}]=await Promise.all([
      sb.rpc("get_service_strategy_7d_metrics_v1"),
      sb.from("service_strategy_analysis_snapshots").select("id,window_started_at,window_ended_at,metrics,findings,recommendations,analysis_note,source,created_at").order("created_at",{ascending:false}).limit(1).maybeSingle(),
      sb.from("service_strategy_analysis_snapshots").select("id",{count:"exact",head:true})
    ]);
    if(metricError)return json(origin,{ok:false,error:"metrics_failed",detail:metricError.message},500);
    return json(origin,{ok:true,user:{role:admin.role,display_name:admin.display_name||null},metrics,latest_snapshot:latest||null,snapshot_count:snapshotCount||0});
  }

  if(action==="conversations_7d"){
    const page=clamp(body?.page,1,10000,1),limit=clamp(body?.limit,10,100,30),q=clean(body?.q,120).toLowerCase();
    const {data:raw,error}=await sb.from("conversations")
      .select("id,customer_id,wa_contact_e164,source,channel,status,stage,mode,human_required,context_summary,opened_at,last_inbound_at,last_outbound_at,updated_at")
      .or(`last_inbound_at.gte.${since},opened_at.gte.${since},created_at.gte.${since}`)
      .order("updated_at",{ascending:false})
      .limit(500);
    if(error)return json(origin,{ok:false,error:"conversations_failed",detail:error.message},500);
    const conversations=arr(raw);
    const customerIds=[...new Set(conversations.map((x:any)=>x.customer_id).filter(Boolean))];
    const convIds=conversations.map((x:any)=>x.id).filter(Boolean);
    const [{data:customers},{data:messages}]=await Promise.all([
      customerIds.length?sb.from("customers").select("id,name,primary_whatsapp_e164").in("id",customerIds):Promise.resolve({data:[] as any[]}),
      convIds.length?sb.from("messages").select("conversation_id,direction,message_type,body_text,transcript,created_at").in("conversation_id",convIds).gte("created_at",since).order("created_at",{ascending:false}).limit(5000):Promise.resolve({data:[] as any[]})
    ]);
    const byCustomer=new Map(arr(customers).map((x:any)=>[x.id,x]));
    const msgMap=new Map<string,{inbound:number,outbound:number,last:any|null}>();
    for(const m of arr(messages)){
      const state=msgMap.get(m.conversation_id)||{inbound:0,outbound:0,last:null};
      if(m.direction==="inbound")state.inbound++;else if(m.direction==="outbound")state.outbound++;
      if(!state.last)state.last=m;
      msgMap.set(m.conversation_id,state);
    }
    let items=conversations.map((c:any)=>{
      const customer=byCustomer.get(c.customer_id)||null,state=msgMap.get(c.id)||{inbound:0,outbound:0,last:null};
      const lastText=clean(state.last?.body_text||state.last?.transcript||state.last?.message_type||"",220);
      return {...c,customer_name:clean(customer?.name,180)||null,phone_masked:maskPhone(c.wa_contact_e164||customer?.primary_whatsapp_e164),last_message:lastText,inbound_count:state.inbound,outbound_count:state.outbound};
    });
    if(q)items=items.filter((x:any)=>[x.customer_name,x.phone_masked,x.last_message,x.status,x.stage,x.mode].some(v=>String(v||"").toLowerCase().includes(q)));
    const total=items.length,from=(page-1)*limit;
    return json(origin,{ok:true,items:items.slice(from,from+limit),total,page,limit,window_started_at:since});
  }

  if(action==="conversation_detail"){
    const id=uuid(body?.id);if(!id)return json(origin,{ok:false,error:"invalid_conversation_id"},400);
    const {data:conversation,error}=await sb.from("conversations").select("*").eq("id",id).maybeSingle();
    if(error||!conversation)return json(origin,{ok:false,error:"conversation_not_found"},404);
    const [{data:customer},{data:messages},{data:handoffs},{data:events}]=await Promise.all([
      conversation.customer_id?sb.from("customers").select("id,name,primary_whatsapp_e164,preferred_reply,shopping_mode,order_count,last_order_at").eq("id",conversation.customer_id).maybeSingle():Promise.resolve({data:null}),
      sb.from("messages").select("id,direction,message_type,body_text,transcript,delivery_status,ai_interpretation,created_at").eq("conversation_id",id).gte("created_at",since).order("created_at",{ascending:true}).limit(500),
      sb.from("human_handoffs").select("id,reason,priority,status,summary,created_at,resolved_at").eq("conversation_id",id).gte("created_at",since).order("created_at",{ascending:true}).limit(100),
      sb.from("whatsapp_sales_action_events").select("id,message_id,action_type,result,confidence,created_at").eq("conversation_id",id).gte("created_at",since).order("created_at",{ascending:true}).limit(300)
    ]);
    return json(origin,{ok:true,conversation,customer:customer||null,messages:messages||[],handoffs:handoffs||[],events:events||[],window_started_at:since});
  }

  if(action==="generate_snapshot"){
    const {data:metrics,error}=await sb.rpc("get_service_strategy_7d_metrics_v1");
    if(error)return json(origin,{ok:false,error:"metrics_failed",detail:error.message},500);
    const analysis=strategyAnalysis(metrics||{});
    const note=clean(body?.note,4000)||"Snapshot de 7 dias gerado pelo Admin V3 para acompanhar a evolução do atendimento.";
    const row={window_started_at:metrics?.window_started_at||since,window_ended_at:metrics?.window_ended_at||new Date().toISOString(),window_days:7,metrics:metrics||{},findings:analysis.findings,recommendations:analysis.recommendations,analysis_note:note,source:"admin_v3",created_by:userData.user.id};
    const {data:snapshot,error:insertError}=await sb.from("service_strategy_analysis_snapshots").insert(row).select("*").single();
    if(insertError)return json(origin,{ok:false,error:"snapshot_save_failed",detail:insertError.message},500);
    const {count}=await sb.from("service_strategy_change_log").select("id",{count:"exact",head:true}).eq("operation","BASELINE");
    if(!count){await sb.from("service_strategy_change_log").insert({entity_type:"service_strategy",entity_id:"baseline",operation:"BASELINE",after_data:{snapshot_id:snapshot.id,metrics:metrics||{}},source:"admin_v3",reason:"Baseline inicial antes da homologação do atendimento automático simples.",expected_result:"Usar este ponto como comparação para os próximos ajustes.",review_status:"baseline",analysis_snapshot_id:snapshot.id,changed_by:userData.user.id})}
    return json(origin,{ok:true,snapshot});
  }

  if(action==="snapshots"){
    const limit=clamp(body?.limit,1,100,30);
    const {data,error}=await sb.from("service_strategy_analysis_snapshots").select("id,window_started_at,window_ended_at,window_days,metrics,findings,recommendations,analysis_note,source,created_at").order("created_at",{ascending:false}).limit(limit);
    if(error)return json(origin,{ok:false,error:"snapshots_failed",detail:error.message},500);
    return json(origin,{ok:true,items:data||[]});
  }

  if(action==="change_log"){
    const limit=clamp(body?.limit,1,200,100);
    const {data,error}=await sb.from("service_strategy_change_log").select("id,entity_type,entity_id,operation,before_data,after_data,source,reason,expected_result,observed_result,review_status,analysis_snapshot_id,changed_by,created_at,reviewed_at").order("created_at",{ascending:false}).limit(limit);
    if(error)return json(origin,{ok:false,error:"change_log_failed",detail:error.message},500);
    return json(origin,{ok:true,items:data||[]});
  }

  if(action==="annotate_change"){
    const id=uuid(body?.id);if(!id)return json(origin,{ok:false,error:"invalid_change_id"},400);
    const status=clean(body?.review_status,30)||"pending";
    if(!["pending","kept","adjusted","reverted","baseline"].includes(status))return json(origin,{ok:false,error:"invalid_review_status"},400);
    const patch:any={reason:clean(body?.reason,2000)||null,expected_result:clean(body?.expected_result,2000)||null,observed_result:clean(body?.observed_result,2000)||null,review_status:status};
    if(status!=="pending")patch.reviewed_at=new Date().toISOString();
    const {data,error}=await sb.from("service_strategy_change_log").update(patch).eq("id",id).select("*").single();
    if(error)return json(origin,{ok:false,error:"change_annotation_failed",detail:error.message},500);
    return json(origin,{ok:true,item:data});
  }

  return json(origin,{ok:false,error:"unknown_action"},400);
});
