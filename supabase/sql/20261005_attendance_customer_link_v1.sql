begin;

-- Atendimento: reconcilia uma conversa sem cliente usando exclusivamente o
-- resolvedor canônico de telefone. Nunca escolhe entre identidades ambíguas.
create or replace function public.ops2_admin_attendance_reconcile_customer_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_conversation public.conversations%rowtype;
  v_resolution jsonb;
  v_customer_id uuid;
  v_phone text;
begin
  if p_conversation_id is null then
    return jsonb_build_object('ok',false,'error','invalid_conversation_id');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('attendance-customer:'||p_conversation_id::text,0));

  select c.* into v_conversation
  from public.conversations c
  where c.id=p_conversation_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164);
  if v_phone is null then
    return jsonb_build_object('ok',false,'error','invalid_phone','match_status','invalid');
  end if;

  if v_conversation.customer_id is not null then
    return jsonb_build_object(
      'ok',true,
      'match_status','linked',
      'linked',true,
      'changed',false,
      'customer_id',v_conversation.customer_id,
      'phone_e164',v_phone
    );
  end if;

  v_resolution:=public.resolve_customer_by_phone_v1(v_phone);

  if v_resolution->>'match_status'='ambiguous' then
    return jsonb_build_object(
      'ok',true,
      'match_status','ambiguous',
      'linked',false,
      'changed',false,
      'candidate_count',coalesce((v_resolution->>'candidate_count')::integer,0),
      'phone_e164',v_phone
    );
  end if;

  if v_resolution->>'match_status'='none' then
    return jsonb_build_object(
      'ok',true,
      'match_status','none',
      'linked',false,
      'changed',false,
      'candidate_count',0,
      'phone_e164',v_phone
    );
  end if;

  if v_resolution->>'match_status'<>'matched' then
    return jsonb_build_object(
      'ok',false,
      'error',coalesce(v_resolution->>'error','customer_resolution_failed'),
      'match_status',coalesce(v_resolution->>'match_status','invalid'),
      'linked',false,
      'phone_e164',v_phone
    );
  end if;

  v_customer_id:=nullif(v_resolution->>'customer_id','')::uuid;
  if v_customer_id is null or not exists(select 1 from public.customers c where c.id=v_customer_id) then
    return jsonb_build_object('ok',false,'error','customer_resolution_failed','match_status','invalid');
  end if;

  update public.conversations
  set customer_id=v_customer_id,updated_at=now()
  where id=p_conversation_id and customer_id is null;

  update public.whatsapp_messages_v1
  set customer_id=v_customer_id
  where conversation_id=p_conversation_id and customer_id is null;

  return jsonb_build_object(
    'ok',true,
    'match_status','matched',
    'linked',true,
    'changed',true,
    'customer_id',v_customer_id,
    'phone_e164',v_phone
  );
end;
$function$;

revoke all on function public.ops2_admin_attendance_reconcile_customer_v1(uuid) from public, anon, authenticated;
grant execute on function public.ops2_admin_attendance_reconcile_customer_v1(uuid) to service_role;

-- Busca administrativa limitada para seleção manual. A função retorna apenas
-- dados operacionais e documento mascarado; não expõe CPF/CNPJ completo.
create or replace function public.ops2_admin_attendance_customer_search_v1(
  p_query text,
  p_limit integer default 10
)
returns table(
  customer_id uuid,
  customer_name text,
  phone_e164 text,
  masked_document text,
  is_active boolean
)
language sql
security definer
set search_path to ''
as $function$
  with input as (
    select
      nullif(btrim(regexp_replace(coalesce(p_query,''),'\s+',' ','g')),'') as q,
      regexp_replace(coalesce(p_query,''),'[^0-9]','','g') as digits,
      least(20,greatest(1,coalesce(p_limit,10))) as lim
  ), matched_ids as (
    select c.id
    from public.customers c, input i
    where i.q is not null
      and char_length(i.q)>=2
      and (
        c.name ilike '%'||i.q||'%'
        or (i.digits<>'' and regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g') like '%'||i.digits||'%')
        or (i.digits<>'' and public.normalize_phone_digits(c.primary_whatsapp_e164) like '%'||i.digits||'%')
      )
    union
    select cp.customer_id
    from public.customer_phones cp, input i
    where i.q is not null
      and char_length(i.q)>=2
      and i.digits<>''
      and public.normalize_phone_digits(cp.phone_e164) like '%'||i.digits||'%'
  ), limited as (
    select c.id
    from matched_ids m
    join public.customers c on c.id=m.id
    order by c.is_active desc,lower(coalesce(c.name,'')),c.id
    limit (select lim from input)
  )
  select
    c.id as customer_id,
    c.name as customer_name,
    public.canonical_whatsapp_e164_br_v2(coalesce(
      c.primary_whatsapp_e164,
      (select cp.phone_e164 from public.customer_phones cp where cp.customer_id=c.id order by cp.is_primary desc,cp.created_at desc limit 1)
    )) as phone_e164,
    case
      when char_length(regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g'))>=4 then
        repeat('*',greatest(0,char_length(regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g'))-4))
        || right(regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g'),4)
      else null
    end as masked_document,
    c.is_active
  from limited l
  join public.customers c on c.id=l.id
  order by c.is_active desc,lower(coalesce(c.name,'')),c.id
$function$;

revoke all on function public.ops2_admin_attendance_customer_search_v1(text,integer) from public, anon, authenticated;
grant execute on function public.ops2_admin_attendance_customer_search_v1(text,integer) to service_role;

-- Vínculo manual explícito. Não muda telefone, CPF ou qualquer outro dado do
-- cliente escolhido; apenas associa a conversa e mensagens ainda órfãs.
create or replace function public.ops2_admin_attendance_link_customer_v1(
  p_conversation_id uuid,
  p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_conversation public.conversations%rowtype;
  v_phone text;
begin
  if p_conversation_id is null then
    return jsonb_build_object('ok',false,'error','invalid_conversation_id');
  end if;
  if p_customer_id is null then
    return jsonb_build_object('ok',false,'error','invalid_customer_id');
  end if;
  if not exists(select 1 from public.customers c where c.id=p_customer_id) then
    return jsonb_build_object('ok',false,'error','customer_not_found');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('attendance-customer:'||p_conversation_id::text,0));

  select c.* into v_conversation
  from public.conversations c
  where c.id=p_conversation_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164);

  if v_conversation.customer_id is not null and v_conversation.customer_id<>p_customer_id then
    return jsonb_build_object(
      'ok',false,
      'error','conversation_already_linked',
      'customer_id',v_conversation.customer_id,
      'phone_e164',v_phone
    );
  end if;

  update public.conversations
  set customer_id=p_customer_id,updated_at=now()
  where id=p_conversation_id;

  update public.whatsapp_messages_v1
  set customer_id=p_customer_id
  where conversation_id=p_conversation_id and customer_id is null;

  return jsonb_build_object(
    'ok',true,
    'linked',true,
    'changed',v_conversation.customer_id is null,
    'customer_id',p_customer_id,
    'phone_e164',v_phone
  );
end;
$function$;

revoke all on function public.ops2_admin_attendance_link_customer_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.ops2_admin_attendance_link_customer_v1(uuid,uuid) to service_role;

commit;
