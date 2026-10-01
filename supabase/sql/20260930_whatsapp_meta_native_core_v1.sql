-- WhatsApp Meta Native V1 — canonical core
-- Safe initial state: PapoAI remains the live provider for 0975/1018.

create table if not exists public.whatsapp_channel_runtime_v1 (
  whatsapp_account_id uuid primary key references public.whatsapp_accounts(id) on delete cascade,
  inbound_provider text not null default 'papoai' check (inbound_provider in ('papoai','meta')),
  outbound_provider text not null default 'papoai' check (outbound_provider in ('papoai','meta','disabled')),
  capture_enabled boolean not null default true,
  send_enabled boolean not null default true,
  ana_enabled boolean not null default false,
  campaigns_enabled boolean not null default false,
  human_send_enabled boolean not null default false,
  homologated_at timestamptz,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.whatsapp_webhook_events_v1 (
  id uuid primary key default gen_random_uuid(),
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  provider text not null check (provider in ('papoai','meta')),
  provider_event_id text,
  event_type text not null,
  provider_message_id text,
  phone_e164 text,
  received_at timestamptz not null default now(),
  payload_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received','normalized','ignored','review_required','failed')),
  processed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  constraint whatsapp_webhook_events_provider_event_uidx unique(provider, whatsapp_account_id, provider_event_id)
);
create unique index if not exists whatsapp_webhook_events_payload_fallback_uidx
  on public.whatsapp_webhook_events_v1(provider, whatsapp_account_id, payload_hash)
  where provider_event_id is null;
create index if not exists whatsapp_webhook_events_account_received_idx
  on public.whatsapp_webhook_events_v1(whatsapp_account_id, received_at desc);
create index if not exists whatsapp_webhook_events_message_idx
  on public.whatsapp_webhook_events_v1(whatsapp_account_id, provider, provider_message_id)
  where provider_message_id is not null;

create table if not exists public.whatsapp_messages_v1 (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'unknown' check (message_type in ('text','audio','image','document','location','interactive','template','reaction','system','unknown')),
  provider text not null check (provider in ('papoai','meta')),
  provider_message_id text,
  provider_conversation_id text,
  reply_to_message_id uuid references public.whatsapp_messages_v1(id) on delete set null,
  text_body text,
  status_current text not null default 'queued' check (status_current in ('queued','sending','accepted','sent','delivered','read','failed','cancelled','received')),
  sender_kind text not null check (sender_kind in ('customer','ana_rule','ana_ai','human','automation','campaign','system')),
  sender_ref text,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint whatsapp_messages_provider_message_uidx unique(whatsapp_account_id, provider, provider_message_id)
);
create index if not exists whatsapp_messages_conversation_time_idx
  on public.whatsapp_messages_v1(conversation_id, coalesce(received_at,sent_at,created_at), id);
create index if not exists whatsapp_messages_customer_time_idx
  on public.whatsapp_messages_v1(customer_id, created_at desc)
  where customer_id is not null;
create index if not exists whatsapp_messages_outbound_status_idx
  on public.whatsapp_messages_v1(status_current, created_at)
  where direction='outbound';

create table if not exists public.whatsapp_message_status_events_v1 (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.whatsapp_messages_v1(id) on delete cascade,
  provider text not null check (provider in ('papoai','meta')),
  provider_message_id text,
  status text not null check (status in ('queued','sending','accepted','sent','delivered','read','failed','cancelled','received')),
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  error_code text,
  error_title text,
  error_detail text,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists whatsapp_message_status_events_dedupe_uidx
  on public.whatsapp_message_status_events_v1(message_id,status,occurred_at,coalesce(error_code,''));
create index if not exists whatsapp_message_status_events_message_idx
  on public.whatsapp_message_status_events_v1(message_id, occurred_at, received_at);

create table if not exists public.whatsapp_media_v1 (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.whatsapp_messages_v1(id) on delete cascade,
  provider_media_id text,
  media_type text not null check (media_type in ('audio','image','document','video','sticker','unknown')),
  mime_type text,
  file_size bigint,
  storage_bucket text,
  storage_path text,
  sha256 text,
  transcription text,
  transcription_status text not null default 'not_requested' check (transcription_status in ('not_requested','pending','processing','completed','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint whatsapp_media_message_provider_uidx unique(message_id,provider_media_id)
);

create table if not exists public.whatsapp_templates_v1 (
  id uuid primary key default gen_random_uuid(),
  whatsapp_account_id uuid references public.whatsapp_accounts(id) on delete cascade,
  waba_id text not null,
  meta_template_id text,
  name text not null,
  language text not null,
  category text,
  status text not null default 'LOCAL_DRAFT',
  components jsonb not null default '[]'::jsonb,
  quality_rating text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint whatsapp_templates_name_language_uidx unique(waba_id,name,language)
);
create unique index if not exists whatsapp_templates_meta_id_uidx
  on public.whatsapp_templates_v1(waba_id,meta_template_id)
  where meta_template_id is not null;

create table if not exists public.whatsapp_outbox_v1 (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  to_phone_e164 text not null,
  message_id uuid references public.whatsapp_messages_v1(id) on delete set null,
  purpose text not null,
  message_type text not null,
  template_id uuid references public.whatsapp_templates_v1(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  provider text not null check (provider in ('papoai','meta')),
  status text not null default 'queued' check (status in ('queued','claimed','sent','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists whatsapp_outbox_ready_idx
  on public.whatsapp_outbox_v1(status,available_at,created_at)
  where status='queued';

create table if not exists public.marketing_optout_events_v2 (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  phone_e164 text,
  whatsapp_message_id uuid references public.whatsapp_messages_v1(id) on delete set null,
  provider text not null check (provider in ('papoai','meta')),
  source_event_key text not null,
  reason_code text not null default 'customer_optout',
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint marketing_optout_events_v2_source_uidx unique(provider,source_event_key)
);
create index if not exists marketing_optout_events_v2_customer_idx
  on public.marketing_optout_events_v2(customer_id,occurred_at desc)
  where customer_id is not null;

-- Runtime starts on PapoAI. This intentionally preserves live capture and sending.
insert into public.whatsapp_channel_runtime_v1(
  whatsapp_account_id,inbound_provider,outbound_provider,capture_enabled,send_enabled,
  ana_enabled,campaigns_enabled,human_send_enabled,homologated_at,metadata
)
select a.id,'papoai','papoai',true,true,false,false,false,null,
       jsonb_build_object('meta_send_homologated',false,'bootstrap','whatsapp_meta_native_v1')
from public.whatsapp_accounts a
where a.slug in ('dona-antonia-0975','dona-antonia-1018')
on conflict (whatsapp_account_id) do nothing;

create or replace function public.whatsapp_resolve_conversation_v1(
  p_whatsapp_account_id uuid,
  p_phone_e164 text,
  p_customer_id uuid default null,
  p_source text default 'unknown'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_phone text := nullif(btrim(coalesce(p_phone_e164,'')),'');
  v_customer_id uuid := p_customer_id;
  v_conversation public.conversations%rowtype;
  v_source text := case when p_source in ('organic','meta_ad','campaign','catalog','website','unknown') then p_source else 'unknown' end;
begin
  if p_whatsapp_account_id is null or v_phone is null then
    return jsonb_build_object('ok',false,'error','account_and_phone_required');
  end if;
  if not exists(select 1 from public.whatsapp_accounts a where a.id=p_whatsapp_account_id and a.is_active=true) then
    return jsonb_build_object('ok',false,'error','account_not_found');
  end if;

  if v_customer_id is null then
    select l.customer_id into v_customer_id
    from public.lookup_customer_by_phone(v_phone) l
    limit 1;
  end if;

  select c.* into v_conversation
  from public.conversations c
  where c.whatsapp_account_id=p_whatsapp_account_id
    and c.wa_contact_e164=v_phone
    and c.status <> 'closed'
  order by c.updated_at desc,c.created_at desc
  limit 1
  for update;

  if found then
    if v_conversation.customer_id is null and v_customer_id is not null then
      update public.conversations
      set customer_id=v_customer_id,updated_at=now()
      where id=v_conversation.id;
      v_conversation.customer_id:=v_customer_id;
    end if;
    return jsonb_build_object('ok',true,'conversation_id',v_conversation.id,'customer_id',v_conversation.customer_id,'created',false);
  end if;

  insert into public.conversations(whatsapp_account_id,customer_id,wa_contact_e164,source,status,stage,channel,mode,updated_at)
  values(p_whatsapp_account_id,v_customer_id,v_phone,v_source,'open','new','whatsapp','ai',now())
  returning * into v_conversation;

  return jsonb_build_object('ok',true,'conversation_id',v_conversation.id,'customer_id',v_conversation.customer_id,'created',true);
end
$$;

create or replace function public.whatsapp_ingest_event_v1(
  p_whatsapp_account_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_provider_message_id text,
  p_phone_e164 text,
  p_received_at timestamptz,
  p_payload_hash text,
  p_payload jsonb,
  p_message jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_event_id uuid;
  v_duplicate boolean := false;
  v_conversation jsonb;
  v_message_id uuid;
  v_direction text;
  v_message_type text;
  v_sender_kind text;
  v_status text;
  v_customer_id uuid;
  v_provider_event_id text := nullif(btrim(coalesce(p_provider_event_id,'')),'');
begin
  if p_provider not in ('papoai','meta') then return jsonb_build_object('ok',false,'error','provider_invalid'); end if;
  if p_whatsapp_account_id is null or nullif(btrim(coalesce(p_payload_hash,'')),'') is null then
    return jsonb_build_object('ok',false,'error','account_and_payload_hash_required');
  end if;

  begin
    insert into public.whatsapp_webhook_events_v1(
      whatsapp_account_id,provider,provider_event_id,event_type,provider_message_id,phone_e164,
      received_at,payload_hash,payload,status,metadata
    ) values(
      p_whatsapp_account_id,p_provider,v_provider_event_id,coalesce(nullif(btrim(p_event_type),''),'unknown'),
      nullif(btrim(coalesce(p_provider_message_id,'')),''),nullif(btrim(coalesce(p_phone_e164,'')),''),coalesce(p_received_at,now()),
      p_payload_hash,coalesce(p_payload,'{}'::jsonb),'received','{}'::jsonb
    ) returning id into v_event_id;
  exception when unique_violation then
    v_duplicate:=true;
    select e.id into v_event_id
    from public.whatsapp_webhook_events_v1 e
    where e.provider=p_provider and e.whatsapp_account_id=p_whatsapp_account_id
      and ((v_provider_event_id is not null and e.provider_event_id=v_provider_event_id)
        or (v_provider_event_id is null and e.payload_hash=p_payload_hash))
    order by e.received_at desc limit 1;
  end;

  if p_message is null or v_duplicate then
    return jsonb_build_object('ok',true,'event_id',v_event_id,'duplicate',v_duplicate,'message_id',null);
  end if;

  v_direction:=coalesce(nullif(p_message->>'direction',''),'inbound');
  v_message_type:=coalesce(nullif(p_message->>'message_type',''),'unknown');
  v_sender_kind:=coalesce(nullif(p_message->>'sender_kind',''),case when v_direction='inbound' then 'customer' else 'system' end);
  v_status:=coalesce(nullif(p_message->>'status_current',''),case when v_direction='inbound' then 'received' else 'queued' end);

  v_conversation:=public.whatsapp_resolve_conversation_v1(
    p_whatsapp_account_id,p_phone_e164,
    nullif(p_message->>'customer_id','')::uuid,
    coalesce(nullif(p_message->>'source',''),'unknown')
  );
  if coalesce((v_conversation->>'ok')::boolean,false) is not true then
    update public.whatsapp_webhook_events_v1 set status='review_required',processed_at=now(),last_error='conversation_resolution_failed' where id=v_event_id;
    return jsonb_build_object('ok',false,'event_id',v_event_id,'error','conversation_resolution_failed','conversation',v_conversation);
  end if;
  v_customer_id:=nullif(v_conversation->>'customer_id','')::uuid;

  insert into public.whatsapp_messages_v1(
    conversation_id,whatsapp_account_id,customer_id,direction,message_type,provider,provider_message_id,
    provider_conversation_id,text_body,status_current,sender_kind,sender_ref,sent_at,received_at,metadata
  ) values(
    (v_conversation->>'conversation_id')::uuid,p_whatsapp_account_id,v_customer_id,v_direction,v_message_type,p_provider,
    nullif(btrim(coalesce(p_provider_message_id,'')),''),nullif(p_message->>'provider_conversation_id',''),p_message->>'text_body',v_status,
    v_sender_kind,nullif(p_message->>'sender_ref',''),
    case when v_direction='outbound' then coalesce((p_message->>'sent_at')::timestamptz,p_received_at,now()) else null end,
    case when v_direction='inbound' then coalesce((p_message->>'received_at')::timestamptz,p_received_at,now()) else null end,
    coalesce(p_message->'metadata','{}'::jsonb)
  )
  on conflict (whatsapp_account_id,provider,provider_message_id) do update
    set conversation_id=excluded.conversation_id,
        customer_id=coalesce(public.whatsapp_messages_v1.customer_id,excluded.customer_id),
        text_body=coalesce(public.whatsapp_messages_v1.text_body,excluded.text_body),
        metadata=public.whatsapp_messages_v1.metadata || excluded.metadata
  returning id into v_message_id;

  update public.whatsapp_webhook_events_v1 set status='normalized',processed_at=now(),last_error=null where id=v_event_id;
  update public.conversations
    set last_inbound_at=case when v_direction='inbound' then coalesce(p_received_at,now()) else last_inbound_at end,
        last_outbound_at=case when v_direction='outbound' then coalesce(p_received_at,now()) else last_outbound_at end,
        updated_at=now()
    where id=(v_conversation->>'conversation_id')::uuid;

  return jsonb_build_object('ok',true,'event_id',v_event_id,'duplicate',false,'message_id',v_message_id,'conversation_id',v_conversation->>'conversation_id');
end
$$;

create or replace function public.whatsapp_record_status_v1(
  p_whatsapp_account_id uuid,
  p_provider text,
  p_provider_message_id text,
  p_status text,
  p_occurred_at timestamptz default now(),
  p_received_at timestamptz default now(),
  p_error_code text default null,
  p_error_title text default null,
  p_error_detail text default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_message public.whatsapp_messages_v1%rowtype;
  v_current_status text;
  v_current_rank integer;
  v_new_rank integer;
  v_apply boolean := false;
  status_rank jsonb := '{"received":5,"queued":10,"sending":20,"accepted":30,"sent":40,"delivered":50,"read":60,"failed":90,"cancelled":90}'::jsonb;
begin
  if p_provider not in ('papoai','meta') or p_status not in ('queued','sending','accepted','sent','delivered','read','failed','cancelled','received') then
    return jsonb_build_object('ok',false,'error','provider_or_status_invalid');
  end if;

  select * into v_message
  from public.whatsapp_messages_v1
  where whatsapp_account_id=p_whatsapp_account_id and provider=p_provider and provider_message_id=p_provider_message_id
  limit 1 for update;
  if not found then return jsonb_build_object('ok',false,'error','message_not_found'); end if;

  insert into public.whatsapp_message_status_events_v1(
    message_id,provider,provider_message_id,status,occurred_at,received_at,error_code,error_title,error_detail,payload
  ) values(
    v_message.id,p_provider,p_provider_message_id,p_status,coalesce(p_occurred_at,now()),coalesce(p_received_at,now()),
    p_error_code,p_error_title,p_error_detail,coalesce(p_payload,'{}'::jsonb)
  ) on conflict do nothing;

  v_current_status:=v_message.status_current;
  v_current_rank:=coalesce((status_rank->>v_current_status)::integer,0);
  v_new_rank:=coalesce((status_rank->>p_status)::integer,0);

  v_apply:=case
    when v_current_status='read' then false
    when v_current_status='delivered' and p_status in ('queued','sending','accepted','sent','failed','cancelled','received') then false
    when v_current_status in ('failed','cancelled') then false
    when p_status in ('failed','cancelled') then true
    when v_new_rank >= v_current_rank then true
    else false
  end;

  if v_apply then
    update public.whatsapp_messages_v1 set status_current=p_status where id=v_message.id;
  end if;

  return jsonb_build_object('ok',true,'message_id',v_message.id,'status_current',case when v_apply then p_status else v_current_status end,'applied',v_apply);
end
$$;

create or replace function public.whatsapp_enqueue_outbound_v1(
  p_idempotency_key text,
  p_whatsapp_account_id uuid,
  p_conversation_id uuid,
  p_customer_id uuid,
  p_to_phone_e164 text,
  p_purpose text,
  p_message_type text,
  p_payload jsonb,
  p_sender_kind text default 'system',
  p_template_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_message_id uuid;
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_existing public.whatsapp_outbox_v1%rowtype;
begin
  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then return jsonb_build_object('ok',false,'error','idempotency_key_required'); end if;
  if p_conversation_id is null or nullif(btrim(coalesce(p_to_phone_e164,'')),'') is null then return jsonb_build_object('ok',false,'error','conversation_and_phone_required'); end if;
  select * into v_existing from public.whatsapp_outbox_v1 where idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('ok',true,'duplicate',true,'outbox_id',v_existing.id,'message_id',v_existing.message_id,'status',v_existing.status); end if;

  select * into v_runtime from public.whatsapp_channel_runtime_v1 where whatsapp_account_id=p_whatsapp_account_id;
  if not found or v_runtime.capture_enabled is not true then return jsonb_build_object('ok',false,'error','channel_runtime_unavailable'); end if;
  if v_runtime.outbound_provider='disabled' or v_runtime.send_enabled is not true then return jsonb_build_object('ok',false,'error','send_disabled'); end if;
  if v_runtime.outbound_provider='meta' and v_runtime.homologated_at is null then return jsonb_build_object('ok',false,'error','meta_not_homologated'); end if;

  insert into public.whatsapp_messages_v1(
    conversation_id,whatsapp_account_id,customer_id,direction,message_type,provider,text_body,status_current,sender_kind,created_at,metadata
  ) values(
    p_conversation_id,p_whatsapp_account_id,p_customer_id,'outbound',coalesce(nullif(p_message_type,''),'text'),v_runtime.outbound_provider,
    p_payload->>'text','queued',p_sender_kind,now(),jsonb_build_object('purpose',p_purpose,'idempotency_key',p_idempotency_key)
  ) returning id into v_message_id;

  insert into public.whatsapp_outbox_v1(
    idempotency_key,whatsapp_account_id,conversation_id,customer_id,to_phone_e164,message_id,purpose,message_type,template_id,payload,provider,status
  ) values(
    p_idempotency_key,p_whatsapp_account_id,p_conversation_id,p_customer_id,p_to_phone_e164,v_message_id,p_purpose,p_message_type,p_template_id,
    coalesce(p_payload,'{}'::jsonb),v_runtime.outbound_provider,'queued'
  ) returning * into v_outbox;

  insert into public.whatsapp_message_status_events_v1(message_id,provider,status,occurred_at,received_at,payload)
  values(v_message_id,v_runtime.outbound_provider,'queued',now(),now(),jsonb_build_object('source','outbox'));

  return jsonb_build_object('ok',true,'duplicate',false,'outbox_id',v_outbox.id,'message_id',v_message_id,'provider',v_runtime.outbound_provider,'status','queued');
end
$$;

-- RLS: server-side only in V1.
alter table public.whatsapp_channel_runtime_v1 enable row level security;
alter table public.whatsapp_webhook_events_v1 enable row level security;
alter table public.whatsapp_messages_v1 enable row level security;
alter table public.whatsapp_message_status_events_v1 enable row level security;
alter table public.whatsapp_media_v1 enable row level security;
alter table public.whatsapp_templates_v1 enable row level security;
alter table public.whatsapp_outbox_v1 enable row level security;
alter table public.marketing_optout_events_v2 enable row level security;

revoke all on table public.whatsapp_channel_runtime_v1 from anon, authenticated;
revoke all on table public.whatsapp_webhook_events_v1 from anon, authenticated;
revoke all on table public.whatsapp_messages_v1 from anon, authenticated;
revoke all on table public.whatsapp_message_status_events_v1 from anon, authenticated;
revoke all on table public.whatsapp_media_v1 from anon, authenticated;
revoke all on table public.whatsapp_templates_v1 from anon, authenticated;
revoke all on table public.whatsapp_outbox_v1 from anon, authenticated;
revoke all on table public.marketing_optout_events_v2 from anon, authenticated;

grant all on table public.whatsapp_channel_runtime_v1 to service_role;
grant all on table public.whatsapp_webhook_events_v1 to service_role;
grant all on table public.whatsapp_messages_v1 to service_role;
grant all on table public.whatsapp_message_status_events_v1 to service_role;
grant all on table public.whatsapp_media_v1 to service_role;
grant all on table public.whatsapp_templates_v1 to service_role;
grant all on table public.whatsapp_outbox_v1 to service_role;
grant all on table public.marketing_optout_events_v2 to service_role;

revoke all on function public.whatsapp_resolve_conversation_v1(uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function public.whatsapp_ingest_event_v1(uuid,text,text,text,text,text,timestamptz,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.whatsapp_record_status_v1(uuid,text,text,text,timestamptz,timestamptz,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.whatsapp_enqueue_outbound_v1(text,uuid,uuid,uuid,text,text,text,jsonb,text,uuid) from public, anon, authenticated;

grant execute on function public.whatsapp_resolve_conversation_v1(uuid,text,uuid,text) to service_role;
grant execute on function public.whatsapp_ingest_event_v1(uuid,text,text,text,text,text,timestamptz,text,jsonb,jsonb) to service_role;
grant execute on function public.whatsapp_record_status_v1(uuid,text,text,text,timestamptz,timestamptz,text,text,text,jsonb) to service_role;
grant execute on function public.whatsapp_enqueue_outbound_v1(text,uuid,uuid,uuid,text,text,text,jsonb,text,uuid) to service_role;
