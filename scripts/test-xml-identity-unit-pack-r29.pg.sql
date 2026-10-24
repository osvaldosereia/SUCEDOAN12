\set ON_ERROR_STOP on
-- R29 runs only in the R2 disposable PostgreSQL database, after test-xml-identity-r2.pg.sql.
\i supabase/migrations/20261010154700_purchase_xml_unit_pack_review_r29.sql

insert into public.purchase_xml_items(id,document_id,item_number,commercial_gtin,tax_gtin,
 purchase_unit,converted_quantity,metadata)
values ('30000000-0000-4000-8000-000000000022',
 '30000000-0000-4000-8000-000000000020',2,
 '7908324400120','7908324400120','PC',null,'{}');
insert into public.xml_r26_evidence_fixture
(observation_id,purchase_item_id,source_state,xml_description,commercial_gtin,tax_gtin,
 xml_ncm,xml_cest,purchase_unit,supplier_item_code)
values('30000000-0000-4000-8000-000000000032',
 '30000000-0000-4000-8000-000000000022','xml_verified',
 'Sabonete Albany - teste sintético 9 PC (não é recebimento)',
 '7908324400120','7908324400120','34011190','2003400','PC','FOR-2');

set role service_role;
do $$
declare
 v_result jsonb;
 v_id uuid;
begin
 begin
  perform public.purchase_xml_resolve_catalog_identity_v2(
  '30000000-0000-4000-8000-000000000022',null,true,
  'Sabonete Albany Extrato de Aveia 85 g','commercial','base_unit',1,
  '30000000-0000-4000-8000-000000000001','CRIAR_INATIVO_XML',0);
  raise exception 'invalid_purchase_pack_was_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_purchase_pack_units_invalid%' then raise; end if;
 end;
 begin
  perform public.purchase_xml_resolve_catalog_identity_v2(
  '30000000-0000-4000-8000-000000000022',null,true,
  'Sabonete Albany Extrato de Aveia 85 g','commercial','package',12,
  '30000000-0000-4000-8000-000000000001','CRIAR_INATIVO_XML',12);
  raise exception 'mixed_package_and_base_factors_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_purchase_pack_units_invalid%' then raise; end if;
 end;
 v_result:=public.purchase_xml_resolve_catalog_identity_v2(
  '30000000-0000-4000-8000-000000000022',null,true,
  'Sabonete Albany Extrato de Aveia 85 g','commercial','base_unit',1,
  '30000000-0000-4000-8000-000000000001','CRIAR_INATIVO_XML',12);
 if v_result->>'ok'<>'true' or v_result->>'stock_updated'<>'false'
    or v_result->>'receipt_authorized'<>'false'
 then raise exception 'unit_pack_identity_failed'; end if;
 v_id:=(v_result->>'product_id')::uuid;
 if not exists(select 1 from public.products
  where id=v_id and gtin='7908324400120' and name='Sabonete Albany Extrato de Aveia 85 g'
    and is_active=false and stock=0 and price is null and cost is null and ncm is null)
 then raise exception 'unit_product_incorrect'; end if;
 if not exists(select 1 from public.purchase_xml_items
  where id='30000000-0000-4000-8000-000000000022' and product_id=v_id
    and converted_quantity is null and inventory_lot_id is null
    and metadata->>'purchase_pack_units_for_review'='12'
    and metadata->>'purchase_pack_not_authorized'='true'
    and metadata->>'purchase_pack_unit_from_xml'='PC')
 then raise exception 'purchase_pack_proposal_not_preserved'; end if;
 if not exists(select 1 from public.purchase_xml_catalog_identity_actions_v1
  where item_id='30000000-0000-4000-8000-000000000022'
   and gtin_role='base_unit' and conversion_factor=1
   and purchase_pack_units_for_review=12)
 then raise exception 'pack_review_audit_missing'; end if;
 if not exists(select 1 from public.product_identifiers
   where product_id=v_id and identifier_value='7908324400120'
   and identifier_kind='base_gtin' and conversion_factor is null)
 then raise exception 'individual_identifier_wrong'; end if;
 if (select count(*) from public.product_inventory_lots) <> 0
 then raise exception 'unexpected_lot_after_pack_note'; end if;
 if has_function_privilege('anon',
  'public.purchase_xml_resolve_catalog_identity_v2(uuid,uuid,boolean,text,text,text,integer,uuid,text,integer)','EXECUTE')
 or has_function_privilege('authenticated',
  'public.purchase_xml_resolve_catalog_identity_v2(uuid,uuid,boolean,text,text,text,integer,uuid,text,integer)','EXECUTE')
 then raise exception 'public_v2_execute_granted'; end if;
 begin
  perform public.purchase_xml_resolve_catalog_identity_v2(
   '30000000-0000-4000-8000-000000000022',null,true,
   'Sabonete Albany Extrato de Aveia 85 g','commercial','base_unit',1,
   '30000000-0000-4000-8000-000000000001','CRIAR_INATIVO_XML',12);
  raise exception 'replayed_identity_accepted';
 exception when others then
  if sqlerrm not like '%xml_identity_already_resolved%' then raise; end if;
 end;
end $$;
reset role;
select 'PASS R29 individual EAN factor 1, separate unapproved pack 12, inactive zero-stock, audit and ACL' as result;
