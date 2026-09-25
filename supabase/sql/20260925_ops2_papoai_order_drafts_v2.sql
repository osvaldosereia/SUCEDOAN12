-- Dona Antonia Operations 2.0
-- Versioned PapoAI order drafts with explicit-summary confirmation.
-- No AI interpretation lives in SQL; SQL only enforces deterministic state/version rules.

create table if not exists public.papoai_order_drafts_v2 (
  id uuid primary key default gen_random_uuid(),
  conversation_ref text not null,
  phone_e164 text not null,
  customer_id uuid references public.customers(id) on delete set null,
  revision integer not null default 1 check (revision>=1),
  status text not null default 'draft'
    check (status in ('draft','awaiting_confirmation','confirmed','cancelled','expired','review_required')),
  cart jsonb not null default '[]'::jsonb,
  payment_method text,
  customer_snapshot jsonb not null default '{}'::jsonb,
  delivery jsonb not null default '{}'::jsonb,
  quoted_total_cents bigint,
  summary_hash text,
  sent_message_id text,
  confirmed_message_id text,
  canonical_order_id uuid references public.orders(id) on delete restrict,
  last_source_event_key text,
  expires_at timestamptz not null default (now()+interval '2 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz
);

create unique index if not exists papoai_order_drafts_v2_one_active_conversation_uidx
  on public.papoai_order_drafts_v2(conversation_ref)
  where status in ('draft','awaiting_confirmation','review_required');

create index if not exists papoai_order_drafts_v2_phone_idx
  on public.papoai_order_drafts_v2(phone_e164,updated_at desc);

create index if not exists papoai_order_drafts_v2_status_idx
  on public.papoai_order_drafts_v2(status,updated_at desc);

create table if not exists public.papoai_draft_events_v2 (
  event_key text primary key,
  draft_id uuid not null references public.papoai_order_drafts_v2(id) on delete cascade,
  revision integer not null,
  event_type text not null default 'draft_update',
  created_at timestamptz not null default now()
);

alter table public.papoai_order_drafts_v2 enable row level security;
alter table public.papoai_draft_events_v2 enable row level security;

create or replace function public.papoai_upsert_order_draft_v2(
  p_conversation_ref text,
  p_phone text,
  p_cart jsonb,
  p_payment_method text,
  p_customer_snapshot jsonb default '{}'::jsonb,
  p_delivery jsonb default '{}'::jsonb,
  p_customer_id uuid default null,
  p_source_event_key text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_conversation text:=left(trim(coalesce(p_conversation_ref,'')),180);
  v_phone text;
  v_event text:=nullif(left(trim(coalesce(p_source_event_key,'')),220),'');
  v_existing_event public.papoai_draft_events_v2%rowtype;
  v_row public.papoai_order_drafts_v2%rowtype;
  v_revision integer;
begin
  if v_conversation='' then raise exception 'conversation_required'; end if;
  v_phone:=public.normalize_storefront_phone_v2(p_phone);
  if jsonb_typeof(coalesce(p_cart,'[]'::jsonb))<>'array' then raise exception 'invalid_cart'; end if;
  if jsonb_array_length(coalesce(p_cart,'[]'::jsonb))>80 then raise exception 'too_many_items'; end if;

  if v_event is not null then
    select * into v_existing_event
      from public.papoai_draft_events_v2
     where event_key=v_event;
    if found then
      select * into v_row from public.papoai_order_drafts_v2 where id=v_existing_event.draft_id;
      return jsonb_build_object(
        'ok',true,'duplicate',true,'draft_id',v_row.id,'revision',v_existing_event.revision,
        'status',v_row.status,'canonical_order_id',v_row.canonical_order_id
      );
    end if;
  end if;

  select * into v_row
    from public.papoai_order_drafts_v2
   where conversation_ref=v_conversation
     and status in ('draft','awaiting_confirmation','review_required')
   order by updated_at desc
   limit 1
   for update;

  if found and v_row.expires_at<=now() then
    update public.papoai_order_drafts_v2
       set status='expired',updated_at=now()
     where id=v_row.id;
    v_row:=null;
  end if;

  if v_row.id is null then
    insert into public.papoai_order_drafts_v2(
      conversation_ref,phone_e164,customer_id,revision,status,cart,payment_method,
      customer_snapshot,delivery,last_source_event_key,expires_at
    ) values(
      v_conversation,v_phone,p_customer_id,1,'draft',coalesce(p_cart,'[]'::jsonb),
      nullif(trim(coalesce(p_payment_method,'')),''),
      coalesce(p_customer_snapshot,'{}'::jsonb),coalesce(p_delivery,'{}'::jsonb),
      v_event,now()+interval '2 hours'
    )
    returning * into v_row;
  else
    v_revision:=v_row.revision+1;
    update public.papoai_order_drafts_v2
       set phone_e164=v_phone,
           customer_id=coalesce(p_customer_id,v_row.customer_id),
           revision=v_revision,
           status='draft',
           cart=coalesce(p_cart,'[]'::jsonb),
           payment_method=nullif(trim(coalesce(p_payment_method,'')),''),
           customer_snapshot=coalesce(p_customer_snapshot,'{}'::jsonb),
           delivery=coalesce(p_delivery,'{}'::jsonb),
           quoted_total_cents=null,
           summary_hash=null,
           sent_message_id=null,
           confirmed_message_id=null,
           last_source_event_key=v_event,
           expires_at=now()+interval '2 hours',
           updated_at=now()
     where id=v_row.id
     returning * into v_row;
  end if;

  if v_event is not null then
    insert into public.papoai_draft_events_v2(event_key,draft_id,revision,event_type)
    values(v_event,v_row.id,v_row.revision,'draft_update')
    on conflict(event_key) do nothing;
  end if;

  return jsonb_build_object(
    'ok',true,'duplicate',false,'draft_id',v_row.id,'revision',v_row.revision,
    'status',v_row.status,'expires_at',v_row.expires_at
  );
end;
$$;

create or replace function public.papoai_mark_draft_summary_v2(
  p_draft_id uuid,
  p_revision integer,
  p_summary_hash text,
  p_sent_message_id text,
  p_quoted_total_cents bigint
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_row public.papoai_order_drafts_v2%rowtype;
begin
  select * into v_row from public.papoai_order_drafts_v2 where id=p_draft_id for update;
  if not found then raise exception 'draft_not_found'; end if;
  if v_row.status not in ('draft','awaiting_confirmation') then raise exception 'draft_not_editable'; end if;
  if v_row.expires_at<=now() then
    update public.papoai_order_drafts_v2 set status='expired',updated_at=now() where id=p_draft_id;
    raise exception 'draft_expired';
  end if;
  if v_row.revision<>p_revision then raise exception 'draft_revision_mismatch'; end if;
  if coalesce(p_summary_hash,'') !~ '^[0-9a-fA-F]{64}$' then raise exception 'invalid_summary_hash'; end if;
  if p_quoted_total_cents is null or p_quoted_total_cents<0 then raise exception 'invalid_quote_total'; end if;

  update public.papoai_order_drafts_v2
     set status='awaiting_confirmation',
         summary_hash=lower(p_summary_hash),
         sent_message_id=nullif(left(trim(coalesce(p_sent_message_id,'')),180),''),
         quoted_total_cents=p_quoted_total_cents,
         updated_at=now()
   where id=p_draft_id
   returning * into v_row;

  return jsonb_build_object(
    'ok',true,'draft_id',v_row.id,'revision',v_row.revision,'status',v_row.status,
    'quoted_total_cents',v_row.quoted_total_cents,'expires_at',v_row.expires_at
  );
end;
$$;

create or replace function public.papoai_confirm_draft_v2(
  p_draft_id uuid,
  p_revision integer,
  p_summary_hash text,
  p_confirmed_message_id text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.papoai_order_drafts_v2%rowtype;
  v_created jsonb;
  v_order_id uuid;
begin
  select * into v_row from public.papoai_order_drafts_v2 where id=p_draft_id for update;
  if not found then raise exception 'draft_not_found'; end if;

  if v_row.status='confirmed' and v_row.canonical_order_id is not null then
    return jsonb_build_object(
      'ok',true,'duplicate',true,'draft_id',v_row.id,'revision',v_row.revision,
      'order_id',v_row.canonical_order_id,'status','confirmed'
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
    'papoai',
    v_row.phone_e164,
    v_row.payment_method,
    v_row.cart,
    v_row.customer_snapshot,
    v_row.delivery
  );
  v_order_id:=(v_created->>'order_id')::uuid;

  if coalesce((v_created->>'total_cents')::bigint,-1)<>v_row.quoted_total_cents then
    raise exception 'draft_quote_changed';
  end if;

  update public.papoai_order_drafts_v2
     set status='confirmed',
         canonical_order_id=v_order_id,
         confirmed_message_id=nullif(left(trim(coalesce(p_confirmed_message_id,'')),180),''),
         confirmed_at=now(),
         updated_at=now()
   where id=p_draft_id
   returning * into v_row;

  return v_created||jsonb_build_object(
    'ok',true,'duplicate',false,'draft_id',v_row.id,'revision',v_row.revision,
    'order_id',v_order_id,'status','confirmed'
  );
end;
$$;

create or replace function public.papoai_cancel_draft_v2(
  p_draft_id uuid,
  p_revision integer
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_row public.papoai_order_drafts_v2%rowtype;
begin
  select * into v_row from public.papoai_order_drafts_v2 where id=p_draft_id for update;
  if not found then raise exception 'draft_not_found'; end if;
  if v_row.status='cancelled' then
    return jsonb_build_object('ok',true,'duplicate',true,'draft_id',v_row.id,'revision',v_row.revision,'status','cancelled');
  end if;
  if v_row.status='confirmed' then raise exception 'confirmed_draft_cannot_cancel'; end if;
  if v_row.revision<>p_revision then raise exception 'draft_revision_mismatch'; end if;

  update public.papoai_order_drafts_v2
     set status='cancelled',cancelled_at=now(),updated_at=now()
   where id=p_draft_id
   returning * into v_row;

  return jsonb_build_object('ok',true,'duplicate',false,'draft_id',v_row.id,'revision',v_row.revision,'status','cancelled');
end;
$$;

revoke all on table public.papoai_order_drafts_v2 from public,anon,authenticated;
revoke all on table public.papoai_draft_events_v2 from public,anon,authenticated;
revoke all on function public.papoai_upsert_order_draft_v2(text,text,jsonb,text,jsonb,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.papoai_mark_draft_summary_v2(uuid,integer,text,text,bigint) from public,anon,authenticated;
revoke all on function public.papoai_confirm_draft_v2(uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.papoai_cancel_draft_v2(uuid,integer) from public,anon,authenticated;

grant execute on function public.papoai_upsert_order_draft_v2(text,text,jsonb,text,jsonb,jsonb,uuid,text) to service_role;
grant execute on function public.papoai_mark_draft_summary_v2(uuid,integer,text,text,bigint) to service_role;
grant execute on function public.papoai_confirm_draft_v2(uuid,integer,text,text) to service_role;
grant execute on function public.papoai_cancel_draft_v2(uuid,integer) to service_role;
