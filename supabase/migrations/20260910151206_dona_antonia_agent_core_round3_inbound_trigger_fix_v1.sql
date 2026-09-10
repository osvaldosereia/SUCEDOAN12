begin;

-- Corrige o contrato real de messages.direction para inbound.
create or replace function public.agent_core_learning_message_trigger_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
declare cfg public.agent_core_runtime_config%rowtype;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.learning_write_enabled then return new; end if;
  if new.direction='inbound' and coalesce(nullif(new.transcript,''),nullif(new.body_text,''),'')<>'' then
    perform public.enqueue_agent_core_learning_v1(new.conversation_id,new.id,'inbound_message',false);
  end if;
  return new;
exception when others then
  insert into public.whatsapp_ops_events(event_type,severity,conversation_id,details)
  values('agent_core_learning_enqueue_failed','warning',new.conversation_id,jsonb_build_object('non_blocking',true));
  return new;
end $$;

do $$ begin
  if exists(select 1 from pg_trigger where tgname='trg_agent_core_learning_message_v1' and tgrelid='public.messages'::regclass) then
    drop trigger trg_agent_core_learning_message_v1 on public.messages;
  end if;
  create trigger trg_agent_core_learning_message_v1
    after insert on public.messages
    for each row execute function public.agent_core_learning_message_trigger_v1();
end $$;

commit;
