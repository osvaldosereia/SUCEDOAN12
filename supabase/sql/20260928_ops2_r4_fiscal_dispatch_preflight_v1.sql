-- R4 fiscal operational hardening.
-- Prevents arming/generating/authorizing NF-e unless the canonical order is fiscally balanced
-- and, for live Ops2 orders, already proved as Verificado in Bling.

create or replace function public.ops2_fiscal_dispatch_preflight_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  o public.orders%rowtype;
  item_sum numeric(14,2):=0;
  expected_total numeric(14,2):=0;
  link_status text;
  link_meta jsonb:='{}'::jsonb;
  runtime_meta jsonb:='{}'::jsonb;
  target_verified_id bigint:=0;
  blockers text[]:='{}';
begin
  select * into o from public.orders where id=p_order_id;
  if not found then
    return jsonb_build_object('ok',false,'ready',false,'blockers',jsonb_build_array('order_not_found'));
  end if;

  select round(coalesce(sum(line_total),0)::numeric,2)
    into item_sum
    from public.order_items
   where order_id=o.id;

  expected_total:=round((coalesce(o.fiscal_subtotal,0)+coalesce(o.other_expenses,0)-coalesce(o.discount,0))::numeric,2);

  if o.status<>'ready' then blockers:=array_append(blockers,'order_not_ready'); end if;
  if abs(item_sum-round(coalesce(o.fiscal_subtotal,0)::numeric,2))>0.01 then blockers:=array_append(blockers,'fiscal_subtotal_item_sum_mismatch'); end if;
  if abs(round(coalesce(o.total,0)::numeric,2)-expected_total)>0.01 then blockers:=array_append(blockers,'canonical_total_not_balanced'); end if;
  if coalesce(o.other_expenses,0)<0 then blockers:=array_append(blockers,'negative_other_expenses'); end if;
  if coalesce(o.discount,0)<0 then blockers:=array_append(blockers,'negative_discount'); end if;

  select status,coalesce(metadata,'{}'::jsonb)
    into link_status,link_meta
    from public.bling_hub_entity_links_v2
   where source_system='vitrine_qx' and entity_type='order' and source_id=o.id
   limit 1;

  if coalesce(link_status,'')<>'matched' then blockers:=array_append(blockers,'bling_order_not_linked'); end if;

  select coalesce(metadata,'{}'::jsonb)
    into runtime_meta
    from public.bling_hub_runtime_v2
   where id=1;

  if coalesce(runtime_meta->>'ops2_direct_order_state_enabled','false')::boolean
     and coalesce(runtime_meta->>'ops2_live_cutover_at','')<>'' then
    target_verified_id:=coalesce((runtime_meta->'ops2_order_status_mapping'->>'verified_id')::bigint,0);
    if coalesce(link_meta->>'ops2_target_key','')<>'verified'
       or coalesce((link_meta->>'ops2_target_status_id')::bigint,0)<>target_verified_id then
      blockers:=array_append(blockers,'bling_order_not_verified');
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'order_id',o.id,
    'order_number',o.order_number,
    'ready',coalesce(array_length(blockers,1),0)=0,
    'blockers',to_jsonb(blockers),
    'item_sum',item_sum,
    'fiscal_subtotal',round(coalesce(o.fiscal_subtotal,0)::numeric,2),
    'other_expenses',round(coalesce(o.other_expenses,0)::numeric,2),
    'discount',round(coalesce(o.discount,0)::numeric,2),
    'canonical_total',round(coalesce(o.total,0)::numeric,2),
    'recomposed_total',expected_total,
    'basket_hidden_adjustment',round(coalesce(o.basket_hidden_adjustment,0)::numeric,2),
    'bling_link_status',link_status,
    'bling_target_key',link_meta->>'ops2_target_key',
    'bling_target_status_id',link_meta->>'ops2_target_status_id'
  );
end;
$$;

revoke all on function public.ops2_fiscal_dispatch_preflight_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_fiscal_dispatch_preflight_v1(uuid) to service_role;

create or replace function public.ops2_guard_fiscal_runtime_arm_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  p jsonb;
begin
  if new.dispatch_fiscal_canary_enabled=true
     or new.dispatch_invoice_generate_enabled=true
     or new.dispatch_invoice_authorize_enabled=true then

    if new.dispatch_invoice_canary_source_order_id is null then
      raise exception 'fiscal_canary_source_order_required';
    end if;

    p:=public.ops2_fiscal_dispatch_preflight_v1(new.dispatch_invoice_canary_source_order_id);

    if coalesce((p->>'ready')::boolean,false) is not true then
      raise exception 'fiscal_dispatch_preflight_failed:%',coalesce(p->'blockers','[]'::jsonb)::text;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ops2_guard_fiscal_runtime_arm_v1 on public.fiscal_runtime_config;
create trigger trg_ops2_guard_fiscal_runtime_arm_v1
before insert or update of dispatch_fiscal_canary_enabled,dispatch_invoice_generate_enabled,dispatch_invoice_authorize_enabled,dispatch_invoice_canary_source_order_id
on public.fiscal_runtime_config
for each row execute function public.ops2_guard_fiscal_runtime_arm_v1();

revoke all on function public.ops2_guard_fiscal_runtime_arm_v1() from public,anon,authenticated;
grant execute on function public.ops2_guard_fiscal_runtime_arm_v1() to service_role;