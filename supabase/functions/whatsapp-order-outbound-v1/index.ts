import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const PROVIDER_URL=Deno.env.get("WHATSAPP_OUTBOUND_URL")||"";
const PROVIDER_TOKEN=Deno.env.get("WHATSAPP_OUTBOUND_TOKEN")||"";
const db=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const text=(v:unknown,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return respond({ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_ROLE_KEY)return respond({ok:false,error:"server_config"},500);
  const auth=req.headers.get("authorization")||"";
  if(auth!==`Bearer ${SERVICE_ROLE_KEY}`)return respond({ok:false,error:"forbidden"},403);
  if(!PROVIDER_URL||!PROVIDER_TOKEN)return respond({ok:false,error:"provider_not_configured"},503);

  const claim=await db.rpc("ops2_claim_whatsapp_outbox_v1");
  if(claim.error)return respond({ok:false,error:"claim_failed",detail:text(claim.error.message)},503);
  if(claim.data?.found!==true)return respond({ok:true,status:"idle",sent:false});

  const item=claim.data.item||{};
  const outboxId=String(item.id||"");
  const attemptCount=Number(item.attempt_count||0);
  const providerPayload={
    idempotency_key:outboxId,
    to:item.phone_e164,
    channel_origin:item.channel_origin,
    channel_phone_e164:item.channel_phone_e164,
    message_kind:item.message_kind,
    payload:item.payload||{}
  };

  try{
    const response=await fetch(PROVIDER_URL,{
      method:"POST",
      headers:{"Authorization":`Bearer ${PROVIDER_TOKEN}`,"Content-Type":"application/json"},
      body:JSON.stringify(providerPayload)
    });
    const data=await response.json().catch(()=>({}));
    if(response.ok){
      const externalMessageId=text(data?.external_message_id||data?.message_id||data?.id||"",200)||null;
      const done=await db.rpc("ops2_finish_whatsapp_outbox_v1",{
        p_outbox_id:outboxId,p_status:"sent",p_external_message_id:externalMessageId,p_last_error:null,p_retry_after_seconds:300
      });
      if(done.error||done.data?.ok!==true)return respond({ok:false,error:"finish_failed",provider_sent:true},500);
      return respond({ok:true,status:"sent",outbox_id:outboxId,external_message_id:externalMessageId});
    }

    const transient=response.status===429||response.status>=500;
    const finishStatus=transient&&attemptCount<5?"retry":"failed";
    const errorText=`provider_http_${response.status}: ${text(data?.error||data?.message||response.statusText,300)}`;
    await db.rpc("ops2_finish_whatsapp_outbox_v1",{
      p_outbox_id:outboxId,p_status:finishStatus,p_external_message_id:null,p_last_error:errorText,p_retry_after_seconds:300
    });
    return respond({ok:false,error:"provider_rejected",status:finishStatus,outbox_id:outboxId},transient?503:502);
  }catch(error){
    const finishStatus=attemptCount<5?"retry":"failed";
    await db.rpc("ops2_finish_whatsapp_outbox_v1",{
      p_outbox_id:outboxId,p_status:finishStatus,p_external_message_id:null,p_last_error:text((error as Error)?.message||error,300),p_retry_after_seconds:300
    });
    return respond({ok:false,error:"provider_unreachable",status:finishStatus,outbox_id:outboxId},503);
  }
});
