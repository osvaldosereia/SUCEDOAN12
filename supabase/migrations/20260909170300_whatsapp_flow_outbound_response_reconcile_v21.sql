begin;

create or replace function public.reconcile_whatsapp_outbound_responses_v3()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.outbound_jobs%rowtype;
  v_resp record;
  v_json jsonb;
  v_sent integer:=0;
  v_review integer:=0;
  v_waiting integer:=0;
  v_provider_id text;
  v_mode text;
  v_expected_interactive_type text;
begin
  for v_job in
    select j.*
      from public.outbound_jobs j
     where j.job_type='seller_message'
       and j.payload->>'message_kind'='conversation_reply'
       and j.status='processing'
       and j.locked_by in ('pgnet-make-outbound-v3','pgnet-make-outbound-v4','pgnet-make-flow-v1')
     order by j.locked_at,j.id
     limit 100
     for update skip locked
  loop
    if v_job.last_dispatch_request_id is null then
      if v_job.locked_at<now()-interval '2 minutes' then
        update public.outbound_jobs
           set status='error',last_error='delivery_uncertain_review_required',not_before=now()+interval '100 years',
               locked_at=null,locked_by=null,dispatch_response_checked_at=now(),updated_at=now()
         where id=v_job.id;
        v_review:=v_review+1;
      else v_waiting:=v_waiting+1;
      end if;
      continue;
    end if;

    select r.* into v_resp from net._http_response r
     where r.id=v_job.last_dispatch_request_id order by r.created desc limit 1;

    if not found then
      if v_job.locked_at<now()-interval '2 minutes' then
        update public.outbound_jobs
           set status='error',last_error='delivery_uncertain_review_required',not_before=now()+interval '100 years',
               locked_at=null,locked_by=null,dispatch_response_checked_at=now(),updated_at=now()
         where id=v_job.id;
        v_review:=v_review+1;
      else v_waiting:=v_waiting+1;
      end if;
      continue;
    end if;

    v_json:=null;
    begin
      if nullif(trim(coalesce(v_resp.content,'')),'') is not null then v_json:=v_resp.content::jsonb; end if;
    exception when others then v_json:=null;
    end;

    update public.outbound_jobs
       set dispatch_response_status=v_resp.status_code,
           dispatch_response=case when jsonb_typeof(v_json)='object' then v_json else null end,
           dispatch_response_checked_at=now(),updated_at=now()
     where id=v_job.id;

    if coalesce(v_resp.timed_out,false)
       or nullif(v_resp.error_msg,'') is not null
       or coalesce(v_resp.status_code,0)<200
       or coalesce(v_resp.status_code,0)>=300
       or jsonb_typeof(v_json) is distinct from 'object'
       or coalesce(v_json->>'ok','')<>'true'
       or coalesce(v_json->>'job_id','')<>v_job.id::text then
      update public.outbound_jobs
         set status='error',last_error='delivery_uncertain_review_required',not_before=now()+interval '100 years',
             locked_at=null,locked_by=null,updated_at=now()
       where id=v_job.id;
      v_review:=v_review+1;
      continue;
    end if;

    v_provider_id:=nullif(trim(coalesce(v_json->>'provider_message_id','')),'');
    v_mode:=coalesce(v_job.payload->>'delivery_mode','text');
    if v_mode not in ('text','audio','image','interactive') then v_mode:='text'; end if;
    v_expected_interactive_type:=case when v_mode='interactive' then coalesce(v_job.payload#>>'{interactive,type}','') else '' end;

    if v_provider_id is null
       or length(v_provider_id)>500
       or coalesce(v_json->>'delivery_mode','')<>v_mode
       or (v_expected_interactive_type='flow' and coalesce(v_json->>'interactive_type','')<>'flow') then
      update public.outbound_jobs
         set status='error',last_error='delivery_uncertain_review_required',not_before=now()+interval '100 years',
             locked_at=null,locked_by=null,updated_at=now()
       where id=v_job.id;
      v_review:=v_review+1;
      continue;
    end if;

    perform public.finish_outbound_job(v_job.id,true,v_provider_id,null,120);
    v_sent:=v_sent+1;
  end loop;

  return jsonb_build_object('sent',v_sent,'review_required',v_review,'waiting',v_waiting);
end;
$$;

revoke all on function public.reconcile_whatsapp_outbound_responses_v3() from public,anon,authenticated;
grant execute on function public.reconcile_whatsapp_outbound_responses_v3() to service_role;

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'flow_outbound_response_reconcile',true,
  'flow_outbound_response_reconcile_version','v21',
  'implementation_stage','new_order_flow_transport_complete_v21'
),updated_at=now()
where slug='flow-cestas-comercial-v1';

commit;
