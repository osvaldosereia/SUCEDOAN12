-- Give the authenticated Meta Flow setup Edge Function narrow service-role
-- access to Vault-backed key reconciliation and per-account bindings.

create function public.admin_whatsapp_flow_setup_snapshot_v1(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_account public.whatsapp_accounts%rowtype;
  v_keyring whatsapp_ordering_private.whatsapp_flow_keyring_v1%rowtype;
  v_vault_present boolean := false;
  v_bindings jsonb;
begin
  select * into v_account
  from public.whatsapp_accounts a
  where a.id = p_account_id
    and a.slug in ('dona-antonia-0975', 'dona-antonia-1018')
    and a.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'account_not_found');
  end if;

  select k.* into v_keyring
  from whatsapp_ordering_private.whatsapp_flow_keyring_v1 k
  where k.whatsapp_account_id = v_account.id
    and k.meta_phone_number_id = v_account.phone_number_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'keyring_not_found');
  end if;

  select exists (
    select 1 from vault.decrypted_secrets s
    where s.name = v_keyring.vault_secret_name
      and s.decrypted_secret is not null
  ) into v_vault_present;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'meta_flow_id', b.meta_flow_id,
    'flow_json_version', b.flow_json_version,
    'data_api_version', b.data_api_version,
    'flow_message_version', b.flow_message_version,
    'flow_status', b.flow_status,
    'flow_cta', b.flow_cta,
    'body_text', b.body_text,
    'is_verified', b.is_verified,
    'is_send_enabled', b.is_send_enabled,
    'verified_at', b.verified_at
  ) order by b.updated_at desc), '[]'::jsonb)
  into v_bindings
  from whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 b
  where b.whatsapp_account_id = v_account.id;

  return jsonb_build_object(
    'ok', true,
    'account_id', v_account.id,
    'account_slug', v_account.slug,
    'key_status', v_keyring.key_status,
    'vault_secret_present', v_vault_present,
    'private_key_sha256', v_keyring.private_key_sha256,
    'meta_public_key_fingerprint', v_keyring.meta_public_key_fingerprint,
    'verified_at', v_keyring.verified_at,
    'bindings', v_bindings
  );
end;
$function$;

create function public.admin_whatsapp_flow_key_candidate_resolve_v1(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_secret_name text;
  v_private_key text;
begin
  select k.vault_secret_name into v_secret_name
  from whatsapp_ordering_private.whatsapp_flow_keyring_v1 k
  join public.whatsapp_accounts a on a.id = k.whatsapp_account_id
  where k.whatsapp_account_id = p_account_id
    and a.slug in ('dona-antonia-0975', 'dona-antonia-1018')
    and a.phone_number_id = k.meta_phone_number_id
    and a.is_active
    and k.key_status <> 'disabled';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'keyring_not_found');
  end if;

  select s.decrypted_secret into v_private_key
  from vault.decrypted_secrets s
  where s.name = v_secret_name
  order by s.updated_at desc
  limit 1;
  if v_private_key is null then
    return jsonb_build_object('ok', false, 'error', 'key_not_present');
  end if;

  return jsonb_build_object('ok', true, 'private_key_pkcs8', v_private_key);
end;
$function$;

create function public.admin_whatsapp_flow_key_store_v1(
  p_account_id uuid,
  p_private_key_pkcs8 text,
  p_private_key_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_keyring whatsapp_ordering_private.whatsapp_flow_keyring_v1%rowtype;
  v_existing text;
  v_digest text;
begin
  if p_private_key_pkcs8 is null
     or length(p_private_key_pkcs8) > 16000
     or p_private_key_pkcs8 not like '%-----BEGIN PRIVATE KEY-----%'
     or p_private_key_pkcs8 not like '%-----END PRIVATE KEY-----%'
     or p_private_key_sha256 is null
     or p_private_key_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'key_material_invalid');
  end if;
  v_digest := encode(extensions.digest(p_private_key_pkcs8, 'sha256'), 'hex');
  if v_digest <> p_private_key_sha256 then
    return jsonb_build_object('ok', false, 'error', 'key_fingerprint_mismatch');
  end if;

  select k.* into v_keyring
  from whatsapp_ordering_private.whatsapp_flow_keyring_v1 k
  join public.whatsapp_accounts a on a.id = k.whatsapp_account_id
  where k.whatsapp_account_id = p_account_id
    and a.slug in ('dona-antonia-0975', 'dona-antonia-1018')
    and a.phone_number_id = k.meta_phone_number_id
    and a.is_active
  for update of k;
  if not found or v_keyring.key_status = 'disabled' then
    return jsonb_build_object('ok', false, 'error', 'keyring_not_found');
  end if;

  select s.decrypted_secret into v_existing
  from vault.decrypted_secrets s
  where s.name = v_keyring.vault_secret_name
  order by s.updated_at desc
  limit 1;

  if v_existing is not null then
    if encode(extensions.digest(v_existing, 'sha256'), 'hex') <> v_digest then
      return jsonb_build_object('ok', false, 'error', 'key_already_exists');
    end if;
    update whatsapp_ordering_private.whatsapp_flow_keyring_v1
    set private_key_sha256 = v_digest,
        key_status = case when key_status = 'pending_key_provisioning'
          then 'pending_meta_verification' else key_status end,
        updated_at = now()
    where whatsapp_account_id = p_account_id;
    return jsonb_build_object('ok', true, 'stored', false, 'key_status', 'pending_meta_verification');
  end if;

  if v_keyring.key_status <> 'pending_key_provisioning' then
    return jsonb_build_object('ok', false, 'error', 'key_provisioning_not_allowed');
  end if;

  perform vault.create_secret(
    p_private_key_pkcs8,
    v_keyring.vault_secret_name,
    'WhatsApp Flow private key for ' || p_account_id::text
  );
  update whatsapp_ordering_private.whatsapp_flow_keyring_v1
  set private_key_sha256 = v_digest,
      meta_public_key_fingerprint = null,
      verified_at = null,
      key_status = 'pending_meta_verification',
      updated_at = now()
  where whatsapp_account_id = p_account_id;

  return jsonb_build_object('ok', true, 'stored', true, 'key_status', 'pending_meta_verification');
