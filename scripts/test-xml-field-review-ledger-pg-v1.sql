\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to service_role,anon,authenticated;
create table public.products(id uuid primary key,name text,gtin text,ncm text,unit text,stock numeric,price numeric);
create table public.product_fiscal_profiles(product_id uuid primary key,ncm text,cest text);
create table public.purchase_xml_catalog_observations_v1(id uuid primary key);
create table public.xml_review_fixture(
 observation_id uuid,linked_product_id uuid,source_state text,xml_description text,
 commercial_gtin text,tax_gtin text,xml_ncm text,xml_cest text,purchase_unit text,
 supplier_item_code text,document_key text);
create view public.purchase_xml_catalog_observation_details_v2 with (security_invoker=true)
as select * from public.xml_review_fixture;
grant select on public.products,public.product_fiscal_profiles,
 public.purchase_xml_catalog_observations_v1,public.xml_review_fixture,
 public.purchase_xml_catalog_observation_details_v2 to service_role;
insert into public.products values
 ('00000000-0000-0000-0000-000000000001','Produto antigo','7891234567890','19059090','UN',8,19.90);
insert into public.product_fiscal_profiles values
 ('00000000-0000-0000-0000-000000000001','19059090','1700100');
insert into public.purchase_xml_catalog_observations_v1 values
 ('00000000-0000-0000-0000-000000000010');
insert into public.xml_review_fixture values
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001',
 'xml_verified','Nome do XML','7891234567890','7891234567890','19059090',
 '1700100','CX','FORN001',repeat('1',44));
\i docs/projects/purchase-xml-field-review-ledger-v1.sql
set role service_role;
do $$
declare a uuid; b uuid; fiscal uuid; response jsonb;
begin
 a:=public.purchase_xml_open_field_review_v1(
 '00000000-0000-0000-0000-000000000010',
 '00000000-0000-0000-0000-000000000001','name',
 '00000000-0000-0000-0000-000000000030');
 b:=public.purchase_xml_open_field_review_v1(
 '00000000-0000-0000-0000-000000000010',
 '00000000-0000-0000-0000-000000000001','name',
 '00000000-0000-0000-0000-000000000030');
 if a is null or a<>b then raise exception 'idempotency_failed'; end if;
 if (select count(*) from public.purchase_xml_field_review_events_v1 where review_id=a)<>1
 then raise exception 'duplicate_audit_events'; end if;
 begin
 perform public.purchase_xml_decide_field_review_v1(a,0,'approve',
 '00000000-0000-0000-0000-000000000030','INVALID');
 raise exception 'missing_confirmation_accepted';
 exception when others then
 if sqlerrm not like '%xml_review_confirmation_required%' then raise; end if;
 end;
 begin
 perform public.purchase_xml_decide_field_review_v1(a,9,'approve',
 '00000000-0000-0000-0000-000000000030','APROVAR_CAMPO_XML');
 raise exception 'stale_revision_accepted';
 exception when others then
 if sqlerrm not like '%xml_review_stale_revision%' then raise; end if;
 end;
 response:=public.purchase_xml_decide_field_review_v1(a,0,'approve',
 '00000000-0000-0000-0000-000000000030','APROVAR_CAMPO_XML');
 if response->>'product_updated'<>'false' or
 (select name from public.products
 where id='00000000-0000-0000-0000-000000000001')<>'Produto antigo'
 then raise exception 'master_written_on_approve'; end if;
 perform public.purchase_xml_decide_field_review_v1(a,1,'reopen',
 '00000000-0000-0000-0000-000000000030','REABRIR_CAMPO_XML');
 perform public.purchase_xml_decide_field_review_v1(a,2,'reject',
 '00000000-0000-0000-0000-000000000030','REJEITAR_CAMPO_XML');
 if (select count(*) from public.purchase_xml_field_review_events_v1 where review_id=a)<>4
 then raise exception 'missing_decision_events'; end if;
 begin
 update public.purchase_xml_field_review_events_v1 set note='tampered' where review_id=a;
 raise exception 'audit_mutation_accepted';
 exception when others then
 if sqlerrm not like '%xml_field_review_event_immutable%' then raise; end if;
 end;
 fiscal:=public.purchase_xml_open_field_review_v1(
 '00000000-0000-0000-0000-000000000010',
 '00000000-0000-0000-0000-000000000001','ncm',
 '00000000-0000-0000-0000-000000000030');
 begin
 perform public.purchase_xml_decide_field_review_v1(fiscal,0,'approve',
 '00000000-0000-0000-0000-000000000030','APROVAR_CAMPO_XML');
 raise exception 'fiscal_without_review_approved';
 exception when others then
 if sqlerrm not like '%xml_review_state_invalid%' then raise; end if;
 end;
 if not has_function_privilege('service_role',
 'public.purchase_xml_decide_field_review_v1(uuid,integer,text,uuid,text,text)','EXECUTE')
 then raise exception 'service_role_execute_missing'; end if;
 if has_function_privilege('authenticated',
 'public.purchase_xml_decide_field_review_v1(uuid,integer,text,uuid,text,text)','EXECUTE')
 then raise exception 'authenticated_can_decide'; end if;
 if has_table_privilege('anon','public.purchase_xml_field_reviews_v1','SELECT') or
 has_table_privilege('authenticated','public.purchase_xml_field_reviews_v1','SELECT')
 then raise exception 'public_review_read'; end if;
end $$;
reset role;
select 'PASS PostgreSQL XML field-review isolated contract' AS result;
