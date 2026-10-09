-- V2: validação GS1 e relatório conservador de famílias candidatas.
-- Não altera products, stock, orders, fiscal profiles nem chama Cosmos.
create or replace function public.cosmos_gtin_valid(p_gtin text)
returns boolean
language plpgsql immutable strict security invoker
set search_path = pg_catalog
as $$
declare
 n integer;
 pos integer;
 sum_digits integer := 0;
 weight integer;
begin
 n:=length(p_gtin);
 if n not in (8,12,13,14) or p_gtin !~ '^[0-9]+$' then
   return false;
 end if;
 for pos in 1..(n-1) loop
   weight:=case when mod(n-pos,2)=1 then 3 else 1 end;
   sum_digits:=sum_digits+substring(p_gtin from pos for 1)::int*weight;
 end loop;
 return mod(10-mod(sum_digits,10),10)=right(p_gtin,1)::int;
end $$;
revoke all on function public.cosmos_gtin_valid(text) from public,anon,authenticated;
grant execute on function public.cosmos_gtin_valid(text) to service_role;

create or replace view public.cosmos_product_identity_audit_v2
with (security_invoker=true)
as
with base as (
 select p.id as product_id, p.name,p.brand,p.gtin,p.ncm,p.packaging,
        p.category,p.subcategory,p.customer_subsubcategory,
        p.is_active,r.status as research_status,
        case
          when p.name ~* '(detergente|lava.lou[cç])'
            and (p.subcategory ilike '%detergente%'
                 or p.customer_subsubcategory ilike '%detergente%')
               then 'detergente_loucas'
          when p.name ~* 'amaciante' and p.name ~* 'concentrado'
               then 'amaciante_concentrado'
          when p.name ~* 'amaciante' then 'amaciante_comum'
          when p.name ~* 'creme para pentear' then 'creme_para_pentear'
          else null end as proposed_family_type,
        regexp_match(lower(p.name),
          '([0-9]+(?:[.,][0-9]+)?)\s*(ml|l|kg|g)(?:$|\s)') as content_match
 from public.products p
 left join public.cosmos_product_research r on r.product_id=p.id
), typed as (
 select b.*,
 case when b.content_match is null then null
      when b.content_match[2] in ('l','ml') then
       trim(trailing '.' from trim(trailing '0' from
          (replace(b.content_match[1],',','.')::numeric *
            case when b.content_match[2]='l' then 1000 else 1 end)::text)) || 'ml'
      when b.content_match[2] in ('kg','g') then
       trim(trailing '.' from trim(trailing '0' from
          (replace(b.content_match[1],',','.')::numeric *
            case when b.content_match[2]='kg' then 1000 else 1 end)::text)) || 'g'
      else null end as normalized_content
 from base b
)
select t.*,
 public.cosmos_gtin_valid(trim(t.gtin)) as gtin_checksum_valid,
 case when t.brand is not null and trim(t.brand)<>'' and t.proposed_family_type is not null
             and t.normalized_content is not null
    then lower(trim(t.brand))||'|'||t.proposed_family_type||'|'||t.normalized_content
    else null end as proposed_family_key,
 case when t.proposed_family_type is null then 'type_needs_research'
      when nullif(trim(t.brand),'') is null then 'brand_needs_research'
      when t.normalized_content is null then 'content_needs_research'
      else 'candidate_only_not_verified' end as classification_status
from typed t;
revoke all on public.cosmos_product_identity_audit_v2 from public,anon,authenticated;
grant select on public.cosmos_product_identity_audit_v2 to service_role;

create or replace view public.cosmos_family_candidate_review_v2
with (security_invoker=true)
as
select proposed_family_key, proposed_family_type, normalized_content,
 min(brand) as example_brand,
 count(*)::int as product_count,
 count(*) filter(where not gtin_checksum_valid)::int as invalid_gtin_count,
 count(distinct nullif(trim(ncm),''))::int as distinct_ncm_count,
 array_agg(name order by name) as product_names,
 array_agg(gtin order by name) as gtins,
 case when count(distinct nullif(trim(ncm),''))>1 then 'fiscal_disagreement_review'
      else 'line_and_packaging_verification_required' end as review_reason
from public.cosmos_product_identity_audit_v2
where is_active and proposed_family_key is not null
group by proposed_family_key,proposed_family_type,normalized_content
having count(*)>=2;
revoke all on public.cosmos_family_candidate_review_v2 from public,anon,authenticated;
grant select on public.cosmos_family_candidate_review_v2 to service_role;

create or replace view public.cosmos_catalog_progress_v2
with (security_invoker=true)
as
select
 (select count(*) from public.products)::int as products_total,
 (select count(*) from public.products where is_active)::int as products_active,
 (select count(*) from public.cosmos_product_research)::int as research_queue_total,
 (select count(*) from public.cosmos_product_research where status='review')::int as researched_for_review,
 (select count(*) from public.cosmos_research_requests)::int as api_attempts_total,
 (select count(*) from public.cosmos_family_candidate_review_v2)::int as proposed_multivariant_families,
 (select count(*) from public.cosmos_product_identity_audit_v2
    where is_active and gtin is not null and trim(gtin)<>'' and not gtin_checksum_valid)::int
    as active_invalid_gtin,
 (select enabled from public.cosmos_research_config where id=true) as worker_enabled;
