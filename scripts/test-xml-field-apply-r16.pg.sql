\set ON_ERROR_STOP on
-- Disposable PostgreSQL 17 only. DO NOT run against Supabase production.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to service_role,anon,authenticated;
create table public.products (
 id uuid primary key,name text not null,gtin text,ncm text,unit text,
 stock numeric,price numeric, cost numeric,is_active boolean default true
);
create table public.product_fiscal_profiles(product_id uuid primary key,ncm text,cest text);
create table public.purchase_xml_catalog_observations_v1(id uuid primary key);
create table public.xml_review_fixture(
 observation_id uuid, linked_product_id uuid, source_state text,
 xml_description text,commercial_gtin text,tax_gtin text,
 xml_ncm text,xml_cest text,purchase_unit text,supplier_item_code text,document_key text
);
create view public.purchase_xml_catalog_observation_details_v2
with (security_invoker=true) as select * from public.xml_review_fixture;
grant select on public.products,public.product_fiscal_profiles,
 public.purchase_xml_catalog_observations_v1,public.xml_review_fixture,
 public.purchase_xml_catalog_observation_details_v2 to service_role;
grant update(name) on public.products to service_role;
insert into public.products(id,name,gtin,ncm,unit,stock,price,cost,is_active) values
 ('00000000-0000-4000-8000-000000000001','Antigo A','7891000000000','19059090','UN',9,99.9,50,true),
 ('00000000-0000-4000-8000-000000000002','Antigo B','7891000000001','19059090','UN',8,89.9,40,true),
 ('00000000-0000-4000-8000-000000000003','Antigo C','7891000000002','19059090','UN',7,79.9,30,true);
insert into public.product_fiscal_profiles(product_id,ncm,cest)
 select id,ncm,'1700100' from public.products;
insert into public.purchase_xml_catalog_observations_v1 values
 ('00000000-0000-4000-8000-000000000011'),
 ('00000000-0000-4000-8000-000000000012'),
 ('00000000-0000-4000-8000-000000000013');
insert into public.xml_review_fixture values
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001',
  'xml_verified','Novo A','7891000000000','7891000000000','19059090','1700100','CX','001',repeat('1',44)),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002',
  'xml_verified','Novo B','7891000000001','7891000000001','19059090','1700100','UN','002',repeat('2',44)),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000003',
  'xml_verified','Novo C','7891000000002','7891000000002','19059080','1700100','UN','003',repeat('3',44));
\i scripts/fixtures/xml-field-review-ledger-r14.sql
\i docs/projects/purchase-xml-field-apply-r16.sql
set role service_role;
do $$
declare
 a uuid;b uuid;f uuid;v_app_id uuid; response jsonb;
