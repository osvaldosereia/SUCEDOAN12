-- R22 HARDENED RELEASE CANDIDATE: NOT A MIGRATION; DO NOT APPLY TO PRODUCTION.
-- Snapshot based on R21. Only after canonical CLI migration and full integration gates.
-- Only a validated human Admin may request this service-role RPC. Atomic linking
-- stores an identity decision without touching stock lots, sale prices or taxes.
create table if not exists public.purchase_xml_catalog_identity_actions_v1 (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null unique references public.purchase_xml_items(id) on delete restrict,
 document_id uuid not null references public.purchase_xml_documents(id) on delete restrict,
 product_id uuid not null references public.products(id) on delete restrict,
 action text not null check (action in ('link_existing','create_inactive')),
 gtin_source text not null check (gtin_source in ('commercial','tax')),
 gtin_role text not null check (gtin_role in ('base_unit','package')),
 identifier text not null,
 conversion_factor integer not null check (conversion_factor between 1 and 100000),
 actor_id uuid not null,
 created_at timestamptz not null default now()
);
create index if not exists purchase_xml_catalog_identity_actions_product_idx
 on public.purchase_xml_catalog_identity_actions_v1 (product_id,created_at desc);
alter table public.purchase_xml_catalog_identity_actions_v1 enable row level security;
revoke all on public.purchase_xml_catalog_identity_actions_v1 from public,anon,authenticated;
grant select,insert on public.purchase_xml_catalog_identity_actions_v1 to service_role;

create or replace function public.purchase_xml_catalog_identity_immutable_v1()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'xml_identity_history_immutable'; end; $$;
revoke all on function public.purchase_xml_catalog_identity_immutable_v1() from public,anon,authenticated;
drop trigger if exists purchase_xml_catalog_identity_immutable_v1
 on public.purchase_xml_catalog_identity_actions_v1;
create trigger purchase_xml_catalog_identity_immutable_v1 before update or delete
 on public.purchase_xml_catalog_identity_actions_v1
 for each row execute function public.purchase_xml_catalog_identity_immutable_v1();

