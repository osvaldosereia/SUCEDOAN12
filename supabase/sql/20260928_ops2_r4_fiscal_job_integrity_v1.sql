-- R4 fiscal job integrity + retry/readiness observability.
create or replace function public.ops2_guard_dispatch_fiscal_job_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  key_digits text;
begin
  if new.status='authorized' then
    key_digits:=regexp_replace(coalesce(new.access_key,''),'[^0-9]','','g');
    if coalesce(new.bling_invoice_id,0)<=0 then
      raise exception 'authorized_fiscal_job_missing_invoice_id';
    end if;
    if length(key_digits)<>44 then
      raise exception 'authorized_fiscal_job_invalid_access_key';
    end if;
    if nullif(trim(coalesce(new.sefaz_status,'')),'') is null then
      raise exception 'authorized_fiscal_job_missing_sefaz_status';
    end if;
    new.finished_at:=coalesce(new.finished_at,now());
  end if;

  if new.status in ('generating','authorizing') and new.attempts>new.max_attempts then
    raise exception 'fiscal_job_attempt_limit_exceeded';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ops2_guard_dispatch_fiscal_job_v1 on public.dispatch_fiscal_jobs;
create trigger trg_ops2_guard_dispatch_fiscal_job_v1
before insert or update on public.dispatch_fiscal_jobs
for each row execute function public.ops2_guard_dispatch_fiscal_job_v1();

revoke all on function public.ops2_guard_dispatch_fiscal_job_v1() from public,anon,authenticated;
grant execute on function public.ops2_guard_dispatch_fiscal_job_v1() to service_role;

create or replace function public.get_ops2_fiscal_dispatch_health_v1()
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
select jsonb_build_object(
  'generated_at',now(),
  'authorized',count(*) filter(where status='authorized'),
  'review_required',count(*) filter(where status='review_required'),
  'error',count(*) filter(where status='error'),
  'generating_stale',count(*) filter(where status='generating' and updated_at<now()-interval '5 minutes'),
  'authorizing_stale',count(*) filter(where status='authorizing' and updated_at<now()-interval '5 minutes'),
  'authorized_invalid_document',count(*) filter(
    where status='authorized' and (
      coalesce(bling_invoice_id,0)<=0
      or length(regexp_replace(coalesce(access_key,''),'[^0-9]','','g'))<>44
      or nullif(trim(coalesce(sefaz_status,'')),'') is null
    )
  ),
  'retry_policy','reconcile_only_after_irreversible_post',
  'max_write_attempts',1
)
from public.dispatch_fiscal_jobs;
$$;

revoke all on function public.get_ops2_fiscal_dispatch_health_v1() from public,anon,authenticated;
grant execute on function public.get_ops2_fiscal_dispatch_health_v1() to service_role;