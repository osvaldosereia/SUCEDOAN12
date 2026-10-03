begin;

create or replace function public.ops2_ana_claim_dry_run_job_v1(p_job_id uuid)
returns setof public.whatsapp_ana_jobs_v1
language plpgsql
security definer
set search_path=''
as $function$
begin
  if p_job_id is null then return; end if;

  return query
  with picked as (
    select j.id
    from public.whatsapp_ana_jobs_v1 j
    where j.id=p_job_id
      and j.status='queued'
      and j.dry_run=true
      and j.available_at<=now()
    for update skip locked
  ), claimed as (
    update public.whatsapp_ana_jobs_v1 j
    set status='claimed',
        claimed_at=now(),
        attempt_count=j.attempt_count+1,
        updated_at=now(),
        last_error=null
    from picked p
    where j.id=p.id
    returning j.*
  )
  select * from claimed;
end;
$function$;

revoke all on function public.ops2_ana_claim_dry_run_job_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_ana_claim_dry_run_job_v1(uuid) to service_role;

commit;
