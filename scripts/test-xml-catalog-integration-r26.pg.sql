\set ON_ERROR_STOP on
-- R26 integration contract: disposable PostgreSQL 17 ONLY, never run against production.
-- Run as postgres in a fresh database. Loads the exact committed R23 then R24 migrations.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon,authenticated,service_role;

create table public.admin_users (
 user_id uuid primary key, role text not null,is_active boolean not null default true
);
create table public.products(
 id uuid primary key default gen_random_uuid(),sku text unique,name text not null,gtin text unique,
 ncm text,cost numeric,price numeric,stock numeric,is_active boolean not null default true,
 is_whatsapp_active boolean not null default true,is_offer boolean not null default false,
 unit text,source_system text not null default 'operational',sync_status text not null default 'local',
 desired_bling_status text not null default 'A',metadata jsonb not null default '{}'::jsonb
);
create table public.product_fiscal_profiles(product_id uuid primary key,ncm text,cest text);
create table public.purchase_xml_documents(
 id uuid primary key,document_key text,receipt_status text,issued_at timestamptz
);
create table public.purchase_xml_items(
 id uuid primary key,document_id uuid not null references public.purchase_xml_documents(id),
 item_number integer,product_id uuid references public.products(id),commercial_gtin text,
 tax_gtin text,purchase_unit text,converted_quantity numeric,inventory_lot_id uuid,
 lot_expiration_date date,base_unit text,supplier_item_code text,
 metadata jsonb not null default '{}'::jsonb,match_method text,processing_status text
);
create table public.product_identifiers(
 id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id),
 identifier_value text not null,identifier_kind text not null,packaging_unit text,
 conversion_factor numeric,source text,confidence numeric,status text,
 metadata jsonb not null default '{}'::jsonb
);
create unique index product_identifiers_confirmed_global_uidx
 on public.product_identifiers(identifier_kind,identifier_value)
 where status='confirmed' and identifier_kind in ('base_gtin','package_gtin');
create table public.purchase_stock_receipt_plans_v1(
 id uuid primary key default gen_random_uuid(),document_id uuid not null,
 status text not null,verified_at timestamptz
);
create table public.purchase_stock_receipts(
 id uuid primary key default gen_random_uuid(),document_id uuid not null,
 status text not null,applied_at timestamptz
);
create table public.product_inventory_lots(
 id uuid primary key default gen_random_uuid(),product_id uuid,lot_code text,
 expiration_date date,quantity_on_hand numeric,quantity_reserved numeric,
 status text,source text,source_ref text,received_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,updated_at timestamptz
);
create unique index product_inventory_lots_source_ref_uidx
 on public.product_inventory_lots(source,source_ref) where source_ref is not null;
\i scripts/fixtures/xml-production-lot-trigger-r22.sql

create table public.purchase_xml_catalog_observations_v1 (id uuid primary key);
create table public.xml_r26_evidence_fixture(
 observation_id uuid primary key,purchase_item_id uuid not null,
 source_state text not null,xml_description text,
 commercial_gtin text,tax_gtin text,xml_ncm text,xml_cest text,
 purchase_unit text,supplier_item_code text
);
create view public.purchase_xml_catalog_observation_details_v2
 with (security_invoker=true) as
 select o.observation_id,o.purchase_item_id,o.source_state,o.xml_description,
 o.commercial_gtin,o.tax_gtin,o.xml_ncm,o.xml_cest,o.purchase_unit,
 o.supplier_item_code,i.product_id as linked_product_id,d.document_key
 from public.xml_r26_evidence_fixture o
 join public.purchase_xml_items i on i.id=o.purchase_item_id
 join public.purchase_xml_documents d on d.id=i.document_id;

grant select on public.admin_users,public.product_fiscal_profiles,
 public.purchase_xml_catalog_observations_v1,public.xml_r26_evidence_fixture,
 public.purchase_xml_catalog_observation_details_v2 to service_role;
grant select,insert,update on public.products,public.purchase_xml_items,
 public.purchase_xml_documents,public.product_identifiers,
 public.purchase_stock_receipt_plans_v1,public.purchase_stock_receipts,
 public.product_inventory_lots to service_role;
grant usage,select on all sequences in schema public to service_role;

