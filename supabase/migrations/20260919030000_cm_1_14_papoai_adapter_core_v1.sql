-- CM-1.14 PapoAI Adapter v1
-- Provider-specific parsing stays at the edge. Core receives only canonical channel events.

create table if not exists public.channel_provider_adapters (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  channel text not null,
  channel_account_id uuid not null references public.channel_accounts(id) on delete cascade,
  status text not null default 'temporary_active' check(status in ('temporary_active','observe','paused','retired')),
  inbound_mode text not null default 'active' check(inbound_mode in ('active','observe','disabled')),
  outbound_mode text not null default 'disabled' check(outbound_mode in ('disabled','manual','active')),
  tag_read_state text not null default 'unknown' check(tag_read_state in ('unknown','observed_webhook','verified_api','unsupported')),
  tag_write_state text not null default 'unknown' check(tag_write_state in ('unknown','verified_api','unsupported')),
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_key,channel,channel_account_id),
  check(jsonb_typeof(capabilities)='object'),
  check(jsonb_typeof(metadata)='object')
);

create table if not exists public.channel_provider_contact_states (
  id uuid primary key default gen_random_uuid(),
  adapter_id uuid not null references public.channel_provider_adapters(id) on delete cascade,
  provider_key text not null,
  channel text not null,
  channel_account_id uuid not null references public.channel_accounts(id) on delete cascade,
  external_contact_id text,
  external_user_id text not null,
  phone_e164 text,
  display_name text,
  customer_id uuid references public.customers(id) on delete set null,
  channel_identity_id uuid references public.customer_channel_identities(id) on delete set null,
  tags text[] not null default '{}'::text[],
  provider_context jsonb not null default '{}'::jsonb,
  last_event_at timestamptz,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_key,channel_account_id,external_user_id),
  check(jsonb_typeof(provider_context)='object')
);

