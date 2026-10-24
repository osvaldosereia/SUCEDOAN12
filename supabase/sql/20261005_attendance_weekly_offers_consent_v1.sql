begin;

create table if not exists public.marketing_weekly_consent_requests_v1 (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  phone_e164 text not null,
  consent_scope text not null default 'weekly_offers_coupons' check (consent_scope='weekly_offers_coupons'),
  consent_text_version text not null default 'weekly_offers_coupons_v1',
  consent_text_snapshot text not null,
  frequency_label text not null default 'max_once_per_week',
  status text not null default 'prepared' check (status in ('prepared','sent','send_failed')),
  attempt_count integer not null default 1 check (attempt_count>=1),
  outbox_id uuid null references public.whatsapp_outbox_v1(id) on delete set null,
  provider_message_id text,
  asked_at timestamptz,
  decision text null check (decision is null or decision in ('opt_in','opt_out')),
  responded_at timestamptz,
  response_message_id uuid null references public.whatsapp_messages_v1(id) on delete set null,
  consent_event_id uuid null references public.marketing_consent_events_v1(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id,consent_scope)
);

create index if not exists marketing_weekly_consent_requests_conversation_idx
  on public.marketing_weekly_consent_requests_v1(conversation_id,created_at desc);

alter table public.marketing_weekly_consent_requests_v1 enable row level security;
revoke all on table public.marketing_weekly_consent_requests_v1 from public, anon, authenticated;
grant select,insert,update on table public.marketing_weekly_consent_requests_v1 to service_role;

create or replace function public.ops2_admin_attendance_weekly_consent_state_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_conversation public.conversations%rowtype;
  v_request public.marketing_weekly_consent_requests_v1%rowtype;
  v_event public.marketing_consent_events_v1%rowtype;
  v_window_open boolean:=false;
  v_state text:='never_asked';
begin
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','invalid_conversation_id'); end if;
  select * into v_conversation from public.conversations where id=p_conversation_id limit 1;
  if not found then return jsonb_build_object('ok',false,'error','conversation_not_found'); end if;
  v_window_open:=v_conversation.last_inbound_at is not null and now()<v_conversation.last_inbound_at+interval '24 hours';
  if v_conversation.customer_id is null then
    return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,'customer_linked',false,'consent_state','unlinked','can_ask',false,'service_window_open',v_window_open);
  end if;

  select e.* into v_event
  from public.marketing_consent_events_v1 e
  where e.customer_id=v_conversation.customer_id
    and coalesce(e.metadata->>'scope','')='weekly_offers_coupons'
  order by e.occurred_at desc,e.created_at desc,e.id desc
  limit 1;

  select r.* into v_request
  from public.marketing_weekly_consent_requests_v1 r
  where r.customer_id=v_conversation.customer_id and r.consent_scope='weekly_offers_coupons'
  order by r.created_at desc
  limit 1;

  if v_event.id is not null then v_state:=v_event.decision;
  elsif v_request.id is not null and v_request.status='sent' then v_state:='pending';
  elsif v_request.id is not null then v_state:=v_request.status;
  end if;

  return jsonb_build_object(
    'ok',true,'conversation_id',p_conversation_id,'customer_linked',true,
    'customer_id',v_conversation.customer_id,'consent_state',v_state,
    'service_window_open',v_window_open,
    'can_ask',v_window_open and v_event.id is null and (v_request.id is null or v_request.status='send_failed'),
    'request_id',v_request.id,'asked_at',v_request.asked_at,'responded_at',coalesce(v_event.occurred_at,v_request.responded_at),
    'consent_text_version',coalesce(v_event.consent_text_version,v_request.consent_text_version),
    'latest_event_id',v_event.id,'latest_source',v_event.source
  );
end;
$function$;

create or replace function public.ops2_admin_attendance_weekly_consent_prepare_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_conversation public.conversations%rowtype;
  v_request public.marketing_weekly_consent_requests_v1%rowtype;
  v_existing_event uuid;
  v_prompt constant text:='Quer receber ofertas e cupons da Dona Antônia pelo WhatsApp? Enviamos no máximo 1 vez por semana. Você pode cancelar quando quiser. Responda SIM, QUERO RECEBER ou AGORA NÃO.';
  v_phone text;
