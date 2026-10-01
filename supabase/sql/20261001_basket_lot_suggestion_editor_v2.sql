-- Dona Antonia · editor completo das sugestões automáticas de lotes
-- Permite preço próprio por lote e edição total da composição antes da aprovação.

alter table public.basket_stock_lots
  add column if not exists sale_price_override numeric(14,2),
  add column if not exists component_sum_snapshot numeric(14,2),
  add column if not exists hidden_adjustment_snapshot numeric(14,2);

do $$ begin
  if not exists(select 1 from pg_constraint where conname='basket_stock_lots_sale_price_override_ck') then
    alter table public.basket_stock_lots add constraint basket_stock_lots_sale_price_override_ck check (sale_price_override is null or sale_price_override>=0);
  end if;
end $$;

create or replace view public.basket_current_lot_v1 with (security_invoker=true) as
select distinct on (basket_id)
  basket_id,id as lot_id,lot_code,quantity_built,quantity_available,composition_hash,
  built_at,built_by,source,metadata,sale_price_override
from public.basket_stock_lots l
where status='ready' and quantity_available>0 and lot_kind='legacy_full' and sale_enabled=true
order by basket_id,built_at,created_at,id;

create or replace function public.basket_lot_suggestion_save_v2(
  p_suggestion_id uuid,
  p_quantity integer,
  p_sale_price numeric,
  p_items jsonb,
  p_operator text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  s public.basket_lot_suggestions%rowtype;
  ov jsonb;
  item_id uuid;
  pid uuid;
  qty numeric;
  pos integer;
  existing public.basket_lot_suggestion_items%rowtype;
  p public.products%rowtype;
  orig public.products%rowtype;
  orig_id uuid;
  template_id uuid;
  avail numeric;
  required numeric;
  component numeric:=0;
  issues jsonb:='[]'::jsonb;
  buildable boolean:=true;
  delta numeric;
  is_sub boolean;
  fam text;
  seen uuid[]:=array[]::uuid[];
  req record;
  manual_added boolean;
begin
  if not public.basket_lot_admin_allowed_v1() then raise exception 'admin_forbidden'; end if;
  if coalesce(p_quantity,0)<1 or p_quantity>500 then raise exception 'invalid_lot_quantity'; end if;
  if p_sale_price is null or p_sale_price<0 or p_sale_price>9999999 then raise exception 'invalid_sale_price'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'invalid_items'; end if;

  select * into s from public.basket_lot_suggestions where id=p_suggestion_id for update;
  if not found then raise exception 'suggestion_not_found'; end if;
  if s.status<>'pending' then raise exception 'suggestion_not_pending'; end if;

  for ov in select value from jsonb_array_elements(p_items) x(value) loop
    begin item_id:=nullif(ov->>'id','')::uuid; exception when others then item_id:=null; end;
    begin pid:=nullif(ov->>'suggested_product_id','')::uuid; exception when others then raise exception 'invalid_product'; end;
    begin qty:=coalesce(nullif(ov->>'quantity_per_basket','')::numeric,0); exception when others then raise exception 'invalid_item_quantity'; end;
    begin pos:=coalesce(nullif(ov->>'position_order','')::integer,0); exception when others then pos:=0; end;
    if pid is null then raise exception 'invalid_product'; end if;
    if qty<=0 or qty>100 then raise exception 'invalid_item_quantity'; end if;

    select * into p from public.products where id=pid and is_active=true;
    if not found then raise exception 'product_unavailable'; end if;

    existing:=null;
    manual_added:=false;
    if item_id is not null then
      select * into existing from public.basket_lot_suggestion_items where id=item_id and suggestion_id=s.id;
      if not found then raise exception 'suggestion_item_not_found'; end if;
      orig_id:=coalesce(existing.original_product_id,pid);
      template_id:=existing.template_item_id;
    else
      item_id:=gen_random_uuid();
      orig_id:=pid;
      template_id:=null;
      manual_added:=true;
    end if;

    select * into orig from public.products where id=orig_id;
    if not found then orig:=p; orig_id:=pid; end if;

    select coalesce(loose_sellable_stock,0) into avail from public.ops2_loose_sellable_stock_v1 where product_id=pid;
    avail:=coalesce(avail,0);
    required:=qty*p_quantity;
    is_sub:=pid<>orig_id;
    fam:=public.basket_substitution_family_v1(orig.name,orig.subcategory);
    delta:=case when coalesce(orig.price,0)>0 then round(((coalesce(p.price,0)-orig.price)/orig.price*100)::numeric,3) else null end;

    insert into public.basket_lot_suggestion_items(
      id,suggestion_id,template_item_id,original_product_id,suggested_product_id,
      quantity_per_basket,position_order,original_unit_price,suggested_unit_price,
      price_delta_pct,is_substituted,substitution_family,substitution_reason,
      loose_stock_snapshot,stock_ok_snapshot,metadata,created_at,updated_at
    ) values(
      item_id,s.id,template_id,orig_id,pid,qty,pos,coalesce(orig.price,0),coalesce(p.price,0),
      delta,is_sub,fam,
      case when manual_added then 'Adicionado manualmente no Admin.' when is_sub then 'Alteração manual no Admin.' else null end,
      avail,avail>=required,
      jsonb_build_object('manual_edit',true,'manual_added',manual_added,'edited_by',coalesce(nullif(trim(p_operator),''),'Operação')),
      now(),now()
    )
    on conflict(id) do update set
      suggested_product_id=excluded.suggested_product_id,
      quantity_per_basket=excluded.quantity_per_basket,
      position_order=excluded.position_order,
      suggested_unit_price=excluded.suggested_unit_price,
      price_delta_pct=excluded.price_delta_pct,
      is_substituted=excluded.is_substituted,
      substitution_family=excluded.substitution_family,
      substitution_reason=excluded.substitution_reason,
      loose_stock_snapshot=excluded.loose_stock_snapshot,
      stock_ok_snapshot=excluded.stock_ok_snapshot,
      metadata=coalesce(public.basket_lot_suggestion_items.metadata,'{}'::jsonb)||excluded.metadata,
      updated_at=now();

    seen:=array_append(seen,item_id);
    component:=component+coalesce(p.price,0)*qty;
  end loop;

  delete from public.basket_lot_suggestion_items
  where suggestion_id=s.id and not(id=any(seen));

  -- One stock warning per product, using cumulative demand across the whole basket.
  for req in
    select i.suggested_product_id,
           sum(i.quantity_per_basket*p_quantity)::numeric required,
           max(coalesce(ls.loose_sellable_stock,0))::numeric available,
           max(p.name) product_name
    from public.basket_lot_suggestion_items i
    join public.products p on p.id=i.suggested_product_id
    left join public.ops2_loose_sellable_stock_v1 ls on ls.product_id=i.suggested_product_id
    where i.suggestion_id=s.id
    group by i.suggested_product_id
  loop
    update public.basket_lot_suggestion_items
       set stock_ok_snapshot=req.available>=req.required,
           loose_stock_snapshot=req.available,
           updated_at=now()
     where suggestion_id=s.id and suggested_product_id=req.suggested_product_id;
    if req.available<req.required then
      buildable:=false;
      issues:=issues||jsonb_build_array(jsonb_build_object(
        'type','cumulative_stock_shortage','product_id',req.suggested_product_id,
        'product_name',req.product_name,'available',req.available,'required',req.required
      ));
    end if;
  end loop;

  update public.basket_lot_suggestions
     set quantity_planned=p_quantity,
         sale_price=round(p_sale_price,2),
         component_sum=round(component,2),
         hidden_adjustment=round(p_sale_price-component,2),
         buildability_status=case when buildable then 'ready' else 'attention' end,
         issues=issues,
         updated_at=now(),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
           'manual_edit',true,'full_editor_v2',true,
           'edited_by',coalesce(nullif(trim(p_operator),''),'Operação')
         )
   where id=s.id;

  return jsonb_build_object(
    'ok',true,'id',s.id,
    'buildability_status',case when buildable then 'ready' else 'attention' end,
    'sale_price',round(p_sale_price,2),
    'component_sum',round(component,2),
    'hidden_adjustment',round(p_sale_price-component,2),
    'issues',issues
  );
