-- ANA própria — customer profile suggestions v1
-- Read/suggest phase only. No canonical customer writes are allowed here.

create table if not exists public.customer_profile_extraction_runs_v1 (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  conversation_phone_e164 text,
  snapshot_key text not null,
  status text not null default 'completed' check (status in ('completed','failed')),
  model text,
  provider_response_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_admin_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id,snapshot_key)
);

create table if not exists public.customer_profile_suggestions_v1 (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.customer_profile_extraction_runs_v1(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  field_name text not null check (field_name in ('name','cpf_cnpj','email','postal_code','street','number','complement','neighborhood','city','state','reference')),
  suggested_value jsonb not null,
  normalized_value text not null,
  confidence numeric(5,4) not null check (confidence>=0 and confidence<=1),
  classification text not null check (classification in ('explicit','derived','ambiguous')),
  recommendation text not null check (recommendation in ('auto_apply','confirm','ignore')),
  evidence_message_ids uuid[] not null default array[]::uuid[],
  status text not null default 'pending' check (status in ('pending','reviewed_accepted','reviewed_rejected','expired')),
  model text,
  policy_version text not null default 'ana_customer_profile_v1',
  reviewed_by_admin_user_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id,field_name,normalized_value)
);

create index if not exists customer_profile_runs_conversation_created_idx
  on public.customer_profile_extraction_runs_v1(conversation_id,created_at desc);
create index if not exists customer_profile_suggestions_conversation_status_idx
  on public.customer_profile_suggestions_v1(conversation_id,status,created_at desc);

alter table public.customer_profile_extraction_runs_v1 enable row level security;
alter table public.customer_profile_suggestions_v1 enable row level security;
revoke all on table public.customer_profile_extraction_runs_v1 from public,anon,authenticated;
revoke all on table public.customer_profile_suggestions_v1 from public,anon,authenticated;
grant all on table public.customer_profile_extraction_runs_v1 to service_role;
grant all on table public.customer_profile_suggestions_v1 to service_role;

create or replace function public.ops2_admin_ana_customer_profile_extract_access_v1()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return public.ops2_admin_attendance_customer_access_v1(true);
end;
$function$;

