-- Hotfix Task 8B — remove ambiguidade PL/pgSQL entre variável de loop e alias do runtime.
create or replace function public.ops2_admin_attendance_enqueue_template_v1(
  p_conversation_id uuid,
  p_template_id uuid,
  p_parameters jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_template public.whatsapp_templates_v1%rowtype;
  v_existing public.whatsapp_outbox_v1%rowtype;
  v_key text;
  v_client_key text:=btrim(coalesce(p_idempotency_key,''));
  v_phone text;
  v_expected integer:=0;
  v_received integer:=0;
  v_rendered text:='';
  v_components jsonb:='[]'::jsonb;
  v_parameter_objects jsonb:='[]'::jsonb;
  v_recent_count integer:=0;
  v_outbox_id uuid;
  v_value text;
  v_index integer:=0;
  v_param record;
begin
  if p_conversation_id is null then return jsonb_build_object('ok',false,'error','conversation_required'); end if;
  if p_template_id is null then return jsonb_build_object('ok',false,'error','template_required'); end if;
  if length(v_client_key)<8 or length(v_client_key)>120 or v_client_key !~ '^[A-Za-z0-9._:-]+$' then
    return jsonb_build_object('ok',false,'error','invalid_idempotency_key');
  end if;
  if p_parameters is null or jsonb_typeof(p_parameters)<>'array' then
    return jsonb_build_object('ok',false,'error','template_parameters_invalid');
  end if;

  v_key:='attendance-template-v1:'||p_conversation_id::text||':'||v_client_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));

  select c.* into v_conversation
  from public.conversations c
  join public.whatsapp_accounts wa on wa.id=c.whatsapp_account_id and wa.is_active=true
  where c.id=p_conversation_id and c.whatsapp_account_id is not null;
  if not found then return jsonb_build_object('ok',false,'error','conversation_channel_unavailable'); end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164);
  if v_phone is null then return jsonb_build_object('ok',false,'error','conversation_phone_invalid'); end if;

  select t.* into v_template
  from public.whatsapp_templates_v1 t
  where t.id=p_template_id
    and t.whatsapp_account_id=v_conversation.whatsapp_account_id
    and upper(coalesce(t.status,''))='APPROVED'
    and lower(coalesce(t.metadata->'attendance'->>'enabled','false'))='true';
  if not found then return jsonb_build_object('ok',false,'error','template_not_sendable'); end if;

  if exists(
    select 1 from jsonb_array_elements(coalesce(v_template.components,'[]'::jsonb)) c
    where upper(coalesce(c->>'type',''))<>'BODY' and c::text like '%{{%'
  ) then
    return jsonb_build_object('ok',false,'error','template_dynamic_component_unsupported');
  end if;

  select coalesce(max((m)[1]::integer),0) into v_expected
  from jsonb_array_elements(coalesce(v_template.components,'[]'::jsonb)) c
  cross join lateral regexp_matches(coalesce(c->>'text',''),'\{\{([0-9]+)\}\}','g') m
  where upper(coalesce(c->>'type',''))='BODY';

  v_received:=jsonb_array_length(p_parameters);
  if v_received<>v_expected then
    return jsonb_build_object('ok',false,'error','template_parameter_count_mismatch','expected',v_expected,'received',v_received);
  end if;

  for v_param in select value,ordinality from jsonb_array_elements(p_parameters) with ordinality loop
    if jsonb_typeof(v_param.value)<>'string' then return jsonb_build_object('ok',false,'error','template_parameter_invalid','index',v_param.ordinality); end if;
    v_value:=v_param.value #>> '{}';
    if btrim(v_value)='' or char_length(v_value)>1024 then return jsonb_build_object('ok',false,'error','template_parameter_invalid','index',v_param.ordinality); end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('type','text','text',value #>> '{}') order by ordinality),'[]'::jsonb)
  into v_parameter_objects
  from jsonb_array_elements(p_parameters) with ordinality;

  if v_expected>0 then
    v_components:=jsonb_build_array(jsonb_build_object('type','body','parameters',v_parameter_objects));
  end if;

  select coalesce(c->>'text','') into v_rendered
  from jsonb_array_elements(coalesce(v_template.components,'[]'::jsonb)) c
  where upper(coalesce(c->>'type',''))='BODY'
  limit 1;
  if v_rendered is null then v_rendered:=''; end if;
  if v_expected>0 then
    for v_index in 1..v_expected loop
      v_rendered:=replace(v_rendered,'{{'||v_index::text||'}}',p_parameters->>(v_index-1));
    end loop;
  end if;

  select o.* into v_existing from public.whatsapp_outbox_v1 o where o.idempotency_key=v_key;
  if found then
    if v_existing.conversation_id is distinct from p_conversation_id
       or v_existing.template_id is distinct from p_template_id
       or coalesce(v_existing.payload->'parameters','[]'::jsonb) is distinct from p_parameters then
      return jsonb_build_object('ok',false,'error','idempotency_conflict');
    end if;
    return jsonb_build_object('ok',true,'duplicate',true,'conversation_id',p_conversation_id,'outbox_id',v_existing.id,'provider',v_existing.provider,'status',v_existing.status);
  end if;

  select rt.* into v_runtime
  from public.whatsapp_channel_runtime_v1 rt
  where rt.whatsapp_account_id=v_conversation.whatsapp_account_id
    and rt.send_enabled=true and rt.human_send_enabled=true and rt.homologated_at is not null
    and rt.outbound_provider='meta'
    and lower(coalesce(rt.metadata->>'meta_send_homologated','false'))='true';
  if not found then return jsonb_build_object('ok',false,'error','meta_template_send_not_homologated'); end if;

  if lower(coalesce(v_runtime.metadata->>'meta_canary_enabled','false'))='true'
     and not exists(
       select 1 from jsonb_array_elements_text(
         case when jsonb_typeof(v_runtime.metadata->'meta_canary_to_e164')='array' then v_runtime.metadata->'meta_canary_to_e164' else '[]'::jsonb end
       ) allowed(value)
       where public.canonical_whatsapp_e164_br_v2(allowed.value)=v_phone
     ) then
    return jsonb_build_object('ok',false,'error','meta_canary_destination_blocked');
  end if;

  if exists(
    select 1 from public.whatsapp_outbox_v1 o
    where o.conversation_id=p_conversation_id and o.provider='meta' and o.status='claimed'
      and coalesce(o.last_error,'') like 'meta_send_uncertain:%'
  ) then return jsonb_build_object('ok',false,'error','meta_send_uncertain'); end if;

  select count(*)::integer into v_recent_count
  from public.whatsapp_outbox_v1 o
  where o.conversation_id=p_conversation_id and o.purpose='human_attendance'
    and o.created_at>now()-interval '60 seconds' and o.status<>'cancelled';
  if v_recent_count>=20 then return jsonb_build_object('ok',false,'error','rate_limited'); end if;

  insert into public.whatsapp_outbox_v1(
    idempotency_key,whatsapp_account_id,conversation_id,customer_id,to_phone_e164,
    purpose,message_type,template_id,payload,provider,status,metadata
  ) values (
    v_key,v_conversation.whatsapp_account_id,p_conversation_id,v_conversation.customer_id,v_phone,
    'human_attendance','template',v_template.id,
    jsonb_build_object(
      'template',jsonb_build_object('name',v_template.name,'language',jsonb_build_object('code',v_template.language),'components',v_components),
      'parameters',p_parameters,'rendered_text',v_rendered
    ),
    'meta','queued',jsonb_build_object('source','attendance','contract','meta_template_v1','provider','meta','template_name',v_template.name,'template_language',v_template.language,'meta_canary',lower(coalesce(v_runtime.metadata->>'meta_canary_enabled','false'))='true')
  ) returning id into v_outbox_id;

  return jsonb_build_object('ok',true,'duplicate',false,'conversation_id',p_conversation_id,'outbox_id',v_outbox_id,'provider','meta','status','queued','template_id',v_template.id,'template_name',v_template.name);
end;
$$;

revoke all on function public.ops2_admin_attendance_enqueue_template_v1(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_enqueue_template_v1(uuid,uuid,jsonb,text) to service_role;
