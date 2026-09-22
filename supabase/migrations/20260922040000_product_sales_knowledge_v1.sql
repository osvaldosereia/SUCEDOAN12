begin;

create table if not exists public.product_sales_knowledge (
  product_id uuid primary key references public.products(id) on delete cascade,
  catalog_search_text text not null default '',
  aliases text[] not null default '{}'::text[],
  use_cases text[] not null default '{}'::text[],
  audiences text[] not null default '{}'::text[],
  search_terms text[] not null default '{}'::text[],
  attributes jsonb not null default '{}'::jsonb,
  cautions text[] not null default '{}'::text[],
  source_urls text[] not null default '{}'::text[],
  evidence jsonb not null default '{}'::jsonb,
  enrichment_status text not null default 'pending_research'
    check(enrichment_status in ('seeded','pending_research','researched','review_required','error')),
  confidence numeric(5,4),
  enrichment_model text,
  enrichment_cost_usd numeric(12,6) not null default 0,
  last_researched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_sales_knowledge enable row level security;
revoke all on table public.product_sales_knowledge from public,anon,authenticated;
grant all on table public.product_sales_knowledge to service_role;

create table if not exists public.product_semantic_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  category_scope text[] not null default '{}'::text[],
  match_terms text[] not null,
  expansion_terms text[] not null,
  priority integer not null default 100,
  enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_semantic_rules enable row level security;
revoke all on table public.product_semantic_rules from public,anon,authenticated;
grant all on table public.product_semantic_rules to service_role;

insert into public.product_semantic_rules(
  code,category_scope,match_terms,expansion_terms,priority,notes
) values
(
  'hair_curls',
  array['SHAMPOO E CONDICIONADOR','BELEZA'],
  array['cachos','cacheado','cacheados'],
  array['cabelo cacheado','cabelo crespo','cabelo ondulado','definicao de cachos','definir cachos'],
  10,
  'Vocabulário comercial para produtos explicitamente destinados a cachos.'
),
(
  'hair_hydration',
  array['SHAMPOO E CONDICIONADOR','BELEZA'],
  array['hidratacao','hidratante','hidrata'],
  array['cabelo seco','cabelo ressecado','ressecamento','hidratar cabelo','maciez'],
  20,
  'Expansão de intenção de hidratação capilar.'
),
(
  'hair_reconstruction',
  array['SHAMPOO E CONDICIONADOR','BELEZA'],
  array['reconstrucao','reconstrutor','reparacao','repair'],
  array['cabelo danificado','cabelo fraco','quebra dos fios','fortalecer cabelo','reparar danos'],
  20,
  'Expansão para reconstrução e reparação capilar.'
),
(
  'hair_frizz',
  array['SHAMPOO E CONDICIONADOR','BELEZA'],
  array['antiumidade','anti umidade','frizz'],
  array['controle de frizz','cabelo com frizz','protecao contra umidade','arrepiado'],
  20,
  'Expansão para controle de frizz/umidade.'
),
(
  'hair_detox',
  array['SHAMPOO E CONDICIONADOR','BELEZA'],
  array['detox'],
  array['limpeza profunda','oleosidade','cabelo oleoso','remover residuos','purificacao'],
  20,
  'Expansão para shampoos detox.'
),
(
  'hair_straight',
  array['SHAMPOO E CONDICIONADOR','BELEZA'],
  array['liso','lisos'],
  array['cabelo liso','cabelo alisado','efeito liso','reduzir volume'],
  30,
  'Expansão para produtos explicitamente destinados a cabelos lisos.'
)
on conflict(code) do update set
  category_scope=excluded.category_scope,
  match_terms=excluded.match_terms,
  expansion_terms=excluded.expansion_terms,
  priority=excluded.priority,
  notes=excluded.notes,
  updated_at=now();

create table if not exists public.product_knowledge_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  status text not null default 'pending'
    check(status in ('pending','processing','completed','error','cancelled')),
  priority integer not null default 50,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_knowledge_enrichment_one_open_job_idx
  on public.product_knowledge_enrichment_jobs(product_id)
  where status in ('pending','processing');

create index if not exists product_knowledge_enrichment_claim_idx
  on public.product_knowledge_enrichment_jobs(status,priority desc,next_attempt_at,created_at);

alter table public.product_knowledge_enrichment_jobs enable row level security;
revoke all on table public.product_knowledge_enrichment_jobs from public,anon,authenticated;
grant all on table public.product_knowledge_enrichment_jobs to service_role;

create table if not exists public.product_knowledge_config (
  id smallint primary key default 1 check(id=1),
  enabled boolean not null default false,
  web_research_enabled boolean not null default false,
  ai_enrichment_enabled boolean not null default false,
  only_sellable_products boolean not null default true,
  batch_size integer not null default 5 check(batch_size between 1 and 25),
  max_daily_products integer not null default 25 check(max_daily_products between 1 and 500),
  max_daily_cost_usd numeric(12,6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.product_knowledge_config(id)
values(1)
on conflict(id) do nothing;

alter table public.product_knowledge_config enable row level security;
revoke all on table public.product_knowledge_config from public,anon,authenticated;
grant all on table public.product_knowledge_config to service_role;

create or replace function public.refresh_product_sales_knowledge_v1(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_existing public.product_sales_knowledge%rowtype;
  v_base_norm text;
  v_expansions text;
  v_catalog_text text;
  v_status text;
begin
  select * into v_product from public.products where id=p_product_id;
  if not found then return jsonb_build_object('ok',false,'reason','product_not_found'); end if;

  select * into v_existing
  from public.product_sales_knowledge
  where product_id=p_product_id;

  v_base_norm:=translate(lower(concat_ws(' ',
    v_product.name,
    v_product.brand,
    v_product.category,
    v_product.subcategory,
    v_product.subsubcategory,
    v_product.packaging,
    v_product.customer_category,
    v_product.customer_subcategory,
    v_product.customer_subsubcategory,
    v_product.description_short,
    v_product.description_long,
    array_to_string(coalesce(v_product.tags,'{}'::text[]),' ')
  )),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');

  select coalesce(string_agg(array_to_string(r.expansion_terms,' '),' ' order by r.priority,r.code),'')
  into v_expansions
  from public.product_semantic_rules r
  where r.enabled=true
    and (
      cardinality(r.category_scope)=0
      or v_product.category=any(r.category_scope)
    )
    and exists(
      select 1
      from unnest(r.match_terms) mt
      where v_base_norm like '%'||
        translate(lower(mt),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')
        ||'%'
    );

  v_catalog_text:=concat_ws(' ',
    v_product.name,
    v_product.brand,
    v_product.category,
    v_product.subcategory,
    v_product.subsubcategory,
    v_product.packaging,
    v_product.customer_category,
    v_product.customer_subcategory,
    v_product.customer_subsubcategory,
    v_product.description_short,
    v_product.description_long,
    array_to_string(coalesce(v_product.tags,'{}'::text[]),' '),
    v_expansions
  );

  v_status:=case
    when nullif(trim(coalesce(v_product.description_short,'')),'') is not null
      or nullif(trim(coalesce(v_product.description_long,'')),'') is not null
      then coalesce(v_existing.enrichment_status,'seeded')
    else coalesce(v_existing.enrichment_status,'pending_research')
  end;

  insert into public.product_sales_knowledge(
    product_id,catalog_search_text,enrichment_status,confidence,updated_at
  ) values(
    p_product_id,
    v_catalog_text,
    v_status,
    case when v_status='pending_research' then 0.35 else 0.60 end,
    now()
  )
  on conflict(product_id) do update set
    catalog_search_text=excluded.catalog_search_text,
    enrichment_status=case
      when public.product_sales_knowledge.enrichment_status in ('researched','review_required')
        then public.product_sales_knowledge.enrichment_status
      else excluded.enrichment_status
    end,
    confidence=case
      when public.product_sales_knowledge.enrichment_status in ('researched','review_required')
        then public.product_sales_knowledge.confidence
      else excluded.confidence
    end,
    updated_at=now();

  return jsonb_build_object('ok',true,'product_id',p_product_id,'status',v_status);
end;
$$;

create or replace function public.refresh_all_sellable_product_sales_knowledge_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
  v_count integer:=0;
begin
  for v_id in
    select id
    from public.products
    where is_active=true
      and is_whatsapp_active=true
      and physically_verified=true
      and coalesce(stock,0)>0
      and coalesce(price,0)>0
  loop
    perform public.refresh_product_sales_knowledge_v1(v_id);
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('ok',true,'refreshed',v_count);
end;
$$;

create or replace function public.queue_active_product_knowledge_enrichment_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_inserted integer:=0;
begin
  insert into public.product_knowledge_enrichment_jobs(
    product_id,status,priority,metadata
  )
  select
    p.id,
    'pending',
    case
      when nullif(trim(coalesce(p.description_short,'')),'') is null
       and nullif(trim(coalesce(p.description_long,'')),'') is null then 100
      else 40
    end,
    jsonb_build_object(
      'reason',case
        when nullif(trim(coalesce(p.description_short,'')),'') is null
         and nullif(trim(coalesce(p.description_long,'')),'') is null
          then 'missing_description'
        else 'active_product_semantic_enrichment'
      end,
      'gtin',p.gtin,
      'sku',p.sku
    )
  from public.products p
  where p.is_active=true
    and p.is_whatsapp_active=true
    and p.physically_verified=true
    and coalesce(p.stock,0)>0
    and coalesce(p.price,0)>0
    and not exists(
      select 1
      from public.product_knowledge_enrichment_jobs j
      where j.product_id=p.id and j.status in ('pending','processing')
    );

  get diagnostics v_inserted=row_count;
  return jsonb_build_object('ok',true,'queued',v_inserted,'external_side_effect',false);
end;
$$;

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
begin
  select * into v_cfg from public.product_knowledge_config where id=1;

  if not coalesce(v_cfg.enabled,false)
     or not coalesce(v_cfg.web_research_enabled,false)
     or not coalesce(v_cfg.ai_enrichment_enabled,false)
  then
    return;
  end if;

  v_limit:=greatest(1,least(coalesce(p_limit,v_cfg.batch_size),25));

  return query
  with picked as (
    select id
    from public.product_knowledge_enrichment_jobs
    where status='pending'
      and next_attempt_at<=now()
      and attempts<max_attempts
    order by priority desc,next_attempt_at,created_at
    limit v_limit
    for update skip locked
  ),
  updated as (
    update public.product_knowledge_enrichment_jobs j
       set status='processing',
           attempts=attempts+1,
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
    array_to_string(coalesce(k.aliases,'{}'::text[]),' '),
    array_to_string(coalesce(k.use_cases,'{}'::text[]),' '),
    array_to_string(coalesce(k.audiences,'{}'::text[]),' '),
    array_to_string(coalesce(k.search_terms,'{}'::text[]),' ')
  )
  from public.products p
  left join public.product_sales_knowledge k on k.product_id=p.id
  where p.id=p_product_id;
$$;

create or replace function public.search_papoai_commerce_products_v1(
  p_query text,
  p_limit integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_limit integer;
  v_query_norm text;
  v_items jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.product_reads_enabled,false) then
    return jsonb_build_object('ok',false,'reason','product_reads_disabled','items','[]'::jsonb);
  end if;

  v_limit:=greatest(1,least(coalesce(p_limit,v_cfg.max_product_results,6),12));
  v_query_norm:=translate(lower(trim(coalesce(p_query,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');

  with tokens as (
    select distinct token
    from regexp_split_to_table(v_query_norm,E'\\s+') token
    where length(token)>=2
      and token not in ('de','da','do','das','dos','para','com','sem','um','uma','uns','umas','pra')
  ),
  token_stats as (
    select count(*)::integer total_tokens from tokens
  ),
  candidates as (
    select
      p.id,p.name,p.brand,p.category,p.subcategory,p.packaging,
      p.price,p.offer_price,p.is_offer,p.stock,
      coalesce(p.image_url,p.image_ai_url,p.image_source_url) image_url,
      coalesce(k.enrichment_status,'pending_research') knowledge_status,
      translate(lower(coalesce(public.get_papoai_product_search_document_v1(p.id),'')),
        'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') searchable,
      translate(lower(coalesce(p.name,'')),
        'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') name_norm,
      translate(lower(coalesce(p.brand,'')),
        'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') brand_norm,
      translate(lower(concat_ws(' ',p.name,p.brand,p.category,p.subcategory,p.packaging)),
        'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') core_norm
    from public.products p
    left join public.product_sales_knowledge k on k.product_id=p.id
    where p.physically_verified=true
      and p.is_active=true
      and p.is_whatsapp_active=true
      and coalesce(p.stock,0)>0
      and coalesce(p.price,0)>0
  ),
  scored as (
    select
      c.*,
      coalesce((
        select count(*)::integer
        from tokens t
        where c.searchable like '%'||t.token||'%'
      ),0) token_hits,
      coalesce((
        select count(*)::integer
        from tokens t
        where c.core_norm like '%'||t.token||'%'
      ),0) core_token_hits,
      (select total_tokens from token_stats) total_tokens,
      case
        when c.name_norm=v_query_norm then 5
        when c.name_norm like v_query_norm||'%' then 4
        when c.name_norm like '%'||v_query_norm||'%' then 3
        else 0
      end phrase_score,
      case
        when c.brand_norm<>'' and v_query_norm like '%'||c.brand_norm||'%' then 1
        else 0
      end brand_requested,
      greatest(
        extensions.word_similarity(v_query_norm,c.name_norm),
        extensions.word_similarity(v_query_norm,c.core_norm)
      ) similarity_score
    from candidates c
  ),
  ranked as (
    select *,
      (
        phrase_score*1200
        + case when total_tokens>0 and token_hits=total_tokens then 900 else 0 end
        + case when total_tokens>0 and core_token_hits=total_tokens then 500 else 0 end
        + brand_requested*450
        + token_hits*160
        + core_token_hits*60
        + round(similarity_score*100)
      )::numeric relevance_score,
      case
        when token_hits>core_token_hits then 'knowledge'
        when phrase_score>0 or core_token_hits>0 then 'catalog'
        else 'fuzzy'
      end match_mode
    from scored
    where token_hits>0
       or similarity_score>=0.55
    order by relevance_score desc,token_hits desc,core_token_hits desc,name
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',id,
    'name',name,
    'brand',brand,
    'category',category,
    'subcategory',subcategory,
    'packaging',packaging,
    'commercial_price',case
      when is_offer and coalesce(offer_price,0)>0 and offer_price<=price then offer_price
      else price
    end,
    'regular_price',price,
    'is_offer',coalesce(is_offer,false),
    'stock',stock,
    'image_url',image_url,
    'knowledge_status',knowledge_status,
    'match_mode',match_mode,
    'token_hits',token_hits,
    'core_token_hits',core_token_hits,
    'total_tokens',total_tokens,
    'relevance_score',relevance_score
  ) order by relevance_score desc,token_hits desc,core_token_hits desc,name),'[]'::jsonb)
  into v_items
  from ranked;

  return jsonb_build_object(
    'ok',true,
    'query',p_query,
    'count',jsonb_array_length(v_items),
    'items',v_items
  );
end;
$$;

create or replace function public.trg_refresh_product_sales_knowledge_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  perform public.refresh_product_sales_knowledge_v1(new.id);
  return new;
end;
$$;

drop trigger if exists trg_refresh_product_sales_knowledge_v1 on public.products;
create trigger trg_refresh_product_sales_knowledge_v1
after insert or update of
  name,brand,category,subcategory,subsubcategory,packaging,
  customer_category,customer_subcategory,customer_subsubcategory,
  description_short,description_long,tags,is_active,is_whatsapp_active,
  physically_verified,price,stock
on public.products
for each row
execute function public.trg_refresh_product_sales_knowledge_v1();

revoke all on function public.refresh_product_sales_knowledge_v1(uuid) from public,anon,authenticated;
grant execute on function public.refresh_product_sales_knowledge_v1(uuid) to service_role;
revoke all on function public.refresh_all_sellable_product_sales_knowledge_v1() from public,anon,authenticated;
grant execute on function public.refresh_all_sellable_product_sales_knowledge_v1() to service_role;
revoke all on function public.queue_active_product_knowledge_enrichment_v1() from public,anon,authenticated;
grant execute on function public.queue_active_product_knowledge_enrichment_v1() to service_role;
revoke all on function public.claim_product_knowledge_enrichment_jobs_v1(integer) from public,anon,authenticated;
grant execute on function public.claim_product_knowledge_enrichment_jobs_v1(integer) to service_role;
revoke all on function public.get_papoai_product_search_document_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_product_search_document_v1(uuid) to service_role;
revoke all on function public.search_papoai_commerce_products_v1(text,integer) from public,anon,authenticated;
grant execute on function public.search_papoai_commerce_products_v1(text,integer) to service_role;

select public.refresh_all_sellable_product_sales_knowledge_v1();
select public.queue_active_product_knowledge_enrichment_v1();

update public.product_knowledge_config
set enabled=false,
    web_research_enabled=false,
    ai_enrichment_enabled=false,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'scope','sellable_active_products_only',
      'initial_strategy','existing_catalog_first_then_research_missing_and_high_value',
      'external_calls_allowed',false
    ),
    updated_at=now()
where id=1;

commit;
