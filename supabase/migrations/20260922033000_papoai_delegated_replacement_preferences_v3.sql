begin;

create table if not exists public.papoai_commerce_substitution_preferences (
  family_key text not null,
  subcategory text not null,
  utility_weight integer not null default 50 check(utility_weight between 0 and 100),
  enabled boolean not null default true,
  notes text,
  updated_at timestamptz not null default now(),
  primary key(family_key,subcategory)
);

alter table public.papoai_commerce_substitution_preferences enable row level security;
revoke all on table public.papoai_commerce_substitution_preferences from public,anon,authenticated;
grant all on table public.papoai_commerce_substitution_preferences to service_role;

insert into public.papoai_commerce_substitution_preferences(
  family_key,subcategory,utility_weight,enabled,notes
) values
  ('food','FEIJÃO',100,true,'Alimento básico de alta utilidade'),
  ('food','ÓLEO',95,true,'Alimento básico de alta utilidade'),
  ('food','MACARRÃO',90,true,'Alimento básico e versátil'),
  ('food','MOLHOS',82,true,'Complemento de refeição'),
  ('food','CAFÉ',80,true,'Item recorrente de cesta'),
  ('food','AÇÚCAR',72,true,'Item básico'),
  ('food','FARINHAS',70,true,'Item básico'),
  ('food','SAL',68,true,'Item básico'),
  ('food','ENLATADOS',60,true,'Complemento'),
  ('food','OVOS',85,true,'Alimento básico'),
  ('food','SUCO EM PÓ',45,true,'Bebida complementar'),
  ('food','DOCE',25,true,'Baixa prioridade em substituição de alimento básico'),
  ('food','CHOCOLATE',20,true,'Baixa prioridade em substituição de alimento básico')
on conflict(family_key,subcategory) do update set
  utility_weight=excluded.utility_weight,
  enabled=excluded.enabled,
  notes=excluded.notes,
  updated_at=now();

