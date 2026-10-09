\set ON_ERROR_STOP on
-- Disposable PostgreSQL 17; NEVER execute this script against production.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to service_role,anon,authenticated;
create table public.products(
 id uuid primary key default gen_random_uuid(),sku text unique,
 name text not null,gtin text unique,ncm text,cost numeric,price numeric,stock numeric,
 is_active boolean not null default true,is_whatsapp_active boolean not null default true,
 is_offer boolean not null default false,unit text,source_system text not null default 'operational',
 sync_status text not null default 'local',desired_bling_status text not null default 'A',
 metadata jsonb not null default '{}'::jsonb
);
create table public.purchase_xml_documents(id uuid primary key,document_key text,
 receipt_status text);
create table public.purchase_xml_items(
 id uuid primary key,document_id uuid not null references public.purchase_xml_documents(id),
 item_number integer,product_id uuid references public.products(id),
 commercial_gtin text,tax_gtin text,purchase_unit text,converted_quantity numeric,
 inventory_lot_id uuid,metadata jsonb not null default '{}'::jsonb,
 match_method text
);
create table public.product_identifiers(
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id),
 identifier_value text not null,identifier_kind text not null,
 packaging_unit text,conversion_factor numeric,source text,confidence numeric,
 status text,metadata jsonb not null default '{}'::jsonb
);
create unique index product_identifiers_confirmed_global_uidx
 on public.product_identifiers(identifier_kind,identifier_value)
 where status='confirmed' and identifier_kind in ('base_gtin','package_gtin');
create table public.purchase_xml_catalog_fixture (
 purchase_item_id uuid, source_state text
);
create view public.purchase_xml_catalog_observation_details_v2
 with (security_invoker=true) as select * from public.purchase_xml_catalog_fixture;
create table public.inventory_lot_side_effects (id bigint generated always as identity,item_id uuid);
create function public.test_identity_lot_trigger() returns trigger
 language plpgsql security invoker as $$
begin
 if coalesce(new.converted_quantity,0)>0 then
  insert into public.inventory_lot_side_effects(item_id) values(new.id);
 end if;
 return new;
end; $$;
create trigger test_identity_lot_after
 after update of product_id,converted_quantity on public.purchase_xml_items
 for each row execute function public.test_identity_lot_trigger();
grant select,insert,update on public.products,public.purchase_xml_items,
 public.purchase_xml_documents,public.product_identifiers,
 public.purchase_xml_catalog_fixture,public.inventory_lot_side_effects to service_role;
grant select on public.purchase_xml_catalog_observation_details_v2 to service_role;
grant usage,select on all sequences in schema public to service_role;
insert into public.products(id,name,gtin,price,stock,is_active) values
 ('10000000-0000-4000-8000-000000000001','Produto mestre','7890000000002',10,5,true),
 ('10000000-0000-4000-8000-000000000002','Segundo mestre',null,12,7,true);
insert into public.purchase_xml_documents(id,document_key,receipt_status) values
 ('10000000-0000-4000-8000-000000000010',repeat('1',44),'review'),
 ('10000000-0000-4000-8000-000000000020',repeat('2',44),'received');
insert into public.purchase_xml_items(
 id,document_id,item_number,commercial_gtin,tax_gtin,purchase_unit,converted_quantity,metadata)
 values
 ('10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000010',1,
  '4006381333931','5901234123457','CX',0,'{}'),
 ('10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000010',2,
  '4006381333931','5901234123457','CX',0,'{}'),
 ('10000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000010',3,
  '4006381333931','5901234123457','UN',0,'{}'),
 ('10000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000010',4,
  '4006381333931','5901234123457','KG',0,'{}'),
 ('10000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000020',1,
  '4006381333931','5901234123457','UN',0,'{}'),
 ('10000000-0000-4000-8000-000000000016','10000000-0000-4000-8000-000000000010',6,
  '4006381333931','5901234123457','UN',2,'{}'),
 ('10000000-0000-4000-8000-000000000017','10000000-0000-4000-8000-000000000010',7,
  '4006381333931','5901234123457','UN',0,'{}'),
 ('10000000-0000-4000-8000-000000000018','10000000-0000-4000-8000-000000000010',8,
  '4006381333931','5901234123457','UN',0,'{}');
insert into public.purchase_xml_catalog_fixture
select id,'xml_verified' from public.purchase_xml_items where
 id<>'10000000-0000-4000-8000-000000000018';
