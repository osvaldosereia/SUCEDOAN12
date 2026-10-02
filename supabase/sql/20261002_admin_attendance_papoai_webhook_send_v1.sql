-- Dona Antônia — Central de Atendimento: transporte humano por Webhook de Entrada oficial do PapoAI
-- URLs ficam no Supabase Vault. A captura canônica de message.sent continua sendo a fonte do histórico.

create or replace function public.ops2_papoai_attendance_provider_url_v1(p_channel text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_name text;
  v_secret text;
begin
  v_name:=case btrim(coalesce(p_channel,''))
    when '0975' then 'papoai_attendance_text_webhook_0975_url_v1'
    when '1018' then 'papoai_attendance_text_webhook_1018_url_v1'
    else null
  end;
  if v_name is null then return null; end if;

  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds
  where ds.name=v_name
  order by ds.updated_at desc nulls last,ds.created_at desc
  limit 1;

  return nullif(btrim(coalesce(v_secret,'')),'');
end;
$$;

create or replace function public.ops2_papoai_attendance_provider_store_v1(p_channel text,p_url text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_name text;
  v_url text;
  v_secret_id uuid;
  v_description text;
begin
  v_name:=case btrim(coalesce(p_channel,''))
    when '0975' then 'papoai_attendance_text_webhook_0975_url_v1'
    when '1018' then 'papoai_attendance_text_webhook_1018_url_v1'
    else null
  end;
  if v_name is null then return jsonb_build_object('ok',false,'error','unsupported_channel'); end if;

  v_url:=nullif(btrim(coalesce(p_url,'')),'');
  if v_url is null or length(v_url)>2048 or v_url !~* '^https://[^[:space:]]+$' then
    return jsonb_build_object('ok',false,'error','invalid_https_url','channel',p_channel);
  end if;

  v_description:=format('Dona Antônia PapoAI attendance text webhook %s',p_channel);
  select s.id into v_secret_id
  from vault.secrets s
  where s.name=v_name
  order by s.updated_at desc nulls last,s.created_at desc
  limit 1;

  if v_secret_id is null then
    v_secret_id:=vault.create_secret(v_url,v_name,v_description,null);
  else
    perform vault.update_secret(v_secret_id,v_url,v_name,v_description,null);
  end if;

  return jsonb_build_object('ok',true,'channel',p_channel,'stored',true);
end;
$$;

create or replace function public.ops2_admin_attendance_enqueue_text_v2(
  p_conversation_id uuid,
  p_text text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_existing public.whatsapp_outbox_v1%rowtype;
  v_text text:=btrim(coalesce(p_text,''));
  v_client_key text:=btrim(coalesce(p_idempotency_key,''));
  v_key text;
  v_phone text;
  v_outbox_id uuid;
  v_recent_count integer:=0;
begin
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','conversation_required'); end if;
  if v_text='' then return jsonb_build_object('ok',false,'error','message_empty'); end if;
  if char_length(v_text)>4000 then return jsonb_build_object('ok',false,'error','message_too_long'); end if;
  if length(v_client_key)<8 or length(v_client_key)>120 or v_client_key !~ '^[A-Za-z0-9._:-]+$' then
    return jsonb_build_object('ok',false,'error','invalid_idempotency_key');
  end if;

  v_key:='attendance-v2:'||p_conversation_id::text||':'||v_client_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));

  select c.* into v_conversation
  from public.conversations c
  join public.whatsapp_accounts wa on wa.id=c.whatsapp_account_id and wa.is_active=true
  where c.id=p_conversation_id and c.whatsapp_account_id is not null;
  if not found then return jsonb_build_object('ok',false,'error','conversation_channel_unavailable'); end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164);
  if v_phone is null then return jsonb_build_object('ok',false,'error','conversation_phone_invalid'); end if;

  select o.* into v_existing from public.whatsapp_outbox_v1 o where o.idempotency_key=v_key;
  if found then
    if v_existing.conversation_id is distinct from p_conversation_id or coalesce(v_existing.payload->>'text','')<>v_text then
      return jsonb_build_object('ok',false,'error','idempotency_conflict');
    end if;
    return jsonb_build_object('ok',true,'duplicate',true,'conversation_id',p_conversation_id,'outbox_id',v_existing.id,'status',v_existing.status);
  end if;

  if v_conversation.last_inbound_at is null or now()>=v_conversation.last_inbound_at+interval '24 hours' then
    return jsonb_build_object('ok',false,'error','service_window_closed');
  end if;

  select r.* into v_runtime
  from public.whatsapp_channel_runtime_v1 r
  where r.whatsapp_account_id=v_conversation.whatsapp_account_id
    and r.outbound_provider='papoai'
    and r.send_enabled=true
    and r.human_send_enabled=true
    and r.homologated_at is not null;
  if not found then return jsonb_build_object('ok',false,'error','human_send_not_homologated'); end if;

  select count(*)::integer into v_recent_count
  from public.whatsapp_outbox_v1 o
  where o.conversation_id=p_conversation_id
    and o.purpose='human_attendance'
    and o.created_at>now()-interval '60 seconds'
    and o.status<>'cancelled';
  if v_recent_count>=20 then return jsonb_build_object('ok',false,'error','rate_limited'); end if;

  insert into public.whatsapp_outbox_v1(
    idempotency_key,whatsapp_account_id,conversation_id,customer_id,to_phone_e164,
    purpose,message_type,payload,provider,status,metadata
  ) values (
    v_key,v_conversation.whatsapp_account_id,p_conversation_id,v_conversation.customer_id,v_phone,
    'human_attendance','text',jsonb_build_object('text',v_text),'papoai','queued',
    jsonb_build_object('source','attendance','transport','papoai_inbound_webhook','canonical_message_source','message.sent')
  ) returning id into v_outbox_id;

  return jsonb_build_object('ok',true,'duplicate',false,'conversation_id',p_conversation_id,'outbox_id',v_outbox_id,'status','queued');