begin
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','invalid_conversation_id'); end if;
  perform pg_advisory_xact_lock(hashtextextended('weekly-consent:'||p_conversation_id::text,0));
  select * into v_conversation from public.conversations where id=p_conversation_id for update;
  if not found then return jsonb_build_object('ok',false,'error','conversation_not_found'); end if;
  if v_conversation.customer_id is null then return jsonb_build_object('ok',false,'error','customer_not_linked'); end if;
  if v_conversation.last_inbound_at is null or now()>=v_conversation.last_inbound_at+interval '24 hours' then
    return jsonb_build_object('ok',false,'error','service_window_closed');
  end if;

  select e.id into v_existing_event from public.marketing_consent_events_v1 e
  where e.customer_id=v_conversation.customer_id and coalesce(e.metadata->>'scope','')='weekly_offers_coupons'
  order by e.occurred_at desc,e.created_at desc limit 1;
  if v_existing_event is not null then return jsonb_build_object('ok',false,'error','weekly_consent_already_decided'); end if;

  select * into v_request from public.marketing_weekly_consent_requests_v1
  where customer_id=v_conversation.customer_id and consent_scope='weekly_offers_coupons'
  for update;

  if found and v_request.status='sent' then
    return jsonb_build_object('ok',false,'error','weekly_consent_already_requested','request_id',v_request.id);
  end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164);
  if v_phone is null then return jsonb_build_object('ok',false,'error','invalid_phone'); end if;

  if found then
    update public.marketing_weekly_consent_requests_v1
       set conversation_id=p_conversation_id,phone_e164=v_phone,status='prepared',attempt_count=attempt_count+1,
           outbox_id=null,provider_message_id=null,updated_at=now()
     where id=v_request.id
     returning * into v_request;
  else
    insert into public.marketing_weekly_consent_requests_v1(customer_id,conversation_id,phone_e164,consent_text_snapshot)
    values(v_conversation.customer_id,p_conversation_id,v_phone,v_prompt)
    returning * into v_request;
  end if;

  return jsonb_build_object('ok',true,'request_id',v_request.id,'attempt_count',v_request.attempt_count,'prompt',v_prompt,
    'consent_text_version',v_request.consent_text_version,'scope',v_request.consent_scope);
end;
$function$;

