-- Pedidos V3 — a separação item a item é a conferência operacional do pedido.
-- O gate legado de READY continua aceitando a sessão antiga `ops_order_check_sessions`,
-- mas também aceita uma separação V3 integralmente decidida e com estoque aplicado.

create or replace function public.ops_enforce_order_check_before_ready_v1()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.status='ready' and old.status='processing' then
    if not exists(
      select 1
      from public.ops_order_check_sessions s
      where s.order_id=new.id
        and s.status='verified'
        and s.verified_at is not null
    )
    and not (
      exists(
        select 1
        from public.order_separation_completions_v1 c
        where c.order_id=new.id
          and coalesce((c.metadata->>'stock_applied')::boolean,false)=true
      )
      and exists(
        select 1
        from public.order_separation_items_v1 s
        where s.order_id=new.id
      )
      and not exists(
        select 1
        from public.order_separation_items_v1 s
        where s.order_id=new.id
          and s.state='pending'
      )
    ) then
      raise exception 'order_check_required_before_ready';
    end if;
  end if;
  return new;
end
$function$;