create table if not exists public.channel_provider_event_receipts (
  id uuid primary key default gen_random_uuid(),
  adapter_id uuid not null references public.channel_provider_adapters(id) on delete cascade,
  provider_key text not null,
  channel text not null,
  channel_account_id uuid not null references public.channel_accounts(id) on delete cascade,
  provider_event_key text not null,
  external_user_id text not null,
  external_message_id text,
  external_event_id text,
  normalized_event_id uuid references public.normalized_channel_events(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  processing_status text not null default 'normalized' check(processing_status in ('normalized','duplicate','held','ignored','error')),
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  unique(provider_key,channel_account_id,provider_event_key),
  check(jsonb_typeof(context)='object')
);

create index if not exists channel_provider_contact_states_customer_idx
  on public.channel_provider_contact_states(customer_id,updated_at desc) where customer_id is not null;
create index if not exists channel_provider_event_receipts_time_idx
  on public.channel_provider_event_receipts(channel_account_id,received_at desc);

alter table public.channel_provider_adapters enable row level security;
alter table public.channel_provider_contact_states enable row level security;
alter table public.channel_provider_event_receipts enable row level security;
revoke all on table public.channel_provider_adapters from public,anon,authenticated;
revoke all on table public.channel_provider_contact_states from public,anon,authenticated;
revoke all on table public.channel_provider_event_receipts from public,anon,authenticated;
grant select,insert,update,delete on table public.channel_provider_adapters to service_role;
grant select,insert,update,delete on table public.channel_provider_contact_states to service_role;
grant select,insert,update,delete on table public.channel_provider_event_receipts to service_role;

insert into public.channel_provider_adapters(
  provider_key,channel,channel_account_id,status,inbound_mode,outbound_mode,
  tag_read_state,tag_write_state,capabilities,metadata,updated_at
)
select
  'papoai','whatsapp',ca.id,'temporary_active','active','disabled','unknown','unknown',
  jsonb_build_object(
    'normalized_event_ingest',true,'identity_resolution',true,'shopping_handoff',true,
    'tags_read_verified',false,'tags_write_verified',false
  ),
  jsonb_build_object(
    'temporary_adapter',true,'replacement_target','meta_direct',
    'adapter_version','cm1.14-v1','business_logic_dependency',false
  ),
  now()
from public.channel_accounts ca
where ca.channel='whatsapp' and ca.status='active'
on conflict(provider_key,channel,channel_account_id) do update set
  status='temporary_active',inbound_mode='active',outbound_mode='disabled',
  capabilities=public.channel_provider_adapters.capabilities||excluded.capabilities,
  metadata=public.channel_provider_adapters.metadata||excluded.metadata,updated_at=now();

create or replace function public.ingest_channel_adapter_event_v1(
  p_provider_key text,
  p_channel text,
  p_channel_account_id uuid,
  p_whatsapp_account_id uuid default null,
  p_external_user_id text default null,
  p_external_contact_id text default null,
  p_phone text default null,
  p_display_name text default null,
  p_external_message_id text default null,
  p_external_event_id text default null,
  p_direction text default 'inbound',
  p_message_type text default 'unknown',
  p_body_text text default null,
  p_media_refs jsonb default '[]'::jsonb,
  p_tags text[] default '{}'::text[],
  p_provider_context jsonb default '{}'::jsonb,
  p_referral jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_provider text:=lower(btrim(coalesce(p_provider_key,'')));
  v_channel text:=lower(btrim(coalesce(p_channel,'')));
  v_external text:=btrim(coalesce(p_external_user_id,''));
  v_contact text:=nullif(btrim(coalesce(p_external_contact_id,'')),'');
  v_phone text:=public.canonical_phone_br(p_phone);
  v_direction text:=lower(btrim(coalesce(p_direction,'inbound')));
  v_type text:=lower(btrim(coalesce(p_message_type,'unknown')));
  v_at timestamptz:=coalesce(p_occurred_at,now());
  v_message_id text:=nullif(btrim(coalesce(p_external_message_id,'')),'');
  v_event_id text:=nullif(btrim(coalesce(p_external_event_id,'')),'');
  v_event_key text;
  v_adapter public.channel_provider_adapters%rowtype;
  v_resolution jsonb;
  v_identity jsonb;
  v_customer_id uuid;
  v_conversation_id uuid;
  v_normalized_event_id uuid;
  v_duplicate boolean:=false;
  v_referral jsonb;
  v_context jsonb;
begin
  if v_provider='' or v_provider !~ '^[a-z0-9_]{2,50}$' then raise exception 'provider_key_invalid'; end if;
  if v_channel not in ('whatsapp','instagram','messenger','web','email') then raise exception 'channel_invalid'; end if;
  if p_channel_account_id is null then raise exception 'channel_account_required'; end if;
  if not exists(select 1 from public.channel_accounts where id=p_channel_account_id and channel=v_channel) then raise exception 'channel_account_not_found'; end if;
  if v_external='' then v_external:=coalesce(v_phone,v_contact,''); end if;
  if v_external='' then raise exception 'external_user_id_required'; end if;
  if v_direction not in ('inbound','outbound','system') then raise exception 'direction_invalid'; end if;
  if v_type not in ('text','image','audio','video','document','location','reaction','post','comment','button','quick_reply','card','carousel','unknown') then v_type:='unknown'; end if;
  if jsonb_typeof(coalesce(p_media_refs,'null'::jsonb))<>'array' then raise exception 'media_refs_must_be_array'; end if;
  if jsonb_typeof(coalesce(p_provider_context,'null'::jsonb))<>'object' then raise exception 'provider_context_must_be_object'; end if;
  if jsonb_typeof(coalesce(p_referral,'null'::jsonb))<>'object' then raise exception 'referral_must_be_object'; end if;

  select * into v_adapter
  from public.channel_provider_adapters
  where provider_key=v_provider and channel=v_channel and channel_account_id=p_channel_account_id
  for update;
  if not found then raise exception 'provider_adapter_not_registered'; end if;
  if v_adapter.status in ('paused','retired') or v_adapter.inbound_mode='disabled' then
    return jsonb_build_object('ok',true,'ignored',true,'reason','provider_adapter_disabled','provider_key',v_provider,'external_side_effect',false);
  end if;

  if v_message_id is null and v_event_id is null then
    v_event_id:='adapter_'||encode(extensions.digest(
      concat_ws('|',v_provider,v_channel,p_channel_account_id::text,v_external,v_direction,v_type,v_at::text,coalesce(p_body_text,'')),
      'sha256'
    ),'hex');
  end if;
  v_event_key:=coalesce(v_message_id,v_event_id);

  select r.normalized_event_id,r.conversation_id,r.customer_id
    into v_normalized_event_id,v_conversation_id,v_customer_id
  from public.channel_provider_event_receipts r
  where r.provider_key=v_provider and r.channel_account_id=p_channel_account_id and r.provider_event_key=v_event_key;
  if found then
    return jsonb_build_object(
      'ok',true,'duplicate',true,'provider_key',v_provider,'normalized_event_id',v_normalized_event_id,
      'conversation_id',v_conversation_id,'customer_id',v_customer_id,'external_side_effect',false
    );
  end if;

  v_resolution:=public.resolve_customer_identity_v1(
    p_phone=>v_phone,p_channel=>v_channel,p_channel_account_id=>p_channel_account_id,
    p_external_user_id=>v_external,p_source=>'channel_adapter:'||v_provider,p_persist=>true
  );
  if coalesce(v_resolution->>'decision','')='matched' then
    v_customer_id:=nullif(v_resolution->>'customer_id','')::uuid;
  end if;

  v_identity:=public.observe_customer_channel_identity_v1(
    p_channel=>v_channel,p_channel_account_id=>p_channel_account_id,p_external_user_id=>v_external,
    p_identity_kind=>case when v_channel='whatsapp' and v_phone is not null then 'e164' else 'other' end,
    p_source=>'channel_adapter:'||v_provider,
    p_evidence=>jsonb_build_object(
      'provider_key',v_provider,'external_contact_id',v_contact,
      'resolution_decision',v_resolution->>'decision',
      'resolution_confidence',coalesce((v_resolution->>'confidence')::numeric,0),
      'adapter_version','cm1.14-v1'
    )
  );

  if v_channel='whatsapp' then
    if p_whatsapp_account_id is null or not exists(select 1 from public.whatsapp_accounts where id=p_whatsapp_account_id and is_active=true) then
      raise exception 'whatsapp_account_required';
    end if;

    select c.id into v_conversation_id
    from public.conversations c
    where c.whatsapp_account_id=p_whatsapp_account_id
      and public.normalize_phone_digits(c.wa_contact_e164)=public.normalize_phone_digits(coalesce(v_phone,v_external))
      and c.status<>'closed'
    order by c.updated_at desc limit 1;

    v_referral:=coalesce(p_referral,'{}'::jsonb)||jsonb_build_object(
      'provider_adapter',v_provider,'external_contact_id',v_contact,'adapter_version','cm1.14-v1'
    );

    if v_conversation_id is null then
      insert into public.conversations(
        whatsapp_account_id,customer_id,wa_contact_e164,source,status,stage,response_preference,
        human_required,referral,context_summary,opened_at,last_inbound_at,last_outbound_at,
        service_window_expires_at,mode,channel,channel_account_id,external_user_id
      )
      values(
        p_whatsapp_account_id,v_customer_id,coalesce(v_phone,v_external),'organic','open','new','auto',
        false,v_referral,'Contato recebido por adapter de canal',v_at,
        case when v_direction='inbound' then v_at else null end,
        case when v_direction='outbound' then v_at else null end,
        case when v_direction='inbound' then v_at+interval '24 hours' else null end,
        'human','whatsapp',p_channel_account_id,v_external
      )
      returning id into v_conversation_id;
    else
      update public.conversations
      set customer_id=coalesce(customer_id,v_customer_id),
          channel_account_id=coalesce(channel_account_id,p_channel_account_id),
          external_user_id=coalesce(external_user_id,v_external),
          referral=coalesce(referral,'{}'::jsonb)||v_referral,
          last_inbound_at=case when v_direction='inbound' then greatest(coalesce(last_inbound_at,v_at),v_at) else last_inbound_at end,
          last_outbound_at=case when v_direction='outbound' then greatest(coalesce(last_outbound_at,v_at),v_at) else last_outbound_at end,
          service_window_expires_at=case when v_direction='inbound' then greatest(coalesce(service_window_expires_at,v_at),v_at+interval '24 hours') else service_window_expires_at end,
          status=case when v_direction='inbound' and status='waiting_customer' then 'open' else status end,
          updated_at=now()
      where id=v_conversation_id;
    end if;
  end if;

  v_context:=jsonb_build_object(
    'provider_adapter',v_provider,'adapter_version','cm1.14-v1','external_contact_id',v_contact,
    'identity_decision',v_resolution->>'decision',
    'identity_confidence',coalesce((v_resolution->>'confidence')::numeric,0),
    'channel_identity_id',v_identity->>'identity_id',
    'tags_observed',coalesce(cardinality(p_tags),0)>0
  )||coalesce(p_provider_context,'{}'::jsonb);

  begin
    insert into public.normalized_channel_events(
      channel,channel_account_id,external_user_id,external_message_id,external_event_id,
      direction,message_type,reply_to_external_message_id,source,referral,occurred_at,raw_event_id,
      conversation_id,customer_id,body_text,media_refs,context,processing_status
    )
    values(
      v_channel,p_channel_account_id,v_external,v_message_id,v_event_id,
      v_direction,v_type,null,'channel_adapter',coalesce(p_referral,'{}'::jsonb),v_at,null,
      v_conversation_id,v_customer_id,nullif(p_body_text,''),coalesce(p_media_refs,'[]'::jsonb),v_context,'normalized'
    )
    returning id into v_normalized_event_id;
  exception when unique_violation then
    v_duplicate:=true;
    select n.id into v_normalized_event_id
    from public.normalized_channel_events n
    where n.channel=v_channel and n.channel_account_id=p_channel_account_id and n.direction=v_direction
      and ((v_message_id is not null and n.external_message_id=v_message_id) or (v_event_id is not null and n.external_event_id=v_event_id))
    order by n.created_at desc limit 1;
  end;

  insert into public.channel_provider_contact_states(
    adapter_id,provider_key,channel,channel_account_id,external_contact_id,external_user_id,
    phone_e164,display_name,customer_id,channel_identity_id,tags,provider_context,last_event_at,updated_at
  )
  values(
    v_adapter.id,v_provider,v_channel,p_channel_account_id,v_contact,v_external,v_phone,
    nullif(btrim(coalesce(p_display_name,'')),''),v_customer_id,nullif(v_identity->>'identity_id','')::uuid,
    coalesce(p_tags,'{}'::text[]),coalesce(p_provider_context,'{}'::jsonb),v_at,now()
  )
  on conflict(provider_key,channel_account_id,external_user_id) do update set
    external_contact_id=coalesce(excluded.external_contact_id,public.channel_provider_contact_states.external_contact_id),
    phone_e164=coalesce(excluded.phone_e164,public.channel_provider_contact_states.phone_e164),
    display_name=coalesce(excluded.display_name,public.channel_provider_contact_states.display_name),
    customer_id=coalesce(excluded.customer_id,public.channel_provider_contact_states.customer_id),
    channel_identity_id=coalesce(excluded.channel_identity_id,public.channel_provider_contact_states.channel_identity_id),
    tags=case when cardinality(excluded.tags)>0 then excluded.tags else public.channel_provider_contact_states.tags end,
    provider_context=public.channel_provider_contact_states.provider_context||excluded.provider_context,
    last_event_at=greatest(coalesce(public.channel_provider_contact_states.last_event_at,excluded.last_event_at),excluded.last_event_at),
    updated_at=now();

  if coalesce(cardinality(p_tags),0)>0 then
    update public.channel_provider_adapters
    set tag_read_state=case when tag_read_state='unknown' then 'observed_webhook' else tag_read_state end,
        capabilities=capabilities||jsonb_build_object('tags_observed_in_webhook',true),
        last_event_at=v_at,updated_at=now()
    where id=v_adapter.id;
  else
    update public.channel_provider_adapters set last_event_at=v_at,updated_at=now() where id=v_adapter.id;
  end if;

  insert into public.channel_provider_event_receipts(
    adapter_id,provider_key,channel,channel_account_id,provider_event_key,external_user_id,
    external_message_id,external_event_id,normalized_event_id,conversation_id,customer_id,
    processing_status,context,occurred_at
  )
  values(
    v_adapter.id,v_provider,v_channel,p_channel_account_id,v_event_key,v_external,
    v_message_id,v_event_id,v_normalized_event_id,v_conversation_id,v_customer_id,
    case when v_duplicate then 'duplicate' else 'normalized' end,
    jsonb_build_object(
      'identity_decision',v_resolution->>'decision',
      'identity_confidence',coalesce((v_resolution->>'confidence')::numeric,0),
      'tags_count',coalesce(cardinality(p_tags),0),'external_side_effect',false
    ),v_at
  )
  on conflict(provider_key,channel_account_id,provider_event_key) do nothing;

  return jsonb_build_object(
    'ok',true,'duplicate',v_duplicate,'provider_key',v_provider,'adapter_id',v_adapter.id,
    'normalized_event_id',v_normalized_event_id,'conversation_id',v_conversation_id,'customer_id',v_customer_id,
    'identity_resolution',v_resolution,'channel_identity_id',v_identity->>'identity_id',
    'tags_observed',coalesce(cardinality(p_tags),0)>0,'external_side_effect',false,'adapter_version','cm1.14-v1'
  );
end;
$fn$;

revoke all on function public.ingest_channel_adapter_event_v1(
  text,text,uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb,text[],jsonb,jsonb,timestamptz
) from public,anon,authenticated;
grant execute on function public.ingest_channel_adapter_event_v1(
  text,text,uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb,text[],jsonb,jsonb,timestamptz
) to service_role;

create or replace function public.channel_provider_adapter_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $fn$
select jsonb_build_object(
  'version','cm1.14-v1',
  'adapters',coalesce((
    select jsonb_agg(jsonb_build_object(
      'provider_key',a.provider_key,'channel',a.channel,'status',a.status,
      'inbound_mode',a.inbound_mode,'outbound_mode',a.outbound_mode,
      'tag_read_state',a.tag_read_state,'tag_write_state',a.tag_write_state,
      'last_event_at',a.last_event_at,'capabilities',a.capabilities
    ) order by a.provider_key,a.channel)
    from public.channel_provider_adapters a
  ),'[]'::jsonb),
  'contacts',(select count(*) from public.channel_provider_contact_states),
  'events_24h',(select count(*) from public.channel_provider_event_receipts where received_at>=now()-interval '24 hours'),
  'external_side_effect',false
)
$fn$;

revoke all on function public.channel_provider_adapter_summary_v1() from public,anon,authenticated;
grant execute on function public.channel_provider_adapter_summary_v1() to service_role;