end;
$$;

create or replace function public.basket_lot_suggestion_approve_v1(p_suggestion_id uuid,p_operator text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  s public.basket_lot_suggestions%rowtype;
  items jsonb;
  res jsonb;
  lot_id uuid;
begin
  if not public.basket_lot_admin_allowed_v1() then raise exception 'admin_forbidden'; end if;
  select * into s from public.basket_lot_suggestions where id=p_suggestion_id for update;
  if not found then raise exception 'suggestion_not_found'; end if;
  if s.status<>'pending' then raise exception 'suggestion_not_pending'; end if;
  if s.buildability_status<>'ready' then raise exception 'suggestion_requires_attention'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',i.suggested_product_id,
    'template_item_id',i.template_item_id,
    'quantity_per_basket',i.quantity_per_basket,
    'position_order',i.position_order,
    'substitution_reason',i.substitution_reason,
    'template_product_id',i.original_product_id,
    'is_substitution',i.is_substituted
  ) order by i.position_order,i.id),'[]'::jsonb)
  into items
  from public.basket_lot_suggestion_items i
  where i.suggestion_id=s.id;

  res:=public.create_basket_stock_lot_v1(
    s.basket_id,s.quantity_planned,items,
    coalesce(nullif(trim(p_operator),''),'Operação'),
    'Lote criado a partir da sugestão automática '||s.id::text,
    'admin',false
  );
  lot_id:=nullif(res->>'lot_id','')::uuid;

  update public.basket_stock_lots
     set sale_price_override=s.sale_price,
         component_sum_snapshot=s.component_sum,
         hidden_adjustment_snapshot=s.hidden_adjustment,
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
           'suggestion_id',s.id,
           'sale_price_override',s.sale_price,
           'component_sum_snapshot',s.component_sum,
           'hidden_adjustment_snapshot',s.hidden_adjustment
         ),
         updated_at=now()
   where id=lot_id;

  update public.basket_lot_suggestions
     set status='approved',reviewed_at=now(),
         reviewed_by=coalesce(nullif(trim(p_operator),''),'Operação'),
         approved_lot_id=lot_id,updated_at=now()
   where id=s.id;

  return jsonb_build_object(
    'ok',true,'suggestion_id',s.id,
    'sale_price',s.sale_price,'hidden_adjustment',s.hidden_adjustment,
    'lot',res
  );
