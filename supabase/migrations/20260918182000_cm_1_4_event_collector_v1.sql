-- CM-1.4 Event Collector v1
-- Evolui customer_behavior_events sem criar uma mega-tabela paralela.
-- Domain events continuam nas tabelas próprias e a timeline é o read model consolidado.

alter table public.customer_behavior_events
  add column if not exists source text,
  add column if not exists channel text,
  add column if not exists provider text,
  add column if not exists event_key text,
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists order_id uuid references public.orders(id) on delete set null,
  add column if not exists campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.customer_behavior_events
set source=coalesce(nullif(event_data->>'source',''),'legacy')
where source is null;

alter table public.customer_behavior_events
  alter column source set default 'system';

create unique index if not exists customer_behavior_events_source_key_uidx
  on public.customer_behavior_events(source,event_key)
  where event_key is not null;

create index if not exists customer_behavior_events_customer_time_v2_idx
  on public.customer_behavior_events(customer_id,occurred_at desc);

create index if not exists customer_behavior_events_product_time_idx
  on public.customer_behavior_events(product_id,occurred_at desc)
  where product_id is not null;

create index if not exists customer_behavior_events_order_time_idx
  on public.customer_behavior_events(order_id,occurred_at desc)
  where order_id is not null;

create or replace function public.record_customer_event_v1(
  p_customer_id uuid,
  p_conversation_id uuid,
  p_event_type text,
  p_source text,
  p_channel text default null,
  p_provider text default null,
  p_event_key text default null,
  p_product_id uuid default null,
  p_order_id uuid default null,
  p_campaign_id uuid default null,
  p_event_data jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_type text:=lower(btrim(coalesce(p_event_type,'')));
  v_source text:=lower(btrim(coalesce(p_source,'')));
  v_channel text:=nullif(lower(btrim(coalesce(p_channel,''))),'');
  v_provider text:=nullif(lower(btrim(coalesce(p_provider,''))),'');
  v_key text:=nullif(btrim(coalesce(p_event_key,'')),'');
  v_row public.customer_behavior_events%rowtype;
begin
  if p_customer_id is null then raise exception 'customer_id_required'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id) then raise exception 'customer_not_found'; end if;
  if v_type='' then raise exception 'event_type_required'; end if;
  if v_source='' then raise exception 'source_required'; end if;
  if length(v_type)>100 or length(v_source)>80 or length(coalesce(v_channel,''))>40 or length(coalesce(v_provider,''))>80 or length(coalesce(v_key,''))>240 then
    raise exception 'event_field_too_long';
  end if;

  if v_key is null then
    insert into public.customer_behavior_events(
      customer_id,conversation_id,event_type,event_data,occurred_at,
      source,channel,provider,event_key,product_id,order_id,campaign_id,metadata
    )
    values(
      p_customer_id,p_conversation_id,v_type,coalesce(p_event_data,'{}'::jsonb),coalesce(p_occurred_at,now()),
      v_source,v_channel,v_provider,null,p_product_id,p_order_id,p_campaign_id,coalesce(p_metadata,'{}'::jsonb)
    )
    returning * into v_row;
  else
    insert into public.customer_behavior_events(
      customer_id,conversation_id,event_type,event_data,occurred_at,
      source,channel,provider,event_key,product_id,order_id,campaign_id,metadata
    )
    values(
      p_customer_id,p_conversation_id,v_type,coalesce(p_event_data,'{}'::jsonb),coalesce(p_occurred_at,now()),
      v_source,v_channel,v_provider,v_key,p_product_id,p_order_id,p_campaign_id,coalesce(p_metadata,'{}'::jsonb)
    )
    on conflict(source,event_key) where event_key is not null
    do update set
      customer_id=excluded.customer_id,
      conversation_id=coalesce(excluded.conversation_id,public.customer_behavior_events.conversation_id),
      product_id=coalesce(excluded.product_id,public.customer_behavior_events.product_id),
      order_id=coalesce(excluded.order_id,public.customer_behavior_events.order_id),
      campaign_id=coalesce(excluded.campaign_id,public.customer_behavior_events.campaign_id),
      channel=coalesce(excluded.channel,public.customer_behavior_events.channel),
      provider=coalesce(excluded.provider,public.customer_behavior_events.provider),
      event_data=public.customer_behavior_events.event_data||excluded.event_data,
      metadata=public.customer_behavior_events.metadata||excluded.metadata
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'ok',true,
    'event_id',v_row.id,
    'event_type',v_row.event_type,
    'source',v_row.source,
    'event_key',v_row.event_key,
    'occurred_at',v_row.occurred_at
  );
end;
$function$;

revoke all on function public.record_customer_event_v1(uuid,uuid,text,text,text,text,text,uuid,uuid,uuid,jsonb,jsonb,timestamptz)
  from public,anon,authenticated;
grant execute on function public.record_customer_event_v1(uuid,uuid,text,text,text,text,text,uuid,uuid,uuid,jsonb,jsonb,timestamptz)
  to service_role;

