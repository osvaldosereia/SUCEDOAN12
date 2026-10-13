-- Dona Antônia: a newly confirmed storefront order goes directly to SEPARAR AGORA.
-- Human selections remain manual; automated selections carry no invented employee id.
-- Existing and historical orders are not backfilled.
alter table public.order_manual_separation_queue_v1
  alter column selected_by drop not null;

alter table public.order_manual_separation_queue_v1
  add column if not exists selected_source text not null default 'admin_manual';

alter table public.order_manual_separation_queue_v1
  drop constraint if exists manual_pick_queue_selected_source_check;
alter table public.order_manual_separation_queue_v1
  add constraint manual_pick_queue_selected_source_check
  check (selected_source in ('admin_manual','customer_confirmed','admin_confirmed'));

create or replace function public.ops3_enqueue_confirmed_storefront_v1()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  if new.source not in ('vitrine','storefront_v2')
    or new.status <> 'confirmed'
    or old.status = 'confirmed'
    or old.status not in ('storefront_received','received') then
    return new;
  end if;

  -- Do not start picking. Only add the fully confirmed order to the queue.
  -- No service or synthetic UUID is impersonated as an Admin employee.
  insert into public.order_manual_separation_queue_v1(
    order_id,selected_by,selected_source
  ) values (
    new.id,null,
    case when coalesce((new.checkout_snapshot->>'customer_confirmed'), '')='true'
      then 'customer_confirmed' else 'admin_confirmed' end
  )
  on conflict (order_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_ops3_enqueue_confirmed_storefront_v1 on public.orders;
create trigger trg_ops3_enqueue_confirmed_storefront_v1
after update of status on public.orders
for each row
when (new.status = 'confirmed' and old.status is distinct from new.status)
execute function public.ops3_enqueue_confirmed_storefront_v1();

revoke all on function public.ops3_enqueue_confirmed_storefront_v1() from public,anon,authenticated;
-- Trigger invocation is not a public RPC. No direct execute grant is needed.
