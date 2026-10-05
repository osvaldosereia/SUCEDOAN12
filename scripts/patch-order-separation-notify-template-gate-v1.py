from pathlib import Path

path=Path('supabase/functions/order-separation-notify-v1/index.ts')
s=path.read_text(encoding='utf-8')

def once(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'anchor not found: {label}')
    if s.count(old)!=1:
        raise SystemExit(f'anchor not unique ({s.count(old)}): {label}')
    s=s.replace(old,new,1)

once(
'''async function canonicalConversation(route:any,order:any,account:any){''',
'''async function templateApprovedForAccount(accountId:string,templateName:string){
  const q=await db.from("whatsapp_templates_v1").select("status").eq("whatsapp_account_id",accountId).eq("name",templateName).eq("language",TEMPLATE_LANGUAGE).maybeSingle();
  if(q.error)throw q.error;
  return String(q.data?.status||"").toUpperCase()==="APPROVED";
}

async function canonicalConversation(route:any,order:any,account:any){''',
'approval helper'
)

once(
'''    const templateName=TEMPLATE_BY_KIND[kind][channel];
    const originalTotal=completion.original_total??order.total??0,finalTotal=completion.final_total??order.total??0;''',
'''    const templateName=TEMPLATE_BY_KIND[kind][channel];
    const templateApproved=await templateApprovedForAccount(account.id,templateName);
    const originalTotal=completion.original_total??order.total??0,finalTotal=completion.final_total??order.total??0;''',
'template approval lookup'
)

once(
'''    const payload={public_code:publicCode,order_url:orderUrl,missing_items:missingItems,missing_items_text:missingText,original_total:originalTotal,missing_subtotal:missingSubtotal,final_total:finalTotal,template_name:templateName,components};
    const insert=await db.from("order_separation_customer_notifications_v1").insert({
      order_id:orderId,notification_kind:kind,status:"sending",whatsapp_account_id:account.id,
      conversation_id:uuid(route.conversation_id)||uuid(order.conversation_id)||null,customer_id:order.customer_id||null,
      phone_e164:routePhone,channel_origin:channel,template_name:templateName,attempt_count:1,payload
    }).select("id,status,provider_message_id").maybeSingle();''',
'''    const payload={public_code:publicCode,order_url:orderUrl,missing_items:missingItems,missing_items_text:missingText,original_total:originalTotal,missing_subtotal:missingSubtotal,final_total:finalTotal,template_name:templateName,components};
    const initialStatus=templateApproved?"sending":"pending";
    const insert=await db.from("order_separation_customer_notifications_v1").insert({
      order_id:orderId,notification_kind:kind,status:initialStatus,whatsapp_account_id:account.id,
      conversation_id:uuid(route.conversation_id)||uuid(order.conversation_id)||null,customer_id:order.customer_id||null,
      phone_e164:routePhone,channel_origin:channel,template_name:templateName,attempt_count:templateApproved?1:0,payload
    }).select("id,status,provider_message_id").maybeSingle();''',
'initial pending state'
)

once(
'''      if(existing.data?.status==="accepted")return respond({ok:true,status:"accepted",duplicate:true,notification_id:existing.data.id,provider_message_id:existing.data.provider_message_id,public_code:publicCode});
      if(existing.data?.status==="sending"||existing.data?.status==="uncertain")return respond({ok:false,error:"notification_not_retryable",status:existing.data.status,notification_id:existing.data.id},409);
      if(body?.retry!==true)return respond({ok:false,error:"notification_requires_explicit_retry",status:existing.data?.status||"failed",notification_id:existing.data?.id||null},409);
      const claimed=await db.from("order_separation_customer_notifications_v1").update({status:"sending",last_error:null,attempt_count:2,updated_at:new Date().toISOString(),payload}).eq("id",existing.data.id).in("status",["pending","retry","failed"]).select("id,status,provider_message_id").maybeSingle();
      if(claimed.error)throw claimed.error;if(!claimed.data)return respond({ok:false,error:"notification_claim_failed"},409);
      notification=claimed.data;
    }

    let result:any=null;''',
'''      if(existing.data?.status==="accepted")return respond({ok:true,status:"accepted",duplicate:true,notification_id:existing.data.id,provider_message_id:existing.data.provider_message_id,public_code:publicCode});
      if(existing.data?.status==="sending"||existing.data?.status==="uncertain")return respond({ok:false,error:"notification_not_retryable",status:existing.data.status,notification_id:existing.data.id},409);
      if(existing.data?.status==="pending"&&!templateApproved)return respond({ok:true,status:"pending",reason:"template_pending_approval",notification_id:existing.data.id,template_name:templateName,public_code:publicCode},202);
      const automaticPendingClaim=existing.data?.status==="pending"&&templateApproved;
      if(!automaticPendingClaim&&body?.retry!==true)return respond({ok:false,error:"notification_requires_explicit_retry",status:existing.data?.status||"failed",notification_id:existing.data?.id||null},409);
      const claimable=automaticPendingClaim?["pending"]:["retry","failed"];
      const claimed=await db.from("order_separation_customer_notifications_v1").update({status:"sending",last_error:null,attempt_count:automaticPendingClaim?1:2,updated_at:new Date().toISOString(),payload}).eq("id",existing.data.id).in("status",claimable).select("id,status,provider_message_id").maybeSingle();
      if(claimed.error)throw claimed.error;if(!claimed.data)return respond({ok:false,error:"notification_claim_failed"},409);
      notification=claimed.data;
    }

    if(!templateApproved)return respond({ok:true,status:"pending",reason:"template_pending_approval",notification_id:notification?.id||null,template_name:templateName,public_code:publicCode},202);

    let result:any=null;''',
'duplicate pending gate'
)

path.write_text(s,encoding='utf-8')
print('order separation template approval gate patched')
