from pathlib import Path

p=Path('supabase/functions/admin-orders-v1/index.ts')
s=p.read_text(encoding='utf-8')

old='const labels:Record<string,string>={pix:"PIX",dinheiro:"Dinheiro",cash:"Dinheiro",credito:"Cartão de crédito",credit_card:"Cartão de crédito",alimentacao:"Cartão alimentação",refeicao:"Cartão refeição"};'
new='const labels:Record<string,string>={pix:"PIX",dinheiro:"Dinheiro",cash:"Dinheiro",credito:"Cartão de crédito",credit_card:"Cartão de crédito",alimentacao:"Cartão alimentação",refeicao:"Cartão refeição",food_card:"Cartão alimentação/refeição"};'
if old not in s:
    raise SystemExit('payment label anchor not found')
s=s.replace(old,new,1)

old='async function finish(outboxId:string,status:"sent"|"retry"|"failed"|"suppressed",externalId:string|null,lastError:string|null,retrySeconds=300){'
new='async function finish(outboxId:string,status:"accepted"|"sent"|"retry"|"failed"|"suppressed",externalId:string|null,lastError:string|null,retrySeconds=300){'
if old not in s:
    raise SystemExit('finish status anchor not found')
s=s.replace(old,new,1)

old='''      if(response.ok){
        const externalId=text(data?.external_message_id||data?.message_id||data?.id||"",200)||null;
        await finish(outboxId,"sent",externalId,null);
        void enqueuePapoAiOrderSignals(orderId,channel,item.phone_e164,details);
        return respond({ok:true,status:"sent",outbox_id:outboxId,recipient_kind:item.recipient_kind,channel_origin:channel,dispatch_scope:scope,external_message_id:externalId});
      }'''
new='''      if(response.ok){
        const rawExternalId=text(data?.external_message_id||data?.message_id||data?.id||"",200)||null;
        const externalId=rawExternalId?.startsWith("wamid.")?rawExternalId:null;
        const providerAcceptanceId=text(data?.data?.event_id||data?.event_id||"",200)||null;
        const nextStatus=externalId?"sent":"accepted";
        if(!externalId){
          const acceptanceAudit=await db.from("ops2_whatsapp_outbox_v1")
            .update({payload:{...obj(item.payload),provider_request:providerPayload,provider_acceptance:{http_status:response.status,event_id:providerAcceptanceId,queued:data?.data?.queued===true,accepted_at:new Date().toISOString()}}})
            .eq("id",outboxId).eq("status","sending");
          if(acceptanceAudit.error)throw new Error(`provider_acceptance_audit_failed: ${text(acceptanceAudit.error.message,240)}`);
        }
        await finish(outboxId,nextStatus,externalId,null);
        void enqueuePapoAiOrderSignals(orderId,channel,item.phone_e164,details);
        return respond({ok:true,status:nextStatus,outbox_id:outboxId,recipient_kind:item.recipient_kind,channel_origin:channel,dispatch_scope:scope,provider_acceptance_id:providerAcceptanceId,external_message_id:externalId});
      }'''
if old not in s:
    raise SystemExit('provider success anchor not found')
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')
print('patched admin-orders-v1 real WhatsApp delivery state')
