begin;

create or replace function public.recover_conversation_worker_dispatch_v3()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  cfg public.automation_config%rowtype;
  r record;
  v_dispatched integer:=0;
  v_held integer:=0;
  v_expired integer:=0;
begin
  select * into cfg from public.automation_config where id=1;

  for r in
    select id from public.ai_jobs
    where status='processing'
      and locked_at<now()-interval '10 minutes'
      and locked_by like 'conversation-%'
    order by locked_at
    limit 20
    for update skip locked
  loop
    update public.ai_jobs
      set status='error',error_message='lease_expired_review_required',updated_at=now()
      where id=r.id;
    v_expired:=v_expired+1;
  end loop;

  if not coalesce(cfg.automation_enabled and cfg.ai_enabled and cfg.conversation_worker_enabled and cfg.conversation_worker_dispatch_enabled,false) then
    return jsonb_build_object('active',false,'dispatched',0,'held',0,'expired_to_review',v_expired,'worker_version',3);
  end if;

  for r in
    select id,worker_dispatch_attempts from public.ai_jobs
    where status='pending'
      and not_before<=now()
      and (worker_dispatched_at is null or worker_dispatched_at<now()-interval '75 seconds')
    order by created_at
    limit 10
    for update skip locked
  loop
    if r.worker_dispatch_attempts>=cfg.conversation_worker_dispatch_max_attempts then
      update public.ai_jobs
        set status='held',error_message='worker_dispatch_exhausted_human_required',updated_at=now()
        where id=r.id;
      v_held:=v_held+1;
    else
      perform public.dispatch_conversation_worker_job_v3(r.id);
      v_dispatched:=v_dispatched+1;
    end if;
  end loop;

  return jsonb_build_object('active',true,'dispatched',v_dispatched,'held',v_held,'expired_to_review',v_expired,'worker_version',3);
end;
$$;

revoke all on function public.recover_conversation_worker_dispatch_v3() from public,anon,authenticated;
grant execute on function public.recover_conversation_worker_dispatch_v3() to service_role;

create or replace function public.recover_conversation_worker_dispatch_v2()
returns jsonb
language sql
security definer
set search_path=''
as $$
  select public.recover_conversation_worker_dispatch_v3();
$$;
revoke all on function public.recover_conversation_worker_dispatch_v2() from public,anon,authenticated;
grant execute on function public.recover_conversation_worker_dispatch_v2() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname='dona-antonia-conversation-worker-recovery-v2';

select cron.schedule(
  'dona-antonia-conversation-worker-recovery-v3',
  '* * * * *',
  'select public.recover_conversation_worker_dispatch_v3();'
)
where not exists(select 1 from cron.job where jobname='dona-antonia-conversation-worker-recovery-v3');

commit;
