-- Dona Antonia · catálogo explícito de substituições de cestas v3
-- A automação só pode substituir por produtos cadastrados explicitamente na mesma família.

create table if not exists public.basket_lot_substitution_products (
  product_id uuid primary key references public.products(id) on delete cascade,
  family_key text not null references public.basket_lot_substitution_rules(family_key) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists basket_lot_substitution_products_family_idx
  on public.basket_lot_substitution_products(family_key,product_id);

alter table public.basket_lot_substitution_products enable row level security;
revoke all on public.basket_lot_substitution_products from public,anon,authenticated;
grant select,insert,update,delete on public.basket_lot_substitution_products to service_role;

-- Migração inicial: preserva exatamente os produtos que a classificação legada já reconhecia.
insert into public.basket_lot_substitution_products(product_id,family_key,updated_by,metadata)
select p.id,f.family_key,'migration_v3',jsonb_build_object('source','legacy_classifier')
from public.products p
cross join lateral (select public.basket_substitution_family_v1(p.name,p.subcategory) family_key) f
join public.basket_lot_substitution_rules r on r.family_key=f.family_key
where f.family_key is not null
on conflict(product_id) do nothing;

create or replace function public.basket_substitution_family_for_product_v2(p_product_id uuid)
returns text
language sql
stable
set search_path to ''
as $$
  select m.family_key
  from public.basket_lot_substitution_products m
  where m.product_id=p_product_id
  limit 1;
$$;

create or replace function public.basket_lot_substitution_catalog_admin_v1()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_result jsonb;
begin
  if not public.basket_lot_admin_allowed_v1() then raise exception 'admin_forbidden'; end if;
  select jsonb_build_object(
    'ok',true,
    'families',coalesce(jsonb_agg(
      jsonb_build_object(
        'family_key',r.family_key,
        'label',r.label,
        'enabled',r.enabled,
        'sort_order',r.sort_order,
        'product_count',(select count(*) from public.basket_lot_substitution_products m where m.family_key=r.family_key),
        'products',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',p.id,'name',p.name,'sku',p.sku,'gtin',p.gtin,'packaging',p.packaging,
            'price',p.price,'image_url',p.image_url,'is_active',p.is_active,
            'loose_stock',coalesce(ls.loose_sellable_stock,0)
          ) order by p.name,p.id)
          from public.basket_lot_substitution_products m
          join public.products p on p.id=m.product_id
          left join public.ops2_loose_sellable_stock_v1 ls on ls.product_id=p.id
          where m.family_key=r.family_key
        ),'[]'::jsonb)
      ) order by r.sort_order,r.label
    ),'[]'::jsonb)
  ) into v_result
  from public.basket_lot_substitution_rules r;
  return v_result;
end;
$$;

