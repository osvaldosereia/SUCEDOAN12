begin;

create or replace function public.marketing_audience_candidates_v2(
  p_filters jsonb default '{}'::jsonb
)
returns table(
  customer_id uuid,
  name text,
  canonical_phone text,
  masked_phone text,
  consent_state text,
  is_active boolean,
  city text,
  neighborhood text,
  order_count integer,
  lifetime_value numeric,
  last_purchase_at timestamptz,
  phone_rank bigint,
  eligible boolean,
  exclusion_reason_list text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filters jsonb := coalesce(p_filters,'{}'::jsonb);
  v_unsupported text;
  v_search text;
  v_city text;
  v_neighborhood text;
  v_brand text;
  v_category text;
  v_last_purchase_before timestamptz;
  v_last_purchase_after timestamptz;
  v_inactive_days integer;
  v_min_order_count integer;
  v_max_order_count integer;
  v_min_lifetime_value numeric;
  v_max_lifetime_value numeric;
begin
  if jsonb_typeof(v_filters) is distinct from 'object' then
    raise exception using errcode='22023', message='invalid_filters';
  end if;

  select k into v_unsupported
  from jsonb_object_keys(v_filters) as k
  where k <> all(array[
    'customer_ids','search','city','neighborhood','label_ids','product_ids','brand','category',
    'last_purchase_before','last_purchase_after','inactive_days','min_order_count','max_order_count',
    'min_lifetime_value','max_lifetime_value'
  ]::text[])
  limit 1;
  if v_unsupported is not null then
    raise exception using errcode='22023', message='unsupported_filter:'||v_unsupported;
  end if;

  if v_filters ? 'customer_ids' and jsonb_typeof(v_filters->'customer_ids') <> 'array' then
    raise exception using errcode='22023', message='invalid_filter_value:customer_ids';
  end if;
  if v_filters ? 'label_ids' and jsonb_typeof(v_filters->'label_ids') <> 'array' then
    raise exception using errcode='22023', message='invalid_filter_value:label_ids';
  end if;
  if v_filters ? 'product_ids' and jsonb_typeof(v_filters->'product_ids') <> 'array' then
    raise exception using errcode='22023', message='invalid_filter_value:product_ids';
  end if;

  v_search := nullif(btrim(coalesce(v_filters->>'search','')),'');
  v_city := nullif(btrim(coalesce(v_filters->>'city','')),'');
  v_neighborhood := nullif(btrim(coalesce(v_filters->>'neighborhood','')),'');
  v_brand := nullif(btrim(coalesce(v_filters->>'brand','')),'');
  v_category := nullif(btrim(coalesce(v_filters->>'category','')),'');

  begin
    if nullif(v_filters->>'last_purchase_before','') is not null then
      v_last_purchase_before := (v_filters->>'last_purchase_before')::timestamptz;
    end if;
    if nullif(v_filters->>'last_purchase_after','') is not null then
      v_last_purchase_after := (v_filters->>'last_purchase_after')::timestamptz;
    end if;
    if nullif(v_filters->>'inactive_days','') is not null then
      v_inactive_days := (v_filters->>'inactive_days')::integer;
    end if;
    if nullif(v_filters->>'min_order_count','') is not null then
      v_min_order_count := (v_filters->>'min_order_count')::integer;
    end if;
    if nullif(v_filters->>'max_order_count','') is not null then
      v_max_order_count := (v_filters->>'max_order_count')::integer;
    end if;
    if nullif(v_filters->>'min_lifetime_value','') is not null then
      v_min_lifetime_value := (v_filters->>'min_lifetime_value')::numeric;
    end if;
    if nullif(v_filters->>'max_lifetime_value','') is not null then
      v_max_lifetime_value := (v_filters->>'max_lifetime_value')::numeric;
    end if;
  exception when others then
    raise exception using errcode='22023', message='invalid_filter_value';
  end;

  if coalesce(v_inactive_days,0) < 0
     or coalesce(v_min_order_count,0) < 0
     or coalesce(v_max_order_count,0) < 0
     or coalesce(v_min_lifetime_value,0) < 0
     or coalesce(v_max_lifetime_value,0) < 0 then
    raise exception using errcode='22023', message='invalid_filter_value';
  end if;

  return query
  with purchase_orders as (
    select o.id,o.customer_id,o.total,o.confirmed_at,o.delivered_at,o.created_at
    from public.orders o
    where o.customer_id is not null
      and o.cancelled_at is null
      and o.returned_at is null
      and (
        o.confirmed_at is not null
        or lower(coalesce(o.status,'')) in ('confirmed','processing','ready','delivered')
      )
  ),
  purchase_stats as (
    select po.customer_id,
           count(*)::integer as order_count,
           coalesce(sum(coalesce(po.total,0)),0)::numeric as lifetime_value,
           max(coalesce(po.delivered_at,po.confirmed_at,po.created_at)) as last_purchase_at
    from purchase_orders po
    group by po.customer_id
  ),
  base as (
    select c.id as customer_id,
           c.name,
           c.is_active,
           c.updated_at,
           c.marketing_consent_updated_at,
           public.canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164) as canonical_phone,
           coalesce(consent.consent_state,'never_consented') as consent_state,
           coalesce(ps.order_count,0) as order_count,
           coalesce(ps.lifetime_value,0)::numeric as lifetime_value,
           ps.last_purchase_at,
           addr.city,
           addr.neighborhood
    from public.customers c
    left join public.marketing_customer_consent_current_v1 consent on consent.customer_id=c.id
    left join purchase_stats ps on ps.customer_id=c.id
    left join lateral (
      select a.city,a.neighborhood
      from public.customer_addresses a
      where a.customer_id=c.id
        and coalesce(a.is_active,true) is true
      order by coalesce(a.is_default,false) desc,
               a.last_confirmed_at desc nulls last,
               a.updated_at desc nulls last,
               a.id
      limit 1
    ) addr on true
    where
      (
        not (v_filters ? 'customer_ids')
        or exists (
          select 1 from jsonb_array_elements_text(v_filters->'customer_ids') x(value)
          where x.value=c.id::text
        )
      )
      and (
        v_search is null
        or c.name ilike '%'||v_search||'%'
        or coalesce(c.primary_whatsapp_e164,'') ilike '%'||v_search||'%'
      )
      and (v_city is null or lower(coalesce(addr.city,''))=lower(v_city))
      and (v_neighborhood is null or lower(coalesce(addr.neighborhood,''))=lower(v_neighborhood))
      and (
        not (v_filters ? 'label_ids')
        or exists (
          select 1
          from public.conversations cv
          join public.attendance_conversation_labels_v1 cl on cl.conversation_id=cv.id
          join public.attendance_labels_v1 l on l.id=cl.label_id and coalesce(l.is_active,true) is true
          where cv.customer_id=c.id
            and exists (
              select 1 from jsonb_array_elements_text(v_filters->'label_ids') lx(value)
              where lx.value=l.id::text
            )
        )
      )
      and (
        not (v_filters ? 'product_ids') and v_brand is null and v_category is null
        or exists (
          select 1
          from purchase_orders po2
          join public.order_items oi on oi.order_id=po2.id
          join public.products p on p.id=oi.product_id
          where po2.customer_id=c.id
            and (
              not (v_filters ? 'product_ids')
              or exists (
                select 1 from jsonb_array_elements_text(v_filters->'product_ids') px(value)
                where px.value=p.id::text
              )
            )
            and (v_brand is null or lower(coalesce(p.brand,''))=lower(v_brand))
            and (
              v_category is null
              or lower(coalesce(nullif(p.customer_category,''),nullif(p.category,''),nullif(p.whatsapp_category,''),''))=lower(v_category)
            )
        )
      )
      and (v_last_purchase_before is null or ps.last_purchase_at < v_last_purchase_before)
      and (v_last_purchase_after is null or ps.last_purchase_at >= v_last_purchase_after)
      and (
        v_inactive_days is null
        or (ps.last_purchase_at is not null and ps.last_purchase_at <= now()-make_interval(days=>v_inactive_days))
      )
      and (v_min_order_count is null or coalesce(ps.order_count,0) >= v_min_order_count)
      and (v_max_order_count is null or coalesce(ps.order_count,0) <= v_max_order_count)
      and (v_min_lifetime_value is null or coalesce(ps.lifetime_value,0) >= v_min_lifetime_value)
      and (v_max_lifetime_value is null or coalesce(ps.lifetime_value,0) <= v_max_lifetime_value)
  ),
  ranked as (
    select b.*,
           row_number() over (
             partition by b.canonical_phone
             order by
               case when b.consent_state='opt_in' then 0 else 1 end,
               case when coalesce(b.is_active,false) then 0 else 1 end,
               b.marketing_consent_updated_at desc nulls last,
               b.updated_at desc nulls last,
               b.customer_id
           ) as phone_rank
    from base b
  ),
  evaluated as (
    select r.*,
           case
             when r.canonical_phone is null then null
             else left(r.canonical_phone,5)||'*****'||right(r.canonical_phone,4)
           end as masked_phone,
           array_remove(array[
             case
               when r.consent_state='opt_out' then 'opted_out'
               when r.consent_state<>'opt_in' then 'no_consent'
               else null
             end,
             case when coalesce(r.is_active,false) is not true then 'inactive_customer' else null end,
             case when r.canonical_phone is null then 'invalid_phone' else null end,
             case when r.canonical_phone is not null and r.phone_rank>1 then 'duplicate_phone' else null end
           ]::text[],null) as exclusion_reason_list
    from ranked r
  )
  select e.customer_id,
         e.name,
         e.canonical_phone,
         e.masked_phone,
         e.consent_state,
         e.is_active,
         e.city,
         e.neighborhood,
         e.order_count,
         e.lifetime_value,
         e.last_purchase_at,
         e.phone_rank,
         coalesce(cardinality(e.exclusion_reason_list),0)=0 as eligible,
         e.exclusion_reason_list
  from evaluated e;
