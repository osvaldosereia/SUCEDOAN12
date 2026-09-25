-- Dona Antônia Operations 2.0
-- Read model único para estoque vendável.
-- Em legacy_shadow apenas observa. O cutover ocorre somente quando
-- bling_hub_runtime_v2.metadata.ops2_stock_authority = 'bling'.

create or replace view public.ops2_sellable_stock_v1
with (security_invoker = true)
as
with cfg as (
  select
    nullif(metadata->>'selected_deposit_id','')::bigint as selected_deposit_id,
    coalesce(metadata->>'ops2_stock_authority','legacy_shadow') as stock_authority,
    nullif(metadata->>'ops2_stock_cutover_at','')::timestamptz as stock_cutover_at
  from public.bling_hub_runtime_v2
  where id=1
),
links as (
  select source_id,bling_id,status,last_verified_at
  from public.bling_hub_entity_links_v2
  where source_system='vitrine_qx'
    and entity_type='product'
)
select
  p.id as product_id,
  p.name,
  p.sku,
  p.gtin,
  p.is_active,
  coalesce(p.stock,0)::numeric as legacy_stock,
  l.bling_id as bling_product_id,
  l.status as link_status,
  m.physical_total as bling_physical_total,
  m.virtual_total as bling_virtual_total,
  cfg.selected_deposit_id,
  case
    when cfg.selected_deposit_id is not null
     and m.deposit_balances ? cfg.selected_deposit_id::text
    then nullif(m.deposit_balances->cfg.selected_deposit_id::text->>'physical','')::numeric
    else null
  end as sellable_physical,
  case
    when cfg.selected_deposit_id is not null
     and m.deposit_balances ? cfg.selected_deposit_id::text
    then greatest(
      0,
      coalesce(
        nullif(m.deposit_balances->cfg.selected_deposit_id::text->>'virtual','')::numeric,
        0
      )
    )
    else null
  end as sellable_virtual,
  m.observed_at as mirror_observed_at,
  m.source_event_id,
  m.source_resource,
  cfg.stock_authority,
  cfg.stock_cutover_at,
  (
    p.is_active=true
    and l.status='matched'
    and l.bling_id is not null
    and m.product_id is not null
    and cfg.selected_deposit_id is not null
    and m.deposit_balances ? cfg.selected_deposit_id::text
  ) as bling_stock_ready,
  case
    when cfg.stock_authority='bling' then
      case
        when p.is_active=true
         and l.status='matched'
         and l.bling_id is not null
         and m.product_id is not null
         and cfg.selected_deposit_id is not null
         and m.deposit_balances ? cfg.selected_deposit_id::text
        then greatest(
          0,
          coalesce(
            nullif(m.deposit_balances->cfg.selected_deposit_id::text->>'virtual','')::numeric,
            0
          )
        )
        else 0::numeric
      end
    else greatest(0,coalesce(p.stock,0)::numeric)
  end as effective_sellable_stock,
  case
    when not p.is_active then 'inactive'
    when l.bling_id is null or l.status is distinct from 'matched' then 'unlinked'
    when m.product_id is null then 'mirror_missing'
    when cfg.selected_deposit_id is null then 'deposit_not_selected'
    when not (m.deposit_balances ? cfg.selected_deposit_id::text) then 'deposit_balance_missing'
    when cfg.stock_authority='bling' then 'bling_virtual'
    else 'legacy_shadow'
  end as stock_source_reason
from public.products p
cross join cfg
left join links l on l.source_id=p.id::text
left join public.bling_stock_mirror_v2 m on m.product_id=p.id;

create or replace function public.get_ops2_sellable_stock_v1(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'product_id',s.product_id,
        'is_active',s.is_active,
        'stock_authority',s.stock_authority,
        'stock_cutover_at',s.stock_cutover_at,
        'legacy_stock',s.legacy_stock,
        'bling_product_id',s.bling_product_id,
        'bling_stock_ready',s.bling_stock_ready,
        'sellable_physical',s.sellable_physical,
        'sellable_virtual',s.sellable_virtual,
        'effective_sellable_stock',s.effective_sellable_stock,
        'mirror_observed_at',s.mirror_observed_at,
        'stock_source_reason',s.stock_source_reason
      )
      from public.ops2_sellable_stock_v1 s
      where s.product_id=p_product_id
    ),
    jsonb_build_object('product_id',p_product_id,'error','product_not_found')
  );
$$;

create or replace function public.get_ops2_sellable_stock_status_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'active_products',count(*) filter (where is_active),
    'active_bling_ready',count(*) filter (where is_active and bling_stock_ready),
    'active_not_ready',count(*) filter (where is_active and not bling_stock_ready),
    'legacy_equal_bling',count(*) filter (
      where is_active and bling_stock_ready
        and abs(legacy_stock-sellable_virtual)<=0.0001
    ),
    'legacy_diff_bling',count(*) filter (
      where is_active and bling_stock_ready
        and abs(legacy_stock-sellable_virtual)>0.0001
    ),
    'legacy_positive_bling_zero',count(*) filter (
      where is_active and bling_stock_ready
        and legacy_stock>0 and sellable_virtual=0
    ),
    'legacy_zero_bling_positive',count(*) filter (
      where is_active and bling_stock_ready
        and legacy_stock=0 and sellable_virtual>0
    ),
    'stock_authority',max(stock_authority),
    'stock_cutover_at',max(stock_cutover_at),
    'last_mirror_observed_at',max(mirror_observed_at)
  )
  from public.ops2_sellable_stock_v1;
$$;

revoke all on function public.get_ops2_sellable_stock_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_ops2_sellable_stock_v1(uuid) to service_role;

revoke all on function public.get_ops2_sellable_stock_status_v1() from public,anon,authenticated;
grant execute on function public.get_ops2_sellable_stock_status_v1() to service_role;

comment on view public.ops2_sellable_stock_v1 is
'Operations 2.0: read model único de estoque. Em autoridade Bling, saldo vendável é o virtual do depósito selecionado; produto sem vínculo/mirror falha fechado em zero.';

comment on function public.get_ops2_sellable_stock_v1(uuid) is
'Operations 2.0: snapshot de disponibilidade de um produto no read model de estoque.';
