-- Mantem na fila manual a confirmacao de separacao COMPLETA persistida no banco.
-- A fila nunca adiciona pedidos sem escolha humana. Nenhum trigger, nenhuma mudanca em pedidos.
-- Ajusta SOMENTE a funcao existente manual_pick_queue_feed_v1.
-- Retorna o codigo publico imutavel de order_public_snapshots_v1, que o
-- checkout exibe ao cliente, sem gerar outro identificador nem mexer em pedidos.
-- /montar: leitura leve, segura e exclusivamente manual da fila existente.
-- Nenhum gatilho, alteracao de status, estoque, fiscal ou pedido.
create or replace function public.manual_pick_queue_feed_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rows jsonb;
begin
  if not exists (
    select 1 from public.admin_users a
     where a.user_id = v_uid and a.is_active = true
  ) then
    raise exception 'admin_not_authorized' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x.obj order by x.selected_at asc, x.order_id asc), '[]'::jsonb)
  into v_rows
  from (
    select q.selected_at,q.order_id,
      jsonb_build_object(
        'id',o.id,
        'order_number',o.order_number,
        'public_code',p.public_code,
        'status',o.status,
        'created_at',o.created_at,
        'selected_at',q.selected_at,
        'customer_name',coalesce(nullif(o.customer_snapshot->>'name',''),
                                  nullif(o.delivery_address->>'customer_name',''),
                                  nullif(o.delivery_address->>'recipient_name',''),'Cliente'),
        'total',o.total,
        'separator_key',a.separator_key,
        'separator_label',a.separator_label,
        'completed',c.completed_at is not null,
        'completed_at',c.completed_at,
        'completed_separator_key',c.separator_key,
        'completed_separator_label',coalesce(a.separator_label,case c.separator_key when 'jose' then 'José' when 'claudio' then 'Cláudio' when 'claudenil' then 'Claudenil' when 'jovenil' then 'Jovenil' when 'kelly' then 'Kelly' else null end),
        'counts',jsonb_build_object(
          'total',coalesce(s.total,0),
          'pending',coalesce(s.pending,0),
          'separated',coalesce(s.separated,0),
          'missing',coalesce(s.missing,0)
        )
      ) as obj
    from public.order_manual_separation_queue_v1 q
    join public.orders o on o.id=q.order_id
    left join public.order_public_snapshots_v1 p on p.order_id=o.id
    left join public.order_separation_assignments_v1 a on a.order_id=o.id
    left join public.order_separation_completions_v1 c on c.order_id=o.id
    left join lateral (
      select count(*)::int as total,
        count(*) filter(where i.state='pending')::int as pending,
        count(*) filter(where i.state='separated')::int as separated,
        count(*) filter(where i.state='missing')::int as missing
      from public.order_separation_items_v1 i
      where i.order_id=o.id
    ) s on true
    where (o.status in ('confirmed','processing') and c.completed_at is null)
       or (o.status='ready' and c.completed_at is not null)
  ) x;
  return jsonb_build_object('ok',true,'orders',v_rows);
end;
$$;
revoke all on function public.manual_pick_queue_feed_v1() from public,anon;
grant execute on function public.manual_pick_queue_feed_v1() to authenticated;
comment on function public.manual_pick_queue_feed_v1() is
 'Fila manual selecionada no Admin, visivel para a tela exclusiva /montar. Nao altera pedidos.';