end;
$$;

revoke all on function public.marketing_audience_candidates_v2(jsonb) from public, anon, authenticated;
grant execute on function public.marketing_audience_candidates_v2(jsonb) to service_role;

create or replace function public.marketing_preview_audience_v1(
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filters jsonb := coalesce(p_filters,'{}'::jsonb);
  v_unsupported text;
  v_limit integer := coalesce(p_limit,50);
  v_offset integer := coalesce(p_offset,0);
  v_result jsonb;
  v_dummy timestamptz;
  v_dummy_int integer;
  v_dummy_num numeric;
begin
  if jsonb_typeof(v_filters) is distinct from 'object' then
    return jsonb_build_object('ok',false,'error','invalid_filters');
  end if;

  select k into v_unsupported
  from jsonb_object_keys(v_filters) as k
  where k <> all(array[
    'customer_ids','search','city','neighborhood','label_ids','product_ids','brand','category',
    'last_purchase_before','last_purchase_after','inactive_days','min_order_count','max_order_count',
    'min_lifetime_value','max_lifetime_value'
  ]::text[])
  limit 1;
  if v_unsupported is not null then
    return jsonb_build_object('ok',false,'error','unsupported_filter','filter',v_unsupported);
  end if;

  if v_limit < 1 or v_limit > 100 or v_offset < 0 then
    return jsonb_build_object('ok',false,'error','invalid_pagination');
  end if;

  if v_filters ? 'customer_ids' and jsonb_typeof(v_filters->'customer_ids') <> 'array' then
    return jsonb_build_object('ok',false,'error','invalid_filter_value','filter','customer_ids');
  end if;
  if v_filters ? 'label_ids' and jsonb_typeof(v_filters->'label_ids') <> 'array' then
    return jsonb_build_object('ok',false,'error','invalid_filter_value','filter','label_ids');
  end if;
  if v_filters ? 'product_ids' and jsonb_typeof(v_filters->'product_ids') <> 'array' then
    return jsonb_build_object('ok',false,'error','invalid_filter_value','filter','product_ids');
  end if;

  begin
    if nullif(v_filters->>'last_purchase_before','') is not null then v_dummy := (v_filters->>'last_purchase_before')::timestamptz; end if;
    if nullif(v_filters->>'last_purchase_after','') is not null then v_dummy := (v_filters->>'last_purchase_after')::timestamptz; end if;
    if nullif(v_filters->>'inactive_days','') is not null then v_dummy_int := (v_filters->>'inactive_days')::integer; if v_dummy_int < 0 then raise exception 'invalid'; end if; end if;
    if nullif(v_filters->>'min_order_count','') is not null then v_dummy_int := (v_filters->>'min_order_count')::integer; if v_dummy_int < 0 then raise exception 'invalid'; end if; end if;
    if nullif(v_filters->>'max_order_count','') is not null then v_dummy_int := (v_filters->>'max_order_count')::integer; if v_dummy_int < 0 then raise exception 'invalid'; end if; end if;
    if nullif(v_filters->>'min_lifetime_value','') is not null then v_dummy_num := (v_filters->>'min_lifetime_value')::numeric; if v_dummy_num < 0 then raise exception 'invalid'; end if; end if;
    if nullif(v_filters->>'max_lifetime_value','') is not null then v_dummy_num := (v_filters->>'max_lifetime_value')::numeric; if v_dummy_num < 0 then raise exception 'invalid'; end if; end if;
  exception when others then
    return jsonb_build_object('ok',false,'error','invalid_filter_value');
  end;

  with candidates as (
    select * from public.marketing_audience_candidates_v2(v_filters)
  ),
  counts as (
    select count(*)::integer as found_count,
           count(*) filter (where c.eligible)::integer as eligible_count,
           count(*) filter (where not c.eligible)::integer as excluded_count
    from candidates c
  ),
  reason_counts as (
    select coalesce(jsonb_object_agg(reason,cnt),'{}'::jsonb) as exclusion_reasons
    from (
      select reason,count(*)::integer as cnt
      from candidates c
      cross join lateral unnest(c.exclusion_reason_list) reason
      group by reason
      order by reason
    ) x
  ),
  paged as (
    select c.*
    from candidates c
    order by c.eligible desc,lower(coalesce(c.name,'')),c.customer_id
    limit v_limit offset v_offset
  ),
  items_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'customer_id',p.customer_id,
      'name',p.name,
      'masked_phone',p.masked_phone,
      'consent_state',p.consent_state,
      'eligible',p.eligible,
      'exclusion_reasons',to_jsonb(p.exclusion_reason_list),
      'city',p.city,
      'neighborhood',p.neighborhood,
      'last_purchase_at',p.last_purchase_at,
      'order_count',p.order_count,
      'lifetime_value',p.lifetime_value
    ) order by p.eligible desc,lower(coalesce(p.name,'')),p.customer_id),'[]'::jsonb) as items
    from paged p
  )
  select jsonb_build_object(
    'ok',true,
    'found_count',c.found_count,
    'eligible_count',c.eligible_count,
    'excluded_count',c.excluded_count,
    'exclusion_reasons',r.exclusion_reasons,
    'limit',v_limit,
    'offset',v_offset,
    'items',i.items
  ) into v_result
  from counts c cross join reason_counts r cross join items_json i;

  return coalesce(v_result,jsonb_build_object(
    'ok',true,'found_count',0,'eligible_count',0,'excluded_count',0,
    'exclusion_reasons','{}'::jsonb,'limit',v_limit,'offset',v_offset,'items','[]'::jsonb
  ));
end;
$$;

revoke all on function public.marketing_preview_audience_v1(jsonb,integer,integer) from public, anon, authenticated;
grant execute on function public.marketing_preview_audience_v1(jsonb,integer,integer) to service_role;

commit;
