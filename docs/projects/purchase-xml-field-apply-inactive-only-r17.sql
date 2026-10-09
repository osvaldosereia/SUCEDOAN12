-- R17 INTEGRATION DRAFT: NOT A MIGRATION. DO NOT DEPLOY TO PRODUCTION.
-- Additional hard gate: name apply/rollback ONLY when products.is_active = false.
-- Active products must not have their public catalog names changed in this experimental flow.
-- Depends on #990: purchase_xml_field_reviews_v1 / purchase_xml_review_event_immutable_v1.
-- This draft handles *only* explicit, human-initiated NAME changes after ledger approval.
-- GTIN, packaging, unit, NCM, CEST, stock, price, cost, Bling and finance: forbidden.
-- The calling gateway must authenticate the human owner/admin and supply p_actor_id;
-- no source XML reader, cron job, catalog ingest or upload may invoke these RPCs.
create table if not exists public.purchase_xml_field_applications_v1 (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.purchase_xml_field_reviews_v1(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  field_name text not null check (field_name='name'),
  before_value text,
  applied_value text not null,
  review_revision integer not null,
  status text not null default 'applied' check (status in ('applied','rolled_back')),
  applied_by uuid not null,
  applied_at timestamptz not null default now(),
  rolled_back_by uuid,
  rolled_back_at timestamptz
);
create table if not exists public.purchase_xml_field_application_events_v1 (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.purchase_xml_field_applications_v1(id) on delete restrict,
  operation text not null check (operation in ('applied','rolled_back')),
  prior_value text,
  new_value text,
  actor_id uuid not null,
  recorded_at timestamptz not null default now()
);
create index if not exists purchase_xml_field_application_product_idx
  on public.purchase_xml_field_applications_v1(product_id,applied_at desc);
create index if not exists purchase_xml_field_application_events_app_idx
  on public.purchase_xml_field_application_events_v1(application_id,id);
alter table public.purchase_xml_field_applications_v1 enable row level security;
alter table public.purchase_xml_field_application_events_v1 enable row level security;
revoke all on public.purchase_xml_field_applications_v1 from public,anon,authenticated;
revoke all on public.purchase_xml_field_application_events_v1 from public,anon,authenticated;
grant select,insert,update on public.purchase_xml_field_applications_v1 to service_role;
grant select,insert on public.purchase_xml_field_application_events_v1 to service_role;
grant usage,select on sequence public.purchase_xml_field_application_events_v1_id_seq to service_role;
drop trigger if exists purchase_xml_field_application_event_immutable_v1
  on public.purchase_xml_field_application_events_v1;
create trigger purchase_xml_field_application_event_immutable_v1
  before update or delete on public.purchase_xml_field_application_events_v1
  for each row execute function public.purchase_xml_review_event_immutable_v1();

-- Block changing a decision from approved while its single application is active.
-- The operator must reverse the effect before reopening the decision.
create or replace function public.purchase_xml_guard_applied_review_v1()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if old.status='approved' and new.status is distinct from 'approved'
    and exists (select 1 from public.purchase_xml_field_applications_v1 a
                where a.review_id=old.id and a.status='applied')
  then raise exception 'xml_review_rollback_required'; end if;
  return new;
end;$$;
revoke all on function public.purchase_xml_guard_applied_review_v1()
from public,anon,authenticated;
grant execute on function public.purchase_xml_guard_applied_review_v1() to service_role;
drop trigger if exists purchase_xml_guard_applied_review_v1
  on public.purchase_xml_field_reviews_v1;
create trigger purchase_xml_guard_applied_review_v1
  before update of status on public.purchase_xml_field_reviews_v1
  for each row execute function public.purchase_xml_guard_applied_review_v1();

-- Read-only preview; deliberately returns no XML, service key, price or stock.
create or replace function public.purchase_xml_preview_field_application_v1(p_review_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v record;
begin
  select r.id,r.product_id,r.field_name,r.status,r.revision,
         r.original_value,r.proposed_value,p.name as current_value,p.is_active as product_is_active,
         exists(select 1 from public.purchase_xml_field_applications_v1 a
                where a.review_id=r.id) as already_attempted
  into v from public.purchase_xml_field_reviews_v1 r
  join public.products p on p.id=r.product_id
  where r.id=p_review_id;
  if not found then raise exception 'xml_apply_review_not_found'; end if;
  return jsonb_build_object('review_id',v.id,'product_id',v.product_id,
    'field_name',v.field_name,'review_revision',v.revision,
    'current_value',v.current_value,'product_is_active',v.product_is_active,
    'expected_value',v.original_value,
    'proposed_value',v.proposed_value,
    'can_apply',v.status='approved' and v.field_name='name'
       and v.product_is_active is false
       and v.current_value is not distinct from v.original_value
       and v.current_value is distinct from v.proposed_value
       and not v.already_attempted,
    'readonly',true,'product_updated',false);
end;$$;
revoke all on function public.purchase_xml_preview_field_application_v1(uuid)
from public,anon,authenticated;
grant execute on function public.purchase_xml_preview_field_application_v1(uuid) to service_role;

-- APPLY: explicit confirmation *separate* from approval, reviewed revision,
-- a current-value compare-and-swap and an immutable event, all in one transaction.
create or replace function public.purchase_xml_apply_field_review_v1(
  p_review_id uuid,p_expected_revision integer,p_actor_id uuid,p_confirmation text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v public.purchase_xml_field_reviews_v1%rowtype;
  v_current text;
  v_active boolean;
  v_application uuid;
  v_count integer;
begin
  if p_actor_id is null or p_review_id is null
  then raise exception 'xml_apply_identity_required'; end if;
  if p_confirmation is distinct from 'APLICAR_NOME_APROVADO_XML'
  then raise exception 'xml_apply_confirmation_required'; end if;
  select * into v from public.purchase_xml_field_reviews_v1
    where id=p_review_id for update;
  if not found then raise exception 'xml_apply_review_not_found'; end if;
  if v.revision is distinct from p_expected_revision
  then raise exception 'xml_apply_stale_review'; end if;
  if v.status<>'approved' or v.field_name<>'name'
  then raise exception 'xml_apply_field_not_authorized'; end if;
  if exists(select 1 from public.purchase_xml_field_applications_v1 where review_id=v.id)
  then raise exception 'xml_apply_already_applied'; end if;
  select name,is_active into v_current,v_active from public.products where id=v.product_id for update;
  if not found then raise exception 'xml_apply_product_missing'; end if;
  if v_active is distinct from false
  then raise exception 'xml_apply_active_product_blocked'; end if;
  if v_current is distinct from v.original_value
  then raise exception 'xml_apply_product_changed'; end if;
  if v_current is not distinct from v.proposed_value
  then raise exception 'xml_apply_no_change'; end if;

  update public.products set name=v.proposed_value
    where id=v.product_id and name is not distinct from v.original_value;
  get diagnostics v_count=row_count;
  if v_count<>1 then raise exception 'xml_apply_compare_and_swap_failed'; end if;
  insert into public.purchase_xml_field_applications_v1
    (review_id,product_id,field_name,before_value,applied_value,
     review_revision,applied_by)
  values(v.id,v.product_id,'name',v_current,v.proposed_value,v.revision,p_actor_id)
  returning id into v_application;
  insert into public.purchase_xml_field_application_events_v1
    (application_id,operation,prior_value,new_value,actor_id)
  values(v_application,'applied',v_current,v.proposed_value,p_actor_id);
  return jsonb_build_object('ok',true,'application_id',v_application,
    'product_id',v.product_id,'changed_field','name','product_updated',true,
    'stock_updated',false,'price_updated',false,'fiscal_updated',false,
    'bling_called',false,'finance_updated',false);
end;$$;
revoke all on function public.purchase_xml_apply_field_review_v1(uuid,integer,uuid,text)
from public,anon,authenticated;
grant execute on function public.purchase_xml_apply_field_review_v1(uuid,integer,uuid,text)
to service_role;

-- ROLLBACK: never overwrite an intervening update; CAS must still match
-- the exact value this application wrote. A rolled-back application is final.
create or replace function public.purchase_xml_rollback_field_review_v1(
  p_application_id uuid,p_actor_id uuid,p_confirmation text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v public.purchase_xml_field_applications_v1%rowtype;
  v_current text;
  v_active boolean;
  v_count integer;
begin
  if p_actor_id is null or p_application_id is null
  then raise exception 'xml_rollback_identity_required'; end if;
  if p_confirmation is distinct from 'REVERTER_NOME_APLICADO_XML'
  then raise exception 'xml_rollback_confirmation_required'; end if;
  select * into v from public.purchase_xml_field_applications_v1
    where id=p_application_id for update;
  if not found then raise exception 'xml_rollback_not_found'; end if;
  if v.status<>'applied' or v.field_name<>'name'
  then raise exception 'xml_rollback_not_allowed'; end if;
  select name,is_active into v_current,v_active from public.products where id=v.product_id for update;
  if not found then raise exception 'xml_rollback_product_missing'; end if;
  if v_active is distinct from false
  then raise exception 'xml_rollback_active_product_blocked'; end if;
  if v_current is distinct from v.applied_value
  then raise exception 'xml_rollback_product_changed'; end if;
  update public.products set name=v.before_value
    where id=v.product_id and name is not distinct from v.applied_value;
  get diagnostics v_count=row_count;
  if v_count<>1 then raise exception 'xml_rollback_compare_and_swap_failed'; end if;
  update public.purchase_xml_field_applications_v1 set
    status='rolled_back',rolled_back_by=p_actor_id,rolled_back_at=now()
    where id=v.id;
  insert into public.purchase_xml_field_application_events_v1
    (application_id,operation,prior_value,new_value,actor_id)
  values(v.id,'rolled_back',v_current,v.before_value,p_actor_id);
  return jsonb_build_object('ok',true,'application_id',v.id,
    'product_id',v.product_id,'rolled_back',true,'product_updated',true,
    'stock_updated',false,'price_updated',false,'fiscal_updated',false,
    'bling_called',false,'finance_updated',false);
end;$$;
revoke all on function public.purchase_xml_rollback_field_review_v1(uuid,uuid,text)
from public,anon,authenticated;
grant execute on function public.purchase_xml_rollback_field_review_v1(uuid,uuid,text)
to service_role;
comment on table public.purchase_xml_field_applications_v1 is
'R16 draft: explicit human name-only application, immutable apply/rollback history; not authorized for production until integrated acceptance gates.';