end;
$$;

create or replace function public.ops2_admin_attendance_claim_outbox_v2(p_outbox_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_conversation public.conversations%rowtype;
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_phone text;
  v_text text;
begin
  if p_outbox_id is null then return jsonb_build_object('ok',false,'error','outbox_required'); end if;

  select o.* into v_outbox from public.whatsapp_outbox_v1 o where o.id=p_outbox_id for update;
  if not found then return jsonb_build_object('ok',false,'error','outbox_not_found'); end if;
  if v_outbox.status='sent' then return jsonb_build_object('ok',true,'already_sent',true,'outbox_id',v_outbox.id,'status','sent'); end if;
  if v_outbox.status<>'queued' then return jsonb_build_object('ok',false,'error','outbox_not_queued','status',v_outbox.status); end if;
  if v_outbox.purpose<>'human_attendance' or v_outbox.provider<>'papoai' or v_outbox.message_type<>'text' then
    return jsonb_build_object('ok',false,'error','outbox_not_dispatchable');
  end if;

  select c.* into v_conversation from public.conversations c where c.id=v_outbox.conversation_id;
  if not found or v_conversation.whatsapp_account_id is null or v_conversation.whatsapp_account_id is distinct from v_outbox.whatsapp_account_id then
    return jsonb_build_object('ok',false,'error','conversation_account_mismatch');
  end if;

  select wa.* into v_account from public.whatsapp_accounts wa where wa.id=v_conversation.whatsapp_account_id and wa.is_active=true;
  if not found then return jsonb_build_object('ok',false,'error','account_unavailable'); end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164);
  if v_phone is null or v_phone is distinct from public.canonical_whatsapp_e164_br_v2(v_outbox.to_phone_e164) then
    return jsonb_build_object('ok',false,'error','destination_mismatch');
  end if;

  if v_conversation.last_inbound_at is null or now()>=v_conversation.last_inbound_at+interval '24 hours' then
    return jsonb_build_object('ok',false,'error','service_window_closed');
  end if;

  select r.* into v_runtime
  from public.whatsapp_channel_runtime_v1 r
  where r.whatsapp_account_id=v_conversation.whatsapp_account_id
    and r.outbound_provider='papoai'
    and r.send_enabled=true
    and r.human_send_enabled=true
    and r.homologated_at is not null;
  if not found then return jsonb_build_object('ok',false,'error','human_send_not_homologated'); end if;

  v_text:=btrim(coalesce(v_outbox.payload->>'text',''));
  if v_text='' or char_length(v_text)>4000 then return jsonb_build_object('ok',false,'error','outbox_text_invalid'); end if;

  update public.whatsapp_outbox_v1
  set status='claimed',claimed_at=now(),attempt_count=attempt_count+1,updated_at=now()
  where id=v_outbox.id and status='queued';
  if not found then return jsonb_build_object('ok',false,'error','outbox_claim_race'); end if;

  return jsonb_build_object(
    'ok',true,'already_sent',false,'outbox_id',v_outbox.id,'conversation_id',v_outbox.conversation_id,
    'whatsapp_account_id',v_outbox.whatsapp_account_id,'account_phone_e164',v_account.phone_e164,
    'to_phone_e164',v_phone,'text',v_text,'idempotency_key',v_outbox.idempotency_key,'status','claimed'
  );
end;
$$;

revoke all on function public.ops2_papoai_attendance_provider_url_v1(text) from public,anon,authenticated;
grant execute on function public.ops2_papoai_attendance_provider_url_v1(text) to service_role;
revoke all on function public.ops2_papoai_attendance_provider_store_v1(text,text) from public,anon,authenticated;
grant execute on function public.ops2_papoai_attendance_provider_store_v1(text,text) to service_role;
revoke all on function public.ops2_admin_attendance_enqueue_text_v2(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_enqueue_text_v2(uuid,text,text) to service_role;
revoke all on function public.ops2_admin_attendance_claim_outbox_v2(uuid) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_claim_outbox_v2(uuid) to service_role;
