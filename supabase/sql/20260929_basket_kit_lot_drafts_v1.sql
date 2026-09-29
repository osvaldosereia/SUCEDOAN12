-- Dona Antônia — rascunhos persistentes de lotes de Alimentos / Limpeza e Higiene
-- Aplicado ao Supabase canônico em 2026-09-29.
-- Rascunho não reserva estoque e nunca entra na vitrine.
-- A ativação revalida o estoque atual e cria o lote real com sale_enabled=false.

create or replace function public.save_basket_kit_lot_draft_v1(
  p_lot_id uuid,
  p_kit_template_id uuid,
  p_quantity integer,
  p_items jsonb,
  p_operator text default null,
  p_notes text default null,
  p_short_code text default null,
  p_duplicated_from_lot_id uuid default null
) returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_kit public.basket_kit_templates%rowtype;
  v_lot_id uuid:=coalesce(p_lot_id,gen_random_uuid());
  v_short text;
  v_internal_code text;
  v_item jsonb;
  v_product_id uuid;
  v_kit_item_id uuid;
  v_source_item_id uuid;
  v_qty numeric;
  v_count integer:=0;
  v_hash text;
begin
  if p_kit_template_id is null then raise exception 'invalid_kit_template'; end if;
  if coalesce(p_quantity,0)<=0 or p_quantity>500 then raise exception 'invalid_lot_quantity'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'invalid_lot_composition'; end if;

  select * into v_kit
  from public.basket_kit_templates
  where id=p_kit_template_id and is_active=true
  for share;
  if not found then raise exception 'kit_template_not_found'; end if;

  v_short:=upper(trim(coalesce(p_short_code,'')));
  if v_short='' then v_short:=public.next_basket_kit_short_code_v1(p_kit_template_id); end if;
  if v_short !~ '^[A-Z]{2}[0-9]$' or left(v_short,2)<>v_kit.code_prefix then raise exception 'invalid_kit_short_code'; end if;
  if exists(select 1 from public.basket_stock_lots where short_code=v_short and status in ('draft','ready') and id<>v_lot_id)
    then raise exception 'kit_short_code_in_use'; end if;

  if p_duplicated_from_lot_id is not null and not exists(
    select 1 from public.basket_stock_lots where id=p_duplicated_from_lot_id and kit_template_id=p_kit_template_id
  ) then raise exception 'invalid_source_lot'; end if;

  if (select count(*)<>count(distinct value->>'product_id') from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)))
    then raise exception 'duplicate_product_in_kit_lot'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    begin v_product_id:=(v_item->>'product_id')::uuid; exception when others then raise exception 'invalid_lot_product'; end;
    begin v_kit_item_id:=nullif(v_item->>'kit_template_item_id','')::uuid; exception when others then v_kit_item_id:=null; end;
    begin v_source_item_id:=nullif(v_item->>'source_template_item_id','')::uuid; exception when others then v_source_item_id:=null; end;
    begin v_qty:=coalesce(nullif(v_item->>'quantity_per_kit','')::numeric,0); exception when others then raise exception 'invalid_lot_component_quantity'; end;
    if v_qty<=0 or v_qty>100 or trunc(v_qty)<>v_qty then raise exception 'invalid_lot_component_quantity'; end if;
    if not exists(select 1 from public.products where id=v_product_id) then raise exception 'lot_product_not_found'; end if;
    if v_kit_item_id is not null and not exists(
      select 1 from public.basket_kit_template_items where id=v_kit_item_id and kit_template_id=p_kit_template_id
    ) then raise exception 'invalid_kit_template_item'; end if;
    v_count:=v_count+1;
  end loop;

  if p_lot_id is not null then
    perform 1 from public.basket_stock_lots
    where id=p_lot_id and status='draft' and kit_template_id=p_kit_template_id
    for update;
    if not found then raise exception 'draft_lot_not_found'; end if;
  end if;

  v_hash:=md5(coalesce(p_items::text,'[]'));
  v_internal_code:='KIT-'||v_short||'-'||upper(substr(replace(v_lot_id::text,'-',''),1,6));

  insert into public.basket_stock_lots(
    id,basket_id,kit_template_id,lot_kind,short_code,lot_code,status,
    quantity_built,quantity_available,composition_hash,built_at,built_by,
    notes,source,duplicated_from_lot_id,sale_enabled,metadata,updated_at
  ) values(
    v_lot_id,v_kit.basket_id,v_kit.id,v_kit.kind,v_short,v_internal_code,'draft',
    p_quantity,0,v_hash,now(),nullif(trim(coalesce(p_operator,'')),''),
    nullif(trim(coalesce(p_notes,'')),''),
    'admin',p_duplicated_from_lot_id,false,
    jsonb_build_object('component_count',v_count,'short_code',v_short,'split_kit',true,
      'draft_saved_at',now(),'draft_saved_by',nullif(trim(coalesce(p_operator,'')),'')),now()
  )
  on conflict(id) do update
  set basket_id=excluded.basket_id,kit_template_id=excluded.kit_template_id,lot_kind=excluded.lot_kind,
      short_code=excluded.short_code,lot_code=excluded.lot_code,quantity_built=excluded.quantity_built,
      quantity_available=0,composition_hash=excluded.composition_hash,built_by=excluded.built_by,
      notes=excluded.notes,duplicated_from_lot_id=excluded.duplicated_from_lot_id,sale_enabled=false,
      metadata=coalesce(public.basket_stock_lots.metadata,'{}'::jsonb)||excluded.metadata,updated_at=now();

  delete from public.basket_stock_lot_items where lot_id=v_lot_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_product_id:=(v_item->>'product_id')::uuid;
    begin v_kit_item_id:=nullif(v_item->>'kit_template_item_id','')::uuid; exception when others then v_kit_item_id:=null; end;
    begin v_source_item_id:=nullif(v_item->>'source_template_item_id','')::uuid; exception when others then v_source_item_id:=null; end;
    v_qty:=(v_item->>'quantity_per_kit')::numeric;
    insert into public.basket_stock_lot_items(
      lot_id,kit_template_item_id,source_template_item_id,product_id,
      quantity_per_basket,position_order,substitution_reason,metadata
    ) values(
      v_lot_id,v_kit_item_id,v_source_item_id,v_product_id,v_qty,
      coalesce(nullif(v_item->>'position_order','')::integer,0),
      nullif(trim(coalesce(v_item->>'change_note','')),''),
      jsonb_build_object('kit_kind',v_kit.kind,'template_product_id',nullif(v_item->>'template_product_id',''),
        'is_changed',coalesce((v_item->>'is_changed')::boolean,false))
    );
  end loop;

  return jsonb_build_object('ok',true,'draft',true,'lot_id',v_lot_id,'short_code',v_short,
    'lot_code',v_internal_code,'quantity_planned',p_quantity,'component_count',v_count,
    'kit_template_id',v_kit.id,'kind',v_kit.kind);