create or replace function public.basket_lot_substitution_family_save_admin_v1(
  p_family_key text,
  p_label text,
  p_enabled boolean,
  p_product_ids uuid[],
  p_operator text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_key text;
  v_label text:=trim(coalesce(p_label,''));
  v_sort integer;
  v_operator text:=coalesce(nullif(trim(coalesce(p_operator,'')),''),'Operação');
  v_ids uuid[]:=coalesce(p_product_ids,array[]::uuid[]);
begin
  if not public.basket_lot_admin_allowed_v1() then raise exception 'admin_forbidden'; end if;
  if length(v_label)<2 or length(v_label)>80 then raise exception 'invalid_family_label'; end if;

  v_key:=lower(trim(coalesce(p_family_key,'')));
  if v_key='' then
    v_key:=trim(both '_' from regexp_replace(public.basket_auto_norm_text_v1(v_label),'[^a-z0-9]+','_','g'));
  end if;
  if v_key='' or v_key!~'^[a-z0-9_]{2,60}$' then raise exception 'invalid_family_key'; end if;

  select sort_order into v_sort from public.basket_lot_substitution_rules where family_key=v_key;
  if v_sort is null then select coalesce(max(sort_order),0)+10 into v_sort from public.basket_lot_substitution_rules; end if;

  insert into public.basket_lot_substitution_rules(family_key,label,enabled,sort_order,metadata,updated_at)
  values(v_key,v_label,coalesce(p_enabled,false),v_sort,jsonb_build_object('edited_by',v_operator,'catalog_v3',true),now())
  on conflict(family_key) do update set
    label=excluded.label,enabled=excluded.enabled,
    metadata=coalesce(public.basket_lot_substitution_rules.metadata,'{}'::jsonb)||excluded.metadata,
    updated_at=now();

  if exists(select 1 from unnest(v_ids) x(id) left join public.products p on p.id=x.id where p.id is null) then
    raise exception 'product_not_found';
  end if;

  delete from public.basket_lot_substitution_products m
  where m.family_key=v_key and not(m.product_id=any(v_ids));

  insert into public.basket_lot_substitution_products(product_id,family_key,updated_by,metadata,updated_at)
  select distinct x.id,v_key,v_operator,jsonb_build_object('source','admin','catalog_v3',true),now()
  from unnest(v_ids) x(id)
  join public.products p on p.id=x.id
  on conflict(product_id) do update set
    family_key=excluded.family_key,updated_by=excluded.updated_by,
    metadata=coalesce(public.basket_lot_substitution_products.metadata,'{}'::jsonb)||excluded.metadata,
    updated_at=now();

  return jsonb_build_object(
    'ok',true,'family_key',v_key,'label',v_label,'enabled',coalesce(p_enabled,false),
    'product_count',(select count(*) from public.basket_lot_substitution_products where family_key=v_key)
  );
end;
$$;

create or replace function public.generate_basket_lot_suggestions_v1(
  p_run_date date default null,p_actor text default 'automation',p_replace_pending boolean default false
) returns jsonb language plpgsql set search_path to '' as $$
declare
  cfg public.basket_lot_automation_settings%rowtype;v_date date;v_run_id uuid;v_basket record;v_item record;v_req record;
  v_family text;v_required numeric;v_available numeric;v_candidate_id uuid;v_candidate_name text;v_candidate_price numeric;v_candidate_available numeric;
  v_component_sum numeric;v_issues jsonb;v_buildable boolean;v_suggestion_id uuid;v_existing_status text;v_generated integer:=0;v_attention integer:=0;v_skipped integer:=0;v_existing_count integer:=0;
begin
  select * into cfg from public.basket_lot_automation_settings where id=1;if not found then raise exception 'basket_automation_settings_missing';end if;
  v_date:=coalesce(p_run_date,(clock_timestamp() at time zone cfg.timezone)::date);
  select count(*) into v_existing_count from public.basket_lot_suggestions where suggestion_date=v_date and source='automation';
  if v_existing_count>0 and not p_replace_pending then return jsonb_build_object('ok',true,'idempotent',true,'run_date',v_date,'generated_count',v_existing_count,'attention_count',(select count(*) from public.basket_lot_suggestions where suggestion_date=v_date and source='automation' and buildability_status='attention'));end if;
  insert into public.basket_lot_automation_runs(run_date,status,source,started_at,finished_at,generated_count,attention_count,metadata)
  values(v_date,'running',coalesce(nullif(trim(p_actor),''),'automation'),now(),null,0,0,jsonb_build_object('replace_pending',p_replace_pending,'catalog_version',3))
  on conflict(run_date) do update set status='running',source=excluded.source,started_at=now(),finished_at=null,generated_count=0,attention_count=0,metadata=excluded.metadata returning id into v_run_id;
  for v_basket in select b.id,b.name,b.base_price,b.sort_order,b.hidden_adjustment from public.basket_templates b where b.is_active=true order by b.sort_order,b.name loop
    select s.status into v_existing_status from public.basket_lot_suggestions s where s.basket_id=v_basket.id and s.suggestion_date=v_date and s.source='automation' limit 1;
    if v_existing_status is not null and v_existing_status<>'pending' then v_skipped:=v_skipped+1;continue;end if;
    if v_existing_status='pending' then select id into v_suggestion_id from public.basket_lot_suggestions where basket_id=v_basket.id and suggestion_date=v_date and source='automation';delete from public.basket_lot_suggestion_items where suggestion_id=v_suggestion_id;
    else insert into public.basket_lot_suggestions(basket_id,suggestion_date,status,buildability_status,quantity_planned,sale_price,component_sum,hidden_adjustment,price_variation_pct_snapshot,generation_run_id,source,issues,metadata)
      values(v_basket.id,v_date,'pending','ready',cfg.lot_quantity,coalesce(v_basket.base_price,0),0,0,cfg.price_variation_pct,v_run_id,'automation','[]'::jsonb,jsonb_build_object('basket_name',v_basket.name,'generated_by',coalesce(p_actor,'automation'),'catalog_version',3)) returning id into v_suggestion_id;end if;
    v_component_sum:=0;v_issues:='[]'::jsonb;v_buildable:=true;
    for v_item in select bi.id template_item_id,bi.product_id,bi.quantity,bi.sort_order,p.name product_name,p.price product_price,p.subcategory,p.packaging,coalesce(s.loose_sellable_stock,0) loose_stock from public.basket_template_items bi join public.products p on p.id=bi.product_id left join public.ops2_loose_sellable_stock_v1 s on s.product_id=p.id where bi.basket_id=v_basket.id order by bi.sort_order,bi.id loop
      v_required:=coalesce(v_item.quantity,0)*cfg.lot_quantity;v_available:=coalesce(v_item.loose_stock,0);v_family:=public.basket_substitution_family_for_product_v2(v_item.product_id);v_candidate_id:=null;v_candidate_name:=null;v_candidate_price:=null;v_candidate_available:=null;
      if v_available<v_required and v_family is not null and exists(select 1 from public.basket_lot_substitution_rules r where r.family_key=v_family and r.enabled=true) then
        select p.id,p.name,p.price,coalesce(s.loose_sellable_stock,0) into v_candidate_id,v_candidate_name,v_candidate_price,v_candidate_available
        from public.basket_lot_substitution_products m
        join public.products p on p.id=m.product_id
        left join public.ops2_loose_sellable_stock_v1 s on s.product_id=p.id
        where m.family_key=v_family and p.is_active=true and p.id<>v_item.product_id
          and public.basket_package_compatible_v1(v_item.packaging,v_item.product_name,p.packaging,p.name)
          and coalesce(s.loose_sellable_stock,0)>=v_required and coalesce(v_item.product_price,0)>0
          and abs((coalesce(p.price,0)-v_item.product_price)/v_item.product_price*100)<=cfg.price_variation_pct
        order by abs((coalesce(p.price,0)-v_item.product_price)/nullif(v_item.product_price,0)),coalesce(s.loose_sellable_stock,0) desc,p.name limit 1;
      end if;
      if v_available>=v_required then
        insert into public.basket_lot_suggestion_items(suggestion_id,template_item_id,original_product_id,suggested_product_id,quantity_per_basket,position_order,original_unit_price,suggested_unit_price,price_delta_pct,is_substituted,substitution_family,substitution_reason,loose_stock_snapshot,stock_ok_snapshot,metadata)
        values(v_suggestion_id,v_item.template_item_id,v_item.product_id,v_item.product_id,v_item.quantity,v_item.sort_order,v_item.product_price,v_item.product_price,0,false,v_family,null,v_available,true,jsonb_build_object('original_name',v_item.product_name,'suggested_name',v_item.product_name,'catalog_version',3));v_component_sum:=v_component_sum+coalesce(v_item.product_price,0)*v_item.quantity;
      elsif v_candidate_id is not null then
        insert into public.basket_lot_suggestion_items(suggestion_id,template_item_id,original_product_id,suggested_product_id,quantity_per_basket,position_order,original_unit_price,suggested_unit_price,price_delta_pct,is_substituted,substitution_family,substitution_reason,loose_stock_snapshot,stock_ok_snapshot,metadata)
        values(v_suggestion_id,v_item.template_item_id,v_item.product_id,v_candidate_id,v_item.quantity,v_item.sort_order,v_item.product_price,v_candidate_price,round(((v_candidate_price-v_item.product_price)/nullif(v_item.product_price,0)*100)::numeric,3),true,v_family,'Substituição automática autorizada pelo catálogo explícito.',v_candidate_available,true,jsonb_build_object('original_name',v_item.product_name,'suggested_name',v_candidate_name,'original_available',v_available,'required',v_required,'catalog_version',3));v_component_sum:=v_component_sum+coalesce(v_candidate_price,0)*v_item.quantity;
      else
        insert into public.basket_lot_suggestion_items(suggestion_id,template_item_id,original_product_id,suggested_product_id,quantity_per_basket,position_order,original_unit_price,suggested_unit_price,price_delta_pct,is_substituted,substitution_family,substitution_reason,loose_stock_snapshot,stock_ok_snapshot,metadata)
        values(v_suggestion_id,v_item.template_item_id,v_item.product_id,v_item.product_id,v_item.quantity,v_item.sort_order,v_item.product_price,v_item.product_price,0,false,v_family,null,v_available,false,jsonb_build_object('original_name',v_item.product_name,'suggested_name',v_item.product_name,'required',v_required,'catalog_version',3));v_component_sum:=v_component_sum+coalesce(v_item.product_price,0)*v_item.quantity;v_buildable:=false;v_issues:=v_issues||jsonb_build_array(jsonb_build_object('type','insufficient_stock','template_item_id',v_item.template_item_id,'product_id',v_item.product_id,'product_name',v_item.product_name,'available',v_available,'required',v_required,'family',v_family));
      end if;
    end loop;
    for v_req in select i.suggested_product_id,sum(i.quantity_per_basket*cfg.lot_quantity)::numeric required,max(coalesce(s.loose_sellable_stock,0))::numeric available,max(p.name) product_name from public.basket_lot_suggestion_items i join public.products p on p.id=i.suggested_product_id left join public.ops2_loose_sellable_stock_v1 s on s.product_id=i.suggested_product_id where i.suggestion_id=v_suggestion_id group by i.suggested_product_id having sum(i.quantity_per_basket*cfg.lot_quantity)>max(coalesce(s.loose_sellable_stock,0)) loop
      update public.basket_lot_suggestion_items set stock_ok_snapshot=false,updated_at=now() where suggestion_id=v_suggestion_id and suggested_product_id=v_req.suggested_product_id;v_buildable:=false;v_issues:=v_issues||jsonb_build_array(jsonb_build_object('type','cumulative_stock_shortage','product_id',v_req.suggested_product_id,'product_name',v_req.product_name,'available',v_req.available,'required',v_req.required));
    end loop;
    update public.basket_lot_suggestions set buildability_status=case when v_buildable then 'ready' else 'attention' end,quantity_planned=cfg.lot_quantity,sale_price=coalesce(v_basket.base_price,0),component_sum=round(v_component_sum,2),hidden_adjustment=round(coalesce(v_basket.base_price,0)-v_component_sum,2),price_variation_pct_snapshot=cfg.price_variation_pct,generation_run_id=v_run_id,issues=v_issues,updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('basket_name',v_basket.name,'generated_by',coalesce(p_actor,'automation'),'catalog_version',3) where id=v_suggestion_id;
    v_generated:=v_generated+1;if not v_buildable then v_attention:=v_attention+1;end if;
  end loop;
  update public.basket_lot_automation_runs set status='completed',generated_count=v_generated,attention_count=v_attention,finished_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('skipped_reviewed',v_skipped,'catalog_version',3) where id=v_run_id;
  return jsonb_build_object('ok',true,'idempotent',false,'run_date',v_date,'run_id',v_run_id,'generated_count',v_generated,'attention_count',v_attention,'skipped_reviewed',v_skipped,'catalog_version',3);
exception when others then if v_run_id is not null then update public.basket_lot_automation_runs set status='failed',finished_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('error',sqlerrm) where id=v_run_id;end if;raise;end;$$;

revoke all on function public.basket_substitution_family_for_product_v2(uuid),public.basket_lot_substitution_catalog_admin_v1(),public.basket_lot_substitution_family_save_admin_v1(text,text,boolean,uuid[],text) from public,anon;
revoke execute on function public.basket_substitution_family_for_product_v2(uuid) from authenticated;
grant execute on function public.basket_substitution_family_for_product_v2(uuid) to service_role;
grant execute on function public.basket_lot_substitution_catalog_admin_v1(),public.basket_lot_substitution_family_save_admin_v1(text,text,boolean,uuid[],text) to authenticated,service_role;
