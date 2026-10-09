-- R24 FIELD REVIEW + APPLICATION RELEASE CANDIDATE. INACTIVE NAME ONLY.
-- DO NOT APPLY DIRECTLY TO PRODUCTION. Supabase CLI migration + isolated CI required.
-- Depends on R23 identity migration, admin_users and catalog views; no automatic product writes.
-- Open/decide review = evidence only; apply/rollback = explicit human-confirmed
-- name-only product mutation, prohibited for active products and fiscal/commercial fields.
create table if not exists public.purchase_xml_field_reviews_v1 (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.purchase_xml_catalog_observations_v1(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  field_name text not null check (field_name in
    ('name','commercial_gtin','tax_gtin','ncm','cest','purchase_unit','supplier_item_code')),
  original_value text,
  proposed_value text not null check (length(btrim(proposed_value)) between 1 and 500),
  document_key text not null check (document_key ~ '^[0-9]{44}$'),
  status text not null default 'pending'
    check (status in ('pending','fiscal_review_required','approved','rejected')),
  revision integer not null default 0 check (revision>=0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  unique (observation_id,product_id,field_name)
);
create table if not exists public.purchase_xml_field_review_events_v1 (
  id bigint generated always as identity primary key,
  review_id uuid not null references public.purchase_xml_field_reviews_v1(id) on delete restrict,
  action text not null check (action in ('submitted','approved','rejected','reopened')),
  from_status text,
  to_status text not null,
  revision integer not null,
  actor_id uuid not null,
  note text,
  recorded_at timestamptz not null default now()
);
create index if not exists purchase_xml_field_reviews_product_idx
  on public.purchase_xml_field_reviews_v1 (product_id,created_at desc);
create index if not exists purchase_xml_field_review_events_review_idx
  on public.purchase_xml_field_review_events_v1 (review_id,id);
alter table public.purchase_xml_field_reviews_v1 enable row level security;
alter table public.purchase_xml_field_review_events_v1 enable row level security;
revoke all on public.purchase_xml_field_reviews_v1 from public,anon,authenticated;
revoke all on public.purchase_xml_field_review_events_v1 from public,anon,authenticated;
grant select,insert,update on public.purchase_xml_field_reviews_v1 to service_role;
grant select,insert on public.purchase_xml_field_review_events_v1 to service_role;
grant usage,select on sequence public.purchase_xml_field_review_events_v1_id_seq to service_role;

create or replace function public.purchase_xml_review_event_immutable_v1()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'xml_field_review_event_immutable'; end;$$;
revoke all on function public.purchase_xml_review_event_immutable_v1() from public,anon,authenticated;
grant execute on function public.purchase_xml_review_event_immutable_v1() to service_role;
drop trigger if exists purchase_xml_review_event_immutable_v1 on public.purchase_xml_field_review_events_v1;
create trigger purchase_xml_review_event_immutable_v1 before update or delete
on public.purchase_xml_field_review_events_v1 for each row
execute function public.purchase_xml_review_event_immutable_v1();

-- Product identity and value are taken from a *verified* XML observation, not client input.
-- The Edge gateway MUST obtain p_actor_id from a validated human Admin session.
create or replace function public.purchase_xml_open_field_review_v1(
  p_observation_id uuid,p_product_id uuid,p_field_name text,p_actor_id uuid
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v public.purchase_xml_catalog_observation_details_v2%rowtype;
 v_proposed text;
 v_original text;
 v_id uuid;
begin
 if p_actor_id is null or p_observation_id is null or p_product_id is null
 then raise exception 'xml_review_identity_required'; end if;
 if not exists(select 1 from public.admin_users a
   where a.user_id=p_actor_id and a.is_active is true and a.role in ('owner','admin'))
 then raise exception 'xml_review_actor_not_authorized'; end if;
 if p_field_name is null or p_field_name not in
   ('name','commercial_gtin','tax_gtin','ncm','cest','purchase_unit','supplier_item_code')
 then raise exception 'xml_review_field_forbidden'; end if;
 select * into v from public.purchase_xml_catalog_observation_details_v2
 where observation_id=p_observation_id and linked_product_id=p_product_id
   and source_state='xml_verified' limit 1;
 if not found then raise exception 'xml_review_verified_link_required'; end if;
 v_proposed:=case p_field_name
   when 'name' then v.xml_description
   when 'commercial_gtin' then v.commercial_gtin
   when 'tax_gtin' then v.tax_gtin
   when 'ncm' then v.xml_ncm
   when 'cest' then v.xml_cest
   when 'purchase_unit' then v.purchase_unit
   when 'supplier_item_code' then v.supplier_item_code end;
 if v_proposed is null or length(btrim(v_proposed)) not between 1 and 500
 then raise exception 'xml_review_source_field_missing'; end if;
 select case p_field_name
   when 'name' then p.name
   when 'commercial_gtin' then p.gtin
   when 'ncm' then coalesce(f.ncm,p.ncm)
   when 'cest' then f.cest
   when 'purchase_unit' then p.unit
   else null end into v_original
 from public.products p left join public.product_fiscal_profiles f on f.product_id=p.id
 where p.id=p_product_id;
 if not found then raise exception 'xml_review_product_missing'; end if;
 insert into public.purchase_xml_field_reviews_v1
 (observation_id,product_id,field_name,original_value,proposed_value,document_key,status,created_by)
 values(p_observation_id,p_product_id,p_field_name,v_original,btrim(v_proposed),v.document_key,
   case when p_field_name in ('ncm','cest','tax_gtin') then 'fiscal_review_required'
   else 'pending' end,p_actor_id)
 on conflict (observation_id,product_id,field_name) do nothing returning id into v_id;
 if v_id is null then
   select id into v_id from public.purchase_xml_field_reviews_v1
   where observation_id=p_observation_id and product_id=p_product_id and field_name=p_field_name;
 else
   insert into public.purchase_xml_field_review_events_v1
     (review_id,action,to_status,revision,actor_id,note)
   select id,'submitted',status,revision,p_actor_id,'Evidência de XML verificado'
   from public.purchase_xml_field_reviews_v1 where id=v_id;
 end if;
 return v_id;
end;$$;
revoke all on function public.purchase_xml_open_field_review_v1(uuid,uuid,text,uuid)
from public,anon,authenticated;
grant execute on function public.purchase_xml_open_field_review_v1(uuid,uuid,text,uuid)
to service_role;

-- Optimistic revision + row lock protect against concurrent/conflicting decisions.
-- A decision does NOT apply its value to the master catalog; that is a separate future gate.
create or replace function public.purchase_xml_decide_field_review_v1(
 p_review_id uuid,p_expected_revision integer,p_decision text,
 p_actor_id uuid,p_confirmation text,p_note text default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v public.purchase_xml_field_reviews_v1%rowtype;
 v_next text;
begin
 if p_actor_id is null or p_review_id is null
 then raise exception 'xml_review_identity_required'; end if;
 if not exists(select 1 from public.admin_users a
   where a.user_id=p_actor_id and a.is_active is true and a.role in ('owner','admin'))
 then raise exception 'xml_review_actor_not_authorized'; end if;
 if p_decision is null or p_decision not in ('approve','reject','reopen')
 then raise exception 'xml_review_decision_invalid'; end if;
 if p_confirmation is distinct from
   (case p_decision when 'approve' then 'APROVAR_CAMPO_XML'
     when 'reject' then 'REJEITAR_CAMPO_XML'
     when 'reopen' then 'REABRIR_CAMPO_XML' end)
 then raise exception 'xml_review_confirmation_required'; end if;
 select * into v from public.purchase_xml_field_reviews_v1
 where id=p_review_id for update;
 if not found then raise exception 'xml_review_not_found'; end if;
 if v.revision is distinct from p_expected_revision
 then raise exception 'xml_review_stale_revision'; end if;
 if p_decision='reopen' then
   if v.status not in ('approved','rejected') then
      raise exception 'xml_review_state_invalid'; end if;
   v_next:=case when v.field_name in ('ncm','cest','tax_gtin')
     then 'fiscal_review_required' else 'pending' end;
 else
   if v.status<>'pending' then raise exception 'xml_review_state_invalid'; end if;
   v_next:=case when p_decision='approve' then 'approved' else 'rejected' end;
 end if;
 update public.purchase_xml_field_reviews_v1 set
   status=v_next,revision=revision+1,decided_at=now(),decided_by=p_actor_id,
   decision_note=left(coalesce(p_note,''),500) where id=p_review_id;
 insert into public.purchase_xml_field_review_events_v1
   (review_id,action,from_status,to_status,revision,actor_id,note)
 values(p_review_id,case p_decision when 'approve' then 'approved'
   when 'reject' then 'rejected' else 'reopened' end,
   v.status,v_next,v.revision+1,p_actor_id,left(coalesce(p_note,''),500));
 return jsonb_build_object('ok',true,'review_id',p_review_id,'decision',v_next,
   'revision',v.revision+1,'product_updated',false,'bling_called',false,
   'stock_updated',false,'fiscal_updated',false);
end;$$;
revoke all on function public.purchase_xml_decide_field_review_v1(uuid,integer,text,uuid,text,text)
from public,anon,authenticated;
grant execute on function public.purchase_xml_decide_field_review_v1(uuid,integer,text,uuid,text,text)
to service_role;
comment on table public.purchase_xml_field_reviews_v1 is
'Approval ledger only; master product application and CAS rollback require a separate authorized workflow.';

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
  if not exists(select 1 from public.admin_users a
   where a.user_id=p_actor_id and a.is_active is true and a.role in ('owner','admin'))
  then raise exception 'xml_apply_actor_not_authorized'; end if;
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
  if not exists(select 1 from public.admin_users a
   where a.user_id=p_actor_id and a.is_active is true and a.role in ('owner','admin'))
  then raise exception 'xml_apply_actor_not_authorized'; end if;
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
