-- Dona Antônia Operations 2.0
-- Controle idempotente para lançamento/estorno físico do estoque de pedidos no Bling.

create table if not exists public.bling_order_stock_controls_v2 (
  source_order_id uuid primary key references public.orders(id) on delete cascade,
  bling_order_id bigint not null unique,
  deposit_id bigint not null,
  state text not null default 'not_launched'
    check (state in ('not_launched','launching','launched','reversing','reversed','review_required')),
  launch_attempts integer not null default 0,
  reverse_attempts integer not null default 0,
  before_launch jsonb,
  after_launch jsonb,
  before_reverse jsonb,
  after_reverse jsonb,
  launched_at timestamptz,
  reversed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bling_order_stock_controls_v2 enable row level security;

create index if not exists bling_order_stock_controls_state_idx
  on public.bling_order_stock_controls_v2(state,updated_at desc);

create or replace function public.claim_bling_order_stock_action_v2(
  p_source_order_id uuid,
  p_bling_order_id bigint,
  p_deposit_id bigint,
  p_action text,
  p_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text:=lower(trim(coalesce(p_action,'')));
  v_row public.bling_order_stock_controls_v2%rowtype;
begin
  if p_source_order_id is null or coalesce(p_bling_order_id,0)<=0 or coalesce(p_deposit_id,0)<=0 then
    return jsonb_build_object('ok',false,'error','invalid_identity');
  end if;
  if v_action not in ('launch','reverse') then
    return jsonb_build_object('ok',false,'error','invalid_action');
  end if;

  insert into public.bling_order_stock_controls_v2(
    source_order_id,bling_order_id,deposit_id,state,created_at,updated_at
  )
  values(
    p_source_order_id,p_bling_order_id,p_deposit_id,'not_launched',now(),now()
  )
  on conflict(source_order_id) do nothing;

  select *
    into v_row
    from public.bling_order_stock_controls_v2
   where source_order_id=p_source_order_id
   for update;

  if not found then
    return jsonb_build_object('ok',false,'error','control_row_missing');
  end if;
  if v_row.bling_order_id<>p_bling_order_id or v_row.deposit_id<>p_deposit_id then
    return jsonb_build_object('ok',false,'error','control_identity_mismatch','state',v_row.state);
  end if;

  if v_action='launch' then
    if v_row.state='launched' then
      return jsonb_build_object('ok',true,'claimed',false,'already_done',true,'state',v_row.state);
    end if;
    if v_row.state='launching' then
      return jsonb_build_object('ok',true,'claimed',false,'in_progress',true,'state',v_row.state);
    end if;
    if v_row.state in ('reversing','review_required') then
      return jsonb_build_object('ok',false,'error','stock_action_blocked','state',v_row.state);
    end if;

    update public.bling_order_stock_controls_v2
       set state='launching',
           launch_attempts=launch_attempts+1,
           before_launch=coalesce(p_snapshot,'{}'::jsonb),
           after_launch=null,
           launched_at=null,
           last_error=null,
           updated_at=now()
     where source_order_id=p_source_order_id;

    return jsonb_build_object('ok',true,'claimed',true,'state','launching');
  end if;

  if v_row.state='reversed' or v_row.state='not_launched' then
    return jsonb_build_object('ok',true,'claimed',false,'already_done',true,'state',v_row.state);
  end if;
  if v_row.state='reversing' then
    return jsonb_build_object('ok',true,'claimed',false,'in_progress',true,'state',v_row.state);
  end if;
  if v_row.state<>'launched' then
    return jsonb_build_object('ok',false,'error','stock_reverse_not_allowed','state',v_row.state);
  end if;

  update public.bling_order_stock_controls_v2
     set state='reversing',
         reverse_attempts=reverse_attempts+1,
         before_reverse=coalesce(p_snapshot,'{}'::jsonb),
         after_reverse=null,
         reversed_at=null,
         last_error=null,
         updated_at=now()
   where source_order_id=p_source_order_id;

  return jsonb_build_object('ok',true,'claimed',true,'state','reversing');
end
$$;

create or replace function public.finish_bling_order_stock_action_v2(
  p_source_order_id uuid,
  p_action text,
  p_success boolean,
  p_snapshot jsonb default '{}'::jsonb,
  p_error text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text:=lower(trim(coalesce(p_action,'')));
  v_state text;
begin
  if v_action not in ('launch','reverse') then
    return jsonb_build_object('ok',false,'error','invalid_action');
  end if;

  if v_action='launch' then
    v_state:=case when p_success then 'launched' else 'review_required' end;
    update public.bling_order_stock_controls_v2
       set state=v_state,
           after_launch=coalesce(p_snapshot,'{}'::jsonb),
           launched_at=case when p_success then now() else launched_at end,
           last_error=case when p_success then null else left(coalesce(p_error,'launch_failed'),1000) end,
           metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),
           updated_at=now()
     where source_order_id=p_source_order_id;
  else
    v_state:=case when p_success then 'reversed' else 'review_required' end;
    update public.bling_order_stock_controls_v2
       set state=v_state,
           after_reverse=coalesce(p_snapshot,'{}'::jsonb),
           reversed_at=case when p_success then now() else reversed_at end,
           last_error=case when p_success then null else left(coalesce(p_error,'reverse_failed'),1000) end,
           metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),
           updated_at=now()
     where source_order_id=p_source_order_id;
  end if;

  if not found then
    return jsonb_build_object('ok',false,'error','control_row_missing');
  end if;
  return jsonb_build_object('ok',true,'state',v_state);
end
$$;

revoke all on table public.bling_order_stock_controls_v2 from anon,authenticated;
revoke all on function public.claim_bling_order_stock_action_v2(uuid,bigint,bigint,text,jsonb)
  from public,anon,authenticated;
revoke all on function public.finish_bling_order_stock_action_v2(uuid,text,boolean,jsonb,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.claim_bling_order_stock_action_v2(uuid,bigint,bigint,text,jsonb)
  to service_role;
grant execute on function public.finish_bling_order_stock_action_v2(uuid,text,boolean,jsonb,text,jsonb)
  to service_role;

comment on table public.bling_order_stock_controls_v2 is
'Operations 2.0: trava idempotente e evidência do lançamento/estorno físico de pedido no Bling.';
