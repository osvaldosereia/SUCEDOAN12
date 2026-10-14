-- Isolated 1018 Flow outbox. No triggers, jobs, outbound HTTP or live activation.
begin;
create table if not exists private.whatsapp_1018_flow_outbox_v1(
 id uuid primary key default gen_random_uuid(),
 whatsapp_account_id uuid not null references public.whatsapp_accounts(id),
 customer_phone_e164 text not null check(customer_phone_e164 ~ '^[+]55[0-9]{10,11}$'),
 flow_id text not null,
 flow_token_sha256 text not null unique check(flow_token_sha256 ~ '^[0-9a-f]{64}$'),
 release_generation bigint not null check(release_generation>0),
 state text not null default 'reserved' check(state in ('reserved','sent','uncertain','cancelled')),
 outbound_message_id text unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null,
 constraint outbox_wamid_state check(state <> 'sent' or outbound_message_id is not null)
);
create index if not exists whatsapp_1018_flow_outbox_state_idx on private.whatsapp_1018_flow_outbox_v1(state,created_at);
revoke all on private.whatsapp_1018_flow_outbox_v1 from public,anon,authenticated;
grant select,insert,update on private.whatsapp_1018_flow_outbox_v1 to service_role;
create or replace function public.ops2_1018_flow_outbox_reserve_v1(
 p_account uuid,p_customer text,p_flow text,p_hash text,p_generation bigint
) returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare v_generation bigint;v_id uuid;
begin
 if auth.role() is distinct from 'service_role' then return jsonb_build_object('ok',false,'error','forbidden');end if;
 if not exists(select 1 from public.whatsapp_accounts where id=p_account and slug='dona-antonia-1018' and phone_e164='+5565984491018')
 then return jsonb_build_object('ok',false,'error','not_1018');end if;
 if p_customer is null or p_customer !~ '^[+]55[0-9]{10,11}$'
 or p_flow is null or length(p_flow) not between 6 and 128
 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
 or p_generation is null or p_generation<=0
 then return jsonb_build_object('ok',false,'error','invalid_input');end if;
 select generation into v_generation from private.whatsapp_ana_channel_release_v1
 where whatsapp_account_id=p_account and mode='pilot' for share;
 if not found or v_generation<>p_generation then return jsonb_build_object('ok',false,'error','pilot_inactive');end if;
 insert into private.whatsapp_1018_flow_outbox_v1
 (whatsapp_account_id,customer_phone_e164,flow_id,flow_token_sha256,release_generation,expires_at)
 values(p_account,p_customer,p_flow,p_hash,p_generation,now()+interval '15 minutes') returning id into v_id;
 return jsonb_build_object('ok',true,'outbox_id',v_id);
exception when unique_violation then return jsonb_build_object('ok',false,'error','duplicate_token');
end;$$;
create or replace function public.ops2_1018_flow_outbox_finalize_v1(
 p_id uuid,p_state text,p_wamid text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare v_row private.whatsapp_1018_flow_outbox_v1%rowtype;v_generation bigint;v_session jsonb;
begin
 if auth.role() is distinct from 'service_role' then return jsonb_build_object('ok',false,'error','forbidden');end if;
 if p_state not in ('sent','uncertain','cancelled') or p_state is null
 or (p_state='sent' and (p_wamid is null or p_wamid !~ '^wamid[.][A-Za-z0-9._:-]{6,240}$'))
 then return jsonb_build_object('ok',false,'error','invalid_input');end if;
 select * into v_row from private.whatsapp_1018_flow_outbox_v1 where id=p_id for update;
 if not found then return jsonb_build_object('ok',false,'error','not_found');end if;
 if v_row.state='sent' and p_state='sent' and v_row.outbound_message_id=p_wamid
 then return jsonb_build_object('ok',true,'replayed',true,'outbox_id',p_id);end if;
 if v_row.state<>'reserved' and not (v_row.state='uncertain' and p_state='sent')
 then return jsonb_build_object('ok',false,'error','already_finalized');end if;
 if p_state='sent' then
  select generation into v_generation from private.whatsapp_ana_channel_release_v1
  where whatsapp_account_id=v_row.whatsapp_account_id and mode='pilot' for share;
  if not found or v_generation<>v_row.release_generation or now()>=v_row.expires_at
  then return jsonb_build_object('ok',false,'error','pilot_changed_or_expired');end if;
  v_session:=public.ops2_1018_flow_session_register_v1(
   v_row.whatsapp_account_id,v_row.customer_phone_e164,v_row.flow_id,
   p_wamid,v_row.flow_token_sha256,v_row.release_generation,
   greatest(60,least(900,extract(epoch from v_row.expires_at-now())::integer)));
  if v_session->>'ok'<>'true' then return jsonb_build_object('ok',false,'error','session_registration_failed');end if;
 end if;
 update private.whatsapp_1018_flow_outbox_v1 set state=p_state,outbound_message_id=case when p_state='sent' then p_wamid else null end,
 updated_at=now() where id=p_id;
 return jsonb_build_object('ok',true,'replayed',false,'outbox_id',p_id,'session_id',v_session->>'session_id');
exception when unique_violation then return jsonb_build_object('ok',false,'error','duplicate_wamid');
end;$$;
revoke all on function public.ops2_1018_flow_outbox_reserve_v1(uuid,text,text,text,bigint) from public,anon,authenticated;
revoke all on function public.ops2_1018_flow_outbox_finalize_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ops2_1018_flow_outbox_reserve_v1(uuid,text,text,text,bigint) to service_role;
grant execute on function public.ops2_1018_flow_outbox_finalize_v1(uuid,text,text) to service_role;
commit;