create or replace function public.ops2_admin_attendance_weekly_consent_mark_sent_v1(
  p_request_id uuid,p_outbox_id uuid,p_provider_message_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  update public.marketing_weekly_consent_requests_v1
     set status='sent',outbox_id=p_outbox_id,provider_message_id=nullif(btrim(coalesce(p_provider_message_id,'')),''),asked_at=coalesce(asked_at,now()),updated_at=now()
   where id=p_request_id and decision is null;
  if not found then return jsonb_build_object('ok',false,'error','weekly_consent_request_not_found'); end if;
  return jsonb_build_object('ok',true,'request_id',p_request_id,'status','sent');
end;
$function$;

create or replace function public.ops2_admin_attendance_weekly_consent_mark_failed_v1(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  update public.marketing_weekly_consent_requests_v1 set status='send_failed',updated_at=now() where id=p_request_id and decision is null;
  if not found then return jsonb_build_object('ok',false,'error','weekly_consent_request_not_found'); end if;
  return jsonb_build_object('ok',true,'request_id',p_request_id,'status','send_failed');
end;
$function$;

create or replace function public.marketing_capture_weekly_consent_message_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_customer_id uuid;
  v_request public.marketing_weekly_consent_requests_v1%rowtype;
  v_text text;
  v_decision text;
  v_record jsonb;
  v_event_id uuid;
begin
  if new.direction<>'inbound' or nullif(btrim(coalesce(new.text_body,'')),'') is null then return new; end if;
  v_text:=regexp_replace(translate(lower(btrim(new.text_body)),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'\s+',' ','g');
  select c.customer_id into v_customer_id from public.conversations c where c.id=new.conversation_id limit 1;
  if v_customer_id is null then return new; end if;

  if v_text in ('sair','parar','cancelar ofertas','nao enviar ofertas','nao quero ofertas') then
    v_record:=public.marketing_record_consent_v1(v_customer_id,'opt_out','attendance_weekly_offers_optout',new.conversation_id::text,
      'weekly_marketing_optout:'||new.id::text,'weekly_offers_coupons_v1',null,coalesce(new.received_at,new.created_at,now()),'customer_whatsapp',
      jsonb_build_object('scope','weekly_offers_coupons','frequency','max_once_per_week','response_message_id',new.id,'response_text',new.text_body));
    return new;
  end if;

  if v_text='sim, quero receber' then v_text:='sim quero receber'; end if;
  if v_text='agora não' then v_text:='agora nao'; end if;
  if v_text='sim quero receber' then v_decision:='opt_in';
  elsif v_text='agora nao' then v_decision:='opt_out';
  else return new;
  end if;

  select * into v_request from public.marketing_weekly_consent_requests_v1 r
  where r.customer_id=v_customer_id and r.consent_scope='weekly_offers_coupons' and r.status='sent' and r.decision is null
  order by r.asked_at desc nulls last,r.created_at desc limit 1 for update;
  if not found then return new; end if;

  v_record:=public.marketing_record_consent_v1(v_customer_id,v_decision,'attendance_weekly_offers_consent',v_request.id::text,
    'weekly_consent_response:'||new.id::text,v_request.consent_text_version,v_request.consent_text_snapshot,
    coalesce(new.received_at,new.created_at,now()),'customer_whatsapp',
    jsonb_build_object('scope','weekly_offers_coupons','frequency',v_request.frequency_label,'conversation_id',new.conversation_id,
      'request_id',v_request.id,'response_message_id',new.id,'response_text',new.text_body));

  if coalesce((v_record->>'ok')::boolean,false) is true then
    begin v_event_id:=nullif(v_record->>'event_id','')::uuid; exception when others then v_event_id:=null; end;
    update public.marketing_weekly_consent_requests_v1
       set decision=v_decision,responded_at=coalesce(new.received_at,new.created_at,now()),response_message_id=new.id,
           consent_event_id=v_event_id,updated_at=now()
     where id=v_request.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists marketing_capture_weekly_consent_message_v1 on public.whatsapp_messages_v1;
create trigger marketing_capture_weekly_consent_message_v1
after insert on public.whatsapp_messages_v1
for each row execute function public.marketing_capture_weekly_consent_message_v1();

create or replace function public.ops2_admin_attendance_weekly_consent_state_browser_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(false);
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  return public.ops2_admin_attendance_weekly_consent_state_v1(p_conversation_id);
end;
$function$;

revoke all on function public.ops2_admin_attendance_weekly_consent_state_v1(uuid) from public,anon,authenticated;
revoke all on function public.ops2_admin_attendance_weekly_consent_prepare_v1(uuid) from public,anon,authenticated;
revoke all on function public.ops2_admin_attendance_weekly_consent_mark_sent_v1(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.ops2_admin_attendance_weekly_consent_mark_failed_v1(uuid) from public,anon,authenticated;
revoke all on function public.marketing_capture_weekly_consent_message_v1() from public,anon,authenticated;
revoke all on function public.ops2_admin_attendance_weekly_consent_state_browser_v1(uuid) from public,anon;

grant execute on function public.ops2_admin_attendance_weekly_consent_state_v1(uuid) to service_role;
grant execute on function public.ops2_admin_attendance_weekly_consent_prepare_v1(uuid) to service_role;
grant execute on function public.ops2_admin_attendance_weekly_consent_mark_sent_v1(uuid,uuid,text) to service_role;
grant execute on function public.ops2_admin_attendance_weekly_consent_mark_failed_v1(uuid) to service_role;
grant execute on function public.ops2_admin_attendance_weekly_consent_state_browser_v1(uuid) to authenticated,service_role;

commit;