insert into public.admin_users(user_id,role,is_active) values
 ('30000000-0000-4000-8000-000000000001','owner',true),
 ('30000000-0000-4000-8000-000000000002','admin',true),
 ('30000000-0000-4000-8000-000000000003','operator',true),
 ('30000000-0000-4000-8000-000000000004','viewer',true),
 ('30000000-0000-4000-8000-000000000005','owner',false);
insert into public.products(id,name,gtin,ncm,cost,price,stock,is_active,unit) values
 ('30000000-0000-4000-8000-000000000010','Nome antigo',null,'19059090',22,44,9,false,'UN');
insert into public.product_fiscal_profiles values
 ('30000000-0000-4000-8000-000000000010','19059090','1700100');
insert into public.purchase_xml_documents(id,document_key,receipt_status) values
 ('30000000-0000-4000-8000-000000000020',repeat('3',44),'review');
insert into public.purchase_xml_items(id,document_id,item_number,commercial_gtin,
 tax_gtin,purchase_unit,converted_quantity,metadata) values
 ('30000000-0000-4000-8000-000000000021',
 '30000000-0000-4000-8000-000000000020',1,'4006381333931','5901234123457','CX',0,'{}');
insert into public.purchase_xml_catalog_observations_v1 values
 ('30000000-0000-4000-8000-000000000030');
insert into public.xml_r26_evidence_fixture values
 ('30000000-0000-4000-8000-000000000030',
 '30000000-0000-4000-8000-000000000021','xml_verified','Nome novo via XML',
 '4006381333931','5901234123457','19059080','1700101','CX','FOR-1');

-- Real migrations, in the required dependency order, same database/connection.
\i supabase/migrations/20261009145919_purchase_xml_identity_atomic_r23.sql
\i supabase/migrations/20261009155445_purchase_xml_field_approval_r24.sql

set role service_role;
do $$
declare
 v_result jsonb;
 v_review uuid;
 v_application uuid;
 v_record record;
 v_count integer;
