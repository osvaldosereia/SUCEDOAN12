begin;

-- Etapa 11 — robustez, auditoria e manutenção do histórico de compras.

create index if not exists idx_customer_behavior_events_customer_time_v1
  on public.customer_behavior_events(customer_id,occurred_at desc)
  where customer_id is not null;

create index if not exists idx_customer_behavior_events_conversation_time_v1
  on public.customer_behavior_events(conversation_id,occurred_at desc)
  where conversation_id is not null;

create index if not exists idx_customer_product_stats_rank_v1
  on public.customer_product_stats(customer_id,purchase_count desc,last_purchase_at desc);

create index if not exists idx_bling_history_staging_customer_status_v1
  on public.bling_history_staging_orders(matched_customer_id,reconciliation_status,order_date desc)
  where matched_customer_id is not null;

create or replace view public.purchase_history_integrity_v1
with (security_invoker=true)
as
with valid_orders as (
  select o.*
  from public.orders o
  where public.is_customer_purchase_valid_v1(o.status,o.cancelled_at,o.returned_at)
),
expected_customer as (
  select
    c.id as customer_id,
    count(v.id)::int as expected_order_count,
    coalesce(sum(v.total),0)::numeric(14,2) as expected_lifetime_value,
    max(coalesce(v.confirmed_at,v.created_at)) as expected_last_order_at
  from public.customers c
  left join valid_orders v on v.customer_id=c.id
  group by c.id
),
duplicate_phones as (
  select public.normalize_phone_digits(primary_whatsapp_e164) identity_value
  from public.customers
  where nullif(public.normalize_phone_digits(primary_whatsapp_e164),'') is not null
  group by public.normalize_phone_digits(primary_whatsapp_e164)
  having count(*)>1
),
duplicate_documents as (
  select regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g') identity_value
  from public.customers
  where nullif(regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g'),'') is not null
  group by regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g')
  having count(*)>1
)
select
  (select count(*)::int from public.customers) as customers_total,
  (select count(*)::int from public.orders) as orders_total,
  (select count(*)::int from valid_orders) as valid_orders_total,
  (select count(*)::int from public.order_items) as order_items_total,

  (select count(*)::int from public.orders where customer_id is null) as orders_without_customer,
  (select count(*)::int
     from public.order_items oi
     left join public.orders o on o.id=oi.order_id
    where o.id is null) as orphan_order_items,

  (select count(*)::int
     from (
       select bling_order_id
       from public.orders
       where bling_order_id is not null
       group by bling_order_id
       having count(*)>1
     ) x) as duplicate_bling_order_groups,

  (select count(*)::int
     from public.orders
    where source='bling_import' and bling_order_id is null) as imported_orders_missing_bling_id,

  (select count(*)::int
     from public.orders
    where source='bling_import' and customer_id is null) as imported_orders_missing_customer,

  (select count(*)::int
     from public.customers c
     join expected_customer e on e.customer_id=c.id
    where coalesce(c.order_count,0)<>e.expected_order_count
       or coalesce(c.lifetime_value,0)::numeric(14,2)<>e.expected_lifetime_value
       or c.last_order_at is distinct from e.expected_last_order_at) as customer_summary_mismatches,

  (select count(*)::int
     from public.bling_history_staging_orders s
    where s.reconciliation_status='promoted'
      and s.local_order_id is null) as promoted_staging_missing_local_order,

  (select count(*)::int
     from public.bling_history_staging_orders s
     join public.orders o on o.id=s.local_order_id
    where s.local_order_id is not null
      and (
        o.bling_order_id is distinct from s.bling_order_id
        or (s.matched_customer_id is not null and o.customer_id is distinct from s.matched_customer_id)
      )) as staging_local_link_mismatches,

  (select count(*)::int
     from public.bling_history_reconciliation_issues
    where resolved=false and severity='blocking') as unresolved_blocking_reconciliation_issues,

  (select count(*)::int from duplicate_phones) as duplicate_customer_phone_groups,
  (select count(*)::int from duplicate_documents) as duplicate_customer_document_groups,

  (select count(*)::int
     from public.bling_history_staging_orders
    where reconciliation_status='ignored'
      and reconciliation_notes @> array['Cliente genérico sem identificador; não atribuir histórico a pessoa específica']::text[]) as generic_bling_orders_safely_ignored,

  now() as calculated_at;

create or replace function public.get_purchase_history_integrity_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(to_jsonb(x),'{}'::jsonb)
  from public.purchase_history_integrity_v1 x
$$;

create or replace function public.rebuild_customer_purchase_profiles_batch_v1(
  p_after uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),500));
  v_processed integer:=0;
  v_last uuid:=null;
  v_has_more boolean:=false;
begin
  for r in
    select c.id
    from public.customers c
    where p_after is null or c.id>p_after
    order by c.id
    limit v_limit
  loop
    perform public.refresh_customer_purchase_profile(r.id);
    v_processed:=v_processed+1;
    v_last:=r.id;
  end loop;

  if v_last is not null then
    select exists(select 1 from public.customers where id>v_last) into v_has_more;
  end if;

  return jsonb_build_object(
    'processed',v_processed,
    'next_after',case when v_has_more then v_last else null end,
    'has_more',v_has_more
  );
end
$$;

create or replace function public.reconcile_nonpromoted_bling_history_batch_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),500));
  v_processed integer:=0;
  v_ready integer:=0;
  v_review integer:=0;
  v_ignored integer:=0;
  v_duplicate integer:=0;
  v_result jsonb;
begin
  for r in
    select id
    from public.bling_history_staging_orders
    where reconciliation_status in ('pending','review','ready')
    order by order_date nulls first,bling_order_id,id
    limit v_limit
  loop
    v_result:=public.reconcile_bling_history_order_v1(r.id);
    v_processed:=v_processed+1;
    case coalesce(v_result->>'status','')
      when 'ready' then v_ready:=v_ready+1;
      when 'review' then v_review:=v_review+1;
      when 'ignored' then v_ignored:=v_ignored+1;
      when 'duplicate_local' then v_duplicate:=v_duplicate+1;
      else null;
    end case;
  end loop;

  return jsonb_build_object(
    'processed',v_processed,
    'ready',v_ready,
    'review',v_review,
    'ignored',v_ignored,
    'duplicate_local',v_duplicate
  );
end
$$;

revoke all on public.purchase_history_integrity_v1 from public,anon,authenticated;
revoke all on function public.get_purchase_history_integrity_v1() from public,anon,authenticated;
revoke all on function public.rebuild_customer_purchase_profiles_batch_v1(uuid,integer) from public,anon,authenticated;
revoke all on function public.reconcile_nonpromoted_bling_history_batch_v1(integer) from public,anon,authenticated;

grant select on public.purchase_history_integrity_v1 to service_role;
grant execute on function public.get_purchase_history_integrity_v1() to service_role;
grant execute on function public.rebuild_customer_purchase_profiles_batch_v1(uuid,integer) to service_role;
grant execute on function public.reconcile_nonpromoted_bling_history_batch_v1(integer) to service_role;

comment on view public.purchase_history_integrity_v1 is
  'Auditoria técnica do histórico: vínculos, duplicidades, resumos e reconciliação Bling.';
comment on function public.rebuild_customer_purchase_profiles_batch_v1(uuid,integer) is
  'Recalcula perfis derivados por cliente em lotes paginados e seguros.';
comment on function public.reconcile_nonpromoted_bling_history_batch_v1(integer) is
  'Reprocessa somente staging Bling ainda não promovido/ignorado; nunca promove automaticamente.';

commit;
