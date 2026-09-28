-- Dona Antônia · Compras/XML · conversão para unidade + aprovação humana de preço
-- Aplicado no projeto canônico ssbesxgaijknwsjbsbcz em 2026-09-28.
-- Regra operacional: compra pode vir em CX/FD/PCT/DP, mas venda/cadastro operacional usa UN.
-- Custo e preço do catálogo só são consolidados após autorização humana no Vitrine/Admin.

update public.purchase_xml_items
set conversion_status='review_required',
    conversion_factor=null,
    converted_quantity=null,
    base_unit='UN',
    base_unit_cost=null,
    processing_status='review_required',
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'unit_conversion_review_required',true,
      'unit_conversion_review_reason','supplier_pack_factor_missing',
      'unit_conversion_review_marked_at',now()
    ),
    updated_at=now()
where coalesce(conversion_factor,0)<=1
  and (
    upper(coalesce(purchase_unit,'')) in ('CX','FD','PCT','DP')
    or upper(coalesce(description,'')) ~ '(CX|FD|PCT|DP)[[:space:]]*/[[:space:]]*0*[2-9][0-9]*'
    or upper(coalesce(description,'')) ~ '[0-9]{2,4}[[:space:]]*(UN|UND|PC|PCS|FS)[[:space:]]*X[[:space:]]*0*1[[:space:]]*(CX|FD|PCT|DP)'
  );

update public.product_purchase_history h
set conversion_factor=null,
    base_unit='UN',
    base_quantity=null,
    base_unit_cost=null,
    metadata=coalesce(h.metadata,'{}'::jsonb) || jsonb_build_object(
      'unit_conversion_review_required',true,
      'unit_conversion_review_marked_at',now()
    )
where exists (
  select 1
  from public.purchase_xml_items i
  where i.id=h.purchase_item_id
    and i.conversion_status='review_required'
    and coalesce((i.metadata->>'unit_conversion_review_required')::boolean,false)=true
);

update public.product_supplier_packaging
set status='review_required',
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'unit_conversion_review_required',true,
      'unit_conversion_review_reason','pack_factor_one_invalid_for_unit_sales',
      'unit_conversion_review_marked_at',now()
    ),
    updated_at=now()
where upper(coalesce(purchase_unit,'')) in ('CX','FD','PCT','DP')
  and conversion_factor<=1
  and status in ('confirmed','inferred_xml');

update public.products p
set metadata=coalesce(p.metadata,'{}'::jsonb) || jsonb_build_object(
      'purchase_catalog_review_required',true,
      'purchase_catalog_review_reason','unit_conversion_requires_human_approval'
    ),
    updated_at=now()
where exists (
  select 1
  from public.purchase_xml_items i
  where i.product_id=p.id
    and i.conversion_status='review_required'
    and coalesce((i.metadata->>'unit_conversion_review_required')::boolean,false)=true
);

update public.purchase_xml_documents d
set processing_status='review_required',
    receipt_status='review',
    review_item_count=(
      select count(*)::integer
      from public.purchase_xml_items i
      where i.document_id=d.id
        and (
          i.product_id is null
          or i.conversion_status='review_required'
          or i.processing_status in ('review_required','failed','pending')
          or i.converted_quantity is null
          or i.converted_quantity<=0
        )
    ),
    matched_item_count=(
      select count(*)::integer
      from public.purchase_xml_items i
      where i.document_id=d.id and i.product_id is not null
    ),
    last_error='Conversão embalagem → unidade exige revisão humana',
    updated_at=now()
where exists (
  select 1
  from public.purchase_xml_items i
  where i.document_id=d.id
    and i.conversion_status='review_required'
    and coalesce((i.metadata->>'unit_conversion_review_required')::boolean,false)=true
);

alter table public.purchase_xml_items
  drop constraint if exists purchase_xml_items_pack_factor_guard;

alter table public.purchase_xml_items
  add constraint purchase_xml_items_pack_factor_guard
  check (
    upper(coalesce(purchase_unit,'')) not in ('CX','FD','PCT','DP')
    or conversion_status='review_required'
    or coalesce(conversion_factor,0)>1
  );
