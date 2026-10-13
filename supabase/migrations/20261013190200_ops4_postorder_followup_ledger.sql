-- Private two-stage WhatsApp follow-up ledger. Never replay a provider send after
-- an uncertain result. No historic orders are enqueued by this migration.
create table if not exists private.ops4_postorder_followups_v1 (
  order_id uuid primary key references public.orders(id) on delete cascade,
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id),
  phone_e164 text not null,
  channel text not null check(channel in ('0975','1018')),
  offer_status text not null default 'pending'
    check(offer_status in ('pending','sent','skipped','failed','uncertain')),
  offer_provider_message_id text,
  confirm_due_at timestamptz not null,
  confirm_status text not null default 'pending'
    check(confirm_status in ('pending','claimed','sent','failed','suppressed','confirmed','changes_requested','conflict')),
  confirm_nonce_hash text check(confirm_nonce_hash is null or confirm_nonce_hash~'^[a-f0-9]{64}$'),
  confirm_total numeric,
  confirm_order_updated_at timestamptz,
  confirm_provider_message_id text,
  reply_provider_message_id text,
  claimed_at timestamptz,
  sent_at timestamptz,
  expires_at timestamptz not null default (now()+interval '48 hours'),
  last_error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ops4_postorder_followups_due_v1
  on private.ops4_postorder_followups_v1(confirm_due_at,created_at)
  where confirm_status='pending';
alter table private.ops4_postorder_followups_v1 enable row level security;
revoke all on private.ops4_postorder_followups_v1 from public,anon,authenticated;
grant select,insert,update on private.ops4_postorder_followups_v1 to service_role;

