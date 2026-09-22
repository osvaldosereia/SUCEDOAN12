begin;

create or replace function public.claim_product_knowledge_enrichment_jobs_v1(
  p_limit integer default null
)
returns setof public.product_knowledge_enrichment_jobs
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.product_knowledge_config%rowtype;
  v_limit integer;
  v_completed_today integer:=0;
  v_remaining integer:=0;
  v_day_start timestamptz;
begin
  select * into v_cfg from public.product_knowledge_config where id=1;

  if not coalesce(v_cfg.enabled,false)
     or not coalesce(v_cfg.web_research_enabled,false)
     or not coalesce(v_cfg.ai_enrichment_enabled,false)
  then
    return;
  end if;

  v_day_start:=(
    date_trunc('day',now() at time zone 'America/Cuiaba')
    at time zone 'America/Cuiaba'
  );

  select count(*)::integer into v_completed_today
  from public.product_knowledge_enrichment_jobs
  where status='completed'
    and completed_at>=v_day_start;

  v_remaining:=greatest(0,v_cfg.max_daily_products-v_completed_today);
  if v_remaining<=0 then return; end if;

  v_limit:=greatest(
    1,
    least(
      coalesce(p_limit,v_cfg.batch_size),
      v_cfg.batch_size,
      v_remaining,
      25
    )
  );

  if coalesce(v_cfg.only_sellable_products,true) then
    update public.product_knowledge_enrichment_jobs j
       set status='cancelled',
           error_message='product_no_longer_sellable',
           updated_at=now()
     where j.status='pending'
       and not exists(
         select 1
         from public.products p
         where p.id=j.product_id
           and p.is_active=true
           and p.is_whatsapp_active=true
           and p.physically_verified=true
           and coalesce(p.stock,0)>0
           and coalesce(p.price,0)>0
       );
  end if;

  return query
  with picked as (
    select j.id
    from public.product_knowledge_enrichment_jobs j
    join public.products p on p.id=j.product_id
    where j.status='pending'
      and j.next_attempt_at<=now()
      and j.attempts<j.max_attempts
      and (
        not coalesce(v_cfg.only_sellable_products,true)
        or (
          p.is_active=true
          and p.is_whatsapp_active=true
          and p.physically_verified=true
          and coalesce(p.stock,0)>0
          and coalesce(p.price,0)>0
        )
      )
    order by j.priority desc,j.next_attempt_at,j.created_at
    limit v_limit
    for update of j skip locked
  ),
  updated as (
    update public.product_knowledge_enrichment_jobs j
       set status='processing',
           attempts=j.attempts+1,
           claimed_at=now(),
           updated_at=now()
      from picked
     where j.id=picked.id
    returning j.*
  )
  select * from updated;
end;
$$;

create or replace function public.get_papoai_product_search_document_v1(p_product_id uuid)
returns text
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select concat_ws(' ',
    p.name,p.brand,p.category,p.subcategory,p.subsubcategory,p.packaging,
    p.customer_category,p.customer_subcategory,p.customer_subsubcategory,
    k.catalog_search_text,
    case when k.enrichment_status='researched'
      then array_to_string(coalesce(k.aliases,'{}'::text[]),' ') else '' end,
    case when k.enrichment_status='researched'
      then array_to_string(coalesce(k.use_cases,'{}'::text[]),' ') else '' end,
    case when k.enrichment_status='researched'
      then array_to_string(coalesce(k.audiences,'{}'::text[]),' ') else '' end,
    case when k.enrichment_status='researched'
      then array_to_string(coalesce(k.search_terms,'{}'::text[]),' ') else '' end
  )
  from public.products p
  left join public.product_sales_knowledge k on k.product_id=p.id
  where p.id=p_product_id;
$$;

revoke all on function public.claim_product_knowledge_enrichment_jobs_v1(integer) from public,anon,authenticated;
grant execute on function public.claim_product_knowledge_enrichment_jobs_v1(integer) to service_role;

revoke all on function public.get_papoai_product_search_document_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_product_search_document_v1(uuid) to service_role;

update public.product_knowledge_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'daily_limit_enforced',true,
  'timezone','America/Cuiaba',
  'untrusted_enrichment_searchable',false
),
updated_at=now()
where id=1;

commit;
