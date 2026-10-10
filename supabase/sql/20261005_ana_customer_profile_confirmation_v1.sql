-- ANA própria — pedidos de confirmação cadastral com escopo e expiração.
-- Esta migração não envia mensagens nem grava dados canônicos do cliente.

create table if not exists public.customer_profile_confirmation_requests_v1 (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  suggestion_ids uuid[] not null check (cardinality(suggestion_ids) between 1 and 8),
  confirmation_summary jsonb not null default '[]'::jsonb check (jsonb_typeof(confirmation_summary)='array'),
  status text not null default 'pending' check (status in ('pending','confirmed','corrected','expired','cancelled')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 minutes'),
  outbound_message_id uuid references public.whatsapp_messages_v1(id) on delete set null,
  confirmation_inbound_message_id uuid references public.whatsapp_messages_v1(id) on delete set null,
  created_by_admin_user_id uuid,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_profile_confirmation_one_pending_per_conversation_v1
  on public.customer_profile_confirmation_requests_v1(conversation_id)
  where status='pending';

create index if not exists customer_profile_confirmation_recent_v1
  on public.customer_profile_confirmation_requests_v1(conversation_id,requested_at desc);

alter table public.customer_profile_confirmation_requests_v1 enable row level security;
revoke all on table public.customer_profile_confirmation_requests_v1 from public,anon,authenticated;
grant all on table public.customer_profile_confirmation_requests_v1 to service_role;

create or replace function public.ops2_ana_customer_confirmation_create_v1(
  p_conversation_id uuid,
  p_suggestion_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(true);
  v_conversation public.conversations%rowtype;
  v_resolution jsonb;
  v_customer_id uuid;
  v_ids uuid[];
  v_count integer;
  v_customer_mismatch integer;
  v_existing public.customer_profile_confirmation_requests_v1%rowtype;
  v_request public.customer_profile_confirmation_requests_v1%rowtype;
  v_summary jsonb;
  v_user_id uuid:=auth.uid();
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','invalid_conversation_id'); end if;
  if coalesce(cardinality(p_suggestion_ids),0) not between 1 and 8 or array_position(p_suggestion_ids,null) is not null then
    return jsonb_build_object('ok',false,'error','suggestions_required');
  end if;

  select array_agg(distinct suggestion_id order by suggestion_id) into v_ids
  from unnest(p_suggestion_ids) as ids(suggestion_id);
  if cardinality(v_ids)<>cardinality(p_suggestion_ids) then return jsonb_build_object('ok',false,'error','duplicate_suggestion_ids'); end if;

  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,0));
  select * into v_conversation from public.conversations where id=p_conversation_id for update;
  if not found then return jsonb_build_object('ok',false,'error','conversation_not_found'); end if;

  v_resolution:=public.resolve_customer_by_phone_v1(v_conversation.wa_contact_e164);
  if v_resolution->>'match_status'='ambiguous' then return jsonb_build_object('ok',false,'error','ambiguous_phone'); end if;
  v_customer_id:=v_conversation.customer_id;
  if v_customer_id is null and v_resolution->>'match_status'='matched' then
    v_customer_id:=(v_resolution->>'customer_id')::uuid;
  elsif v_customer_id is not null and v_resolution->>'match_status'='matched'
      and (v_resolution->>'customer_id')::uuid<>v_customer_id then
    return jsonb_build_object('ok',false,'error','customer_identity_conflict');
  end if;

  select count(*),count(*) filter(where s.customer_id is distinct from v_customer_id)
    into v_count,v_customer_mismatch
  from public.customer_profile_suggestions_v1 s
  where s.id=any(v_ids) and s.conversation_id=p_conversation_id and s.status='pending';
  if v_count<>cardinality(v_ids) then return jsonb_build_object('ok',false,'error','suggestion_not_pending_for_conversation'); end if;
  if v_customer_mismatch>0 then return jsonb_build_object('ok',false,'error','suggestion_customer_mismatch'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'suggestion_id',s.id,
    'field_name',s.field_name,
    'label',case s.field_name
      when 'name' then 'Nome' when 'cpf_cnpj' then 'CPF/CNPJ' when 'email' then 'E-mail'
      when 'postal_code' then 'CEP' when 'street' then 'Rua' when 'number' then 'Número'
      when 'complement' then 'Complemento' when 'neighborhood' then 'Bairro'
      when 'city' then 'Cidade' when 'state' then 'Estado' when 'reference' then 'Referência'
      else 'Dado'
    end,
    'value',case when s.field_name='cpf_cnpj'
      then '***'||right(regexp_replace(coalesce(s.normalized_value,''),'[^0-9]','','g'),4)
      else coalesce(s.normalized_value,'') end
  ) order by s.created_at,s.id),'[]'::jsonb)
    into v_summary
  from public.customer_profile_suggestions_v1 s
  where s.id=any(v_ids) and s.conversation_id=p_conversation_id and s.status='pending';

  select * into v_existing from public.customer_profile_confirmation_requests_v1
  where conversation_id=p_conversation_id and status='pending' for update;
  if found and v_existing.expires_at>now() and v_existing.suggestion_ids=v_ids then
    return jsonb_build_object('ok',true,'request_id',v_existing.id,'status','pending','expires_at',v_existing.expires_at,'summary',v_existing.confirmation_summary,'idempotent',true);
  end if;
  if found then
    update public.customer_profile_confirmation_requests_v1
      set status=case when expires_at<=now() then 'expired' else 'cancelled' end,
          completed_at=now(),updated_at=now()
      where id=v_existing.id;
  end if;

  insert into public.customer_profile_confirmation_requests_v1(
    conversation_id,customer_id,suggestion_ids,confirmation_summary,created_by_admin_user_id
  ) values (p_conversation_id,v_customer_id,v_ids,v_summary,v_user_id)
  returning * into v_request;

  return jsonb_build_object('ok',true,'request_id',v_request.id,'status',v_request.status,'expires_at',v_request.expires_at,'summary',v_request.confirmation_summary,'idempotent',false);
end;
$function$;

create or replace function public.ops2_ana_customer_confirmation_pending_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(false);
  v_request public.customer_profile_confirmation_requests_v1%rowtype;
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','invalid_conversation_id'); end if;
  if not exists(select 1 from public.conversations where id=p_conversation_id) then return jsonb_build_object('ok',false,'error','conversation_not_found'); end if;

  select * into v_request from public.customer_profile_confirmation_requests_v1
  where conversation_id=p_conversation_id and status='pending' and expires_at>now()
  order by requested_at desc limit 1;
  if not found then return jsonb_build_object('ok',true,'pending',false,'conversation_id',p_conversation_id); end if;

  return jsonb_build_object(
    'ok',true,'pending',true,'request_id',v_request.id,'customer_id',v_request.customer_id,
    'conversation_id',v_request.conversation_id,'suggestion_ids',to_jsonb(v_request.suggestion_ids),
    'summary',v_request.confirmation_summary,'expires_at',v_request.expires_at,
    'outbound_message_id',v_request.outbound_message_id
  );
end;
$function$;

revoke all on function public.ops2_ana_customer_confirmation_create_v1(uuid,uuid[]) from public,anon;
revoke all on function public.ops2_ana_customer_confirmation_pending_v1(uuid) from public,anon;
grant execute on function public.ops2_ana_customer_confirmation_create_v1(uuid,uuid[]) to authenticated,service_role;
grant execute on function public.ops2_ana_customer_confirmation_pending_v1(uuid) to authenticated,service_role;