create or replace function public.ops4_register_postorder_followup_v1(
 p_order_id uuid,p_whatsapp_account_id uuid,p_phone_e164 text,p_channel text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  o public.orders%rowtype;
  a public.whatsapp_accounts%rowtype;
  n integer;
begin
  if p_order_id is null or p_whatsapp_account_id is null or
    p_channel not in ('0975','1018') or
    p_phone_e164 !~ '^55[0-9]{10,11}$' then
    return jsonb_build_object('ok',false,'error','invalid_followup_request');
  end if;
  select * into o from public.orders where id=p_order_id;
  select * into a from public.whatsapp_accounts where id=p_whatsapp_account_id;
  if o.id is null or o.source not in ('vitrine','storefront_v2') or o.status<>'storefront_received'
    or a.id is null or a.is_active is not true
    or a.slug <> 'dona-antonia-'||p_channel
    or regexp_replace(coalesce(o.phone_e164,''),'\D','','g') <> p_phone_e164 then
    return jsonb_build_object('ok',false,'error','order_not_eligible');
  end if;
  if not exists(select 1 from private.order_customer_actions_v1 c where c.order_id=o.id
     and c.expires_at>now()) then
    return jsonb_build_object('ok',false,'error','customer_action_not_issued');
  end if;
  insert into private.ops4_postorder_followups_v1
    (order_id,whatsapp_account_id,phone_e164,channel,confirm_due_at)
  values (o.id,a.id,p_phone_e164,p_channel,greatest(now(),o.created_at+interval '20 minutes'))
  on conflict(order_id) do nothing;
  get diagnostics n=row_count;
  return jsonb_build_object('ok',true,'created',n=1,
    'order_id',o.id,'confirm_due_at',greatest(now(),o.created_at+interval '20 minutes'));
end;$$;
revoke all on function public.ops4_register_postorder_followup_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ops4_register_postorder_followup_v1(uuid,uuid,text,text) to service_role;

create or replace function public.ops4_offer_send_result_v1(
  p_order_id uuid,p_status text,p_provider_message_id text default null
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('sent','skipped','failed','uncertain') then return false; end if;
  update private.ops4_postorder_followups_v1
    set offer_status=p_status,offer_provider_message_id=p_provider_message_id,updated_at=now()
    where order_id=p_order_id and offer_status='pending';
  return found;
end;$$;
revoke all on function public.ops4_offer_send_result_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ops4_offer_send_result_v1(uuid,text,text) to service_role;

create or replace function public.ops4_claim_due_postorder_followups_v1(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb;
begin
  with candidate as (
    select f.order_id from private.ops4_postorder_followups_v1 f
    where f.confirm_status='pending' and f.confirm_due_at<=now()
      and f.attempts<2
    order by f.confirm_due_at,f.created_at
    limit greatest(1,least(coalesce(p_limit,10),15))
    for update skip locked
  ), updated as (
    update private.ops4_postorder_followups_v1 f
       set confirm_status='claimed',claimed_at=now(),attempts=attempts+1,updated_at=now()
    where f.order_id in (select order_id from candidate)
    returning f.order_id,f.whatsapp_account_id,f.phone_e164,f.channel,f.expires_at
  )
  select coalesce(jsonb_agg(to_jsonb(u)),'[]'::jsonb) into v_rows from updated u;
  return jsonb_build_object('ok',true,'items',v_rows);
end;$$;
revoke all on function public.ops4_claim_due_postorder_followups_v1(integer) from public,anon,authenticated;
grant execute on function public.ops4_claim_due_postorder_followups_v1(integer) to service_role;

create or replace function public.ops4_complete_postorder_confirm_send_v1(
  p_order_id uuid,p_status text,p_nonce_hash text default null,
  p_expected_total numeric default null,p_expected_updated_at timestamptz default null,
  p_provider_message_id text default null,p_error text default null
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('sent','failed','suppressed','pending') then return false; end if;
  if p_status='sent' and (p_nonce_hash !~ '^[0-9a-f]{64}$'
    or p_expected_total is null or p_expected_updated_at is null
    or nullif(p_provider_message_id,'') is null) then return false; end if;
  update private.ops4_postorder_followups_v1
  set confirm_status=p_status,confirm_nonce_hash=case when p_status='sent' then p_nonce_hash else null end,
      confirm_total=case when p_status='sent' then p_expected_total else null end,
      confirm_order_updated_at=case when p_status='sent' then p_expected_updated_at else null end,
      confirm_provider_message_id=case when p_status='sent' then p_provider_message_id else null end,
      sent_at=case when p_status='sent' then now() else null end,
      last_error=left(p_error,200),updated_at=now()
  where order_id=p_order_id and confirm_status='claimed';
  return found;
end;$$;
revoke all on function public.ops4_complete_postorder_confirm_send_v1(uuid,text,text,numeric,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.ops4_complete_postorder_confirm_send_v1(uuid,text,text,numeric,timestamptz,text,text) to service_role;

-- Apply only an explicit, structured Meta button payload tied to this account,
-- sender, most recently SENT template, nonce, and exact order price/version.
-- Never interpret a free-form "SIM" as an order confirmation.
create or replace function public.ops4_apply_postorder_quickreply_v1(
  p_order_id uuid,p_account_id uuid,p_phone_e164 text,p_action text,
  p_nonce_hash text,p_provider_message_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare f private.ops4_postorder_followups_v1%rowtype;
  v_token_hash text; v_result jsonb;
begin
  if p_action not in ('confirm','edit')
    or p_nonce_hash !~ '^[a-f0-9]{64}$'
    or nullif(btrim(coalesce(p_provider_message_id,'')),'') is null then
    return jsonb_build_object('ok',false,'error','invalid_reply');
  end if;
  select * into f from private.ops4_postorder_followups_v1
    where order_id=p_order_id for update;
  if not found or f.confirm_status<>'sent'
    or f.whatsapp_account_id is distinct from p_account_id
    or f.phone_e164 is distinct from p_phone_e164
    or f.confirm_nonce_hash is distinct from p_nonce_hash
    or f.sent_at is null or now()>f.expires_at then
    return jsonb_build_object('ok',false,'error','reply_not_applicable');
  end if;
  if p_action='edit' then
    update private.ops4_postorder_followups_v1
      set confirm_status='changes_requested',
          reply_provider_message_id=p_provider_message_id,updated_at=now()
      where order_id=p_order_id;
    return jsonb_build_object('ok',true,'action','edit','order_id',p_order_id);
  end if;
  select token_hash into v_token_hash from private.order_customer_actions_v1
    where order_id=p_order_id;
  if v_token_hash is null then
    return jsonb_build_object('ok',false,'error','customer_action_missing');
  end if;
  v_result:=public.ops3_confirm_customer_order_v1(
    v_token_hash,f.confirm_total,f.confirm_order_updated_at
  );
  if coalesce((v_result->>'ok')::boolean,false) is true then
    update private.ops4_postorder_followups_v1
      set confirm_status='confirmed',reply_provider_message_id=p_provider_message_id,
          updated_at=now() where order_id=p_order_id;
  elsif v_result->>'error' in ('order_changed','order_status_closed','session_expired') then
    update private.ops4_postorder_followups_v1
      set confirm_status='conflict',last_error=v_result->>'error',updated_at=now()
      where order_id=p_order_id;
  end if;
  return v_result||jsonb_build_object('action','confirm','order_id',p_order_id);
end;$$;
revoke all on function public.ops4_apply_postorder_quickreply_v1(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.ops4_apply_postorder_quickreply_v1(uuid,uuid,text,text,text,text) to service_role;
