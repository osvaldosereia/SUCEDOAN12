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

-- R2 identity-only release fixture. R24 field apply deliberately excluded: it can rename existing products.
\i supabase/migrations/20261009185312_purchase_xml_identity_atomic_r27.sql

set role service_role;
do $$
declare
 v_result jsonb;
 v_before record;
 v_after record;
begin
 select name,ncm,cost,price,stock,is_active into v_before from public.products
 where id='30000000-0000-4000-8000-000000000010';
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '30000000-0000-4000-8000-000000000021',
   '30000000-0000-4000-8000-000000000010',false,'ignored',
   'commercial','package',12,'30000000-0000-4000-8000-000000000003','VINCULAR_ITEM_XML');
  raise exception 'operator_was_authorized';
 exception when others then
  if sqlerrm not like '%xml_identity_actor_not_authorized%' then raise; end if;
 end;
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '30000000-0000-4000-8000-000000000021',
   '30000000-0000-4000-8000-000000000010',false,'ignored',
   'commercial','package',12,'30000000-0000-4000-8000-000000000005','VINCULAR_ITEM_XML');
  raise exception 'disabled_owner_was_authorized';
 exception when others then
  if sqlerrm not like '%xml_identity_actor_not_authorized%' then raise; end if;
 end;
 v_result:=public.purchase_xml_resolve_catalog_identity_v1(
   '30000000-0000-4000-8000-000000000021',
   '30000000-0000-4000-8000-000000000010',false,'ignored',
   'commercial','package',12,'30000000-0000-4000-8000-000000000001','VINCULAR_ITEM_XML');
 if v_result->>'ok'<>'true' or v_result->>'stock_updated'<>'false'
 then raise exception 'identity_link_failed'; end if;
 select name,ncm,cost,price,stock,is_active into v_after from public.products
 where id='30000000-0000-4000-8000-000000000010';
 if v_after is distinct from v_before then raise exception 'existing_product_mutated'; end if;
 if (select count(*) from public.product_inventory_lots)<>0 then raise exception 'unexpected_lot'; end if;
 if (select count(*) from public.purchase_xml_catalog_identity_actions_v1)<>1 then
   raise exception 'audit_missing'; end if;
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '30000000-0000-4000-8000-000000000021',
   '30000000-0000-4000-8000-000000000010',false,'ignored',
   'commercial','package',12,'30000000-0000-4000-8000-000000000001','VINCULAR_ITEM_XML');
  raise exception 'replay_was_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_already_resolved%' then raise; end if;
 end;
 if has_function_privilege('anon','public.purchase_xml_resolve_catalog_identity_v1(uuid,uuid,boolean,text,text,text,integer,uuid,text)','EXECUTE')
 or has_function_privilege('authenticated','public.purchase_xml_resolve_catalog_identity_v1(uuid,uuid,boolean,text,text,text,integer,uuid,text)','EXECUTE')
 then raise exception 'public_rpc_access'; end if;
 if not (select relrowsecurity from pg_class where oid='public.purchase_xml_catalog_identity_actions_v1'::regclass)
 then raise exception 'audit_rls_disabled'; end if;
end $$;
reset role;
select 'PASS R2 identity only: owner/admin, no stock, no name/price/tax mutation, replay denied, audit and ACL' as result;
