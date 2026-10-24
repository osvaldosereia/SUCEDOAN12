-- Fila manual de separacao: nenhum pedido entra sem acao humana.
-- Controle independente dos estados, estoque, Bling e automacoes.
create table if not exists public.order_manual_separation_queue_v1 (
  order_id uuid primary key references public.orders(id) on delete cascade,
  selected_at timestamptz not null default now(),
  selected_by uuid not null
);
alter table public.order_manual_separation_queue_v1 enable row level security;
revoke all on table public.order_manual_separation_queue_v1 from public, anon, authenticated;

create or replace function public.manual_pick_queue_action_v1(
  p_action text,
  p_order_id uuid default null
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_status text;
  v_ids jsonb;
begin
  select a.role into v_role
    from public.admin_users a
   where a.user_id = v_user and a.is_active = true;
  if v_role is null then
    raise exception 'admin_not_authorized' using errcode = '42501';
  end if;
  if p_action not in ('list','add','remove') or p_action is null then
    raise exception 'invalid_queue_action' using errcode = '22023';
  end if;
  if p_action <> 'list' then
    if v_role = 'viewer' then
      raise exception 'queue_update_forbidden' using errcode = '42501';
    end if;
    if p_order_id is null then
      raise exception 'order_id_required' using errcode = '22023';
    end if;
    if p_action = 'add' then
      select o.status into v_status
        from public.orders o where o.id = p_order_id for update;
      if v_status is distinct from 'confirmed' then
        raise exception 'order_not_confirmed_for_queue' using errcode = '22023';
      end if;
      insert into public.order_manual_separation_queue_v1(order_id,selected_by)
      values (p_order_id,v_user) on conflict (order_id) do nothing;
    else
      delete from public.order_manual_separation_queue_v1
        where order_id = p_order_id;
    end if;
  end if;
  select coalesce(jsonb_agg(q.order_id order by q.selected_at, q.order_id),'[]'::jsonb)
    into v_ids
    from public.order_manual_separation_queue_v1 q
    join public.orders o on o.id = q.order_id
   where o.status in ('confirmed','processing');
  return jsonb_build_object('order_ids',v_ids);
end;
$$;
revoke all on function public.manual_pick_queue_action_v1(text,uuid) from public, anon;
grant execute on function public.manual_pick_queue_action_v1(text,uuid) to authenticated;
comment on table public.order_manual_separation_queue_v1 is
 'Fila de separacao por inclusao manual explicita; nao modifica status, reserva ou estoque.';
