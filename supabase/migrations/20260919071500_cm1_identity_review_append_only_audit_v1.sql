create table if not exists public.customer_identity_review_audit (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.customer_identity_resolution_evaluations(id),
  review_status text not null check (review_status in ('approved','rejected')),
  selected_customer_id uuid null references public.customers(id),
  review_notes text not null,
  reviewed_by uuid not null,
  actor_role text null,
  actor_display_name text null,
  created_at timestamptz not null default now()
);

alter table public.customer_identity_review_audit enable row level security;
revoke all on public.customer_identity_review_audit from anon, authenticated;
grant select, insert on public.customer_identity_review_audit to service_role;

create or replace function public.prevent_identity_review_audit_mutation_v1()
returns trigger language plpgsql as $$
begin
  raise exception 'identity_review_audit_is_append_only';
end;
$$;

drop trigger if exists trg_identity_review_audit_append_only on public.customer_identity_review_audit;
create trigger trg_identity_review_audit_append_only
before update or delete on public.customer_identity_review_audit
for each row execute function public.prevent_identity_review_audit_mutation_v1();

create or replace function public.review_identity_conflict_v1(
  p_evaluation_id uuid,
  p_review text,
  p_selected_customer_id uuid,
  p_notes text,
  p_reviewed_by uuid,
  p_actor_role text default null,
  p_actor_display_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eval public.customer_identity_resolution_evaluations%rowtype;
  v_candidates jsonb;
  v_result jsonb;
begin
  if p_review not in ('approved','rejected') then raise exception 'invalid_review'; end if;
  if length(trim(coalesce(p_notes,''))) < 5 then raise exception 'identity_review_note_required'; end if;

  select * into v_eval from public.customer_identity_resolution_evaluations where id=p_evaluation_id for update;
  if not found then raise exception 'identity_evaluation_not_found'; end if;
  if v_eval.decision <> 'conflict' then raise exception 'identity_review_requires_conflict'; end if;
  if v_eval.review_status <> 'pending' then raise exception 'identity_review_already_closed'; end if;

  v_candidates := coalesce(v_eval.evidence->'candidate_ids','[]'::jsonb);
  if p_review='approved' then
    if p_selected_customer_id is null then raise exception 'customer_id_required'; end if;
    if not (v_candidates ? p_selected_customer_id::text) then raise exception 'customer_not_in_candidates'; end if;
  else
    p_selected_customer_id := null;
  end if;

  update public.customer_identity_resolution_evaluations
  set review_status=p_review,
      customer_id=case when p_review='approved' then p_selected_customer_id else customer_id end,
      reviewed_at=now(), reviewed_by=p_reviewed_by, review_notes=trim(p_notes)
  where id=p_evaluation_id
  returning jsonb_build_object('id',id,'decision',decision,'customer_id',customer_id,'confidence',confidence,'match_method',match_method,'review_status',review_status,'reviewed_at',reviewed_at,'review_notes',review_notes)
  into v_result;

  insert into public.customer_identity_review_audit(evaluation_id,review_status,selected_customer_id,review_notes,reviewed_by,actor_role,actor_display_name)
  values(p_evaluation_id,p_review,p_selected_customer_id,trim(p_notes),p_reviewed_by,p_actor_role,p_actor_display_name);

  return v_result;
end;
$$;

revoke all on function public.review_identity_conflict_v1(uuid,text,uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.review_identity_conflict_v1(uuid,text,uuid,text,uuid,text,text) to service_role;

create or replace function public.audit_identity_review_transition_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if old.review_status='pending' and new.review_status in ('approved','rejected') then
    insert into public.customer_identity_review_audit(
      evaluation_id,review_status,selected_customer_id,review_notes,reviewed_by,actor_role,actor_display_name
    ) values (
      new.id,new.review_status,
      case when new.review_status='approved' then new.customer_id else null end,
      coalesce(new.review_notes,''),new.reviewed_by,null,null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_identity_review_transition_audit on public.customer_identity_resolution_evaluations;
create trigger trg_identity_review_transition_audit
after update of review_status on public.customer_identity_resolution_evaluations
for each row execute function public.audit_identity_review_transition_audit_v1();