\i docs/projects/purchase-xml-identity-atomic-r21.sql
set role service_role;
do $$
declare v jsonb; product uuid; v_actor uuid:='10000000-0000-4000-8000-000000000099';
begin
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '10000000-0000-4000-8000-000000000011',
   '10000000-0000-4000-8000-000000000002',false,'ignore',
   'commercial','package',12,v_actor,'WRONG');
  raise exception 'missing_confirmation_was_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_confirmation_required%' then raise; end if;
 end;
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '10000000-0000-4000-8000-000000000011',
   '10000000-0000-4000-8000-000000000002',false,'ignore',
   'commercial','base_unit',12,v_actor,'VINCULAR_ITEM_XML');
  raise exception 'base_unit_invalid_factor_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_factor_invalid%' then raise; end if;
 end;
 v:=public.purchase_xml_resolve_catalog_identity_v1(
   '10000000-0000-4000-8000-000000000011',
   '10000000-0000-4000-8000-000000000002',false,'ignore',
   'commercial','package',12,v_actor,'VINCULAR_ITEM_XML');
 if v->>'ok'<>'true' or v->>'stock_updated'<>'false'
    or v->>'fiscal_updated'<>'false' or v->>'finance_updated'<>'false'
 then raise exception 'normal_existing_link_failed'; end if;
 if (select product_id from public.purchase_xml_items
   where id='10000000-0000-4000-8000-000000000011')
   <>'10000000-0000-4000-8000-000000000002'
 then raise exception 'wrong_product_link'; end if;
 if (select name from public.products where id='10000000-0000-4000-8000-000000000002')<>'Segundo mestre'
    or (select price from public.products where id='10000000-0000-4000-8000-000000000002')<>12
    or (select stock from public.products where id='10000000-0000-4000-8000-000000000002')<>7
 then raise exception 'existing_product_mutated'; end if;
 if (select count(*) from public.inventory_lot_side_effects)<>0
 then raise exception 'lot_was_created'; end if;
 if (select count(*) from public.purchase_xml_catalog_identity_actions_v1)<>1
 then raise exception 'missing_audit'; end if;
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '10000000-0000-4000-8000-000000000011',
   '10000000-0000-4000-8000-000000000002',false,'ignore',
   'commercial','package',12,v_actor,'VINCULAR_ITEM_XML');
  raise exception 'repeat_link_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_already_resolved%' then raise; end if;
 end;
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '10000000-0000-4000-8000-000000000012',null,true,'Rascunho',
   'commercial','package',12,v_actor,'CRIAR_INATIVO_XML');
  raise exception 'duplicate_gtin_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_identifier_conflict%' then raise; end if;
 end;
 -- Different tax EAN is an explicit independent choice; one new inactive SKU.
 v:=public.purchase_xml_resolve_catalog_identity_v1(
   '10000000-0000-4000-8000-000000000012',null,true,'Rascunho revisão',
   'tax','base_unit',1,v_actor,'CRIAR_INATIVO_XML');
 product:=(v->>'product_id')::uuid;
 if product is null or (select stock from public.products where id=product)<>0
    or (select is_active from public.products where id=product)<>false
    or (select is_whatsapp_active from public.products where id=product)<>false
    or (select price is not null or cost is not null or ncm is not null from public.products where id=product)
 then raise exception 'inactive_draft_invariant_failed'; end if;
 if (select count(*) from public.inventory_lot_side_effects)<>0
 then raise exception 'lot_side_effect_on_draft'; end if;
 if (select count(*) from public.purchase_xml_catalog_identity_actions_v1)<>2
 then raise exception 'audit_not_atomic'; end if;
 begin
  update public.purchase_xml_catalog_identity_actions_v1 set identifier='tampered'
  where product_id=product;
  raise exception 'audit_tamper_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_history_immutable%' then raise; end if;
 end;
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '10000000-0000-4000-8000-000000000014',
   '10000000-0000-4000-8000-000000000001',false,'ignore',
   'commercial','base_unit',1,v_actor,'VINCULAR_ITEM_XML');
  raise exception 'weight_item_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_weight_unit_review_required%' then raise; end if;
 end;
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '10000000-0000-4000-8000-000000000015',
   '10000000-0000-4000-8000-000000000001',false,'ignore',
   'commercial','base_unit',1,v_actor,'VINCULAR_ITEM_XML');
  raise exception 'received_item_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_receipt_review_required%' then raise; end if;
 end;
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '10000000-0000-4000-8000-000000000016',
   '10000000-0000-4000-8000-000000000001',false,'ignore',
   'commercial','base_unit',1,v_actor,'VINCULAR_ITEM_XML');
  raise exception 'converted_item_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_operational_lot_review_required%' then raise; end if;
 end;
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '10000000-0000-4000-8000-000000000018',
   '10000000-0000-4000-8000-000000000001',false,'ignore',
   'commercial','base_unit',1,v_actor,'VINCULAR_ITEM_XML');
  raise exception 'unverified_source_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_verified_source_required%' then raise; end if;
 end;
 begin
  perform public.purchase_xml_resolve_catalog_identity_v1(
   '10000000-0000-4000-8000-000000000017',
   '10000000-0000-4000-8000-000000000001',false,'ignore',
   'commercial','package',12,null,'VINCULAR_ITEM_XML');
  raise exception 'null_actor_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_human_required%' then raise; end if;
 end;
 if has_function_privilege('anon',
 'public.purchase_xml_resolve_catalog_identity_v1(uuid,uuid,boolean,text,text,text,integer,uuid,text)',
 'EXECUTE') or has_function_privilege('authenticated',
 'public.purchase_xml_resolve_catalog_identity_v1(uuid,uuid,boolean,text,text,text,integer,uuid,text)',
 'EXECUTE') then raise exception 'public_rpc_execute_leak'; end if;
 if (select count(*) from public.inventory_lot_side_effects)<>0
 then raise exception 'unexpected_lot_trigger_mutation'; end if;
end $$;
reset role;
select 'PASS R21 PostgreSQL isolated atomic product identity, inactive draft and zero lot effects' AS result;
