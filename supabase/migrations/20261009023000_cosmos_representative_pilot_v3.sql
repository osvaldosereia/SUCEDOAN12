-- Pesquisa Cosmos por representante: prioriza UMA consulta por grupo candidato.
-- Todas as decisões continuam pendentes de validação e não atualizam produtos.
alter table public.cosmos_research_config
 add column if not exists research_mode text not null default 'representatives_only'
 check (research_mode in ('representatives_only','full'));

create or replace view public.cosmos_family_representatives_v2
with (security_invoker=true)
as
with ranked as (
 select a.product_id,a.name,a.gtin,a.proposed_family_key,
   c.product_count,c.review_reason,
   (case when nullif(trim(p.description_short),'') is not null then 4 else 0 end
    +case when nullif(trim(p.image_url),'') is not null then 3 else 0 end
    +case when nullif(trim(p.packaging),'') is not null and lower(trim(p.packaging)) not in ('un','unidade') then 2 else 0 end
    +case when nullif(trim(p.brand),'') is not null then 1 else 0 end
   ) as evidence_score,
   row_number() over(partition by a.proposed_family_key
     order by
       (case when nullif(trim(p.description_short),'') is not null then 4 else 0 end
       +case when nullif(trim(p.image_url),'') is not null then 3 else 0 end
       +case when nullif(trim(p.packaging),'') is not null and lower(trim(p.packaging)) not in ('un','unidade') then 2 else 0 end
       +case when nullif(trim(p.brand),'') is not null then 1 else 0 end) desc,
       a.name,a.product_id) as rank_in_group
 from public.cosmos_product_identity_audit_v2 a
 join public.products p on p.id=a.product_id
 join public.cosmos_family_candidate_review_v2 c
   on c.proposed_family_key=a.proposed_family_key
 where a.is_active and a.gtin_checksum_valid is true
)
select product_id as representative_product_id,name as representative_name,
  gtin as representative_gtin,proposed_family_key,product_count,
  review_reason,evidence_score
from ranked
where rank_in_group=1;
revoke all on public.cosmos_family_representatives_v2 from public,anon,authenticated;
grant select on public.cosmos_family_representatives_v2 to service_role;

-- Modo seguro padrão: consultar apenas representantes das famílias candidatas.
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
 select enabled,daily_limit,research_mode into cfg
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
 where p.is_active and trim(coalesce(p.gtin,'')) ~ '^[0-9]{8}([0-9]{4}([0-9]{1,2})?)?$'
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
 left join public.cosmos_family_representatives_v2 rep
   on rep.representative_product_id=r.product_id
 where p.is_active and trim(p.gtin)=r.gtin
   and public.cosmos_gtin_valid(r.gtin)
   and (cfg.research_mode='full' or rep.representative_product_id is not null)
   and r.status in ('pending','retry')
   and (r.retry_after is null or r.retry_after <= now())
 order by case when rep.representative_product_id is not null then 0 else 1 end,
   r.created_at, r.product_id
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
comment on view public.cosmos_family_representatives_v2 is
 'EANs para piloto por grupos; os outros EANs ficam pendentes, nunca se tornam automaticamente revisados.';
