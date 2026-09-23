create or replace function public.merge_bling_hub_runtime_metadata_v2(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_metadata jsonb;
begin
  update public.bling_hub_runtime_v2
  set metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_patch,'{}'::jsonb),
      updated_at=now()
  where id=1
  returning metadata into v_metadata;

  if v_metadata is null then
    raise exception 'bling_hub_runtime_missing';
  end if;
  return v_metadata;
end
$$;

revoke all on function public.merge_bling_hub_runtime_metadata_v2(jsonb) from public,anon,authenticated;
grant execute on function public.merge_bling_hub_runtime_metadata_v2(jsonb) to service_role;

create or replace function public.set_bling_hub_order_rollout_v2(
  p_state text,
  p_details jsonb default '{}'::jsonb,
  p_disable_orders boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_runtime jsonb;
  v_rollout jsonb;
begin
  if nullif(trim(coalesce(p_state,'')),'') is null then
    raise exception 'order_rollout_state_required';
  end if;

  v_rollout=jsonb_build_object('state',trim(p_state))
    ||coalesce(p_details,'{}'::jsonb);

  update public.bling_hub_runtime_v2
  set orders_enabled=case when p_disable_orders then false else orders_enabled end,
      metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{order_rollout}',v_rollout,true),
      updated_at=now()
  where id=1
  returning jsonb_build_object(
    'orders_enabled',orders_enabled,
    'order_rollout',metadata->'order_rollout'
  ) into v_runtime;

  if v_runtime is null then
    raise exception 'bling_hub_runtime_missing';
  end if;
  return v_runtime;
end
$$;

revoke all on function public.set_bling_hub_order_rollout_v2(text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.set_bling_hub_order_rollout_v2(text,jsonb,boolean) to service_role;