create or replace function public.purchase_xml_resolve_catalog_identity_v1(
 p_item_id uuid,p_product_id uuid,p_create_new boolean,p_proposed_name text,
 p_gtin_source text,p_gtin_role text,p_conversion_factor integer,
 p_actor_id uuid,p_confirmation text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_item record;
 v_existing uuid;
 v_product record;
 v_product_id uuid;
 v_gtin text;
 v_check integer := 0;
 v_digit integer;
 v_weight integer:=3;
 v_expected integer;
 v_count integer;
 v_action text;
 v_audit_id uuid;
 v_kind text;
begin
 if p_actor_id is null or p_item_id is null or p_create_new is null
 then raise exception 'xml_identity_human_required'; end if;
 -- Re-check human privileges at the database transaction boundary. The Admin
 -- already authenticates the JWT, but this rejects stale/deactivated actors.
 if not exists (select 1 from public.admin_users
     where user_id=p_actor_id and is_active is true and role in ('owner','admin'))
 then raise exception 'xml_identity_actor_not_authorized'; end if;
 if p_confirmation is distinct from (case when p_create_new
   then 'CRIAR_INATIVO_XML' else 'VINCULAR_ITEM_XML' end)
 then raise exception 'xml_identity_confirmation_required'; end if;
 if p_gtin_source not in ('commercial','tax') or p_gtin_source is null
   or p_gtin_role not in ('base_unit','package') or p_gtin_role is null
 then raise exception 'xml_identity_role_required'; end if;
 if p_conversion_factor is null or p_conversion_factor not between 1 and 100000
   or (p_gtin_role='base_unit' and p_conversion_factor<>1)
   or (p_gtin_role='package' and p_conversion_factor<=1)
 then raise exception 'xml_identity_factor_invalid'; end if;
 select i.id,i.document_id,i.item_number,i.product_id,i.commercial_gtin,i.tax_gtin,
   i.purchase_unit,i.converted_quantity,i.inventory_lot_id,i.metadata,
   d.document_key,d.receipt_status
 into v_item from public.purchase_xml_items i
 join public.purchase_xml_documents d on d.id=i.document_id
 where i.id=p_item_id for update of i;
 if not found then raise exception 'xml_identity_item_not_found'; end if;
 if v_item.product_id is not null or exists(
   select 1 from public.purchase_xml_catalog_identity_actions_v1 where item_id=p_item_id)
 then raise exception 'xml_identity_already_resolved'; end if;
 -- Crucial: existing lot trigger fires on product_id UPDATE. Only 0/null
 -- converted quantity with no lot pointer is safe for evidence-only linking.
 if coalesce(v_item.converted_quantity,0)<>0 or v_item.inventory_lot_id is not null
 then raise exception 'xml_identity_operational_lot_review_required'; end if;
 -- The production lot trigger also treats a verified receipt plan or an applied
 -- stock receipt as received, even if document.receipt_status is still review.
 if v_item.receipt_status='received'
    or exists (select 1 from public.purchase_stock_receipt_plans_v1
        where document_id=v_item.document_id and status='verified')
    or exists (select 1 from public.purchase_stock_receipts
        where document_id=v_item.document_id and status='applied')
 then raise exception 'xml_identity_receipt_review_required'; end if;
 -- A stale/detached inventory lot is also operational state. Never relink it.
 if exists (select 1 from public.product_inventory_lots
       where source='purchase_xml' and source_ref='purchase-xml-item:'||p_item_id::text)
 then raise exception 'xml_identity_operational_lot_review_required'; end if;
 if not exists (select 1 from public.purchase_xml_catalog_observation_details_v2 x
   where x.purchase_item_id=v_item.id and x.source_state='xml_verified')
 then raise exception 'xml_identity_verified_source_required'; end if;
 if upper(coalesce(v_item.purchase_unit,'')) ~ '^(KG|G|L|LT|LTS|M|MT|TON)$'
 then raise exception 'xml_identity_weight_unit_review_required'; end if;
 if upper(coalesce(v_item.purchase_unit,'')) ~ '^(CX|FD|FAR|FARDO|CAIXA|FDO)$'
   and p_gtin_role<>'package'
 then raise exception 'xml_identity_outer_pack_requires_package'; end if;
 v_gtin:=case p_gtin_source when 'commercial' then v_item.commercial_gtin
   else v_item.tax_gtin end;
 if v_gtin is null or v_gtin !~ '^[0-9]+$' or
   length(v_gtin) not in (8,12,13,14)
 then raise exception 'xml_identity_gtin_invalid'; end if;
 for v_digit in reverse length(v_gtin)-1..1 loop
   v_check:=v_check + substr(v_gtin,v_digit,1)::integer * v_weight;
   v_weight:=case when v_weight=3 then 1 else 3 end;
 end loop;
 v_expected:=(10-(v_check%10))%10;
 if v_expected<>right(v_gtin,1)::integer
 then raise exception 'xml_identity_gtin_invalid'; end if;
 -- Serialize concurrent claims of the same EAN, across base/package kinds.
 perform pg_advisory_xact_lock(hashtextextended('purchase-xml-gtin:'||v_gtin,0));
 if p_create_new then
   if p_product_id is not null then raise exception 'xml_identity_product_argument_invalid'; end if;
 else
   if p_product_id is null then raise exception 'xml_identity_product_required'; end if;
 end if;
 select id into v_existing from public.products where gtin=v_gtin limit 1;
 if found and (p_create_new or v_existing is distinct from p_product_id)
 then raise exception 'xml_identity_gtin_conflict'; end if;
 if exists(select 1 from public.product_identifiers
     where identifier_value=v_gtin and status='confirmed'
       and identifier_kind in ('base_gtin','package_gtin')
       and (p_create_new or product_id is distinct from p_product_id))
 then raise exception 'xml_identity_identifier_conflict'; end if;
 if p_create_new then
   if length(btrim(coalesce(p_proposed_name,''))) not between 2 and 300
   then raise exception 'xml_identity_name_invalid'; end if;
   insert into public.products(sku,name,gtin,ncm,cost,price,stock,is_active,
     is_whatsapp_active,is_offer,unit,source_system,sync_status,desired_bling_status,metadata)
   values('XML-'||upper(left(replace(p_item_id::text,'-',''),12)),
     btrim(p_proposed_name),
     case when p_gtin_role='base_unit' then v_gtin else null end,
     null,null,null,0,false,false,false,'UN','operational','local','I',
     jsonb_build_object('purchase_xml_created',true,'fiscal_review_required',true,
       'catalog_identity_pending_receipt',true,'purchase_item_id',p_item_id))
   returning id into v_product_id;
   v_action:='create_inactive';
 else
   select id,gtin into v_product from public.products where id=p_product_id for update;
   if not found then raise exception 'xml_identity_product_not_found'; end if;
   if p_gtin_role='base_unit' and v_product.gtin is not null
      and v_product.gtin is distinct from v_gtin
   then raise exception 'xml_identity_existing_gtin_mismatch'; end if;
   v_product_id:=p_product_id;
   v_action:='link_existing';
 end if;
 v_kind:=case when p_gtin_role='package' then 'package_gtin' else 'base_gtin' end;
 -- Prevent a previously confirmed code from silently changing its EAN role.
 if exists (select 1 from public.product_identifiers
   where identifier_value=v_gtin and status='confirmed'
     and identifier_kind in ('base_gtin','package_gtin')
     and product_id=v_product_id and identifier_kind<>v_kind)
 then raise exception 'xml_identity_role_conflict'; end if;
 if not exists(select 1 from public.product_identifiers where identifier_value=v_gtin
   and status='confirmed' and identifier_kind in ('base_gtin','package_gtin'))
 then
   insert into public.product_identifiers(product_id,identifier_value,identifier_kind,
     packaging_unit,conversion_factor,source,confidence,status,metadata)
   values(v_product_id,v_gtin,v_kind,
     case when p_gtin_role='package' then v_item.purchase_unit else null end,
     case when p_gtin_role='package' then p_conversion_factor else null end,
     'purchase_identity_admin',1,'confirmed',
     jsonb_build_object('catalog_evidence_only',true,'purchase_item_id',p_item_id));
 end if;
 -- Do NOT set converted_quantity, receipt_status, NCM/CEST or stock.
 -- Existing lot trigger returns early when converted_quantity<=0 and no lot.
 update public.purchase_xml_items set product_id=v_product_id,
   match_method=case when p_create_new then 'human_created_inactive' else 'human_confirmed_existing' end,
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
     'catalog_evidence_only',true,'identity_confirmed_at',now(),
     'identity_confirmed_by',p_actor_id,'gtin_role',p_gtin_role,
     'gtin_source',p_gtin_source,'conversion_factor_proposed',p_conversion_factor,
     'receipt_not_authorized',true)
 where id=p_item_id and product_id is null and coalesce(converted_quantity,0)=0
   and inventory_lot_id is null;
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'xml_identity_race_conflict'; end if;
 insert into public.purchase_xml_catalog_identity_actions_v1
 (item_id,document_id,product_id,action,gtin_source,gtin_role,identifier,conversion_factor,actor_id)
 values(p_item_id,v_item.document_id,v_product_id,v_action,p_gtin_source,
   p_gtin_role,v_gtin,p_conversion_factor,p_actor_id) returning id into v_audit_id;
 return jsonb_build_object('ok',true,'item_id',p_item_id,'product_id',v_product_id,
   'created',p_create_new,'is_active',case when p_create_new then false else null end,
   'identity_action_id',v_audit_id,'catalog_evidence_only',true,
   'receipt_authorized',false,'stock_updated',false,'price_updated',false,
   'fiscal_updated',false,'bling_called',false,'finance_updated',false);
end; $$;
revoke all on function public.purchase_xml_resolve_catalog_identity_v1(
 uuid,uuid,boolean,text,text,text,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.purchase_xml_resolve_catalog_identity_v1(
 uuid,uuid,boolean,text,text,text,integer,uuid,text) to service_role;
comment on table public.purchase_xml_catalog_identity_actions_v1 is
 'R22 release candidate: identity decisions atomic, private, audit only; receipt separate.';
