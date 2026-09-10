begin;

-- Fila assíncrona durável. O dispatcher fica inerte enquanto learning_write_enabled=false.
create extension if not exists pgmq;

do $$ begin
  if to_regclass('pgmq.q_agent_core_learning_v1') is null then
    perform pgmq.create('agent_core_learning_v1');
  end if;
end $$;

do $$ begin
  if not exists(select 1 from vault.decrypted_secrets where name='agent_core_learning_webhook_key_v1') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'agent_core_learning_webhook_key_v1');
  end if;
end $$;

create or replace function public.enqueue_agent_core_learning_v1(
  p_conversation_id uuid,p_last_message_id uuid,p_reason text default 'message',p_force boolean default false)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare cfg public.agent_core_runtime_config%rowtype; c public.conversations%rowtype; mid bigint;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.enabled then return jsonb_build_object('queued',false,'reason','agent_core_disabled'); end if;
  if not p_force and not cfg.learning_write_enabled then return jsonb_build_object('queued',false,'reason','learning_write_disabled'); end if;
  select * into c from public.conversations where id=p_conversation_id;
  if not found then return jsonb_build_object('queued',false,'reason','conversation_not_found'); end if;
  if c.human_required or exists(select 1 from public.human_handoffs h where h.conversation_id=c.id and h.status in ('open','claimed')) then
    return jsonb_build_object('queued',false,'reason','human_handoff_precedence');
  end if;
  if not p_force and c.mode<>'ai' then return jsonb_build_object('queued',false,'reason','conversation_not_ai'); end if;
  if p_last_message_id is not null and not exists(select 1 from public.messages m where m.id=p_last_message_id and m.conversation_id=p_conversation_id) then
    return jsonb_build_object('queued',false,'reason','message_mismatch');
  end if;
  select x into mid from pgmq.send('agent_core_learning_v1',jsonb_build_object('conversation_id',p_conversation_id,'last_message_id',p_last_message_id,'reason',left(coalesce(p_reason,'message'),60),'queued_at',now())) x limit 1;
  return jsonb_build_object('queued',true,'queue_message_id',mid);
end $$;

create or replace function public.claim_agent_core_learning_jobs_v1(p_limit integer default 4)
returns jsonb language sql security definer set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('msg_id',q.msg_id,'read_ct',q.read_ct,'enqueued_at',q.enqueued_at,'message',q.message) order by q.msg_id),'[]'::jsonb)
  from pgmq.read('agent_core_learning_v1',180,greatest(1,least(coalesce(p_limit,4),8))) q;
$$;

create or replace function public.archive_agent_core_learning_job_v1(p_msg_id bigint)
returns boolean language sql security definer set search_path=''
as $$ select pgmq.archive('agent_core_learning_v1',p_msg_id); $$;

create or replace function public.dispatch_agent_core_learning_worker_v1()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare cfg public.agent_core_runtime_config%rowtype; v_secret text; qlen bigint:=0; req bigint;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.learning_write_enabled then return jsonb_build_object('dispatched',false,'reason','learning_write_disabled'); end if;
  select queue_length into qlen from pgmq.metrics('agent_core_learning_v1');
  if coalesce(qlen,0)=0 then return jsonb_build_object('dispatched',false,'reason','queue_empty'); end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='agent_core_learning_webhook_key_v1' order by created_at desc limit 1;
  if v_secret is null then return jsonb_build_object('dispatched',false,'reason','worker_secret_missing'); end if;
  req:=net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/dona-antonia-agent-learning-v1',
    headers:=jsonb_build_object('Content-Type','application/json','x-da-learning-key',v_secret),
    body:=jsonb_build_object('event','drain','limit',4,'dry_run',false),timeout_milliseconds:=120000);
  return jsonb_build_object('dispatched',true,'request_id',req,'queue_length',qlen);
exception when others then
  return jsonb_build_object('dispatched',false,'reason','dispatch_failed');
end $$;

create or replace function public.dispatch_agent_core_learning_dry_run_v1(p_conversation_id uuid,p_message_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_secret text; req bigint;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='agent_core_learning_webhook_key_v1' order by created_at desc limit 1;
  if v_secret is null then return jsonb_build_object('dispatched',false,'reason','worker_secret_missing'); end if;
  req:=net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/dona-antonia-agent-learning-v1',
    headers:=jsonb_build_object('Content-Type','application/json','x-da-learning-key',v_secret),
    body:=jsonb_build_object('event','dry_run','conversation_id',p_conversation_id,'message_id',p_message_id,'dry_run',true),timeout_milliseconds:=120000);
  return jsonb_build_object('dispatched',true,'request_id',req);
end $$;

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
  if not exists(select 1 from pg_trigger where tgname='trg_agent_core_learning_message_v1' and tgrelid='public.messages'::regclass) then
    create trigger trg_agent_core_learning_message_v1 after insert on public.messages for each row execute function public.agent_core_learning_message_trigger_v1();
  end if;
end $$;

do $$ begin
  if not exists(select 1 from cron.job where jobname='agent-core-learning-v1') then
    perform cron.schedule('agent-core-learning-v1','*/5 * * * *','select public.dispatch_agent_core_learning_worker_v1();');
  end if;
end $$;

revoke execute on function public.enqueue_agent_core_learning_v1(uuid,uuid,text,boolean) from public,anon,authenticated;
revoke execute on function public.claim_agent_core_learning_jobs_v1(integer) from public,anon,authenticated;
revoke execute on function public.archive_agent_core_learning_job_v1(bigint) from public,anon,authenticated;
revoke execute on function public.dispatch_agent_core_learning_worker_v1() from public,anon,authenticated;
revoke execute on function public.dispatch_agent_core_learning_dry_run_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_agent_core_learning_v1(uuid,uuid,text,boolean) to service_role;
grant execute on function public.claim_agent_core_learning_jobs_v1(integer) to service_role;
grant execute on function public.archive_agent_core_learning_job_v1(bigint) to service_role;
grant execute on function public.dispatch_agent_core_learning_worker_v1() to service_role;
grant execute on function public.dispatch_agent_core_learning_dry_run_v1(uuid,uuid) to service_role;

commit;