begin
 a:=public.purchase_xml_open_field_review_v1(
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000001','name',
  '00000000-0000-4000-8000-000000000090');
 perform public.purchase_xml_decide_field_review_v1(a,0,'approve',
  '00000000-0000-4000-8000-000000000091','APROVAR_CAMPO_XML');
 response:=public.purchase_xml_preview_field_application_v1(a);
 if response->>'can_apply'<>'true' or response->>'current_value'<>'Antigo A'
  or (select name from public.products where id='00000000-0000-4000-8000-000000000001')<>'Antigo A'
 then raise exception 'preview_must_not_write'; end if;
 begin
  perform public.purchase_xml_apply_field_review_v1(a,1,
   '00000000-0000-4000-8000-000000000092','WRONG');
  raise exception 'missing_apply_confirmation_accepted';
 exception when others then
  if sqlerrm not like '%xml_apply_confirmation_required%' then raise; end if;
 end;
 begin
  perform public.purchase_xml_apply_field_review_v1(a,0,
   '00000000-0000-4000-8000-000000000092','APLICAR_NOME_APROVADO_XML');
  raise exception 'stale_review_accepted';
 exception when others then
  if sqlerrm not like '%xml_apply_stale_review%' then raise; end if;
 end;
 response:=public.purchase_xml_apply_field_review_v1(a,1,
  '00000000-0000-4000-8000-000000000092','APLICAR_NOME_APROVADO_XML');
 v_app_id:=(response->>'application_id')::uuid;
 if v_app_id is null or response->>'product_updated'<>'true'
 or response->>'bling_called'<>'false' or response->>'stock_updated'<>'false'
 or (select name from public.products where id='00000000-0000-4000-8000-000000000001')<>'Novo A'
 then raise exception 'apply_name_failed'; end if;
 if (select stock from public.products where id='00000000-0000-4000-8000-000000000001')<>9 or
    (select price from public.products where id='00000000-0000-4000-8000-000000000001')<>99.9
 then raise exception 'commercial_fields_changed'; end if;
 if (select count(*) from public.purchase_xml_field_application_events_v1 where application_id=v_app_id)<>1
 then raise exception 'missing_apply_event'; end if;
 begin
  perform public.purchase_xml_apply_field_review_v1(a,1,
   '00000000-0000-4000-8000-000000000092','APLICAR_NOME_APROVADO_XML');
  raise exception 'repeat_apply_accepted';
 exception when others then
  if sqlerrm not like '%xml_apply_already_applied%' then raise; end if;
 end;
 begin
  perform public.purchase_xml_decide_field_review_v1(a,1,'reopen',
   '00000000-0000-4000-8000-000000000091','REABRIR_CAMPO_XML');
  raise exception 'reopened_applied_without_rollback';
 exception when others then
  if sqlerrm not like '%xml_review_rollback_required%' then raise; end if;
 end;
 begin
  perform public.purchase_xml_rollback_field_review_v1(v_app_id,
   '00000000-0000-4000-8000-000000000093','WRONG');
  raise exception 'rollback_without_confirmation_accepted';
 exception when others then
  if sqlerrm not like '%xml_rollback_confirmation_required%' then raise; end if;
 end;
 response:=public.purchase_xml_rollback_field_review_v1(v_app_id,
  '00000000-0000-4000-8000-000000000093','REVERTER_NOME_APLICADO_XML');
 if response->>'rolled_back'<>'true'
  or (select name from public.products where id='00000000-0000-4000-8000-000000000001')<>'Antigo A'
 then raise exception 'rollback_name_failed'; end if;
 if (select count(*) from public.purchase_xml_field_application_events_v1 where application_id=v_app_id)<>2
 then raise exception 'missing_rollback_event'; end if;
 begin
  perform public.purchase_xml_rollback_field_review_v1(v_app_id,
   '00000000-0000-4000-8000-000000000093','REVERTER_NOME_APLICADO_XML');
  raise exception 'double_rollback_accepted';
 exception when others then
  if sqlerrm not like '%xml_rollback_not_allowed%' then raise; end if;
 end;
 perform public.purchase_xml_decide_field_review_v1(a,1,'reopen',
  '00000000-0000-4000-8000-000000000091','REABRIR_CAMPO_XML');

 -- Conflict before application: a legitimate intervening human rename must win.
 b:=public.purchase_xml_open_field_review_v1(
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000002','name',
  '00000000-0000-4000-8000-000000000090');
 perform public.purchase_xml_decide_field_review_v1(b,0,'approve',
  '00000000-0000-4000-8000-000000000091','APROVAR_CAMPO_XML');
 update public.products set name='Atualização humana externa'
 where id='00000000-0000-4000-8000-000000000002';
 begin
  perform public.purchase_xml_apply_field_review_v1(b,1,
   '00000000-0000-4000-8000-000000000092','APLICAR_NOME_APROVADO_XML');
  raise exception 'stale_product_overwritten';
 exception when others then
  if sqlerrm not like '%xml_apply_product_changed%' then raise; end if;
 end;
 if (select name from public.products where id='00000000-0000-4000-8000-000000000002')<>'Atualização humana externa'
 then raise exception 'changed_product_lost'; end if;

 -- Fiscal evidence is never a generic product write, even if manually marked approved.
 f:=public.purchase_xml_open_field_review_v1(
  '00000000-0000-4000-8000-000000000013',
  '00000000-0000-4000-8000-000000000003','ncm',
  '00000000-0000-4000-8000-000000000090');
 begin
  perform public.purchase_xml_apply_field_review_v1(f,0,
   '00000000-0000-4000-8000-000000000092','APLICAR_NOME_APROVADO_XML');
  raise exception 'fiscal_field_applicable';
 exception when others then
  if sqlerrm not like '%xml_apply_field_not_authorized%' then raise; end if;
 end;

 if has_function_privilege('anon',
 'public.purchase_xml_apply_field_review_v1(uuid,integer,uuid,text)','EXECUTE')
 or has_function_privilege('authenticated',
 'public.purchase_xml_rollback_field_review_v1(uuid,uuid,text)','EXECUTE')
 or has_table_privilege('authenticated','public.purchase_xml_field_applications_v1','SELECT')
 then raise exception 'public_permission_leak'; end if;

end $$;
reset role;
select 'PASS R16 PostgreSQL 17 isolated CAS apply, rollback, no fiscal or commercial side effects' AS test_result;
