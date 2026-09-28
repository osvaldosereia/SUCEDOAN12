-- Dona Antônia Operations 2.0 — R8 PapoAI/WhatsApp operational bridge
-- Applied to canonical Supabase on 2026-09-28.
-- Safe-by-default: free-text capture never creates an order and structured order commit stays disabled.

create table if not exists public.ops2_papoai_bridge_runtime_v1 (
  id smallint primary key default 1 check (id=1),
  structured_draft_enabled boolean not null default true,
  structured_order_commit_enabled boolean not null default false,
  identity_link_enabled boolean not null default true,
  identity_link_ttl_minutes integer not null default 120 check (identity_link_ttl_minutes between 5 and 1440),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
insert into public.ops2_papoai_bridge_runtime_v1(id) values(1) on conflict(id) do nothing;
alter table public.ops2_papoai_bridge_runtime_v1 enable row level security;
revoke all on table public.ops2_papoai_bridge_runtime_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.ops2_papoai_bridge_runtime_v1 to service_role;

alter table public.storefront_identity_tokens
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists source_event_key text;
create index if not exists storefront_identity_tokens_conversation_idx
  on public.storefront_identity_tokens(conversation_id,created_at desc) where conversation_id is not null;
create index if not exists storefront_identity_tokens_redeemed_phone_idx
  on public.storefront_identity_tokens(phone_e164,redeemed_at desc) where redeemed_at is not null;

create table if not exists public.papoai_customer_flow_events_v1 (
  event_key text primary key,
  phone_e164 text not null,
  customer_id uuid references public.customers(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_created boolean not null default false,
  orders_linked integer not null default 0,
  status text not null default 'processed' check (status in ('processed','review_required','failed')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.papoai_customer_flow_events_v1 enable row level security;
revoke all on table public.papoai_customer_flow_events_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.papoai_customer_flow_events_v1 to service_role;


-- ops2_issue_papoai_catalog_link_v1
CREATE OR REPLACE FUNCTION public.ops2_issue_papoai_catalog_link_v1(p_phone text, p_conversation_id uuid DEFAULT NULL::uuid, p_source_event_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_cfg public.ops2_papoai_bridge_runtime_v1%rowtype;
  v_phone text;
  v_digits text;
  v_customer_id uuid;
  v_conv public.conversations%rowtype;
  v_existing public.storefront_identity_tokens%rowtype;
  v_code text;
  v_hash text;
  v_exp timestamptz;
  v_try integer:=0;
begin
  select * into v_cfg from public.ops2_papoai_bridge_runtime_v1 where id=1;
  if not found or v_cfg.identity_link_enabled is not true then
    raise exception 'papoai_identity_link_disabled';
  end if;

  v_phone:=public.normalize_storefront_phone_v2(p_phone);
  v_digits:=regexp_replace(coalesce(v_phone,''),'\D','','g');
  if length(v_digits)<10 then raise exception 'invalid_phone'; end if;

  if p_conversation_id is not null then
    select * into v_conv from public.conversations where id=p_conversation_id;
    if not found then raise exception 'conversation_not_found'; end if;
    if regexp_replace(coalesce(v_conv.wa_contact_e164,''),'\D','','g')<>v_digits then
      raise exception 'conversation_phone_mismatch';
    end if;
  end if;

  select c.id into v_customer_id
  from public.customers c
  where regexp_replace(coalesce(c.primary_whatsapp_e164,''),'\D','','g')=v_digits
  limit 1;

  if v_customer_id is null then
    select cp.customer_id into v_customer_id
    from public.customer_phones cp
    where regexp_replace(coalesce(cp.phone_e164,''),'\D','','g')=v_digits
    order by cp.is_primary desc,cp.created_at asc
    limit 1;
  end if;

  if p_conversation_id is not null and v_conv.customer_id is not null then
    if v_customer_id is not null and v_customer_id<>v_conv.customer_id then
      raise exception 'conversation_customer_conflict';
    end if;
    v_customer_id:=v_conv.customer_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ops2:papoai:identity:'||v_digits,0));

  select * into v_existing
  from public.storefront_identity_tokens t
  where regexp_replace(coalesce(t.phone_e164,''),'\D','','g')=v_digits
    and t.redeemed_at is null
    and t.expires_at>now()
    and (p_conversation_id is null or t.conversation_id=p_conversation_id)
  order by t.created_at desc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'ok',true,'reused',true,'token_id',v_existing.id,'short_code',v_existing.short_code,
      'catalog_path','/catalogo_'||v_existing.short_code,
      'expires_at',v_existing.expires_at,'customer_linked',v_existing.customer_id is not null,
      'conversation_linked',v_existing.conversation_id is not null
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ops2:papoai:identity-code-pool',0));
  v_exp:=now()+make_interval(mins=>v_cfg.identity_link_ttl_minutes);

  loop
    v_try:=v_try+1;
    if v_try>60 then raise exception 'identity_code_pool_busy'; end if;
    v_code:=lpad((1000+floor(random()*9000)::integer)::text,4,'0');
    exit when not exists(
      select 1 from public.storefront_identity_tokens
      where short_code=v_code and redeemed_at is null and expires_at>now()
    );
  end loop;

  v_hash:=encode(digest(v_code,'sha256'),'hex');

  insert into public.storefront_identity_tokens(
    token_hash,phone_e164,contact_name,source,expires_at,use_count,short_code,
    conversation_id,customer_id,source_event_key
  ) values(
    v_hash,v_phone,null,'papoai',v_exp,0,v_code,
    p_conversation_id,v_customer_id,nullif(left(trim(coalesce(p_source_event_key,'')),220),'')
  )
  returning * into v_existing;

  return jsonb_build_object(
    'ok',true,'reused',false,'token_id',v_existing.id,'short_code',v_code,
    'catalog_path','/catalogo_'||v_code,'expires_at',v_exp,
    'customer_linked',v_customer_id is not null,'conversation_linked',p_conversation_id is not null
  );
end;
$function$


-- ops2_link_storefront_order_from_identity_v1
CREATE OR REPLACE FUNCTION public.ops2_link_storefront_order_from_identity_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_digits text;
  v_token public.storefront_identity_tokens%rowtype;
  v_matches integer:=0;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;

  if v_order.source<>'vitrine' then
    return jsonb_build_object('ok',true,'linked',false,'reason','order_source_not_vitrine');
  end if;

  if v_order.conversation_id is not null then
    return jsonb_build_object('ok',true,'linked',true,'idempotent_replay',true,
      'conversation_id',v_order.conversation_id,'customer_id',v_order.customer_id);
  end if;

  v_digits:=regexp_replace(coalesce(v_order.phone_e164,''),'\D','','g');
  if length(v_digits)<10 then
    return jsonb_build_object('ok',true,'linked',false,'reason','order_phone_missing');
  end if;

  select count(*) into v_matches
  from public.storefront_identity_tokens t
  where regexp_replace(coalesce(t.phone_e164,''),'\D','','g')=v_digits
    and t.redeemed_at is not null
    and t.redeemed_at>=v_order.created_at-interval '30 minutes'
    and t.redeemed_at<=v_order.created_at+interval '6 hours'
    and t.conversation_id is not null;

  if v_matches=0 then
    return jsonb_build_object('ok',true,'linked',false,'reason','no_redeemed_identity_link');
  end if;

  select * into v_token
  from public.storefront_identity_tokens t
  where regexp_replace(coalesce(t.phone_e164,''),'\D','','g')=v_digits
    and t.redeemed_at is not null
    and t.redeemed_at>=v_order.created_at-interval '30 minutes'
    and t.redeemed_at<=v_order.created_at+interval '6 hours'
    and t.conversation_id is not null
  order by t.redeemed_at desc
  limit 1;

  if exists(
    select 1 from public.storefront_identity_tokens t
    where regexp_replace(coalesce(t.phone_e164,''),'\D','','g')=v_digits
      and t.redeemed_at is not null
      and t.redeemed_at>=v_order.created_at-interval '30 minutes'
      and t.redeemed_at<=v_order.created_at+interval '6 hours'
      and t.conversation_id is not null
      and t.conversation_id<>v_token.conversation_id
  ) then
    return jsonb_build_object('ok',true,'linked',false,'reason','identity_conversation_ambiguous');
  end if;

  if not exists(
    select 1 from public.conversations c
    where c.id=v_token.conversation_id
      and regexp_replace(coalesce(c.wa_contact_e164,''),'\D','','g')=v_digits
  ) then
    return jsonb_build_object('ok',true,'linked',false,'reason','identity_conversation_phone_mismatch');
  end if;

  update public.orders
     set conversation_id=v_token.conversation_id,
         whatsapp_account_id=coalesce(whatsapp_account_id,(select c.whatsapp_account_id from public.conversations c where c.id=v_token.conversation_id)),
         customer_id=coalesce(customer_id,v_token.customer_id),
         checkout_snapshot=coalesce(checkout_snapshot,'{}'::jsonb)
           || jsonb_build_object(
             'papoai_identity_token_id',v_token.id,
             'papoai_identity_redeemed_at',v_token.redeemed_at,
             'papoai_conversation_linked',true
           ),
         updated_at=now()
   where id=p_order_id;

  return jsonb_build_object(
    'ok',true,'linked',true,'conversation_id',v_token.conversation_id,
    'customer_id',coalesce(v_order.customer_id,v_token.customer_id),
    'identity_token_id',v_token.id
  );
end;
$function$


-- ops2_apply_papoai_customer_flow_v1
CREATE OR REPLACE FUNCTION public.ops2_apply_papoai_customer_flow_v1(p_event_key text, p_phone text, p_name text, p_conversation_ref text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event text:=nullif(left(trim(coalesce(p_event_key,'')),220),'');
  v_phone text;
  v_digits text;
  v_name text:=nullif(left(trim(regexp_replace(coalesce(p_name,''),'\s+',' ','g')),180),'');
  v_existing public.papoai_customer_flow_events_v1%rowtype;
  v_customer_ids uuid[];
  v_customer_id uuid;
  v_created boolean:=false;
  v_conversation_id uuid;
  v_linked integer:=0;
  v_cutover timestamptz;
begin
  if v_event is null then raise exception 'flow_event_key_required'; end if;
  v_phone:=public.normalize_storefront_phone_v2(p_phone);
  v_digits:=regexp_replace(coalesce(v_phone,''),'\D','','g');
  if length(v_digits)<10 then raise exception 'invalid_phone'; end if;
  if v_name is null or length(v_name)<2 then raise exception 'customer_name_required'; end if;

  select * into v_existing from public.papoai_customer_flow_events_v1 where event_key=v_event;
  if found then
    return coalesce(v_existing.result,'{}'::jsonb)
      || jsonb_build_object('ok',v_existing.status='processed','duplicate',true,'event_key',v_event);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ops2:papoai:customer-flow:'||v_digits,0));

  select array_agg(distinct z.customer_id) into v_customer_ids
  from (
    select c.id customer_id from public.customers c
    where regexp_replace(coalesce(c.primary_whatsapp_e164,''),'\D','','g')=v_digits
    union
    select cp.customer_id from public.customer_phones cp
    where regexp_replace(coalesce(cp.phone_e164,''),'\D','','g')=v_digits
  ) z;

  if coalesce(array_length(v_customer_ids,1),0)>1 then
    insert into public.papoai_customer_flow_events_v1(event_key,phone_e164,status,result)
    values(v_event,v_phone,'review_required',
      jsonb_build_object('ok',false,'error','phone_identity_ambiguous','external_write',false));
    return jsonb_build_object('ok',false,'error','phone_identity_ambiguous','review_required',true,'external_write',false);
  end if;

  v_customer_id:=case when array_length(v_customer_ids,1)=1 then v_customer_ids[1] else null end;

  if v_customer_id is null then
    insert into public.customers(name,primary_whatsapp_e164,is_active,created_at,updated_at)
    values(v_name,v_phone,true,now(),now())
    returning id into v_customer_id;
    v_created:=true;
  else
    update public.customers
       set name=case when nullif(trim(name),'') is null then v_name else name end,
           primary_whatsapp_e164=coalesce(primary_whatsapp_e164,v_phone),
           is_active=true,updated_at=now()
     where id=v_customer_id;
  end if;

  insert into public.customer_phones(customer_id,phone_e164,source,is_primary,verified_at)
  values(v_customer_id,v_phone,'papoai_flow',true,now())
  on conflict(phone_e164) do update set
    verified_at=coalesce(public.customer_phones.verified_at,excluded.verified_at),
    source=case when public.customer_phones.source is null or public.customer_phones.source='' then excluded.source else public.customer_phones.source end;

  if nullif(trim(coalesce(p_conversation_ref,'')),'') is not null then
    begin
      if p_conversation_ref ~* '^[0-9a-f-]{36}$' then
        select id into v_conversation_id from public.conversations
        where id=p_conversation_ref::uuid
          and regexp_replace(coalesce(wa_contact_e164,''),'\D','','g')=v_digits
        limit 1;
      end if;
    exception when others then v_conversation_id:=null; end;

    if v_conversation_id is null then
      select id into v_conversation_id from public.conversations
      where referral->>'papoai_session_uid'=p_conversation_ref
        and regexp_replace(coalesce(wa_contact_e164,''),'\D','','g')=v_digits
      order by updated_at desc limit 1;
    end if;
  end if;

  if v_conversation_id is null then
    select id into v_conversation_id from public.conversations
    where regexp_replace(coalesce(wa_contact_e164,''),'\D','','g')=v_digits
      and status<>'closed'
    order by updated_at desc limit 1;
  end if;

  if v_conversation_id is not null then
    update public.conversations
       set customer_id=coalesce(customer_id,v_customer_id),updated_at=now()
     where id=v_conversation_id
       and (customer_id is null or customer_id=v_customer_id);
  end if;

  begin
    select nullif(metadata->>'ops2_live_cutover_at','')::timestamptz
      into v_cutover from public.bling_hub_runtime_v2 where id=1;
  exception when others then v_cutover:=null; end;
  v_cutover:=coalesce(v_cutover,'2026-09-28T14:44:46.627499Z'::timestamptz);

  update public.orders
     set customer_id=coalesce(customer_id,v_customer_id),
         conversation_id=coalesce(conversation_id,v_conversation_id),
         whatsapp_account_id=coalesce(whatsapp_account_id,
           (select c.whatsapp_account_id from public.conversations c where c.id=v_conversation_id)),
         customer_snapshot=coalesce(customer_snapshot,'{}'::jsonb)
           || jsonb_build_object('papoai_flow_customer_linked_at',now(),'papoai_flow_event_key',v_event),
         updated_at=now()
   where (customer_id is null or customer_id=v_customer_id)
     and created_at>=v_cutover
     and regexp_replace(coalesce(phone_e164,''),'\D','','g')=v_digits
     and source in ('vitrine','manual_whatsapp','papoai')
     and (conversation_id is null or conversation_id=v_conversation_id);
  get diagnostics v_linked=row_count;

  insert into public.papoai_customer_flow_events_v1(
    event_key,phone_e164,customer_id,conversation_id,customer_created,orders_linked,status,result
  ) values(
    v_event,v_phone,v_customer_id,v_conversation_id,v_created,v_linked,'processed',
    jsonb_build_object('ok',true,'customer_id',v_customer_id,'customer_created',v_created,
      'conversation_id',v_conversation_id,'orders_linked',v_linked,'external_order_created',false)
  );

  return jsonb_build_object(
    'ok',true,'duplicate',false,'event_key',v_event,'customer_id',v_customer_id,
    'customer_created',v_created,'conversation_id',v_conversation_id,'orders_linked',v_linked,
    'external_order_created',false
  );
end;
$function$


-- papoai_confirm_draft_v2
CREATE OR REPLACE FUNCTION public.papoai_confirm_draft_v2(p_draft_id uuid, p_revision integer, p_summary_hash text, p_confirmed_message_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.papoai_order_drafts_v2%rowtype;
  v_created jsonb;
  v_order_id uuid;
  v_commit_enabled boolean:=false;
begin
  select * into v_row from public.papoai_order_drafts_v2 where id=p_draft_id for update;
  if not found then raise exception 'draft_not_found'; end if;

  if v_row.status='confirmed' and v_row.canonical_order_id is not null then
    return jsonb_build_object(
      'ok',true,'duplicate',true,'draft_id',v_row.id,'revision',v_row.revision,
      'order_id',v_row.canonical_order_id,'status','confirmed'
    );
  end if;

  select structured_order_commit_enabled into v_commit_enabled
  from public.ops2_papoai_bridge_runtime_v1 where id=1;

  if coalesce(v_commit_enabled,false) is not true then
    return jsonb_build_object(
      'ok',false,'blocked',true,'error','papoai_structured_order_commit_not_homologated',
      'draft_id',v_row.id,'revision',v_row.revision,'status',v_row.status,
      'external_write',false
    );
  end if;

  if v_row.status<>'awaiting_confirmation' then raise exception 'draft_not_awaiting_confirmation'; end if;
  if v_row.expires_at<=now() then
    update public.papoai_order_drafts_v2 set status='expired',updated_at=now() where id=p_draft_id;
    raise exception 'draft_expired';
  end if;
  if v_row.revision<>p_revision then raise exception 'draft_revision_mismatch'; end if;
  if lower(coalesce(p_summary_hash,''))<>lower(coalesce(v_row.summary_hash,'')) then
    raise exception 'summary_hash_mismatch';
  end if;
  if v_row.quoted_total_cents is null then raise exception 'draft_quote_missing'; end if;

  v_created:=public.create_canonical_cart_order_v2(
    'papoai',v_row.phone_e164,v_row.payment_method,v_row.cart,v_row.customer_snapshot,v_row.delivery
  );
  v_order_id:=(v_created->>'order_id')::uuid;

  if coalesce((v_created->>'total_cents')::bigint,-1)<>v_row.quoted_total_cents then
    raise exception 'draft_quote_changed';
  end if;

  update public.orders
     set conversation_id=coalesce(conversation_id,(
           select c.id from public.conversations c
           where c.referral->>'papoai_session_uid'=v_row.conversation_ref
              or c.id::text=v_row.conversation_ref
           order by c.updated_at desc limit 1
         )),
         customer_id=coalesce(customer_id,v_row.customer_id),
         updated_at=now()
   where id=v_order_id;

  update public.papoai_order_drafts_v2
     set status='confirmed',canonical_order_id=v_order_id,
         confirmed_message_id=nullif(left(trim(coalesce(p_confirmed_message_id,'')),180),''),
         confirmed_at=now(),updated_at=now()
   where id=p_draft_id
   returning * into v_row;

  return v_created||jsonb_build_object(
    'ok',true,'duplicate',false,'draft_id',v_row.id,'revision',v_row.revision,
    'order_id',v_order_id,'status','confirmed'
  );
end;
$function$


-- get_ops2_papoai_bridge_health_v1
CREATE OR REPLACE FUNCTION public.get_ops2_papoai_bridge_health_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select jsonb_build_object(
  'generated_at',now(),
  'capture_enabled',(select capture_enabled from public.papoai_webhook_runtime_v2 where id=1),
  'last_seen_at',(select last_seen_at from public.papoai_webhook_runtime_v2 where id=1),
  'last_error',(select last_error from public.papoai_webhook_runtime_v2 where id=1),
  'events_total',(select count(*) from public.papoai_webhook_inbox_v2),
  'events_24h',(select count(*) from public.papoai_webhook_inbox_v2 where received_at>=now()-interval '24 hours'),
  'events_review',(select count(*) from public.papoai_webhook_inbox_v2 where status='review_required'),
  'events_customer_linked',(select count(*) from public.papoai_webhook_inbox_v2 where nullif(metadata->>'customer_id','') is not null),
  'events_conversation_linked',(select count(*) from public.papoai_webhook_inbox_v2 where nullif(metadata->>'conversation_id','') is not null),
  'flow_events_total',(select count(*) from public.papoai_customer_flow_events_v1),
  'flow_events_review',(select count(*) from public.papoai_customer_flow_events_v1 where status='review_required'),
  'flow_orders_linked',(select coalesce(sum(orders_linked),0) from public.papoai_customer_flow_events_v1 where status='processed'),
  'drafts_total',(select count(*) from public.papoai_order_drafts_v2),
  'drafts_active',(select count(*) from public.papoai_order_drafts_v2 where status in ('draft','awaiting_confirmation','review_required')),
  'orders_linked',(select count(*) from public.papoai_order_drafts_v2 where canonical_order_id is not null),
  'identity_tokens_total',(select count(*) from public.storefront_identity_tokens where source='papoai'),
  'identity_tokens_active',(select count(*) from public.storefront_identity_tokens where source='papoai' and redeemed_at is null and expires_at>now()),
  'identity_tokens_redeemed',(select count(*) from public.storefront_identity_tokens where source='papoai' and redeemed_at is not null),
  'identity_order_links',(select count(*) from public.orders where coalesce((checkout_snapshot->>'papoai_conversation_linked')::boolean,false)=true),
  'structured_draft_enabled',(select structured_draft_enabled from public.ops2_papoai_bridge_runtime_v1 where id=1),
  'structured_order_commit_enabled',(select structured_order_commit_enabled from public.ops2_papoai_bridge_runtime_v1 where id=1),
  'identity_link_enabled',(select identity_link_enabled from public.ops2_papoai_bridge_runtime_v1 where id=1),
  'last_identity_link',(
    select jsonb_build_object(
      'created_at',t.created_at,'expires_at',t.expires_at,'redeemed_at',t.redeemed_at,
      'short_code',t.short_code,'catalog_path','/catalogo_'||t.short_code,
      'conversation_linked',t.conversation_id is not null,'customer_linked',t.customer_id is not null
    )
    from public.storefront_identity_tokens t
    where t.source='papoai'
    order by t.created_at desc limit 1
  ),
  'last_flow',(
    select jsonb_build_object(
      'created_at',f.created_at,'status',f.status,'customer_created',f.customer_created,
      'customer_linked',f.customer_id is not null,'conversation_linked',f.conversation_id is not null,
      'orders_linked',f.orders_linked
    )
    from public.papoai_customer_flow_events_v1 f
    order by f.created_at desc limit 1
  )
);
$function$


revoke all on function public.ops2_issue_papoai_catalog_link_v1(text,uuid,text) from public,anon,authenticated;
grant execute on function public.ops2_issue_papoai_catalog_link_v1(text,uuid,text) to service_role;
revoke all on function public.ops2_link_storefront_order_from_identity_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_link_storefront_order_from_identity_v1(uuid) to service_role;
revoke all on function public.ops2_apply_papoai_customer_flow_v1(text,text,text,text) from public,anon,authenticated;
grant execute on function public.ops2_apply_papoai_customer_flow_v1(text,text,text,text) to service_role;
revoke all on function public.papoai_confirm_draft_v2(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.papoai_confirm_draft_v2(uuid,integer,text,text) to service_role;
revoke all on function public.get_ops2_papoai_bridge_health_v1() from public,anon,authenticated;
grant execute on function public.get_ops2_papoai_bridge_health_v1() to service_role;
