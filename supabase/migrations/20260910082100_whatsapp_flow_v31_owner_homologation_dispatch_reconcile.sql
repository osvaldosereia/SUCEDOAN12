create or replace function public.reconcile_whatsapp_flow_owner_homologation_dispatches_v1()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r record;
  v_body jsonb;
  v_ok boolean;
  v_provider text;
  v_sent integer:=0;
  v_error integer:=0;
begin
  for r in
    select j.id as job_id,j.last_dispatch_request_id,h.status_code,h.content,h.timed_out,h.error_msg
      from public.outbound_jobs j
      join net._http_response h on h.id=j.last_dispatch_request_id
     where j.status='processing'
       and j.job_type='seller_message'
       and j.payload->>'delivery_mode'='interactive'
       and j.payload#>>'{interactive,type}'='flow'
       and j.payload ? 'homologation_session_id'
       and exists (
         select 1
           from public.experience_sessions s
           join public.experience_definitions d on d.id=s.definition_id
          where s.id=(j.payload->>'homologation_session_id')::uuid
            and d.slug='flow-cestas-comercial-v8-stable'
            and coalesce((s.context->>'homologation_test')::boolean,false)
            and coalesce((s.context->>'requested_by_owner')::boolean,false)
       )
  loop
    begin
      v_body:=coalesce(nullif(r.content,''),'{}')::jsonb;
    exception when others then
      v_body:='{}'::jsonb;
    end;
    v_ok:=coalesce((v_body->>'ok')::boolean,false);
    v_provider:=nullif(v_body->>'provider_message_id','');

    if coalesce(r.timed_out,false)=false and r.error_msg is null and r.status_code between 200 and 299 and v_ok and v_provider is not null and v_body->>'job_id'=r.job_id::text and v_body->>'interactive_type'='flow' then
      update public.outbound_jobs
         set status='sent',provider_message_id=v_provider,sent_at=coalesce(sent_at,now()),last_error=null,
             dispatch_response_status=r.status_code,dispatch_response=v_body,dispatch_response_checked_at=now(),
             locked_at=null,locked_by=null,updated_at=now()
       where id=r.job_id and status='processing';
      if found then v_sent:=v_sent+1; end if;
    elsif coalesce(r.timed_out,false) or r.error_msg is not null or r.status_code<200 or r.status_code>=300 or (r.status_code between 200 and 299 and not v_ok) then
      update public.outbound_jobs
         set status='error',last_error=left(coalesce(r.error_msg,v_body->>'error','owner_homologation_dispatch_failed'),1000),
             dispatch_response_status=r.status_code,dispatch_response=v_body,dispatch_response_checked_at=now(),
             locked_at=null,locked_by=null,updated_at=now()
       where id=r.job_id and status='processing';
      if found then v_error:=v_error+1; end if;
    end if;
  end loop;

  return jsonb_build_object('ok',true,'sent_reconciled',v_sent,'errors_reconciled',v_error);
end;
$function$;

revoke all on function public.reconcile_whatsapp_flow_owner_homologation_dispatches_v1() from public, anon, authenticated;
grant execute on function public.reconcile_whatsapp_flow_owner_homologation_dispatches_v1() to service_role;

select cron.schedule(
  'dona-antonia-flow-v31-owner-reconcile-v1',
  '* * * * *',
  'select public.reconcile_whatsapp_flow_owner_homologation_dispatches_v1(); select public.recover_whatsapp_flow_owner_homologation_stale_v1(15);'
)
where not exists(select 1 from cron.job where jobname='dona-antonia-flow-v31-owner-reconcile-v1');