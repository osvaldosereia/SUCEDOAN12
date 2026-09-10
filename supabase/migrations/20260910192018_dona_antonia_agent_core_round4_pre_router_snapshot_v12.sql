begin;

create table if not exists public.agent_core_pre_router_snapshots(
  ai_job_id uuid primary key,
  conversation_id uuid not null,
  message_id uuid,
  observed_at timestamptz not null default now(),
  message_type text,
  interactive_id text,
  conversation_mode text,
  conversation_stage text,
  service_window_open boolean not null default false,
  human_required boolean not null default false,
  open_handoff boolean not null default false,
  awaiting text,
  basket_session_active boolean not null default false,
  cart_exists boolean not null default false,
  cart_valid boolean not null default false,
  customer_registered boolean not null default false,
  address_known boolean not null default false,
  pii_stored boolean not null default false check (pii_stored=false)
);

alter table public.agent_core_pre_router_snapshots enable row level security;
revoke all on public.agent_core_pre_router_snapshots from public,anon,authenticated;
grant select,insert,update,delete on public.agent_core_pre_router_snapshots to service_role;

create index if not exists agent_core_pre_router_snapshots_observed_at_idx
  on public.agent_core_pre_router_snapshots(observed_at desc);
create index if not exists agent_core_pre_router_snapshots_conversation_idx
  on public.agent_core_pre_router_snapshots(conversation_id,observed_at desc);

create or replace function public.observe_agent_core_pre_router_state_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  c public.conversations%rowtype;
  m public.messages%rowtype;
  st public.whatsapp_sales_state%rowtype;
  bs public.catalog_sessions%rowtype;
  k public.carts%rowtype;
  cust jsonb:='{}'::jsonb;
  contact jsonb:='{}'::jsonb;
  v_open_handoff boolean:=false;
  v_basket_active boolean:=false;
  v_cart_exists boolean:=false;
  v_cart_valid boolean:=false;
begin
  begin
    if new.job_type<>'conversation' or new.status<>'pending' or new.message_id is null then return new; end if;

    select * into c from public.conversations where id=new.conversation_id;
    if not found or c.channel<>'whatsapp' or coalesce(c.automation_cohort,'')<>'homologation' then return new; end if;

    select * into m from public.messages where id=new.message_id and conversation_id=new.conversation_id and direction='inbound';
    if not found then return new; end if;

    select * into st from public.whatsapp_sales_state where conversation_id=new.conversation_id;

    select * into bs
      from public.catalog_sessions
      where conversation_id=new.conversation_id and metadata->>'flow'='basket_basic_v1'
      order by created_at desc limit 1;
    v_basket_active:=bs.id is not null and bs.status='open' and (bs.expires_at is null or bs.expires_at>now());

    if bs.cart_id is not null then
      select * into k from public.carts where id=bs.cart_id;
    else
      select * into k from public.carts
      where conversation_id=new.conversation_id and status='draft'
      order by updated_at desc limit 1;
    end if;
    v_cart_exists:=k.id is not null;
    v_cart_valid:=v_cart_exists and k.status='draft' and coalesce(k.pricing_status,'ready')='ready'
      and exists(select 1 from public.cart_items ci where ci.cart_id=k.id and ci.quantity>0);

    select exists(
      select 1 from public.human_handoffs h
      where h.conversation_id=new.conversation_id and h.status in ('open','claimed')
    ) into v_open_handoff;

    begin cust:=public.get_agent_core_basket_customer_status_compact_v1(new.conversation_id); exception when others then cust:='{}'::jsonb; end;
    begin contact:=public.get_agent_core_checkout_contact_compact_v1(new.conversation_id); exception when others then contact:='{}'::jsonb; end;

    insert into public.agent_core_pre_router_snapshots(
      ai_job_id,conversation_id,message_id,observed_at,message_type,interactive_id,
      conversation_mode,conversation_stage,service_window_open,human_required,open_handoff,
      awaiting,basket_session_active,cart_exists,cart_valid,customer_registered,address_known,pii_stored
    ) values (
      new.id,new.conversation_id,new.message_id,now(),left(coalesce(m.message_type,''),40),left(coalesce(m.ai_interpretation->>'id',''),120),
      left(coalesce(c.mode,''),30),left(coalesce(c.stage,''),80),
      c.service_window_expires_at is not null and c.service_window_expires_at>now(),
      coalesce(c.human_required,false),v_open_handoff,left(coalesce(st.awaiting,''),80),
      v_basket_active,v_cart_exists,v_cart_valid,
      coalesce((cust->>'registered')::boolean,false),coalesce((contact->>'address_known')::boolean,false),false
    )
    on conflict(ai_job_id) do update set
      observed_at=excluded.observed_at,
      message_type=excluded.message_type,
      interactive_id=excluded.interactive_id,
      conversation_mode=excluded.conversation_mode,
      conversation_stage=excluded.conversation_stage,
      service_window_open=excluded.service_window_open,
      human_required=excluded.human_required,
      open_handoff=excluded.open_handoff,
      awaiting=excluded.awaiting,
      basket_session_active=excluded.basket_session_active,
      cart_exists=excluded.cart_exists,
      cart_valid=excluded.cart_valid,
      customer_registered=excluded.customer_registered,
      address_known=excluded.address_known,
      pii_stored=false;
  exception when others then
    begin
      insert into public.whatsapp_ops_events(event_type,severity,conversation_id,ai_job_id,details)
      values('agent_core_pre_router_snapshot_failed','warning',new.conversation_id,new.id,jsonb_build_object('sqlstate',sqlstate,'pii_stored',false));
    exception when others then null;
    end;
  end;
  return new;
