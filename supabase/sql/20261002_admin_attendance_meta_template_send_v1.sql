-- Dona Antônia — Central de Atendimento: envio de templates Meta fora da janela de 24h
-- Mantém texto livre na regra existente e cria um caminho separado/fail-closed para templates aprovados.

-- Libera inicialmente somente os templates utilitários mínimos de confirmação de pedido.
update public.whatsapp_templates_v1 t
set metadata=coalesce(t.metadata,'{}'::jsonb)||jsonb_build_object(
  'attendance',jsonb_build_object(
    'enabled',true,
    'kind','utility_order_received',
    'parameter_count',4,
    'parameter_labels',jsonb_build_array('Pedido','Total','Entrega','Pagamento')
  )
), updated_at=now()
from public.whatsapp_accounts a
where a.id=t.whatsapp_account_id
  and (
    (a.slug='dona-antonia-0975' and t.name='pedidorecebidosite0975')
    or (a.slug='dona-antonia-1018' and t.name='pedidorecebidosite1018')
  );

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
  r record;
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

  for r in select value,ordinality from jsonb_array_elements(p_parameters) with ordinality loop
    if jsonb_typeof(r.value)<>'string' then return jsonb_build_object('ok',false,'error','template_parameter_invalid','index',r.ordinality); end if;
    v_value:=r.value #>> '{}';
    if btrim(v_value)='' or char_length(v_value)>1024 then return jsonb_build_object('ok',false,'error','template_parameter_invalid','index',r.ordinality); end if;
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

  select r.* into v_runtime
  from public.whatsapp_channel_runtime_v1 r
  where r.whatsapp_account_id=v_conversation.whatsapp_account_id
    and r.send_enabled=true and r.human_send_enabled=true and r.homologated_at is not null
    and r.outbound_provider='meta'
    and lower(coalesce(r.metadata->>'meta_send_homologated','false'))='true';
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

