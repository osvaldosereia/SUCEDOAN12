import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const OPTIONAL_PROVIDER_TOKEN=Deno.env.get("PAPOAI_ORDER_WEBHOOK_TOKEN")||"";
const db=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

type Provider={channelOrigin:"0975"|"1018";url:string};
const providers:Provider[]=[
  {channelOrigin:"0975",url:Deno.env.get("PAPOAI_ORDER_TEMPLATE_WEBHOOK_0975_URL")||""},
  {channelOrigin:"1018",url:Deno.env.get("PAPOAI_ORDER_TEMPLATE_WEBHOOK_1018_URL")||""}
].filter(p=>p.url);

const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const text=(v:unknown,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const money=(v:unknown)=>{
  const n=Number(v);
  return Number.isFinite(n)?new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n):"";
};
const paymentLabel=(v:unknown)=>{
  const raw=text(v,80);
  const key=raw.toLowerCase();
  const labels:Record<string,string>={
    pix:"PIX",dinheiro:"Dinheiro",cash:"Dinheiro",
    credito:"Cartão de crédito",credit_card:"Cartão de crédito",
    alimentacao:"Cartão alimentação",refeicao:"Cartão refeição"
  };
  return labels[key]||raw||"A confirmar";
};
const deliveryLabel=(v:any)=>text(v?.label||v?.date||v?.delivery_date||"A confirmar",120);

async function claim(provider:Provider){
  const result=await db.rpc("ops2_claim_whatsapp_outbox_v1",{
    p_channel_origin:provider.channelOrigin
  });
  if(result.error)throw new Error(`claim_failed: ${text(result.error.message)}`);
  return result.data?.found===true?result.data.item:null;
}

async function finish(outboxId:string,status:"sent"|"retry"|"failed"|"suppressed",externalMessageId:string|null,lastError:string|null,retrySeconds=300){
  const result=await db.rpc("ops2_finish_whatsapp_outbox_v1",{
    p_outbox_id:outboxId,
    p_status:status,
    p_external_message_id:externalMessageId,
    p_last_error:lastError,
    p_retry_after_seconds:retrySeconds
  });
  if(result.error||result.data?.ok!==true)throw new Error(`finish_failed: ${text(result.error?.message||result.data?.error)}`);
  return result.data;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return respond({ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_ROLE_KEY)return respond({ok:false,error:"server_config"},500);
  const auth=req.headers.get("authorization")||"";
  if(auth!==`Bearer ${SERVICE_ROLE_KEY}`)return respond({ok:false,error:"forbidden"},403);
  if(!providers.length)return respond({ok:false,error:"provider_not_configured"},503);

  let provider:Provider|null=null;
  let item:any=null;
  try{
    for(const candidate of providers){
      const claimed=await claim(candidate);
      if(claimed){provider=candidate;item=claimed;break;}
    }
  }catch(error){
    return respond({ok:false,error:"claim_failed",detail:text((error as Error)?.message||error)},503);
  }

  if(!provider||!item)return respond({ok:true,status:"idle",sent:false});

  const outboxId=text(item.id,80);
  const order=item?.payload?.order||{};
  const providerPayload={
    event:"order_received",
    source:"dona_antonia_supabase",
    event_id:outboxId,
    order_id:item.order_id,
    phone_e164:item.phone_e164,
    order_number:text(order.order_number||item?.payload?.order_number||"",60),
    purchased_at:item.created_at,
    channel_origin:item.channel_origin,
    delivery_mode:"utility_template",
    total_formatted:money(order.total),
    payment_label:paymentLabel(order.payment_method),
    delivery_label:deliveryLabel(order.delivery)
  };

  const headers:Record<string,string>={"Content-Type":"application/json"};
  if(OPTIONAL_PROVIDER_TOKEN)headers.Authorization=`Bearer ${OPTIONAL_PROVIDER_TOKEN}`;

  try{
    const response=await fetch(provider.url,{method:"POST",headers,body:JSON.stringify(providerPayload)});
    const data=await response.json().catch(()=>({}));
    if(response.ok){
      const externalMessageId=text(data?.external_message_id||data?.message_id||data?.id||"",200)||null;
      await finish(outboxId,"sent",externalMessageId,null);
      return respond({ok:true,status:"sent",outbox_id:outboxId,delivery_mode:"utility_template",channel_origin:item.channel_origin,external_message_id:externalMessageId});
    }

    // Só 429 recebe retry automático; falhas ambíguas ficam para revisão para evitar duplicidade.
    const retryable=response.status===429;
    const finishStatus=retryable&&Number(item.attempt_count||0)<5?"retry":"failed";
    const errorText=`provider_http_${response.status}: ${text(data?.error||data?.message||response.statusText,300)}`;
    await finish(outboxId,finishStatus,null,errorText,retryable?300:0);
    return respond({ok:false,error:"provider_rejected",status:finishStatus,outbox_id:outboxId},retryable?503:502);
  }catch(error){
    const errorText=`provider_ambiguous_failure: ${text((error as Error)?.message||error,300)}`;
    try{await finish(outboxId,"failed",null,errorText,0);}catch(finishError){
      return respond({ok:false,error:"provider_failure_and_finish_failed",outbox_id:outboxId,detail:text((finishError as Error)?.message||finishError)},500);
    }
    return respond({ok:false,error:"provider_unreachable",status:"failed",outbox_id:outboxId},503);
  }
});