end
$$;

revoke all on function public.observe_agent_core_pre_router_state_v1() from public,anon,authenticated;
grant execute on function public.observe_agent_core_pre_router_state_v1() to service_role;

drop trigger if exists a0z_agent_core_pre_router_state_v1 on public.ai_jobs;
create trigger a0z_agent_core_pre_router_state_v1
before insert on public.ai_jobs
for each row execute function public.observe_agent_core_pre_router_state_v1();

insert into public.agent_core_router_inventory(table_name,trigger_name,function_name,phase,classification,retirement_state,precedence,notes,last_verified_at)
values('ai_jobs','a0z_agent_core_pre_router_state_v1','observe_agent_core_pre_router_state_v1','before','compatibility','keep',5,
       'Telemetria temporária sem PII para capturar estado estrutural antes dos routers legados em homologação; executa após release gate e antes do primeiro router comercial.',now())
on conflict(table_name,trigger_name) do update set
  function_name=excluded.function_name,phase=excluded.phase,classification=excluded.classification,
  retirement_state=excluded.retirement_state,precedence=excluded.precedence,notes=excluded.notes,last_verified_at=excluded.last_verified_at;

create or replace function public.get_agent_core_round4_pre_router_snapshot_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_trigger boolean:=false;
  v_after_release boolean:=false;
  v_before_first_commercial boolean:=false;
  v_pii_columns integer:=0;
  v_rows integer:=0;
begin
  select exists(
    select 1 from pg_trigger tg join pg_class c on c.oid=tg.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='ai_jobs' and tg.tgname='a0z_agent_core_pre_router_state_v1' and not tg.tgisinternal
  ) into v_trigger;

  v_after_release:='a0_whatsapp_release_gate_v1' < 'a0z_agent_core_pre_router_state_v1';
  v_before_first_commercial:='a0z_agent_core_pre_router_state_v1' < 'a1_whatsapp_simple_product_query_v1';

  select count(*)::integer into v_pii_columns
  from information_schema.columns
  where table_schema='public' and table_name='agent_core_pre_router_snapshots'
    and lower(column_name) ~ '(body|text|transcript|phone|telefone|email|cpf|cnpj|address|endereco|name|nome|customer_id)';

  select count(*)::integer into v_rows from public.agent_core_pre_router_snapshots;

  return jsonb_build_object(
    'version',1,
    'trigger_present',v_trigger,
    'runs_after_release_gate',v_after_release,
    'runs_before_first_commercial_router',v_before_first_commercial,
    'homologation_only',true,
    'fail_open',true,
    'pii_stored',false,
    'pii_like_columns',v_pii_columns,
    'snapshot_rows',v_rows,
    'ready',v_trigger and v_after_release and v_before_first_commercial and v_pii_columns=0
  );
end
$$;

revoke all on function public.get_agent_core_round4_pre_router_snapshot_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_pre_router_snapshot_readiness_v1() to service_role;

commit;