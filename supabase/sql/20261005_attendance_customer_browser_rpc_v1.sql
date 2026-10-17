begin;

-- Ponte browser-safe para a lateral de clientes do Atendimento.
-- As RPCs internas canônicas continuam service-role-only. Estes wrappers
-- identificam o usuário pelo JWT do PostgREST e validam admin_users antes
-- de delegar qualquer operação.

create or replace function public.ops2_admin_attendance_customer_access_v1(p_write boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid:=auth.uid();
  v_role text;
begin
  if v_user is null then
    return jsonb_build_object('ok',false,'error','admin_not_authorized');
  end if;

  select coalesce(a.role,'viewer') into v_role
  from public.admin_users a
  where a.user_id=v_user and a.is_active=true
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','admin_not_authorized');
  end if;

  if coalesce(p_write,false) and v_role='viewer' then
    return jsonb_build_object('ok',false,'error','admin_write_forbidden','role',v_role);
  end if;

  return jsonb_build_object('ok',true,'user_id',v_user,'role',v_role,'write_allowed',v_role<>'viewer');
end;
$function$;

revoke all on function public.ops2_admin_attendance_customer_access_v1(boolean) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_customer_access_v1(boolean) to service_role;

create or replace function public.ops2_admin_attendance_customer_reconcile_browser_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(true);
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','invalid_conversation_id'); end if;
  return public.ops2_admin_attendance_reconcile_customer_v1(p_conversation_id);
end;
$function$;

create or replace function public.ops2_admin_attendance_customer_search_browser_v1(
  p_query text,
  p_limit integer default 10
)
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
  if char_length(btrim(coalesce(p_query,'')))<2 then return jsonb_build_object('ok',true,'items','[]'::jsonb); end if;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
  into v_items
  from public.ops2_admin_attendance_customer_search_v1(p_query,least(20,greatest(1,coalesce(p_limit,10)))) x;

  return jsonb_build_object('ok',true,'items',coalesce(v_items,'[]'::jsonb));
end;
$function$;

create or replace function public.ops2_admin_attendance_customer_editor_browser_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(false);
  v_customer_id uuid;
  v_conversation_phone text;
  v_customer record;
  v_email text;
  v_address record;
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','invalid_conversation_id'); end if;

  select c.customer_id,public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164)
  into v_customer_id,v_conversation_phone
  from public.conversations c
  where c.id=p_conversation_id;

  if not found then return jsonb_build_object('ok',false,'error','conversation_not_found'); end if;
  if v_customer_id is null then return jsonb_build_object('ok',false,'error','customer_not_linked'); end if;

  select c.id,c.name,c.primary_whatsapp_e164,c.cpf_cnpj,c.is_active,c.birthday_day,c.birthday_month
  into v_customer
  from public.customers c
  where c.id=v_customer_id;
  if not found then return jsonb_build_object('ok',false,'error','customer_not_found'); end if;

  select ce.email into v_email
  from public.customer_emails ce
  where ce.customer_id=v_customer_id
  order by ce.is_primary desc,ce.created_at desc
  limit 1;

  select ca.street,ca.number,ca.complement,ca.neighborhood,ca.city,ca.state,ca.postal_code,ca.reference
  into v_address
  from public.customer_addresses ca
  where ca.customer_id=v_customer_id and ca.is_active=true
  order by ca.is_default desc,ca.updated_at desc,ca.id
  limit 1;

  return jsonb_build_object(
    'ok',true,
    'conversation_id',p_conversation_id,
    'conversation_phone_e164',v_conversation_phone,
    'customer',jsonb_build_object(
      'id',v_customer.id,
      'display_name',coalesce(v_customer.name,''),
      'phone_e164',v_customer.primary_whatsapp_e164,
      'cpf',v_customer.cpf_cnpj,
      'email',v_email,
      'status',case when v_customer.is_active=false then 'inactive' else 'active' end,
      'birthday_day',v_customer.birthday_day,
      'birthday_month',v_customer.birthday_month,
      'address',case when v_address is null then '{}'::jsonb else jsonb_build_object(
        'street',v_address.street,
        'number',v_address.number,
        'complement',v_address.complement,
        'district',v_address.neighborhood,
        'city',v_address.city,
        'state',v_address.state,
        'postal_code',v_address.postal_code,
        'raw_text',v_address.reference
      ) end
    )
  );
end;
$function$;