create or replace function public.preview_papoai_commerce_delegated_replacement_v3(
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
  v_source_category text;
  v_current_qty numeric;
  v_remove_qty numeric;
  v_unit_credit numeric;
  v_target numeric;
  v_family text;
  v_cart_id uuid;
  v_limit integer:=greatest(1,least(coalesce(p_limit,3),5));
  v_max_pct numeric:=greatest(0.03,least(coalesce(p_max_difference_pct,0.15),0.25));
  v_options jsonb;
begin
  v_credit_info:=public.get_papoai_commerce_removal_credit_v1(p_conversation_id,p_source_query);
  if not coalesce((v_credit_info->>'ok')::boolean,false) then return v_credit_info; end if;

  v_source_id:=(v_credit_info#>>'{source,product_id}')::uuid;
  v_source_category:=v_credit_info#>>'{source,category}';
  v_current_qty:=(v_credit_info#>>'{source,current_quantity}')::numeric;
  v_unit_credit:=(v_credit_info->>'unit_removal_credit')::numeric;
  v_family:=v_credit_info->>'family_key';

  v_remove_qty:=coalesce(p_remove_quantity,v_current_qty);
  if v_remove_qty<=0 or trunc(v_remove_qty)<>v_remove_qty or v_remove_qty>v_current_qty then
    return jsonb_build_object('ok',false,'reason','invalid_remove_quantity','current_quantity',v_current_qty);
  end if;

  v_target:=round(v_remove_qty*v_unit_credit,2);

  select id into v_cart_id
  from public.carts
  where conversation_id=p_conversation_id and status='draft'
  order by updated_at desc limit 1;
  if v_cart_id is null then return jsonb_build_object('ok',false,'reason','cart_not_found'); end if;

  with existing_actions as (
    select
      p.id product_id,p.name,p.category,p.subcategory,
      coalesce(p.image_url,p.image_ai_url,p.image_source_url) image_url,
      'increase_existing'::text action_type,
      coalesce(bi.add_unit_delta,ci.unit_price) unit_cost,
      greatest(0,least(
        3,
        floor(greatest(0,coalesce(p.stock,0)-ci.quantity)),
        floor(greatest(0,coalesce(bi.max_quantity,ci.quantity+3)-ci.quantity))
      ))::integer max_units,
      1::integer existing_priority,
      case when p.category=v_source_category then 1 else 0 end same_category,
      100::integer template_occurrences,
      coalesce(pref.utility_weight,50)::integer utility_weight
    from public.cart_items ci
    join public.products p on p.id=ci.product_id
    join public.basket_template_items bi on bi.id=nullif(ci.metadata->>'basket_template_item_id','')::uuid
    join public.papoai_commerce_category_families f
      on f.category=p.category and f.family_key=v_family and f.substitution_enabled=true
    left join public.papoai_commerce_substitution_preferences pref
      on pref.family_key=v_family and pref.subcategory=p.subcategory and pref.enabled=true
    where ci.cart_id=v_cart_id
      and ci.source='basket'
      and ci.quantity>0
      and ci.product_id<>v_source_id
      and bi.quantity_editable=true
      and coalesce(bi.add_unit_delta,ci.unit_price,0)>0
      and coalesce(p.stock,0)>ci.quantity
  ),
  existing_ids as (
    select product_id from public.cart_items where cart_id=v_cart_id and quantity>0
  ),
  popularity as (
    select bi.product_id,count(*)::integer template_occurrences
    from public.basket_template_items bi
    join public.basket_templates b on b.id=bi.basket_id
    where b.is_active=true and b.is_whatsapp_active=true
    group by bi.product_id
  ),
  new_actions as (
    select
      p.id product_id,p.name,p.category,p.subcategory,
      coalesce(p.image_url,p.image_ai_url,p.image_source_url) image_url,
      'add_product'::text action_type,
      case when p.is_offer and coalesce(p.offer_price,0)>0 and p.offer_price<=p.price then p.offer_price else p.price end unit_cost,
      least(3,floor(p.stock))::integer max_units,
      0::integer existing_priority,
      case when p.category=v_source_category then 1 else 0 end same_category,
      coalesce(pop.template_occurrences,0) template_occurrences,
      coalesce(pref.utility_weight,50)::integer utility_weight
    from public.products p
    join public.papoai_commerce_category_families f
      on f.category=p.category and f.family_key=v_family and f.substitution_enabled=true
    left join popularity pop on pop.product_id=p.id
    left join public.papoai_commerce_substitution_preferences pref
      on pref.family_key=v_family and pref.subcategory=p.subcategory and pref.enabled=true
    where p.id<>v_source_id
      and p.physically_verified=true
      and p.is_active=true
      and p.is_whatsapp_active=true
      and coalesce(p.stock,0)>0
      and coalesce(p.price,0)>0
      and not exists(select 1 from existing_ids e where e.product_id=p.id)
  ),
  all_actions as (
    select * from existing_actions where max_units>0
    union all
    select * from new_actions where max_units>0
  ),
  ranked_actions as (
    select *
    from all_actions
    where unit_cost<=v_target*(1+v_max_pct)
    order by
      same_category desc,
      utility_weight desc,
      existing_priority desc,
      template_occurrences desc,
      abs(unit_cost-v_target),
      name
    limit 28
  ),
  expanded as (
    select a.*,q.qty,round(a.unit_cost*q.qty,2) line_total
    from ranked_actions a
    cross join lateral (values(1),(2),(3)) q(qty)
    where q.qty<=a.max_units
  ),
  single_options as (
    select
      jsonb_build_array(jsonb_build_object(
        'action',action_type,'product_id',product_id,'name',name,'category',category,
        'subcategory',subcategory,'quantity',qty,'unit_price',unit_cost,
        'line_total',line_total,'image_url',image_url,'utility_weight',utility_weight
      )) items,
      line_total option_total,
      same_category same_category_count,
      existing_priority existing_action_count,
      utility_weight utility_score,
      template_occurrences popularity_score,
      1::integer distinct_products,
      qty::integer total_units
    from expanded
  ),
  pair_options as (
    select
      jsonb_build_array(
        jsonb_build_object(
          'action',a.action_type,'product_id',a.product_id,'name',a.name,'category',a.category,
          'subcategory',a.subcategory,'quantity',a.qty,'unit_price',a.unit_cost,
          'line_total',a.line_total,'image_url',a.image_url,'utility_weight',a.utility_weight
        ),
        jsonb_build_object(
          'action',b.action_type,'product_id',b.product_id,'name',b.name,'category',b.category,
          'subcategory',b.subcategory,'quantity',b.qty,'unit_price',b.unit_cost,
          'line_total',b.line_total,'image_url',b.image_url,'utility_weight',b.utility_weight
        )
      ) items,
      round(a.line_total+b.line_total,2) option_total,
      (a.same_category+b.same_category)::integer same_category_count,
      (a.existing_priority+b.existing_priority)::integer existing_action_count,
      (a.utility_weight+b.utility_weight)::integer utility_score,
      (a.template_occurrences+b.template_occurrences)::integer popularity_score,
      2::integer distinct_products,
      (a.qty+b.qty)::integer total_units
    from expanded a
    join expanded b on b.product_id>a.product_id
  ),
  options as (
    select * from single_options
    union all
    select * from pair_options
  ),
  scored as (
    select *,
      abs(option_total-v_target) difference_value,
      case when v_target>0 then abs(option_total-v_target)/v_target else 999 end difference_pct
    from options
    where option_total between v_target*(1-v_max_pct) and v_target*(1+v_max_pct)
  ),
  best as (
    select *
    from scored
    order by
      case when difference_pct<=0.05 then 0 else 1 end,
      same_category_count desc,
      utility_score desc,
      existing_action_count desc,
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
    'utility_score',utility_score,
    'same_category_count',same_category_count,
    'existing_action_count',existing_action_count,
    'distinct_products',distinct_products,
    'total_units',total_units,
    'requires_confirmation',true
  ) order by
    case when difference_pct<=0.05 then 0 else 1 end,
    same_category_count desc,
    utility_score desc,
    existing_action_count desc,
    difference_pct asc
  ),'[]'::jsonb)
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
    'ranking_policy','utility_weight_then_value',
    'requires_confirmation',true,
    'writes_performed',false,
    'calculation_authority','supabase'
  );
end;
$$;

revoke all on function public.preview_papoai_commerce_delegated_replacement_v3(uuid,text,numeric,numeric,integer) from public,anon,authenticated;
grant execute on function public.preview_papoai_commerce_delegated_replacement_v3(uuid,text,numeric,numeric,integer) to service_role;

commit;
