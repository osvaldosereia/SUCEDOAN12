begin;

create table if not exists public.papoai_commerce_category_families (
  category text primary key,
  family_key text not null,
  family_label text not null,
  substitution_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.papoai_commerce_category_families enable row level security;
revoke all on table public.papoai_commerce_category_families from public,anon,authenticated;
grant all on table public.papoai_commerce_category_families to service_role;

insert into public.papoai_commerce_category_families(category,family_key,family_label,substitution_enabled)
values
  ('MERCEARIA BÁSICA','food','Alimentos',true),
  ('MACARRÃO E MOLHOS','food','Alimentos',true),
  ('MOLHOS E CONDIMENTOS','food','Alimentos',true),
  ('CAFÉ DA MANHÃ','food','Alimentos',true),
  ('CONFEITARIA','food','Alimentos',true),
  ('BOLACHAS E BISCOITOS','food','Alimentos',true),
  ('TEMPEROS','food','Alimentos',true),
  ('SUCOS, REFRI E ENERGÉTICOS','food','Alimentos',true),
  ('LAVANDERIA','cleaning','Limpeza e lavanderia',true),
  ('LIMPEZA','cleaning','Limpeza e lavanderia',true),
  ('HIGIENE','personal_care','Higiene e cuidados pessoais',true),
  ('SABONETE','personal_care','Higiene e cuidados pessoais',true)
on conflict(category) do update set
  family_key=excluded.family_key,
  family_label=excluded.family_label,
  substitution_enabled=excluded.substitution_enabled,
  updated_at=now();

create or replace function public.get_papoai_commerce_removal_credit_v1(
  p_conversation_id uuid,
  p_product_query text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_match jsonb;
  v_cart_id uuid;
  v_item public.cart_items%rowtype;
  v_template public.basket_template_items%rowtype;
  v_product public.products%rowtype;
  v_unit_credit numeric;
  v_family text;
  v_family_label text;
begin
  v_match:=public.resolve_papoai_commerce_cart_item_v1(p_conversation_id,p_product_query);
  if not coalesce((v_match->>'found')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'needs_clarification',true,
      'reason',coalesce(v_match->>'reason','source_not_found'),
      'candidates',coalesce(v_match->'candidates','[]'::jsonb)
    );
  end if;

  select id into v_cart_id
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1;
  if v_cart_id is null then return jsonb_build_object('ok',false,'reason','cart_not_found'); end if;

  select * into v_item
  from public.cart_items
  where cart_id=v_cart_id
    and product_id=(v_match->>'product_id')::uuid
    and source='basket'
    and quantity>0
  limit 1;
  if not found then
    return jsonb_build_object('ok',false,'reason','source_not_basket_item');
  end if;

  select * into v_template
  from public.basket_template_items
  where id=nullif(v_item.metadata->>'basket_template_item_id','')::uuid;
  if not found then
    return jsonb_build_object('ok',false,'reason','basket_template_item_not_found');
  end if;

  if not v_template.removable then
    return jsonb_build_object('ok',false,'reason','item_not_removable');
  end if;

  select * into v_product from public.products where id=v_item.product_id;
  if not found then return jsonb_build_object('ok',false,'reason','source_product_missing'); end if;

  v_unit_credit:=abs(case
    when v_template.remove_unit_delta is null then -coalesce(v_item.unit_price,0)
    when v_template.remove_unit_delta>0 then -v_template.remove_unit_delta
    else v_template.remove_unit_delta
  end);

  if v_unit_credit<=0 then
    return jsonb_build_object('ok',false,'reason','removal_credit_not_configured');
  end if;

  select family_key,family_label
    into v_family,v_family_label
  from public.papoai_commerce_category_families
  where category=v_product.category and substitution_enabled=true;

  if v_family is null then
    return jsonb_build_object(
      'ok',false,
      'reason','source_category_not_mapped',
      'source_category',v_product.category
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'source',jsonb_build_object(
      'product_id',v_product.id,
      'name',v_product.name,
      'category',v_product.category,
      'subcategory',v_product.subcategory,
      'current_quantity',v_item.quantity
    ),
    'family_key',v_family,
    'family_label',v_family_label,
    'unit_removal_credit',round(v_unit_credit,2),
    'full_removal_credit',round(v_unit_credit*v_item.quantity,2),
    'calculation_authority','supabase'
  );
end;
$$;

revoke all on function public.get_papoai_commerce_removal_credit_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_removal_credit_v1(uuid,text) to service_role;

create or replace function public.preview_papoai_commerce_delegated_replacement_v1(
  p_conversation_id uuid,
  p_source_query text,
  p_remove_quantity numeric default null,
  p_max_difference_pct numeric default 0.15,
  p_limit integer default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_credit_info jsonb;
  v_source_id uuid;
  v_current_qty numeric;
  v_remove_qty numeric;
  v_unit_credit numeric;
  v_target numeric;
  v_family text;
  v_limit integer:=greatest(1,least(coalesce(p_limit,3),5));
  v_max_pct numeric:=greatest(0.03,least(coalesce(p_max_difference_pct,0.15),0.25));
  v_options jsonb;
begin
  v_credit_info:=public.get_papoai_commerce_removal_credit_v1(p_conversation_id,p_source_query);
  if not coalesce((v_credit_info->>'ok')::boolean,false) then return v_credit_info; end if;

  v_source_id:=(v_credit_info#>>'{source,product_id}')::uuid;
  v_current_qty:=(v_credit_info#>>'{source,current_quantity}')::numeric;
  v_unit_credit:=(v_credit_info->>'unit_removal_credit')::numeric;
  v_family:=v_credit_info->>'family_key';

  v_remove_qty:=coalesce(p_remove_quantity,v_current_qty);
  if v_remove_qty<=0 or trunc(v_remove_qty)<>v_remove_qty or v_remove_qty>v_current_qty then
    return jsonb_build_object(
      'ok',false,'reason','invalid_remove_quantity',
      'current_quantity',v_current_qty
    );
  end if;

  v_target:=round(v_remove_qty*v_unit_credit,2);

  with existing as (
    select product_id
    from public.cart_items ci
    join public.carts c on c.id=ci.cart_id
    where c.conversation_id=p_conversation_id
      and c.status='draft'
      and ci.quantity>0
  ),
  popularity as (
    select bi.product_id,count(*)::integer template_occurrences
    from public.basket_template_items bi
    join public.basket_templates b on b.id=bi.basket_id
    where b.is_active=true and b.is_whatsapp_active=true
    group by bi.product_id
  ),
  pool as (
    select
      p.id,
      p.name,
      p.brand,
      p.category,
      p.subcategory,
      case
        when p.is_offer and coalesce(p.offer_price,0)>0 and p.offer_price<=p.price then p.offer_price
        else p.price
      end commercial_price,
      p.stock,
      coalesce(pop.template_occurrences,0) template_occurrences,
      coalesce(p.image_url,p.image_ai_url,p.image_source_url) image_url
    from public.products p
    join public.papoai_commerce_category_families f
      on f.category=p.category
     and f.family_key=v_family
     and f.substitution_enabled=true
    left join popularity pop on pop.product_id=p.id
    where p.id<>v_source_id
      and p.physically_verified=true
      and p.is_active=true
      and p.is_whatsapp_active=true
      and coalesce(p.stock,0)>0
      and coalesce(p.price,0)>0
      and not exists(select 1 from existing e where e.product_id=p.id)
  ),
  ranked_pool as (
    select *
    from pool
    where commercial_price<=v_target*(1+v_max_pct)
    order by
      template_occurrences desc,
      abs(commercial_price-v_target) asc,
      stock desc,
      name
    limit 24
  ),
  single_options as (
    select
      'single'::text option_type,
      jsonb_build_array(jsonb_build_object(
        'product_id',p.id,
        'name',p.name,
        'quantity',q.qty,
        'unit_price',p.commercial_price,
        'line_total',round(p.commercial_price*q.qty,2),
        'image_url',p.image_url
      )) items,
      round(p.commercial_price*q.qty,2) option_total,
      1::integer distinct_products,
      q.qty::integer total_units,
      p.template_occurrences popularity_score
    from ranked_pool p
    cross join lateral (values (1),(2),(3)) q(qty)
    where q.qty<=least(3,floor(p.stock))
  ),
  pair_options as (
    select
      'pair'::text option_type,
      jsonb_build_array(
        jsonb_build_object(
          'product_id',a.id,'name',a.name,'quantity',qa.qty,
          'unit_price',a.commercial_price,
          'line_total',round(a.commercial_price*qa.qty,2),
          'image_url',a.image_url
        ),
        jsonb_build_object(
          'product_id',b.id,'name',b.name,'quantity',qb.qty,
          'unit_price',b.commercial_price,
          'line_total',round(b.commercial_price*qb.qty,2),
          'image_url',b.image_url
        )
      ) items,
      round(a.commercial_price*qa.qty+b.commercial_price*qb.qty,2) option_total,
      2::integer distinct_products,
      (qa.qty+qb.qty)::integer total_units,
      (a.template_occurrences+b.template_occurrences) popularity_score
    from ranked_pool a
    join ranked_pool b on b.id>a.id
    cross join lateral (values (1),(2)) qa(qty)
    cross join lateral (values (1),(2)) qb(qty)
    where qa.qty<=least(2,floor(a.stock))
      and qb.qty<=least(2,floor(b.stock))
  ),
  all_options as (
    select * from single_options
    union all
    select * from pair_options
  ),
  scored as (
    select *,
      abs(option_total-v_target) difference_value,
      case when v_target>0 then abs(option_total-v_target)/v_target else 999 end difference_pct
    from all_options
    where option_total between v_target*(1-v_max_pct) and v_target*(1+v_max_pct)
  ),
  dedup as (
    select *,
      row_number() over(
        partition by md5(items::text)
        order by difference_pct,distinct_products,total_units,popularity_score desc
      ) rn
    from scored
  ),
  best as (
    select *
    from dedup
    where rn=1
    order by
      difference_pct asc,
      distinct_products asc,
      total_units asc,
      popularity_score desc
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'items',items,
    'option_total',option_total,
    'target_value',v_target,
    'difference_value',round(option_total-v_target,2),
    'difference_pct',round((difference_pct*100)::numeric,1),
    'distinct_products',distinct_products,
    'total_units',total_units,
    'requires_confirmation',true
  ) order by difference_pct,distinct_products,total_units),'[]'::jsonb)
  into v_options
  from best;

  return jsonb_build_object(
    'ok',true,
    'source',v_credit_info->'source',
    'remove_quantity',v_remove_qty,
    'target_value',v_target,
    'family_key',v_family,
    'family_label',v_credit_info->>'family_label',
    'max_difference_pct',round(v_max_pct*100,1),
    'options',v_options,
    'option_count',jsonb_array_length(v_options),
    'requires_confirmation',true,
    'writes_performed',false,
    'calculation_authority','supabase'
  );
end;
$$;

revoke all on function public.preview_papoai_commerce_delegated_replacement_v1(uuid,text,numeric,numeric,integer) from public,anon,authenticated;
grant execute on function public.preview_papoai_commerce_delegated_replacement_v1(uuid,text,numeric,numeric,integer) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'delegated_replacement_version','v1',
  'delegated_replacement_max_difference_pct',15,
  'delegated_replacement_max_options',3,
  'delegated_replacement_max_distinct_products',2,
  'delegated_replacement_requires_confirmation',true
),
updated_at=now()
where id=1;

commit;
