begin;

revoke delete on table public.marketing_render_triage_requests from service_role;

create or replace function public.guard_marketing_render_triage_request_v1()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  if tg_op='DELETE' then raise exception 'marketing_render_triage_delete_forbidden'; end if;
  if new.id<>old.id or new.job_id<>old.job_id or new.asset_id<>old.asset_id or new.action<>old.action
     or new.reason_code<>old.reason_code or new.idempotency_key<>old.idempotency_key
     or new.requested_by is distinct from old.requested_by or new.requested_at<>old.requested_at
     or new.eligibility_snapshot is distinct from old.eligibility_snapshot or new.created_at<>old.created_at then
    raise exception 'marketing_render_triage_identity_immutable';
  end if;
  if old.status='pending_review' and new.status not in ('pending_review','approved','blocked','cancelled') then raise exception 'invalid_triage_status_transition'; end if;
  if old.status='approved' and new.status not in ('approved','executed','blocked','cancelled') then raise exception 'invalid_triage_status_transition'; end if;
  if old.status in ('executed','blocked','cancelled') and new.status<>old.status then raise exception 'terminal_triage_status_immutable'; end if;
  return new;
end;
$$;

revoke all on function public.guard_marketing_render_triage_request_v1() from public,anon,authenticated;
grant execute on function public.guard_marketing_render_triage_request_v1() to service_role;

drop trigger if exists trg_guard_marketing_render_triage_request_v1 on public.marketing_render_triage_requests;
create trigger trg_guard_marketing_render_triage_request_v1
before update or delete on public.marketing_render_triage_requests
for each row execute function public.guard_marketing_render_triage_request_v1();

commit;