import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const PROVIDER_TOKEN=Deno.env.get("PAPOAI_ORDER_WEBHOOK_TOKEN")||"";
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});

type Channel="0975"|"1018";
const providerUrl=(channel:Channel)=>channel==="1018"
  ? (Deno.env.get("PAPOAI_ORDER_TEMPLATE_WEBHOOK_1018_URL")||"")
  : (Deno.env.get("PAPOAI_ORDER_TEMPLATE_WEBHOOK_0975_URL")||"");
const providerReadiness=()=>{const p0975=Boolean(providerUrl("0975")),p1018=Boolean(providerUrl("1018"));return {ready:p0975&&p1018,providers:{"0975":p0975,"1018":p1018}}};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const text=(v:unknown,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const uid=(v:unknown)=>{const s=text(v,80);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const money=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n):""};
const paymentLabel=(v:unknown)=>{const raw=text(v,80),key=raw.toLowerCase();const labels:Record<string,string>={pix:"PIX",dinheiro:"Dinheiro",cash:"Dinheiro",credito:"Cartão de crédito",credit_card:"Cartão de crédito",alimentacao:"Cartão alimentação",refeicao:"Cartão refeição"};return labels[key]||raw||"A confirmar"};
const deliveryLabel=(v:any)=>text(v?.label||v?.date||v?.delivery_date||"A confirmar",120);
async function claim(orderId:string){const r=await db.rpc("ops2_claim_order_whatsapp_outbox_v1",{p_order_id:orderId});if(r.error)throw new Error(`claim_failed: ${text(r.error.message)}`);return r.data?.found===true?r.data.item:null}
async function finish(outboxId:string,status:"sent"|"retry"|"failed"|"suppressed",externalId:string|null,lastError:string|null,retrySeconds=300){const r=await db.rpc("ops2_finish_whatsapp_outbox_v1",{p_outbox_id:outboxId,p_status:status,p_external_message_id:externalId,p_last_error:lastError,p_retry_after_seconds:retrySeconds});if(r.error||r.data?.ok!==true)throw new Error(`finish_failed: ${text(r.error?.message||r.data?.error)}`);return r.data}
Deno.serve(async(req:Request)=>{
  if(!U||!K)return respond({ok:false,error:"server_config"},500);
  if(req.headers.get("x-internal-key")!==K)return respond({ok:false,error:"forbidden"},403);
  if(req.method==="GET")return respond({ok:true,service:"admin-orders-v1",...providerReadiness()});
  if(req.method!=="POST")return respond({ok:false,error:"method_not_allowed"},405);
  const readiness=providerReadiness();if(!readiness.ready)return respond({ok:false,error:"provider_not_configured",...readiness},503);
  const body=await req.json().catch(()=>({})),orderId=uid(body?.order_id);if(!orderId)return respond({ok:false,error:"order_id_required"},400);
  let item:any=null;try{item=await claim(orderId)}catch(error){return respond({ok:false,error:"claim_failed",detail:text((error as Error)?.message||error)},503)}
  if(!item)return respond({ok:true,status:"idle",sent:false,order_id:orderId});
  const outboxId=uid(item.id),channel=(text(item.channel_origin,4)==="1018"?"1018":"0975") as Channel,url=providerUrl(channel);
  if(!url){const errorText=`provider_not_configured_${channel}`;try{await finish(outboxId,"failed",null,errorText,0)}catch{}return respond({ok:false,error:"provider_not_configured",channel_origin:channel,recipient_kind:item.recipient_kind||null,outbox_id:outboxId},503)}
  const order=item?.payload?.order||{};
  const providerPayload={event:"order_received",source:"dona_antonia_admin",event_id:outboxId,order_id:item.order_id,recipient_kind:text(item.recipient_kind,30),phone_e164:item.phone_e164,order_number:text(order.order_number||item?.payload?.order_number||"",60),purchased_at:item.created_at,channel_origin:channel,delivery_mode:"utility_template",total_formatted:money(order.total),payment_label:paymentLabel(order.payment_method),delivery_label:deliveryLabel(order.delivery)};
  const headers:Record<string,string>={"Content-Type":"application/json"};if(PROVIDER_TOKEN)headers.Authorization=`Bearer ${PROVIDER_TOKEN}`;
  try{
    const response=await fetch(url,{method:"POST",headers,body:JSON.stringify(providerPayload)}),data=await response.json().catch(()=>({}));
    if(response.ok){const externalId=text(data?.external_message_id||data?.message_id||data?.id||"",200)||null;await finish(outboxId,"sent",externalId,null);return respond({ok:true,status:"sent",outbox_id:outboxId,recipient_kind:item.recipient_kind,channel_origin:channel,external_message_id:externalId})}
    const retryable=response.status===429,state=retryable&&Number(item.attempt_count||0)<5?"retry":"failed",errorText=`provider_http_${response.status}: ${text(data?.error||data?.message||response.statusText,300)}`;await finish(outboxId,state,null,errorText,retryable?300:0);return respond({ok:false,error:"provider_rejected",status:state,outbox_id:outboxId,recipient_kind:item.recipient_kind},retryable?503:502);
  }catch(error){const errorText=`provider_ambiguous_failure: ${text((error as Error)?.message||error,300)}`;try{await finish(outboxId,"failed",null,errorText,0)}catch(finishError){return respond({ok:false,error:"provider_failure_and_finish_failed",outbox_id:outboxId,detail:text((finishError as Error)?.message||finishError)},500)}return respond({ok:false,error:"provider_unreachable",status:"failed",outbox_id:outboxId,recipient_kind:item.recipient_kind},503)}
});