create or replace function public.ops2_admin_ana_customer_profile_context_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(false);
  v_conversation public.conversations%rowtype;
  v_resolution jsonb;
  v_customer_id uuid;
  v_customer public.customers%rowtype;
  v_email text;
  v_address public.customer_addresses%rowtype;
  v_messages jsonb:='[]'::jsonb;
  v_missing text[]:=array[]::text[];
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','invalid_conversation_id'); end if;

  select * into v_conversation from public.conversations where id=p_conversation_id;
  if not found then return jsonb_build_object('ok',false,'error','conversation_not_found'); end if;

  v_resolution:=public.resolve_customer_by_phone_v1(v_conversation.wa_contact_e164);
  if coalesce(v_resolution->>'match_status','')='ambiguous' then
    return jsonb_build_object('ok',false,'error','ambiguous_phone','match_status','ambiguous','candidate_count',coalesce((v_resolution->>'candidate_count')::int,0));
  end if;

  v_customer_id:=v_conversation.customer_id;
  if v_customer_id is null and v_resolution->>'match_status'='matched' then
    v_customer_id:=(v_resolution->>'customer_id')::uuid;
  elsif v_customer_id is not null and v_resolution->>'match_status'='matched' and (v_resolution->>'customer_id')::uuid<>v_customer_id then
    return jsonb_build_object('ok',false,'error','customer_identity_conflict');
  end if;

  if v_customer_id is not null then
    select * into v_customer from public.customers where id=v_customer_id;
    select e.email into v_email from public.customer_emails e where e.customer_id=v_customer_id order by e.is_primary desc,e.updated_at desc limit 1;
    select * into v_address from public.customer_addresses a where a.customer_id=v_customer_id and a.is_active=true order by a.is_default desc,a.updated_at desc limit 1;
  end if;

  if v_customer_id is null or nullif(btrim(coalesce(v_customer.name,'')),'') is null then v_missing:=array_append(v_missing,'name'); end if;
  if v_customer_id is null or nullif(regexp_replace(coalesce(v_customer.cpf_cnpj,''),'\D','','g'),'') is null then v_missing:=array_append(v_missing,'cpf_cnpj'); end if;
  if nullif(btrim(coalesce(v_email,'')),'') is null then v_missing:=array_append(v_missing,'email'); end if;
  if nullif(btrim(coalesce(v_address.postal_code,'')),'') is null then v_missing:=array_append(v_missing,'postal_code'); end if;
  if nullif(btrim(coalesce(v_address.street,'')),'') is null then v_missing:=array_append(v_missing,'street'); end if;
  if nullif(btrim(coalesce(v_address.number,'')),'') is null then v_missing:=array_append(v_missing,'number'); end if;
  if nullif(btrim(coalesce(v_address.neighborhood,'')),'') is null then v_missing:=array_append(v_missing,'neighborhood'); end if;
  if nullif(btrim(coalesce(v_address.city,'')),'') is null then v_missing:=array_append(v_missing,'city'); end if;
  if nullif(btrim(coalesce(v_address.state,'')),'') is null then v_missing:=array_append(v_missing,'state'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'direction',m.direction,'text',m.text_body,'sender_kind',m.sender_kind,
      'timestamp',coalesce(m.received_at,m.sent_at,m.created_at)
    ) order by m.created_at),'[]'::jsonb)
    into v_messages
  from (
    select w.id,w.direction,w.text_body,w.sender_kind,w.received_at,w.sent_at,w.created_at
    from public.whatsapp_messages_v1 w
    where w.conversation_id=p_conversation_id
      and w.message_type='text'
      and nullif(btrim(coalesce(w.text_body,'')),'') is not null
    order by w.created_at desc
    limit 30
  ) m;

  return jsonb_build_object(
    'ok',true,
    'conversation_id',v_conversation.id,
    'conversation_phone_e164',public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164),
    'customer_id',v_customer_id,
    'match_status',coalesce(v_resolution->>'match_status','invalid'),
    'missing_fields',to_jsonb(v_missing),
    'current_profile',jsonb_build_object(
      'name',case when v_customer_id is null then null else nullif(btrim(v_customer.name),'') end,
      'cpf_cnpj_present',v_customer_id is not null and nullif(regexp_replace(coalesce(v_customer.cpf_cnpj,''),'\D','','g'),'') is not null,
      'email',nullif(btrim(coalesce(v_email,'')),''),
      'address',case when v_address.id is null then null else jsonb_build_object(
        'postal_code',v_address.postal_code,'street',v_address.street,'number',v_address.number,
        'complement',v_address.complement,'neighborhood',v_address.neighborhood,'city',v_address.city,
        'state',v_address.state,'reference',v_address.reference
      ) end
    ),
    'messages',v_messages
  );
end;
$function$;

create or replace function public.ops2_admin_ana_customer_profile_suggestions_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(false);
  v_items jsonb;
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','invalid_conversation_id'); end if;
  if not exists(select 1 from public.conversations where id=p_conversation_id) then return jsonb_build_object('ok',false,'error','conversation_not_found'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'run_id',s.run_id,'field_name',s.field_name,'suggested_value',s.suggested_value,
    'normalized_value',case when s.field_name='cpf_cnpj' then regexp_replace(s.normalized_value,'^(.*)([0-9]{4})$','***\2') else s.normalized_value end,
    'confidence',s.confidence,'classification',s.classification,'recommendation',s.recommendation,
    'evidence_message_ids',to_jsonb(s.evidence_message_ids),'status',s.status,'created_at',s.created_at
  ) order by s.created_at desc),'[]'::jsonb) into v_items
  from public.customer_profile_suggestions_v1 s
  where s.conversation_id=p_conversation_id and s.status<>'expired';

  return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,'items',v_items);
end;
$function$;

revoke all on function public.ops2_admin_ana_customer_profile_extract_access_v1() from public,anon;
revoke all on function public.ops2_admin_ana_customer_profile_context_v1(uuid) from public,anon;
revoke all on function public.ops2_admin_ana_customer_profile_suggestions_v1(uuid) from public,anon;
grant execute on function public.ops2_admin_ana_customer_profile_extract_access_v1() to authenticated,service_role;
grant execute on function public.ops2_admin_ana_customer_profile_context_v1(uuid) to authenticated,service_role;
grant execute on function public.ops2_admin_ana_customer_profile_suggestions_v1(uuid) to authenticated,service_role;