create or replace function public.ops2_admin_attendance_claim_template_outbox_v1(p_outbox_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_conversation public.conversations%rowtype;
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_template public.whatsapp_templates_v1%rowtype;
  v_phone text;
begin
  if p_outbox_id is null then return jsonb_build_object('ok',false,'error','outbox_required'); end if;
  select o.* into v_outbox from public.whatsapp_outbox_v1 o where o.id=p_outbox_id for update;
  if not found then return jsonb_build_object('ok',false,'error','outbox_not_found'); end if;
  if v_outbox.status='sent' then return jsonb_build_object('ok',true,'already_sent',true,'outbox_id',v_outbox.id,'provider',v_outbox.provider,'status','sent'); end if;
  if v_outbox.status<>'queued' then return jsonb_build_object('ok',false,'error','outbox_not_queued','status',v_outbox.status); end if;
  if v_outbox.purpose<>'human_attendance' or v_outbox.provider<>'meta' or v_outbox.message_type<>'template' or v_outbox.template_id is null then
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

  select r.* into v_runtime from public.whatsapp_channel_runtime_v1 r
  where r.whatsapp_account_id=v_conversation.whatsapp_account_id
    and r.send_enabled=true and r.human_send_enabled=true and r.homologated_at is not null
    and r.outbound_provider='meta' and lower(coalesce(r.metadata->>'meta_send_homologated','false'))='true';
  if not found then return jsonb_build_object('ok',false,'error','meta_template_send_not_homologated'); end if;
  if lower(coalesce(v_runtime.metadata->>'meta_canary_enabled','false'))='true'
     and not exists(
       select 1 from jsonb_array_elements_text(case when jsonb_typeof(v_runtime.metadata->'meta_canary_to_e164')='array' then v_runtime.metadata->'meta_canary_to_e164' else '[]'::jsonb end) allowed(value)
       where public.canonical_whatsapp_e164_br_v2(allowed.value)=v_phone
     ) then return jsonb_build_object('ok',false,'error','meta_canary_destination_blocked'); end if;

  select t.* into v_template from public.whatsapp_templates_v1 t
  where t.id=v_outbox.template_id and t.whatsapp_account_id=v_outbox.whatsapp_account_id
    and upper(coalesce(t.status,''))='APPROVED'
    and lower(coalesce(t.metadata->'attendance'->>'enabled','false'))='true';
  if not found then return jsonb_build_object('ok',false,'error','template_not_sendable'); end if;
  if coalesce(v_outbox.payload#>>'{template,name}','')<>v_template.name
     or coalesce(v_outbox.payload#>>'{template,language,code}','')<>v_template.language then
    return jsonb_build_object('ok',false,'error','template_payload_mismatch');
  end if;

  update public.whatsapp_outbox_v1 set status='claimed',claimed_at=now(),attempt_count=attempt_count+1,updated_at=now()
  where id=v_outbox.id and status='queued';
  if not found then return jsonb_build_object('ok',false,'error','outbox_claim_race'); end if;

  return jsonb_build_object(
    'ok',true,'already_sent',false,'outbox_id',v_outbox.id,'conversation_id',v_outbox.conversation_id,
    'whatsapp_account_id',v_outbox.whatsapp_account_id,'provider','meta','account_phone_e164',v_account.phone_e164,
    'phone_number_id',v_account.phone_number_id,'waba_id',v_account.waba_id,'to_phone_e164',v_phone,
    'template_id',v_template.id,'template_name',v_template.name,'language_code',v_template.language,
    'components',coalesce(v_outbox.payload#>'{template,components}','[]'::jsonb),
    'rendered_text',coalesce(v_outbox.payload->>'rendered_text',''),'idempotency_key',v_outbox.idempotency_key,'status','claimed'
  );
end;
$$;

create or replace function public.ops2_admin_attendance_accept_meta_template_outbound_v1(
  p_outbox_id uuid,
  p_provider_message_id text,
  p_accepted_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_message public.whatsapp_messages_v1%rowtype;
  v_provider_message_id text:=btrim(coalesce(p_provider_message_id,''));
  v_accepted_at timestamptz:=coalesce(p_accepted_at,now());
  v_message_id uuid;
  v_status_result jsonb;
  v_replayed integer:=0;
  v_status text;
  v_occurred_at timestamptz;
  r public.whatsapp_webhook_events_v1%rowtype;
begin
  if p_outbox_id is null then return jsonb_build_object('ok',false,'error','outbox_required'); end if;
  if v_provider_message_id not like 'wamid.%' or char_length(v_provider_message_id)>500 or v_provider_message_id ~ '[[:cntrl:][:space:]]' then
    return jsonb_build_object('ok',false,'error','provider_message_id_invalid');
  end if;

  select o.* into v_outbox from public.whatsapp_outbox_v1 o where o.id=p_outbox_id for update;
  if not found then return jsonb_build_object('ok',false,'error','outbox_not_found'); end if;
  if v_outbox.provider<>'meta' or v_outbox.purpose<>'human_attendance' or v_outbox.message_type<>'template' or v_outbox.template_id is null then
    return jsonb_build_object('ok',false,'error','outbox_not_meta_template_attendance');
  end if;
  if v_outbox.conversation_id is null then return jsonb_build_object('ok',false,'error','conversation_required'); end if;

  if v_outbox.status='sent' then
    if v_outbox.provider_message_id is distinct from v_provider_message_id or v_outbox.message_id is null then return jsonb_build_object('ok',false,'error','already_sent_mismatch'); end if;
    return jsonb_build_object('ok',true,'already_accepted',true,'idempotent',true,'outbox_id',v_outbox.id,'message_id',v_outbox.message_id,'provider_message_id',v_outbox.provider_message_id,'status','sent');
  end if;
  if v_outbox.status<>'claimed' then return jsonb_build_object('ok',false,'error','outbox_not_claimed','status',v_outbox.status); end if;

  select m.* into v_message from public.whatsapp_messages_v1 m
  where m.whatsapp_account_id=v_outbox.whatsapp_account_id and m.provider_message_id=v_provider_message_id
  order by case when m.provider='meta' then 0 else 1 end,m.created_at,m.id limit 1 for update;

  if found then
    if v_message.conversation_id is distinct from v_outbox.conversation_id then return jsonb_build_object('ok',false,'error','wamid_conversation_conflict'); end if;
    if v_message.direction<>'outbound' then return jsonb_build_object('ok',false,'error','wamid_direction_conflict'); end if;
    update public.whatsapp_messages_v1 m set
      provider='meta',customer_id=coalesce(m.customer_id,v_outbox.customer_id),message_type='template',
      text_body=coalesce(m.text_body,nullif(v_outbox.payload->>'rendered_text','')),
      status_current=case when m.status_current in ('sent','delivered','read','failed','cancelled') then m.status_current else 'accepted' end,
      sender_kind='human',sender_ref=coalesce(nullif(v_outbox.metadata->>'admin_user_id',''),m.sender_ref),sent_at=coalesce(m.sent_at,v_accepted_at),
      metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
        'source','attendance','transport','meta_cloud_api','outbox_id',v_outbox.id,'idempotency_key',v_outbox.idempotency_key,
        'meta_acceptance','accepted','meta_accepted_at',v_accepted_at,'template_id',v_outbox.template_id,
        'template_name',v_outbox.payload#>>'{template,name}','template_language',v_outbox.payload#>>'{template,language,code}',
        'promoted_from_shadow',v_message.provider='papoai'
      )
    where m.id=v_message.id returning * into v_message;
  else
    begin
      insert into public.whatsapp_messages_v1(
        conversation_id,whatsapp_account_id,customer_id,direction,message_type,provider,provider_message_id,
        provider_conversation_id,text_body,status_current,sender_kind,sender_ref,sent_at,metadata
      ) values (
        v_outbox.conversation_id,v_outbox.whatsapp_account_id,v_outbox.customer_id,'outbound','template','meta',v_provider_message_id,
        null,nullif(v_outbox.payload->>'rendered_text',''),'accepted','human',nullif(v_outbox.metadata->>'admin_user_id',''),v_accepted_at,
        jsonb_build_object('source','attendance','transport','meta_cloud_api','outbox_id',v_outbox.id,'idempotency_key',v_outbox.idempotency_key,
          'meta_acceptance','accepted','meta_accepted_at',v_accepted_at,'template_id',v_outbox.template_id,
          'template_name',v_outbox.payload#>>'{template,name}','template_language',v_outbox.payload#>>'{template,language,code}')
      ) returning * into v_message;
    exception when unique_violation then
      select m.* into v_message from public.whatsapp_messages_v1 m
      where m.whatsapp_account_id=v_outbox.whatsapp_account_id and m.provider_message_id=v_provider_message_id
      order by case when m.provider='meta' then 0 else 1 end,m.created_at,m.id limit 1 for update;
      if not found then raise; end if;
      if v_message.conversation_id is distinct from v_outbox.conversation_id or v_message.direction<>'outbound' then return jsonb_build_object('ok',false,'error','wamid_race_conflict'); end if;
      update public.whatsapp_messages_v1 m set provider='meta',message_type='template',sender_kind='human',
        sender_ref=coalesce(nullif(v_outbox.metadata->>'admin_user_id',''),m.sender_ref),
        text_body=coalesce(m.text_body,nullif(v_outbox.payload->>'rendered_text','')),
        status_current=case when m.status_current in ('sent','delivered','read','failed','cancelled') then m.status_current else 'accepted' end,
        sent_at=coalesce(m.sent_at,v_accepted_at),
        metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object('source','attendance','transport','meta_cloud_api','outbox_id',v_outbox.id,
          'idempotency_key',v_outbox.idempotency_key,'meta_acceptance','accepted','meta_accepted_at',v_accepted_at,'template_id',v_outbox.template_id,
          'template_name',v_outbox.payload#>>'{template,name}','template_language',v_outbox.payload#>>'{template,language,code}','race_reconciled',true)
      where m.id=v_message.id returning * into v_message;
    end;
  end if;

  v_message_id:=v_message.id;
  update public.whatsapp_outbox_v1 set message_id=v_message_id,provider_message_id=v_provider_message_id,status='sent',sent_at=v_accepted_at,last_error=null,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('meta_acceptance','accepted','meta_accepted_at',v_accepted_at,'canonical_message_id',v_message_id),updated_at=now()
  where id=v_outbox.id;

  update public.conversations set
    last_outbound_at=greatest(coalesce(last_outbound_at,'-infinity'::timestamptz),v_accepted_at),
    last_human_message_at=greatest(coalesce(last_human_message_at,'-infinity'::timestamptz),v_accepted_at),
    updated_at=greatest(updated_at,v_accepted_at)
  where id=v_outbox.conversation_id;

  v_status_result:=public.whatsapp_record_status_v1(v_outbox.whatsapp_account_id,'meta',v_provider_message_id,'accepted',v_accepted_at,now(),null,null,null,jsonb_build_object('source','graph_send_response','outbox_id',v_outbox.id));
  if coalesce((v_status_result->>'ok')::boolean,false) is not true then return jsonb_build_object('ok',false,'error','accepted_status_record_failed','detail',v_status_result); end if;

  for r in select e.* from public.whatsapp_webhook_events_v1 e
    where e.whatsapp_account_id=v_outbox.whatsapp_account_id and e.provider='meta' and e.provider_message_id=v_provider_message_id
      and e.event_type like 'message.status.%' and e.status='received'
    order by e.received_at,e.id for update
  loop
    v_status:=split_part(r.event_type,'.',3);
    if v_status not in ('sent','delivered','read','failed','cancelled') then
      update public.whatsapp_webhook_events_v1 set status='ignored',processed_at=now(),last_error='status_not_supported_for_replay' where id=r.id;
      continue;
    end if;
    v_occurred_at:=case when coalesce(r.payload->>'timestamp','') ~ '^\d+(\.\d+)?$' then to_timestamp((r.payload->>'timestamp')::double precision) else r.received_at end;
    v_status_result:=public.whatsapp_record_status_v1(
      v_outbox.whatsapp_account_id,'meta',v_provider_message_id,v_status,v_occurred_at,r.received_at,
      nullif(r.payload->'errors'->0->>'code',''),nullif(r.payload->'errors'->0->>'title',''),
      nullif(coalesce(r.payload->'errors'->0->>'message',r.payload->'errors'->0->'error_data'->>'details'),''),r.payload
    );
    if coalesce((v_status_result->>'ok')::boolean,false) is true then
      update public.whatsapp_webhook_events_v1 set status='normalized',processed_at=now(),last_error=null where id=r.id; v_replayed:=v_replayed+1;
    else
      update public.whatsapp_webhook_events_v1 set status='review_required',processed_at=now(),last_error=left(coalesce(v_status_result->>'error','status_replay_failed'),500) where id=r.id;
    end if;
  end loop;

  return jsonb_build_object('ok',true,'already_accepted',false,'idempotent',false,'outbox_id',v_outbox.id,'message_id',v_message_id,
    'provider_message_id',v_provider_message_id,'status_current',(select m.status_current from public.whatsapp_messages_v1 m where m.id=v_message_id),
    'pending_statuses_replayed',v_replayed,'status','sent');
end;
$$;

revoke all on function public.ops2_admin_attendance_enqueue_template_v1(uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.ops2_admin_attendance_claim_template_outbox_v1(uuid) from public,anon,authenticated;
revoke all on function public.ops2_admin_attendance_accept_meta_template_outbound_v1(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_enqueue_template_v1(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.ops2_admin_attendance_claim_template_outbox_v1(uuid) to service_role;
grant execute on function public.ops2_admin_attendance_accept_meta_template_outbound_v1(uuid,text,timestamptz) to service_role;