create or replace view public.customer_timeline_v1
with (security_invoker=true)
as
select
  n.customer_id,
  n.conversation_id,
  n.occurred_at,
  n.channel,
  'message'::text as event_kind,
  n.direction,
  n.message_type as title,
  n.body_text,
  n.id::text as reference_id,
  jsonb_build_object(
    'source','normalized_channel_events',
    'source_detail',n.source,
    'referral',n.referral,
    'media_refs',n.media_refs,
    'processing_status',n.processing_status
  ) as metadata
from public.normalized_channel_events n

union all

select
  c.customer_id,
  m.conversation_id,
  m.created_at as occurred_at,
  c.channel,
  'message'::text as event_kind,
  m.direction,
  m.message_type as title,
  coalesce(m.body_text,m.transcript) as body_text,
  m.id::text as reference_id,
  jsonb_build_object(
    'source','legacy_messages',
    'delivery_status',m.delivery_status,
    'whatsapp_message_id',m.whatsapp_message_id
  ) as metadata
from public.messages m
join public.conversations c on c.id=m.conversation_id
where not exists(
  select 1 from public.normalized_channel_events n
  where n.conversation_id=m.conversation_id
    and m.whatsapp_message_id is not null
    and n.external_message_id=m.whatsapp_message_id
)

union all

select
  o.customer_id,
  o.conversation_id,
  coalesce(o.external_status_updated_at,o.confirmed_at,o.created_at) as occurred_at,
  coalesce(c.channel,'commerce'::text) as channel,
  'order'::text as event_kind,
  'system'::text as direction,
  o.status as title,
  null::text as body_text,
  o.id::text as reference_id,
  jsonb_build_object(
    'source','orders',
    'total',o.total,
    'currency',o.currency,
    'sync_status',o.sync_status,
    'delivered_at',o.delivered_at,
    'cancelled_at',o.cancelled_at,
    'returned_at',o.returned_at
  ) as metadata
from public.orders o
left join public.conversations c on c.id=o.conversation_id

union all

select
  h.customer_id,
  h.conversation_id,
  h.created_at as occurred_at,
  h.channel,
  'handoff'::text as event_kind,
  'system'::text as direction,
  h.reason as title,
  h.summary as body_text,
  h.id::text as reference_id,
  jsonb_build_object(
    'source','human_handoffs',
    'status',h.status,
    'priority',h.priority,
    'claimed_at',h.claimed_at,
    'resolved_at',h.resolved_at,
    'sla_due_at',h.sla_due_at
  ) as metadata
from public.human_handoffs h

union all

select
  r.customer_id,
  r.conversation_id,
  coalesce(r.sent_at,r.created_at) as occurred_at,
  r.channel,
  'operator_reply'::text as event_kind,
  'outbound'::text as direction,
  r.status as title,
  r.body_text,
  r.id::text as reference_id,
  jsonb_build_object(
    'source','operator_reply_jobs',
    'status',r.status,
    'blocked_reason',r.blocked_reason,
    'provider_message_id',r.provider_message_id,
    'admin_user_id',r.admin_user_id
  ) as metadata
from public.operator_reply_jobs r

union all

select
  b.customer_id,
  b.conversation_id,
  b.occurred_at,
  coalesce(b.channel,'behavior'::text) as channel,
  'behavior'::text as event_kind,
  'system'::text as direction,
  b.event_type as title,
  null::text as body_text,
  b.id::text as reference_id,
  jsonb_build_object(
    'source',coalesce(b.source,'legacy'),
    'provider',b.provider,
    'event_key',b.event_key,
    'product_id',b.product_id,
    'order_id',b.order_id,
    'campaign_id',b.campaign_id,
    'event_data',b.event_data,
    'metadata',b.metadata
  ) as metadata
from public.customer_behavior_events b

union all

select
  e.customer_id,
  s.conversation_id,
  e.occurred_at,
  'web'::text as channel,
  'catalog'::text as event_kind,
  'system'::text as direction,
  e.event_type as title,
  null::text as body_text,
  e.id::text as reference_id,
  jsonb_build_object(
    'source','catalog_events',
    'catalog_session_id',e.catalog_session_id,
    'product_id',e.product_id,
    'event_data',e.event_data
  ) as metadata
from public.catalog_events e
left join public.catalog_sessions s on s.id=e.catalog_session_id

union all

select
  e.customer_id,
  e.conversation_id,
  e.created_at as occurred_at,
  'web'::text as channel,
  'shopping_chat'::text as event_kind,
  'system'::text as direction,
  e.trigger as title,
  null::text as body_text,
  e.id::text as reference_id,
  jsonb_build_object(
    'source','shopping_chat_trigger_events',
    'catalog_session_id',e.catalog_session_id,
    'from_state',e.from_state,
    'to_state',e.to_state,
    'payload',e.payload
  ) as metadata
from public.shopping_chat_trigger_events e;
