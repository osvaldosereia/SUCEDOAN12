-- Dona Antônia — gate de ativação para confirmação transacional do checkout
-- Instalação segura: OFF por padrão, CANARY para um único pedido, LIVE após homologação.

create table if not exists public.ops2_whatsapp_order_runtime_v1 (
  id smallint primary key check (id = 1),
  mode text not null default 'off' check (mode in ('off','canary','live')),
  canary_order_id uuid,
  updated_at timestamptz not null default now(),
  check (mode <> 'canary' or canary_order_id is not null)
);

insert into public.ops2_whatsapp_order_runtime_v1(id,mode,canary_order_id)
values (1,'off',null)
on conflict (id) do nothing;

alter table public.ops2_whatsapp_order_runtime_v1 enable row level security;
revoke all on table public.ops2_whatsapp_order_runtime_v1 from public,anon,authenticated;
grant all on table public.ops2_whatsapp_order_runtime_v1 to service_role;

-- Nenhuma fila criada antes da instalação do gate pode sobreviver para uma ativação futura.
update public.ops2_whatsapp_outbox_v1
   set status='suppressed',
       last_error='runtime_gate_install_suppressed_preexisting',
       locked_at=null,
       updated_at=now()
 where status in ('pending','retry','sending')
   and sent_at is null;

-- Preserva a implementação de roteamento já testada atrás de um wrapper fail-closed.
alter function public.ops2_enqueue_order_whatsapp_v1(uuid,text)
  rename to ops2_enqueue_order_whatsapp_v1_base;

revoke all on function public.ops2_enqueue_order_whatsapp_v1_base(uuid,text) from public,anon,authenticated;
grant execute on function public.ops2_enqueue_order_whatsapp_v1_base(uuid,text) to service_role;

create or replace function public.ops2_enqueue_order_whatsapp_v1(
  p_order_id uuid,
  p_message_kind text default 'order_received'
)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_runtime_mode text;
  v_canary_order_id uuid;
begin
  select r.mode,r.canary_order_id
    into v_runtime_mode,v_canary_order_id
  from public.ops2_whatsapp_order_runtime_v1 r
  where r.id=1;

  v_runtime_mode:=coalesce(v_runtime_mode,'off');

  if v_runtime_mode='off' then
    return jsonb_build_object('ok',true,'skipped',true,'reason','runtime_off');
  end if;

  if v_runtime_mode='canary' and p_order_id is distinct from v_canary_order_id then
    return jsonb_build_object('ok',true,'skipped',true,'reason','not_canary_order');
  end if;

  return public.ops2_enqueue_order_whatsapp_v1_base(p_order_id,p_message_kind);
end;
$$;

revoke all on function public.ops2_enqueue_order_whatsapp_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.ops2_enqueue_order_whatsapp_v1(uuid,text) to service_role;

-- Claim também é fail-closed. Mesmo uma linha inserida manualmente não sai em OFF.
create or replace function public.ops2_claim_whatsapp_outbox_v1(
  p_channel_origin text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item public.ops2_whatsapp_outbox_v1%rowtype;
  v_channel text:=nullif(btrim(coalesce(p_channel_origin,'')),'');
  v_runtime_mode text;
  v_canary_order_id uuid;
begin
  select r.mode,r.canary_order_id
    into v_runtime_mode,v_canary_order_id
  from public.ops2_whatsapp_order_runtime_v1 r
  where r.id=1;

  v_runtime_mode:=coalesce(v_runtime_mode,'off');

  if v_runtime_mode='off' then
    return jsonb_build_object('ok',true,'found',false,'reason','runtime_off');
  end if;

  if v_runtime_mode='canary' and v_canary_order_id is null then
    return jsonb_build_object('ok',true,'found',false,'reason','canary_order_missing');
  end if;

  update public.ops2_whatsapp_outbox_v1
     set status='retry',
         locked_at=null,
         updated_at=now(),
         last_error=coalesce(last_error,'stale_sending_recovered')
   where status='sending'
     and locked_at < now()-interval '15 minutes'
     and attempt_count < 5
     and (v_runtime_mode='live' or order_id=v_canary_order_id);

  with next_item as (
    select q.id
    from public.ops2_whatsapp_outbox_v1 q
    where q.status in ('pending','retry')
      and q.delivery_mode='utility_template'
      and q.available_at <= now()
      and q.attempt_count < 5
      and (v_channel is null or q.channel_origin=v_channel)
      and (v_runtime_mode='live' or q.order_id=v_canary_order_id)
    order by q.available_at,q.created_at
    for update skip locked
    limit 1
  )
  update public.ops2_whatsapp_outbox_v1 q
     set status='sending',
         attempt_count=q.attempt_count+1,
         locked_at=now(),
         updated_at=now(),
         last_error=null
    from next_item n
   where q.id=n.id
  returning q.* into v_item;

  if not found then
    return jsonb_build_object('ok',true,'found',false);
  end if;

  return jsonb_build_object('ok',true,'found',true,'item',to_jsonb(v_item));
end;
$$;

revoke all on function public.ops2_claim_whatsapp_outbox_v1(text) from public,anon,authenticated;
grant execute on function public.ops2_claim_whatsapp_outbox_v1(text) to service_role;