end;
$$;

-- Patch the canonical legacy order engine in place: only sale-enabled legacy lots
-- can be allocated, and a lot-specific sale price overrides the template price.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.create_vitrine_cart_order_v1(text,text,jsonb,jsonb,jsonb)'::regprocedure) into v_def;
  v_new:=v_def;
  v_new:=replace(v_new,
    "where id=v_lot_id and basket_id=v_basket_id and status='ready' and quantity_available>0",
    "where id=v_lot_id and basket_id=v_basket_id and status='ready' and quantity_available>0 and lot_kind='legacy_full' and sale_enabled=true");
  v_new:=replace(v_new,
    "where basket_id=v_basket_id and status='ready' and quantity_available>0",
    "where basket_id=v_basket_id and status='ready' and quantity_available>0 and lot_kind='legacy_full' and sale_enabled=true");
  v_new:=replace(v_new,
    'v_basket_unit:=coalesce(v_basket.base_price,0);',
    'v_basket_unit:=coalesce(v_lot.sale_price_override,v_basket.base_price,0);');
  if v_new=v_def then raise exception 'create_vitrine_cart_order_v1 patch anchors not found'; end if;
  if position('sale_price_override' in v_new)=0 or position("sale_enabled=true" in v_new)=0 then raise exception 'create_vitrine_cart_order_v1 patch incomplete'; end if;
  execute v_new;
end $$;

revoke all on function public.basket_lot_suggestion_save_v2(uuid,integer,numeric,jsonb,text) from public,anon;
grant execute on function public.basket_lot_suggestion_save_v2(uuid,integer,numeric,jsonb,text) to authenticated,service_role;