end;
$function$;

create function public.admin_whatsapp_flow_key_mark_ready_v1(
  p_account_id uuid,
  p_private_key_sha256 text,
  p_meta_public_key_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_keyring whatsapp_ordering_private.whatsapp_flow_keyring_v1%rowtype;
  v_vault_digest text;
begin
  if p_private_key_sha256 is null
     or p_meta_public_key_fingerprint is null
     or p_private_key_sha256 !~ '^[0-9a-f]{64}$'
     or p_meta_public_key_fingerprint !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'key_fingerprint_invalid');
  end if;

  select k.* into v_keyring
  from whatsapp_ordering_private.whatsapp_flow_keyring_v1 k
  join public.whatsapp_accounts a on a.id = k.whatsapp_account_id
  where k.whatsapp_account_id = p_account_id
    and a.slug in ('dona-antonia-0975', 'dona-antonia-1018')
    and a.phone_number_id = k.meta_phone_number_id
    and a.is_active
  for update of k;
  if not found or v_keyring.key_status = 'disabled' then
    return jsonb_build_object('ok', false, 'error', 'keyring_not_found');
  end if;

  select encode(extensions.digest(s.decrypted_secret, 'sha256'), 'hex')
  into v_vault_digest
  from vault.decrypted_secrets s
  where s.name = v_keyring.vault_secret_name
  order by s.updated_at desc
  limit 1;
  if v_vault_digest is null or v_vault_digest <> p_private_key_sha256
     or v_keyring.private_key_sha256 <> p_private_key_sha256 then
    return jsonb_build_object('ok', false, 'error', 'key_fingerprint_mismatch');
  end if;

  update whatsapp_ordering_private.whatsapp_flow_keyring_v1
  set key_status = 'ready',
      meta_public_key_fingerprint = p_meta_public_key_fingerprint,
      verified_at = now(),
      updated_at = now()
  where whatsapp_account_id = p_account_id;
  return jsonb_build_object('ok', true, 'key_status', 'ready');
end;
$function$;