exception when unique_violation then raise exception 'kit_short_code_in_use';
end;
$$;

create or replace function public.activate_basket_kit_lot_draft_v1(
  p_lot_id uuid,
  p_operator text default null
) returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_lot public.basket_stock_lots%rowtype;
  v_req record;
  v_available numeric;
  v_item_count integer;
begin
  select * into v_lot from public.basket_stock_lots where id=p_lot_id for update;
  if not found then raise exception 'draft_lot_not_found'; end if;
  if v_lot.status<>'draft' or v_lot.kit_template_id is null then raise exception 'draft_lot_required'; end if;
  select count(*) into v_item_count from public.basket_stock_lot_items where lot_id=p_lot_id;
  if v_item_count=0 then raise exception 'empty_lot_composition'; end if;

  perform p.id from public.products p
  where p.id in (select li.product_id from public.basket_stock_lot_items li where li.lot_id=p_lot_id)
  order by p.id for update;

  for v_req in
    select li.product_id,sum(li.quantity_per_basket*v_lot.quantity_built)::numeric as required
    from public.basket_stock_lot_items li where li.lot_id=p_lot_id group by li.product_id
  loop
    if not exists(select 1 from public.products where id=v_req.product_id and is_active=true)
      then raise exception 'lot_product_unavailable:%',v_req.product_id; end if;
    select loose_sellable_stock into v_available from public.ops2_loose_sellable_stock_v1 where product_id=v_req.product_id;
    if coalesce(v_available,0)<v_req.required
      then raise exception 'insufficient_loose_stock:%:%:%',v_req.product_id,coalesce(v_available,0),v_req.required; end if;
  end loop;

  update public.basket_stock_lots
  set status='ready',quantity_available=quantity_built,built_at=now(),
      built_by=coalesce(nullif(trim(coalesce(p_operator,'')),''),built_by),sale_enabled=false,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('draft_activated_at',now(),
        'draft_activated_by',nullif(trim(coalesce(p_operator,'')),'')),updated_at=now()
  where id=p_lot_id;

  return jsonb_build_object('ok',true,'lot_id',p_lot_id,'status','ready','short_code',v_lot.short_code,
    'quantity_built',v_lot.quantity_built,'sale_enabled',false);
end;
$$;

create or replace function public.delete_basket_kit_lot_draft_v1(p_lot_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $$
begin
  delete from public.basket_stock_lots where id=p_lot_id and status='draft' and kit_template_id is not null;
  if not found then raise exception 'draft_lot_not_found'; end if;
  return jsonb_build_object('ok',true,'lot_id',p_lot_id,'deleted',true);
end;
$$;

revoke all on function public.save_basket_kit_lot_draft_v1(uuid,uuid,integer,jsonb,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.activate_basket_kit_lot_draft_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.delete_basket_kit_lot_draft_v1(uuid) from public,anon,authenticated;
grant execute on function public.save_basket_kit_lot_draft_v1(uuid,uuid,integer,jsonb,text,text,text,uuid) to service_role;
grant execute on function public.activate_basket_kit_lot_draft_v1(uuid,text) to service_role;
grant execute on function public.delete_basket_kit_lot_draft_v1(uuid) to service_role;
