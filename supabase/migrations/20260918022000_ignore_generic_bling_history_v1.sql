begin;

create or replace function public.reconcile_bling_history_order_v1(p_staging_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  o public.bling_history_staging_orders%rowtype;
  v_existing_order uuid;
  v_by_bling uuid;
  v_by_doc uuid;
  v_by_phone uuid;
  v_customer uuid;
  v_method text;
  v_status text;
  v_notes text[]:='{}'::text[];
  v_ready boolean:=true;
  r record;
  v_product uuid;
  v_product_method text;
  v_candidates integer;
begin
  select * into o from public.bling_history_staging_orders where id=p_staging_order_id for update;
  if not found then raise exception 'staging_order_not_found'; end if;

  delete from public.bling_history_reconciliation_issues where staging_order_id=o.id and resolved=false;

  select id into v_existing_order from public.orders where bling_order_id=o.bling_order_id limit 1;
  if v_existing_order is not null then
    update public.bling_history_staging_orders
       set local_order_id=v_existing_order,
           reconciliation_status='duplicate_local',
           reconciliation_notes=array['Pedido já existe localmente pelo bling_order_id'],
           updated_at=now()
     where id=o.id;
    insert into public.bling_history_reconciliation_issues(staging_order_id,issue_type,severity,details)
    values(o.id,'order_duplicate','info',jsonb_build_object('local_order_id',v_existing_order,'bling_order_id',o.bling_order_id))
    on conflict do nothing;
    return jsonb_build_object('status','duplicate_local','local_order_id',v_existing_order);
  end if;

  select canonical_status into v_status
    from public.bling_history_status_policy
   where bling_status_id=o.status_id and approved=true;

  if v_status='delivered'
     and lower(trim(coalesce(o.customer_name,''))) in ('consumidor final','consumidor','cliente final','cliente')
     and nullif(regexp_replace(coalesce(o.customer_document,''),'[^0-9]','','g'),'') is null
     and nullif(public.normalize_phone_digits(o.customer_phone),'') is null then
    update public.bling_history_staging_orders
       set canonical_status=v_status,
           matched_customer_id=null,
           customer_match_method='generic_unattributable',
           reconciliation_status='ignored',
           reconciliation_notes=array['Cliente genérico sem identificador; não atribuir histórico a pessoa específica'],
           updated_at=now()
     where id=o.id;
    return jsonb_build_object(
      'status','ignored',
      'customer_id',null,
      'customer_match_method','generic_unattributable',
      'canonical_status',v_status,
      'notes',array['Cliente genérico sem identificador']
    );
  end if;

  if o.bling_contact_id is not null then
    select id into v_by_bling from public.customers where bling_contact_id=o.bling_contact_id limit 1;
  end if;

  if nullif(regexp_replace(coalesce(o.customer_document,''),'[^0-9]','','g'),'') is not null then
    select id into v_by_doc
      from public.customers
     where regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g')
           =regexp_replace(o.customer_document,'[^0-9]','','g')
     limit 1;
  end if;

  if nullif(public.normalize_phone_digits(o.customer_phone),'') is not null then
    select id into v_by_phone
      from public.customers
     where public.normalize_phone_digits(primary_whatsapp_e164)=public.normalize_phone_digits(o.customer_phone)
     limit 1;
  end if;

  if v_by_bling is not null then
    if (v_by_doc is not null and v_by_doc<>v_by_bling) or (v_by_phone is not null and v_by_phone<>v_by_bling) then
      v_ready:=false;
      v_notes:=array_append(v_notes,'Bling contact conflita com CPF/telefone local');
      insert into public.bling_history_reconciliation_issues(staging_order_id,issue_type,severity,details)
      values(o.id,'customer_ambiguous','blocking',jsonb_build_object('by_bling',v_by_bling,'by_document',v_by_doc,'by_phone',v_by_phone))
      on conflict do nothing;
    else
      v_customer:=v_by_bling;v_method:='bling_contact_id';
    end if;
  elsif v_by_doc is not null and v_by_phone is not null and v_by_doc<>v_by_phone then
    v_ready:=false;
    v_notes:=array_append(v_notes,'CPF e telefone apontam para clientes diferentes');
    insert into public.bling_history_reconciliation_issues(staging_order_id,issue_type,severity,details)
    values(o.id,'customer_ambiguous','blocking',jsonb_build_object('by_document',v_by_doc,'by_phone',v_by_phone))
    on conflict do nothing;
  elsif v_by_doc is not null then
    v_customer:=v_by_doc;v_method:='document_exact';
  elsif v_by_phone is not null then
    v_customer:=v_by_phone;v_method:='phone_exact';
  else
    v_ready:=false;
    v_notes:=array_append(v_notes,'Cliente não localizado');
    insert into public.bling_history_reconciliation_issues(staging_order_id,issue_type,severity,details)
    values(o.id,'customer_unmatched','blocking',jsonb_build_object('bling_contact_id',o.bling_contact_id))
    on conflict do nothing;
  end if;

  select canonical_status into v_status
    from public.bling_history_status_policy
   where bling_status_id=o.status_id and approved=true;

  if v_status is null then
    v_ready:=false;
    v_notes:=array_append(v_notes,'Situação do Bling ainda não mapeada');
    insert into public.bling_history_reconciliation_issues(staging_order_id,issue_type,severity,details)
    values(o.id,'status_unmapped','blocking',jsonb_build_object('status_id',o.status_id,'status_name',o.status_name))
    on conflict do nothing;
  end if;

  for r in
    select * from public.bling_history_staging_items where staging_order_id=o.id order by item_index
  loop
    v_product:=null;v_product_method:=null;v_candidates:=0;

    if r.bling_product_id is not null then
      select id into v_product from public.products where bling_product_id=r.bling_product_id limit 1;
      if v_product is not null then v_product_method:='bling_product_id'; end if;
    end if;

    if v_product is null and nullif(trim(coalesce(r.sku,'')),'') is not null then
      select count(*),(array_agg(id order by id))[1] into v_candidates,v_product
        from public.products where lower(trim(coalesce(sku,'')))=lower(trim(r.sku));
      if v_candidates=1 then v_product_method:='sku_exact'; else v_product:=null; end if;
    end if;

    if v_product is null and nullif(regexp_replace(coalesce(r.gtin,''),'[^0-9]','','g'),'') is not null then
      select count(*),(array_agg(id order by id))[1] into v_candidates,v_product
        from public.products
       where regexp_replace(coalesce(gtin,''),'[^0-9]','','g')
             =regexp_replace(r.gtin,'[^0-9]','','g');
      if v_candidates=1 then v_product_method:='gtin_exact'; else v_product:=null; end if;
    end if;

    update public.bling_history_staging_items
       set product_id=v_product,product_match_method=v_product_method,updated_at=now()
     where id=r.id;

    if v_product is null then
      insert into public.bling_history_reconciliation_issues(staging_order_id,issue_type,severity,details)
      values(o.id,'product_unmatched','review',jsonb_build_object('item_index',r.item_index,'bling_product_id',r.bling_product_id,'sku',r.sku,'gtin',r.gtin,'name',r.name))
      on conflict do nothing;
    end if;
  end loop;

  update public.bling_history_staging_orders
     set matched_customer_id=v_customer,
         customer_match_method=v_method,
         canonical_status=v_status,
         reconciliation_status=case when v_status='ignored' then 'ignored' when v_ready then 'ready' else 'review' end,
         reconciliation_notes=v_notes,
         updated_at=now()
   where id=o.id;

  return jsonb_build_object(
    'status',case when v_status='ignored' then 'ignored' when v_ready then 'ready' else 'review' end,
    'customer_id',v_customer,
    'customer_match_method',v_method,
    'canonical_status',v_status,
    'notes',v_notes
  );
end
$$;

revoke all on function public.reconcile_bling_history_order_v1(uuid) from public,anon,authenticated;
grant execute on function public.reconcile_bling_history_order_v1(uuid) to service_role;

commit;