revoke all on public.cosmos_catalog_progress_v2 from public,anon,authenticated;
grant select on public.cosmos_catalog_progress_v2 to service_role;

-- Fila de pesquisas: não desperdiçar franquia em GTIN de dígito verificador incorreto.
create or replace function public.cosmos_research_reserve_next()
returns table(request_id bigint, selected_product_id uuid, selected_gtin text)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
 cfg record;
 used_slots int;
 next_record record;
 local_day date := (now() at time zone 'America/Cuiaba')::date;
begin
 select enabled,daily_limit into cfg
 from public.cosmos_research_config where id=true for update;
 if not found or not cfg.enabled then return; end if;

 -- Refazer fila somente para produtos ativos com GTIN numérico de formato válido.
 -- Nenhum match é assumido usando apenas a semelhança dos nomes.
 insert into public.cosmos_product_research(product_id,gtin,candidate_cohort_key)
 select p.id,trim(p.gtin),
        lower(concat_ws('|',nullif(trim(p.brand),''),
          nullif(trim(coalesce(p.customer_subsubcategory,p.subcategory,'')),''),
          regexp_replace(coalesce(p.packaging,''),'\s+','','g')))
 from public.products p
 where p.is_active and trim(coalesce(p.gtin,'')) ~ '^[0-9]{8}([0-9]{4}([0-9]{1,2})?)?
   and not exists (select 1 from public.cosmos_product_research r where r.product_id=p.id)
 order by p.id limit 150
 on conflict (product_id) do nothing;

 -- Se a função caiu no meio da chamada, liberar o item para nova tentativa futura.
 update public.cosmos_product_research r set status='retry',
   retry_after=now()+interval '24 hours', updated_at=now(),last_error='abandoned_reservation'
 where r.status='reserved' and r.last_attempt_at<now()-interval '45 minutes';

 select count(*) into used_slots from public.cosmos_research_requests
 where quota_date=local_day;
 if used_slots >= cfg.daily_limit then return; end if;

 select r.product_id,r.gtin into next_record
 from public.cosmos_product_research r
 join public.products p on p.id=r.product_id
 where p.is_active and trim(p.gtin)=r.gtin
   and public.cosmos_gtin_valid(r.gtin)
   and r.status in ('pending','retry')
   and (r.retry_after is null or r.retry_after <= now())
 order by case when p.is_active then 0 else 1 end, r.created_at, r.product_id
 for update of r skip locked limit 1;
 if not found then return; end if;

 insert into public.cosmos_research_requests(quota_date,quota_slot,product_id,gtin)
 values (local_day,used_slots+1,next_record.product_id,next_record.gtin)
 returning id into request_id;
 update public.cosmos_product_research
 set status='reserved',last_attempt_at=now(),updated_at=now()
 where product_id=next_record.product_id;
 selected_product_id:=next_record.product_id;
 selected_gtin:=next_record.gtin;
 return next;
end $$;

   and public.cosmos_gtin_valid(trim(p.gtin))
   and not exists (select 1 from public.cosmos_product_research r where r.product_id=p.id)
 order by p.id limit 150
 on conflict (product_id) do nothing;

 -- Se a função caiu no meio da chamada, liberar o item para nova tentativa futura.
 update public.cosmos_product_research r set status='retry',
   retry_after=now()+interval '24 hours', updated_at=now(),last_error='abandoned_reservation'
 where r.status='reserved' and r.last_attempt_at<now()-interval '45 minutes';

 select count(*) into used_slots from public.cosmos_research_requests
 where quota_date=local_day;
 if used_slots >= cfg.daily_limit then return; end if;

 select r.product_id,r.gtin into next_record
 from public.cosmos_product_research r
 join public.products p on p.id=r.product_id
 where p.is_active and trim(p.gtin)=r.gtin
   and r.status in ('pending','retry')
   and (r.retry_after is null or r.retry_after <= now())
 order by case when p.is_active then 0 else 1 end, r.created_at, r.product_id
 for update of r skip locked limit 1;
 if not found then return; end if;

 insert into public.cosmos_research_requests(quota_date,quota_slot,product_id,gtin)
 values (local_day,used_slots+1,next_record.product_id,next_record.gtin)
 returning id into request_id;
 update public.cosmos_product_research
 set status='reserved',last_attempt_at=now(),updated_at=now()
 where product_id=next_record.product_id;
 selected_product_id:=next_record.product_id;
 selected_gtin:=next_record.gtin;
 return next;
end $$;

revoke all on function public.cosmos_research_reserve_next() from public,anon,authenticated;
grant execute on function public.cosmos_research_reserve_next() to service_role;

comment on view public.cosmos_family_candidate_review_v2 is
 'Grupos somente sugeridos por tipo/marca/conteúdo; NÃO autorizam herança automática de NCM, CEST ou medidas físicas.';