begin
 -- DB auth is checked again, even though Edge already checks the human JWT.
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '30000000-0000-4000-8000-000000000021',
   '30000000-0000-4000-8000-000000000010',false,'ignored',
   'commercial','package',12,'30000000-0000-4000-8000-000000000003','VINCULAR_ITEM_XML');
  raise exception 'r26_operator_allowed_identity';
 exception when others then
  if sqlerrm not like '%xml_identity_actor_not_authorized%' then raise; end if;
 end;
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '30000000-0000-4000-8000-000000000021',
   '30000000-0000-4000-8000-000000000010',false,'ignored',
   'commercial','package',12,'30000000-0000-4000-8000-000000000005','VINCULAR_ITEM_XML');
  raise exception 'r26_disabled_owner_allowed_identity';
 exception when others then
  if sqlerrm not like '%xml_identity_actor_not_authorized%' then raise; end if;
 end;
 v_result:=public.purchase_xml_resolve_catalog_identity_v1(
  '30000000-0000-4000-8000-000000000021',
  '30000000-0000-4000-8000-000000000010',false,'ignored',
  'commercial','package',12,'30000000-0000-4000-8000-000000000001','VINCULAR_ITEM_XML');
 if v_result->>'ok'<>'true' or v_result->>'stock_updated'<>'false'
 then raise exception 'r26_link_failure'; end if;
 if (select count(*) from public.product_inventory_lots)<>0
 then raise exception 'r26_unwanted_lot'; end if;

 begin
  perform public.purchase_xml_open_field_review_v1(
   '30000000-0000-4000-8000-000000000030',
   '30000000-0000-4000-8000-000000000010','name',
   '30000000-0000-4000-8000-000000000004');
  raise exception 'r26_viewer_allowed_review';
 exception when others then
  if sqlerrm not like '%xml_review_actor_not_authorized%' then raise; end if;
 end;
 v_review:=public.purchase_xml_open_field_review_v1(
  '30000000-0000-4000-8000-000000000030',
  '30000000-0000-4000-8000-000000000010','name',
  '30000000-0000-4000-8000-000000000002');
 perform public.purchase_xml_decide_field_review_v1(
  v_review,0,'approve','30000000-0000-4000-8000-000000000001',
  'APROVAR_CAMPO_XML');
 v_result:=public.purchase_xml_preview_field_application_v1(v_review);
 if v_result->>'can_apply'<>'true' then
  raise exception 'r26_preview_failed: %',v_result; end if;
 if (select name from public.products where id='30000000-0000-4000-8000-000000000010')<>'Nome antigo'
 then raise exception 'r26_preview_mutated_product'; end if;
 begin
  perform public.purchase_xml_apply_field_review_v1(v_review,1,
   '30000000-0000-4000-8000-000000000005','APLICAR_NOME_APROVADO_XML');
  raise exception 'r26_disabled_owner_allowed_apply';
 exception when others then
  if sqlerrm not like '%xml_apply_actor_not_authorized%' then raise; end if;
 end;
 v_result:=public.purchase_xml_apply_field_review_v1(v_review,1,
  '30000000-0000-4000-8000-000000000002','APLICAR_NOME_APROVADO_XML');
 v_application:=(v_result->>'application_id')::uuid;
 if v_result->>'product_updated'<>'true' or v_application is null then
  raise exception 'r26_apply_failed'; end if;
 select name,ncm,cost,price,stock,is_active into v_record from public.products
 where id='30000000-0000-4000-8000-000000000010';
 if v_record.name<>'Nome novo via XML' or v_record.ncm<>'19059090'
   or v_record.cost<>22 or v_record.price<>44 or v_record.stock<>9
   or v_record.is_active is distinct from false
 then raise exception 'r26_commercial_or_fiscal_mutation'; end if;
 if (select count(*) from public.product_inventory_lots)<>0 then
   raise exception 'r26_stock_lot_mutation'; end if;
 v_result:=public.purchase_xml_rollback_field_review_v1(v_application,
  '30000000-0000-4000-8000-000000000001','REVERTER_NOME_APLICADO_XML');
 if v_result->>'rolled_back'<>'true' or
   (select name from public.products where id='30000000-0000-4000-8000-000000000010')<>'Nome antigo'
 then raise exception 'r26_rollback_failed'; end if;
 if (select count(*) from public.purchase_xml_catalog_identity_actions_v1)<>1
 or (select count(*) from public.purchase_xml_field_review_events_v1)<>2
 or (select count(*) from public.purchase_xml_field_application_events_v1)<>2
 then raise exception 'r26_audit_incomplete'; end if;
 -- Fiscal proposal stays blocked (there is no generic fiscal apply RPC).
 perform public.purchase_xml_open_field_review_v1(
  '30000000-0000-4000-8000-000000000030',
  '30000000-0000-4000-8000-000000000010','ncm',
  '30000000-0000-4000-8000-000000000002');
 if (select count(*) from public.purchase_xml_field_reviews_v1
  where field_name='ncm' and status='fiscal_review_required')<>1
 then raise exception 'r26_fiscal_review_was_approved'; end if;

 for v_record in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
  'purchase_xml_resolve_catalog_identity_v1','purchase_xml_open_field_review_v1',
  'purchase_xml_decide_field_review_v1','purchase_xml_preview_field_application_v1',
  'purchase_xml_apply_field_review_v1','purchase_xml_rollback_field_review_v1')
 loop
   if has_function_privilege('anon',v_record.oid,'EXECUTE')
      or has_function_privilege('authenticated',v_record.oid,'EXECUTE')
   then raise exception 'r26_public_rpc_leak'; end if;
 end loop;
 select count(*) into v_count from pg_class c join pg_namespace n
   on n.oid=c.relnamespace where n.nspname='public'
   and c.relname in ('purchase_xml_catalog_identity_actions_v1',
    'purchase_xml_field_reviews_v1','purchase_xml_field_review_events_v1',
    'purchase_xml_field_applications_v1','purchase_xml_field_application_events_v1')
   and c.relrowsecurity=true;
 if v_count<>5 then raise exception 'r26_rls_missing %',v_count; end if;
end; $$;
reset role;
select 'PASS R26 joined R23 + R24: owner/admin, disabled/viewer/operator, RLS/ACL, identity->review->CAS apply->rollback, fiscal and no stock/finance' as result;