create or replace function public.ops2_admin_attendance_customer_link_browser_v1(
  p_conversation_id uuid,
  p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(true);
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','invalid_conversation_id'); end if;
  if p_customer_id is null then return jsonb_build_object('ok',false,'error','invalid_customer_id'); end if;
  return public.ops2_admin_attendance_link_customer_v1(p_conversation_id,p_customer_id);
end;
$function$;

create or replace function public.ops2_admin_attendance_customer_create_browser_v1(
  p_conversation_id uuid,
  p_customer jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(true);
  v_existing_customer uuid;
  v_phone text;
  v_payload jsonb;
  v_saved jsonb;
  v_linked jsonb;
  v_customer_id uuid;
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','invalid_conversation_id'); end if;

  perform pg_advisory_xact_lock(hashtextextended('attendance-customer:'||p_conversation_id::text,0));

  select c.customer_id,public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164)
  into v_existing_customer,v_phone
  from public.conversations c
  where c.id=p_conversation_id
  for update;

  if not found then return jsonb_build_object('ok',false,'error','conversation_not_found'); end if;
  if v_existing_customer is not null then
    return jsonb_build_object('ok',false,'error','conversation_already_linked','customer_id',v_existing_customer);
  end if;
  if v_phone is null then return jsonb_build_object('ok',false,'error','invalid_phone'); end if;

  v_payload:=jsonb_build_object(
    'id',null,
    'display_name',p_customer->>'display_name',
    'phone',v_phone,
    'cpf',p_customer->>'cpf',
    'email',p_customer->>'email',
    'status','active',
    'address',coalesce(p_customer->'address','{}'::jsonb)
  );

  v_saved:=public.ops2_admin_customer_save_v2(v_payload);
  if coalesce((v_saved->>'ok')::boolean,false) is not true then return v_saved; end if;

  begin v_customer_id:=(v_saved->>'customer_id')::uuid;
  exception when invalid_text_representation then v_customer_id:=null; end;
  if v_customer_id is null then return jsonb_build_object('ok',false,'error','customer_save_failed'); end if;

  v_linked:=public.ops2_admin_attendance_link_customer_v1(p_conversation_id,v_customer_id);
  if coalesce((v_linked->>'ok')::boolean,false) is not true then
    return v_linked||jsonb_build_object('created_customer_id',v_customer_id);
  end if;

  return jsonb_build_object('ok',true,'created',true,'linked',true,'customer_id',v_customer_id,'phone_e164',v_phone);
end;
$function$;

create or replace function public.ops2_admin_attendance_customer_save_browser_v1(
  p_conversation_id uuid,
  p_customer jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(true);
  v_customer_id uuid;
  v_phone text;
  v_active boolean;
  v_payload jsonb;
  v_saved jsonb;
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','invalid_conversation_id'); end if;

  select c.customer_id into v_customer_id
  from public.conversations c
  where c.id=p_conversation_id;
  if not found then return jsonb_build_object('ok',false,'error','conversation_not_found'); end if;
  if v_customer_id is null then return jsonb_build_object('ok',false,'error','customer_not_linked'); end if;

  select cu.primary_whatsapp_e164,cu.is_active into v_phone,v_active
  from public.customers cu
  where cu.id=v_customer_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','customer_not_found'); end if;

  v_payload:=jsonb_build_object(
    'id',v_customer_id,
    'display_name',p_customer->>'display_name',
    'phone',v_phone,
    'cpf',p_customer->>'cpf',
    'email',p_customer->>'email',
    'status',case when v_active=false then 'inactive' else 'active' end,
    'address',coalesce(p_customer->'address','{}'::jsonb)
  );

  v_saved:=public.ops2_admin_customer_save_v2(v_payload);
  if coalesce((v_saved->>'ok')::boolean,false) is not true then return v_saved; end if;
  return jsonb_build_object('ok',true,'saved',true,'customer_id',v_customer_id);
end;
$function$;

revoke all on function public.ops2_admin_attendance_customer_reconcile_browser_v1(uuid) from public,anon;
revoke all on function public.ops2_admin_attendance_customer_search_browser_v1(text,integer) from public,anon;
revoke all on function public.ops2_admin_attendance_customer_editor_browser_v1(uuid) from public,anon;
revoke all on function public.ops2_admin_attendance_customer_link_browser_v1(uuid,uuid) from public,anon;
revoke all on function public.ops2_admin_attendance_customer_create_browser_v1(uuid,jsonb) from public,anon;
revoke all on function public.ops2_admin_attendance_customer_save_browser_v1(uuid,jsonb) from public,anon;

grant execute on function public.ops2_admin_attendance_customer_reconcile_browser_v1(uuid) to authenticated,service_role;
grant execute on function public.ops2_admin_attendance_customer_search_browser_v1(text,integer) to authenticated,service_role;
grant execute on function public.ops2_admin_attendance_customer_editor_browser_v1(uuid) to authenticated,service_role;
grant execute on function public.ops2_admin_attendance_customer_link_browser_v1(uuid,uuid) to authenticated,service_role;
grant execute on function public.ops2_admin_attendance_customer_create_browser_v1(uuid,jsonb) to authenticated,service_role;
grant execute on function public.ops2_admin_attendance_customer_save_browser_v1(uuid,jsonb) to authenticated,service_role;

commit;
