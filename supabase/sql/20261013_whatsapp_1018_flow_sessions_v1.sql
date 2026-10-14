-- 1018 Flow session registry. Safe to stage; does not enable or send Flow.
begin;
create table if not exists private.whatsapp_1018_flow_sessions_v1 (
  id uuid primary key default gen_random_uuid(),
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id),
  customer_phone_e164 text not null check (customer_phone_e164 ~ '^\\+55[0-9]{10,11}$'),
  flow_id text not null check (length(flow_id) between 6 and 128),
  outbound_message_id text not null check (length(outbound_message_id) between 6 and 256),
  flow_token_sha256 text not null unique check (flow_token_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','consumed','expired','cancelled')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  inbound_message_id text unique,
  consumed_intent text check (consumed_intent in ('new_order','offers','existing_order','human')),
  consumed_at timestamptz,
  constraint flow_session_max_ttl check (expires_at > issued_at and expires_at <= issued_at + interval '30 minutes'),
  constraint flow_session_consumption_consistent check (
    (status='consumed' and inbound_message_id is not null and consumed_intent is not null and consumed_at is not null)
    or (status <> 'consumed' and inbound_message_id is null and consumed_intent is null and consumed_at is null)
  )
);
create index if not exists whatsapp_1018_flow_sessions_pending_idx
  on private.whatsapp_1018_flow_sessions_v1(whatsapp_account_id,customer_phone_e164,expires_at)
  where status='pending';
revoke all on private.whatsapp_1018_flow_sessions_v1 from public,anon,authenticated;
grant select,insert,update on private.whatsapp_1018_flow_sessions_v1 to service_role;
-- Mutations are exclusively through service-role RPCs, never anon/authenticated.
create or replace function public.ops2_1018_flow_session_register_v1(
 p_whatsapp_account_id uuid,p_customer_phone_e164 text,p_flow_id text,
 p_outbound_message_id text,p_token_sha256 text,p_ttl_seconds integer default 900
) returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare v_id uuid;
begin
 if auth.role() is distinct from 'service_role' then return jsonb_build_object('ok',false,'error','forbidden'); end if;
 if not exists(select 1 from public.whatsapp_accounts where id=p_whatsapp_account_id
   and slug='dona-antonia-1018' and phone_e164='+5565984491018')
 then return jsonb_build_object('ok',false,'error','not_1018'); end if;
 if p_customer_phone_e164 is null or p_customer_phone_e164 !~ '^\\+55[0-9]{10,11}$'
   or p_flow_id is null or length(p_flow_id) not between 6 and 128
   or p_outbound_message_id is null or length(p_outbound_message_id) not between 6 and 256
   or p_token_sha256 is null or p_token_sha256 !~ '^[0-9a-f]{64}$'
   or p_ttl_seconds is null or p_ttl_seconds not between 60 and 1800
 then return jsonb_build_object('ok',false,'error','invalid_input'); end if;
 insert into private.whatsapp_1018_flow_sessions_v1
 (whatsapp_account_id,customer_phone_e164,flow_id,outbound_message_id,flow_token_sha256,expires_at)
 values(p_whatsapp_account_id,p_customer_phone_e164,p_flow_id,p_outbound_message_id,p_token_sha256,
 now()+make_interval(secs=>p_ttl_seconds))
 returning id into v_id;
 return jsonb_build_object('ok',true,'session_id',v_id);
exception when unique_violation then
 return jsonb_build_object('ok',false,'error','duplicate_token');
end;$$;
create or replace function public.ops2_1018_flow_session_consume_v1(
 p_whatsapp_account_id uuid,p_customer_phone_e164 text,p_token_sha256 text,
 p_flow_id text,p_inbound_message_id text,p_intent text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare v_session private.whatsapp_1018_flow_sessions_v1%rowtype;
begin
 if auth.role() is distinct from 'service_role' then return jsonb_build_object('ok',false,'error','forbidden'); end if;
 if not exists(select 1 from public.whatsapp_accounts where id=p_whatsapp_account_id
   and slug='dona-antonia-1018' and phone_e164='+5565984491018')
 then return jsonb_build_object('ok',false,'error','not_1018'); end if;
 if p_token_sha256 is null or p_token_sha256 !~ '^[0-9a-f]{64}$'
   or p_inbound_message_id is null or length(p_inbound_message_id) not between 6 and 256
   or p_intent not in ('new_order','offers','existing_order','human')
 then return jsonb_build_object('ok',false,'error','invalid_input'); end if;
 select * into v_session from private.whatsapp_1018_flow_sessions_v1
 where flow_token_sha256=p_token_sha256 for update;
 if not found then return jsonb_build_object('ok',false,'error','session_not_found'); end if;
 if v_session.whatsapp_account_id<>p_whatsapp_account_id
    or v_session.customer_phone_e164 is distinct from p_customer_phone_e164
    or v_session.flow_id is distinct from p_flow_id
 then return jsonb_build_object('ok',false,'error','session_mismatch'); end if;
 if v_session.status='consumed' then
   if v_session.inbound_message_id=p_inbound_message_id and v_session.consumed_intent=p_intent
   then return jsonb_build_object('ok',true,'replayed',true,'session_id',v_session.id,'intent',v_session.consumed_intent); end if;
   return jsonb_build_object('ok',false,'error','session_already_consumed');
 end if;
 if v_session.status<>'pending' or now()>=v_session.expires_at
 then return jsonb_build_object('ok',false,'error','session_expired_or_cancelled'); end if;
 update private.whatsapp_1018_flow_sessions_v1
 set status='consumed',inbound_message_id=p_inbound_message_id,
     consumed_intent=p_intent,consumed_at=now()
 where id=v_session.id;
 return jsonb_build_object('ok',true,'replayed',false,'session_id',v_session.id,'intent',p_intent);
exception when unique_violation then
 return jsonb_build_object('ok',false,'error','inbound_already_consumed');
end;$$;
revoke all on function public.ops2_1018_flow_session_register_v1(uuid,text,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.ops2_1018_flow_session_consume_v1(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.ops2_1018_flow_session_register_v1(uuid,text,text,text,text,integer) to service_role;
grant execute on function public.ops2_1018_flow_session_consume_v1(uuid,text,text,text,text,text) to service_role;
commit;
