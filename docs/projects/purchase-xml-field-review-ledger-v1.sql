-- DRAFT ONLY. Do not deploy without isolated PostgreSQL, role, and UI acceptance tests.
-- Decisions here are evidence-only: NO master product, stock, price, fiscal, Bling or financial writes.
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
