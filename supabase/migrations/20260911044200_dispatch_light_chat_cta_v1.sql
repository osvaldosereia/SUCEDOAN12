begin;

create or replace function public.dispatch_whatsapp_outbound_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_cfg public.automation_config%rowtype;
  v_job public.outbound_jobs%rowtype;
  v_profile public.ai_voice_profiles%rowtype;
  v_webhook text;
  v_request_id bigint;
  v_mode text;
  v_payload jsonb;
  v_interactive jsonb;
  v_image text;
  v_cta_url text;
begin
  if p_job_id is null then return jsonb_build_object('ok',false,'reason','job_id_required'); end if;
  select * into v_cfg from public.automation_config where id=1;
  if not coalesce(v_cfg.automation_enabled and v_cfg.outbound_enabled and v_cfg.ai_enabled and v_cfg.conversation_worker_enabled and v_cfg.whatsapp_inbound_enabled and v_cfg.whatsapp_auto_reply_enabled,false) then return jsonb_build_object('ok',true,'skipped','automation_disabled'); end if;
  select j.* into v_job from public.outbound_jobs j join public.conversations c on c.id=j.conversation_id where j.id=p_job_id and j.job_type='seller_message' and j.payload->>'message_kind'='conversation_reply' and j.status in ('pending','error') and coalesce(j.last_error,'') not in ('lease_expired_review_required','dispatch_unreachable_review_required','delivery_uncertain_review_required') and j.not_before<=now() and j.attempts<j.max_attempts and c.mode='ai' and c.service_window_expires_at>now() for update of j;
  if not found then return jsonb_build_object('ok',true,'skipped','job_unavailable'); end if;
  v_mode:=coalesce(v_job.payload->>'delivery_mode','text');
  if v_mode not in ('text','audio','image','interactive') then v_mode:='text'; end if;
  if v_mode in ('text','audio') and nullif(trim(coalesce(v_job.payload->>'body_text','')),'') is null then
    update public.outbound_jobs set status='cancelled',last_error='empty_conversation_reply',locked_at=null,locked_by=null,updated_at=now() where id=v_job.id;
    return jsonb_build_object('ok',true,'skipped','empty_conversation_reply');
  end if;
  if v_mode='audio' then
    select * into v_profile from public.ai_voice_profiles where id=coalesce(nullif(v_job.payload->>'voice_profile',''),'dona_antonia_marin_b_v1') and is_active=true;
    if not found then return jsonb_build_object('ok',false,'reason','voice_profile_unavailable'); end if;
  elsif v_mode='image' then
    v_image:=nullif(v_job.payload->>'image_url','');
    if v_image is null or v_image !~ '^https://' then return jsonb_build_object('ok',false,'reason','image_url_unavailable'); end if;
  elsif v_mode='interactive' then
    v_interactive:=v_job.payload->'interactive';
    if jsonb_typeof(v_interactive) is distinct from 'object' or coalesce(v_interactive->>'type','') not in ('button','list','cta_url') then
      return jsonb_build_object('ok',false,'reason','interactive_payload_invalid');
    end if;
    if coalesce(v_interactive->>'type','')='cta_url' then
      v_cta_url:=coalesce(v_interactive#>>'{action,parameters,url}','');
      if coalesce(v_interactive#>>'{action,name}','')<>'cta_url'
         or nullif(trim(coalesce(v_interactive#>>'{action,parameters,display_text}','')),'') is null
         or not (
           v_cta_url ~ '^https://donaantonia[.]com[.]br/cesta/[?]t=[A-Fa-f0-9]{64}$'
           or v_cta_url ~ '^https://donaantonia[.]com[.]br/catalogo/[?]c=[A-Fa-f0-9]{64}&q=[A-Za-z0-9%._~!$''()*+,;:@/-]+$'
           or v_cta_url ~ '^https://donaantonia[.]com[.]br/comprar/[?]s=[A-Fa-f0-9]{64}$'
         ) then
        return jsonb_build_object('ok',false,'reason','cta_url_payload_invalid');
      end if;
    end if;
  end if;
  select decrypted_secret into v_webhook from vault.decrypted_secrets where name='dona_antonia_whatsapp_outbound_make_webhook' order by created_at desc limit 1;
  if nullif(v_webhook,'') is null then return jsonb_build_object('ok',false,'reason','webhook_unavailable'); end if;
  update public.outbound_jobs set status='processing',attempts=attempts+1,locked_at=now(),locked_by='pgnet-make-outbound-v4',dispatch_attempts=dispatch_attempts+1,last_dispatch_at=now(),last_error=null,dispatch_response_status=null,dispatch_response=null,dispatch_response_checked_at=null,updated_at=now() where id=v_job.id returning * into v_job;
  v_payload:=jsonb_build_object('event','outbound_delivery','protocol_version',4,'job',jsonb_build_object('id',v_job.id::text,'conversation_id',v_job.conversation_id::text,'recipient_e164',v_job.recipient_e164,'attempt',v_job.attempts,'delivery_mode',v_mode,'body_text',left(coalesce(v_job.payload->>'body_text',''),4096),'image_url',v_image,'interactive',v_interactive,'reply_message_id',v_job.payload->>'reply_message_id','voice_profile',case when v_mode='audio' then jsonb_build_object('id',v_profile.id,'model',v_profile.model,'voice',v_profile.voice,'speed',v_profile.speed,'instructions',v_profile.instructions,'output_format',v_profile.output_format) else null end));
  begin
    v_request_id:=net.http_post(url:=v_webhook,body:=v_payload,headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=30000);
  exception when others then
    update public.outbound_jobs set status='error',last_error='dispatch_enqueue_failed',not_before=now()+interval '2 minutes',locked_at=null,locked_by=null,updated_at=now() where id=v_job.id;
    return jsonb_build_object('ok',false,'reason','dispatch_enqueue_failed');
  end;
  update public.outbound_jobs set last_dispatch_request_id=v_request_id,updated_at=now() where id=v_job.id;
  return jsonb_build_object('ok',true,'request_id',v_request_id,'job_id',v_job.id,'protocol_version',4,'delivery_mode',v_mode);
end;
$$;

revoke all on function public.dispatch_whatsapp_outbound_job(uuid) from public,anon,authenticated;
grant execute on function public.dispatch_whatsapp_outbound_job(uuid) to service_role;

commit;