create function public.admin_whatsapp_flow_binding_upsert_v1(
  p_account_id uuid,
  p_actor_id uuid,
  p_meta_flow_id text,
  p_flow_json_version text,
  p_data_api_version text,
  p_flow_message_version text,
  p_flow_status text,
  p_flow_cta text,
  p_body_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key_status text;
  v_binding_id uuid;
begin
  select k.key_status into v_key_status
  from whatsapp_ordering_private.whatsapp_flow_keyring_v1 k
  join public.whatsapp_accounts a on a.id = k.whatsapp_account_id
  where k.whatsapp_account_id = p_account_id
    and a.slug in ('dona-antonia-0975', 'dona-antonia-1018')
    and a.is_active;
  if v_key_status is distinct from 'ready' then
    return jsonb_build_object('ok', false, 'error', 'flow_key_not_ready');
  end if;
  if p_meta_flow_id is null
     or p_flow_json_version is null
     or p_data_api_version is null
     or p_flow_message_version is null
     or p_flow_status is null
     or p_flow_cta is null
     or p_body_text is null
     or p_meta_flow_id !~ '^[0-9]{6,32}$'
     or p_flow_json_version <> '7.3'
     or p_data_api_version <> '3.0'
     or p_flow_message_version <> '3'
     or upper(p_flow_status) <> 'PUBLISHED'
     or length(btrim(p_flow_cta)) not between 1 and 20
     or length(btrim(p_body_text)) not between 1 and 1024 then
    return jsonb_build_object('ok', false, 'error', 'flow_binding_invalid');
  end if;

  insert into whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 (
    whatsapp_account_id, meta_flow_id, flow_json_version,
    data_api_version, flow_message_version, flow_action, flow_status,
    flow_cta, body_text, is_verified, is_send_enabled, verified_at, verified_by
  ) values (
    p_account_id, p_meta_flow_id, p_flow_json_version,
    p_data_api_version, p_flow_message_version, 'data_exchange', 'PUBLISHED',
    btrim(p_flow_cta), btrim(p_body_text), true, false, now(), p_actor_id
  )
  on conflict (whatsapp_account_id, meta_flow_id, flow_json_version)
  do update set
    data_api_version = excluded.data_api_version,
    flow_message_version = excluded.flow_message_version,
    flow_status = excluded.flow_status,
    flow_cta = excluded.flow_cta,
    body_text = excluded.body_text,
    is_verified = true,
    verified_at = now(),
    verified_by = excluded.verified_by,
    updated_at = now()
  returning id into v_binding_id;

  return jsonb_build_object('ok', true, 'binding_id', v_binding_id, 'is_send_enabled', false);
end;
$function$;

create function public.admin_whatsapp_flow_binding_enable_v1(
  p_account_id uuid,
  p_binding_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key_status text;
  v_updated uuid;
begin
  select k.key_status into v_key_status
  from whatsapp_ordering_private.whatsapp_flow_keyring_v1 k
  join public.whatsapp_accounts a on a.id = k.whatsapp_account_id
  where k.whatsapp_account_id = p_account_id
    and a.slug in ('dona-antonia-0975', 'dona-antonia-1018')
    and a.is_active;
  if v_key_status is distinct from 'ready' then
    return jsonb_build_object('ok', false, 'error', 'flow_key_not_ready');
  end if;

  perform 1
  from whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 b
  where b.id = p_binding_id
    and b.whatsapp_account_id = p_account_id
    and b.is_verified
    and upper(b.flow_status) = 'PUBLISHED'
    and b.verified_at is not null
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'flow_binding_not_verified');
  end if;

  update whatsapp_ordering_private.whatsapp_order_flow_bindings_v1
  set is_send_enabled = false, updated_at = now()
  where whatsapp_account_id = p_account_id and is_send_enabled;

  update whatsapp_ordering_private.whatsapp_order_flow_bindings_v1
  set is_send_enabled = true, updated_at = now()
  where id = p_binding_id
    and whatsapp_account_id = p_account_id
    and is_verified
    and upper(flow_status) = 'PUBLISHED'
    and verified_at is not null
  returning id into v_updated;
  return jsonb_build_object('ok', true, 'binding_id', v_updated, 'is_send_enabled', true);
end;
$function$;

create function public.admin_whatsapp_flow_binding_disable_v1(
  p_account_id uuid,
  p_binding_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated uuid;
begin
  update whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 b
  set is_send_enabled = false, updated_at = now()
  from public.whatsapp_accounts a
  where b.id = p_binding_id
    and b.whatsapp_account_id = p_account_id
    and a.id = b.whatsapp_account_id
    and a.slug in ('dona-antonia-0975', 'dona-antonia-1018')
  returning b.id into v_updated;
  if v_updated is null then
    return jsonb_build_object('ok', false, 'error', 'flow_binding_not_found');
  end if;
  return jsonb_build_object('ok', true, 'binding_id', v_updated, 'is_send_enabled', false);
end;
$function$;

revoke all on function public.admin_whatsapp_flow_setup_snapshot_v1(uuid) from public, anon, authenticated;
revoke all on function public.admin_whatsapp_flow_key_candidate_resolve_v1(uuid) from public, anon, authenticated;
revoke all on function public.admin_whatsapp_flow_key_store_v1(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_whatsapp_flow_key_mark_ready_v1(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_whatsapp_flow_binding_upsert_v1(uuid, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_whatsapp_flow_binding_enable_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_whatsapp_flow_binding_disable_v1(uuid, uuid) from public, anon, authenticated;

grant execute on function public.admin_whatsapp_flow_setup_snapshot_v1(uuid) to service_role;
grant execute on function public.admin_whatsapp_flow_key_candidate_resolve_v1(uuid) to service_role;
grant execute on function public.admin_whatsapp_flow_key_store_v1(uuid, text, text) to service_role;
grant execute on function public.admin_whatsapp_flow_key_mark_ready_v1(uuid, text, text) to service_role;
grant execute on function public.admin_whatsapp_flow_binding_upsert_v1(uuid, uuid, text, text, text, text, text, text, text) to service_role;
grant execute on function public.admin_whatsapp_flow_binding_enable_v1(uuid, uuid) to service_role;
grant execute on function public.admin_whatsapp_flow_binding_disable_v1(uuid, uuid) to service_role;

comment on function public.admin_whatsapp_flow_key_candidate_resolve_v1(uuid) is
  'Returns a candidate private Flow key only to service_role for an authenticated Edge Function; never grants browser roles access.';
comment on function public.admin_whatsapp_flow_key_store_v1(uuid, text, text) is
  'Stores only a new per-account Flow private key in Supabase Vault when absent; refuses to overwrite an existing key.';
