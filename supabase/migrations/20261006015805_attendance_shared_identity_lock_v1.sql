begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
lock table public.conversations in access exclusive mode;
CREATE OR REPLACE FUNCTION public.papoai_ensure_conversation_v2(p_capture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.papoai_webhook_inbox_v2%rowtype;
  v_phone_e164 text;
  v_phone_digits text;
  v_business_phone text;
  v_occurred_at timestamptz;
  v_customer_id uuid;
  v_contact_id text;
  v_session_uid text;
  v_account_id uuid;
  v_account_count integer;
  v_conversation_id uuid;
  v_created boolean:=false;
begin
  select * into v_row
  from public.papoai_webhook_inbox_v2
  where id=p_capture_id
  for update;

  if not found then return jsonb_build_object('ok',false,'error','capture_not_found'); end if;
  if v_row.status not in ('normalized','processed') then
    return jsonb_build_object('ok',false,'error','capture_not_normalized','status',v_row.status);
  end if;
  if coalesce(v_row.event_name,'')<>'message.received' then
    return jsonb_build_object('ok',true,'skipped',true,'reason','not_inbound_message');
  end if;

  v_phone_e164:=public.canonical_whatsapp_e164_br_v2(v_row.phone_candidate);
  if v_phone_e164 is null then
    update public.papoai_webhook_inbox_v2
       set status='review_required',last_error='phone_missing_for_conversation'
     where id=p_capture_id;
    return jsonb_build_object('ok',false,'error','phone_missing_for_conversation');
  end if;
  v_phone_digits:=public.normalize_phone_digits(v_phone_e164);
  v_business_phone:=public.canonical_whatsapp_e164_br_v2(v_row.metadata->>'phone_to');

  begin
    v_occurred_at:=coalesce(nullif(v_row.metadata->>'occurred_at','')::timestamptz,v_row.received_at);
  exception when others then v_occurred_at:=v_row.received_at; end;

  begin
    v_customer_id:=nullif(v_row.metadata->>'customer_id','')::uuid;
  exception when others then v_customer_id:=null; end;

  if v_customer_id is null then
    select customer_id into v_customer_id
    from public.lookup_customer_by_phone(v_phone_e164)
    limit 1;
  end if;

  v_contact_id:=nullif(v_row.metadata->>'contact_id','');
  v_session_uid:=nullif(v_row.conversation_ref,'');

  select count(*),(array_agg(id order by updated_at desc))[1]
    into v_account_count,v_account_id
  from public.whatsapp_accounts
  where is_active=true
    and v_business_phone is not null
    and public.normalize_phone_digits(phone_e164)=public.normalize_phone_digits(v_business_phone);

  if v_account_count<>1 or v_account_id is null then
    update public.papoai_webhook_inbox_v2
       set status='review_required',
           last_error=case when v_business_phone is null then 'business_phone_missing'
                           else 'whatsapp_account_unresolved' end
     where id=p_capture_id;
    return jsonb_build_object(
      'ok',false,
      'error',case when v_business_phone is null then 'business_phone_missing' else 'whatsapp_account_unresolved' end,
      'business_phone',v_business_phone,'count',v_account_count
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('whatsapp-conversation:'||v_account_id::text||':'||v_phone_e164,0));

  select c.id into v_conversation_id
  from public.conversations c
  where c.whatsapp_account_id=v_account_id
    and coalesce(public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164),c.wa_contact_e164)=v_phone_e164
    and c.status<>'closed'
  order by c.updated_at desc
  limit 1
  for update;

  if v_conversation_id is null then
    insert into public.conversations(
      whatsapp_account_id,channel_account_id,customer_id,wa_contact_e164,source,status,stage,
      response_preference,human_required,referral,opened_at,last_inbound_at,
      service_window_expires_at,created_at,updated_at,mode,channel,external_user_id
    ) values (
      v_account_id,v_account_id,v_customer_id,v_phone_e164,'organic','open','new',
      'auto',false,
      jsonb_strip_nulls(jsonb_build_object(
        'source','papoai','papoai_session_uid',v_session_uid,
        'papoai_contact_id',v_contact_id,'business_phone_e164',v_business_phone
      )),
      v_occurred_at,v_occurred_at,v_occurred_at+interval '24 hours',
      now(),now(),'ai','whatsapp',v_phone_e164
    )
    returning id into v_conversation_id;
    v_created:=true;
  else
    update public.conversations
       set customer_id=coalesce(customer_id,v_customer_id),
           wa_contact_e164=v_phone_e164,
           channel_account_id=coalesce(channel_account_id,v_account_id),
           external_user_id=coalesce(external_user_id,v_phone_e164),
           last_inbound_at=greatest(coalesce(last_inbound_at,v_occurred_at),v_occurred_at),
           service_window_expires_at=greatest(
             coalesce(service_window_expires_at,v_occurred_at+interval '24 hours'),
             v_occurred_at+interval '24 hours'
           ),
           referral=coalesce(referral,'{}'::jsonb)
             || jsonb_strip_nulls(jsonb_build_object(
               'source','papoai','papoai_session_uid',v_session_uid,
               'papoai_contact_id',v_contact_id,'business_phone_e164',v_business_phone
             )),
           updated_at=now()
     where id=v_conversation_id;
  end if;

  update public.papoai_webhook_inbox_v2
     set phone_candidate=public.normalize_phone_digits(v_phone_e164),
         metadata=coalesce(metadata,'{}'::jsonb)
           || jsonb_build_object(
             'conversation_id',v_conversation_id,
             'conversation_created',v_created,
             'customer_id',v_customer_id,
             'conversation_bridge_version',3,
             'business_phone_e164',v_business_phone,
             'whatsapp_account_id',v_account_id,
             'canonical_phone_e164',v_phone_e164
           ),
         last_error=null
   where id=p_capture_id;

  return jsonb_build_object(
    'ok',true,'conversation_id',v_conversation_id,'created',v_created,
    'customer_id',v_customer_id,'phone_e164',v_phone_e164,
    'business_phone_e164',v_business_phone,'whatsapp_account_id',v_account_id
  );
end;
$function$
;
revoke all on function public.papoai_ensure_conversation_v2(uuid) from public,anon,authenticated;
grant execute on function public.papoai_ensure_conversation_v2(uuid) to service_role;

do $migration$
declare
  g record;
  v_losers uuid[];
  v_loser uuid;
  v_rows integer;
  v_refs bigint;
  v_read_message_id uuid;
  v_read_at timestamptz;
  v_follow_up_at timestamptz;
  v_state_updated_at timestamptz;
  v_status text;
  v_mode text;
  v_stage text;
  v_human_required boolean;
  v_last_inbound_at timestamptz;
  v_last_outbound_at timestamptz;
  v_service_window_expires_at timestamptz;
  v_updated_at timestamptz;
  v_fk_table text;
begin
  for g in
    with normalized as (
      select c.*,
             public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164) as canonical_phone,
             (select count(*) from public.whatsapp_messages_v1 m where m.conversation_id=c.id) as message_count,
             greatest(c.updated_at,c.last_inbound_at,c.last_outbound_at,c.created_at) as activity_at
      from public.conversations c
      where c.status <> 'closed'
    ), eligible_groups as (
      select whatsapp_account_id,canonical_phone
      from normalized
      where canonical_phone is not null
      group by whatsapp_account_id,canonical_phone
      having count(*)>1
         and (
           count(distinct customer_id)=0
           or (count(distinct customer_id)=1 and not bool_or(customer_id is null))
         )
    ), ranked as (
      select n.*,
             row_number() over (
               partition by n.whatsapp_account_id,n.canonical_phone
               order by n.message_count desc,n.activity_at desc,n.id asc
             ) as position
      from normalized n
      join eligible_groups e using(whatsapp_account_id,canonical_phone)
    )
    select keeper.id as keeper_id,
           keeper.whatsapp_account_id,
           keeper.canonical_phone,
           array_agg(other.id order by other.id) filter(where other.position>1) as loser_ids
    from ranked keeper
    join ranked other using(whatsapp_account_id,canonical_phone)
    where keeper.position=1
    group by keeper.id,keeper.whatsapp_account_id,keeper.canonical_phone
    order by keeper.whatsapp_account_id,keeper.canonical_phone
  loop
    v_losers:=g.loser_ids;
    if coalesce(array_length(v_losers,1),0)=0 then continue; end if;

    -- A unique snapshot key cannot be moved if the keeper already has the same
    -- extraction run identity. Abort the entire migration rather than discard it.
    if exists(
      select 1
      from public.customer_profile_extraction_runs_v1 loser
      join public.customer_profile_extraction_runs_v1 keeper
        on keeper.conversation_id=g.keeper_id and keeper.snapshot_key=loser.snapshot_key
      where loser.conversation_id=any(v_losers)
    ) then
      raise exception 'conversation consolidation has conflicting customer profile snapshots for keeper %',g.keeper_id;
    end if;

    -- Keep the freshest read pointer and the follow-up from the most recently
    -- updated state row (including a deliberate NULL cancellation).
    select s.last_read_message_id,s.last_read_at,s.updated_at
      into v_read_message_id,v_read_at,v_state_updated_at
    from public.attendance_conversation_state_v1 s
    where s.conversation_id=g.keeper_id or s.conversation_id=any(v_losers)
    order by s.last_read_at desc nulls last,s.updated_at desc,s.conversation_id asc
    limit 1;

    select s.follow_up_at,s.updated_at
      into v_follow_up_at,v_updated_at
    from public.attendance_conversation_state_v1 s
    where s.conversation_id=g.keeper_id or s.conversation_id=any(v_losers)
    order by s.updated_at desc,s.conversation_id asc
    limit 1;

    if found then
      v_state_updated_at:=greatest(v_state_updated_at,v_updated_at);
      insert into public.attendance_conversation_state_v1(
        conversation_id,last_read_message_id,last_read_at,follow_up_at,updated_at
      ) values(g.keeper_id,v_read_message_id,v_read_at,v_follow_up_at,v_state_updated_at)
      on conflict(conversation_id) do update set
        last_read_message_id=excluded.last_read_message_id,
        last_read_at=excluded.last_read_at,
        follow_up_at=excluded.follow_up_at,
        updated_at=excluded.updated_at;
    end if;
    delete from public.attendance_conversation_state_v1 where conversation_id=any(v_losers);

    insert into public.attendance_conversation_labels_v1(conversation_id,label_id,created_at)
    select g.keeper_id,l.label_id,l.created_at
    from public.attendance_conversation_labels_v1 l
    where l.conversation_id=any(v_losers)
    on conflict(conversation_id,label_id) do nothing;
    delete from public.attendance_conversation_labels_v1 where conversation_id=any(v_losers);

    -- Move every other conversation foreign-key reference, preserving its row ID.
    foreach v_fk_table in array array[
      'whatsapp_messages_v1',
      'attendance_human_ai_audit_v1',
      'attendance_library_audit_v1',
      'carts',
      'catalog_sessions',
      'customer_profile_extraction_runs_v1',
      'customer_profile_suggestions_v1',
      'ops2_papoai_outbound_intents_v1',
      'ops2_whatsapp_outbox_v1',
      'orders',
      'papoai_customer_flow_events_v1',
      'storefront_identity_tokens',
      'whatsapp_ana_jobs_v1',
      'whatsapp_ana_reviews_v1',
      'whatsapp_outbox_v1'
    ] loop
      execute format('update public.%I set conversation_id=$1 where conversation_id=any($2)',v_fk_table)
        using g.keeper_id,v_losers;
    end loop;

    -- Preserve the latest operational state while retaining the most useful
    -- history-bearing row selected above.
    select c.status,c.mode,c.stage
      into v_status,v_mode,v_stage
    from public.conversations c
    where c.id=g.keeper_id or c.id=any(v_losers)
    order by c.updated_at desc,c.created_at desc,c.id asc
    limit 1;

    select bool_or(c.human_required),max(c.last_inbound_at),max(c.last_outbound_at),
           max(c.service_window_expires_at),max(c.updated_at)
      into v_human_required,v_last_inbound_at,v_last_outbound_at,
           v_service_window_expires_at,v_updated_at
    from public.conversations c
    where c.id=g.keeper_id or c.id=any(v_losers);

    update public.conversations
       set wa_contact_e164=g.canonical_phone,
           status=v_status,
           mode=v_mode,
           stage=v_stage,
           human_required=coalesce(v_human_required,false),
           last_inbound_at=v_last_inbound_at,
           last_outbound_at=v_last_outbound_at,
           service_window_expires_at=v_service_window_expires_at,
           updated_at=v_updated_at
     where id=g.keeper_id;

    -- Fail closed if any FK was not covered by the transfer list.
    for v_fk_table in
      select distinct tc.table_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name=kcu.constraint_name and tc.constraint_schema=kcu.constraint_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema
      where tc.constraint_type='FOREIGN KEY'
        and tc.table_schema='public'
        and ccu.table_schema='public' and ccu.table_name='conversations' and ccu.column_name='id'
        and tc.table_name not in ('attendance_conversation_state_v1','attendance_conversation_labels_v1')
    loop
      execute format('select count(*) from public.%I where conversation_id=any($1)',v_fk_table)
        into v_refs using v_losers;
      if v_refs<>0 then
        raise exception 'conversation consolidation left % references in public.%',v_refs,v_fk_table;
      end if;
    end loop;

    if exists(select 1 from public.attendance_conversation_state_v1 where conversation_id=any(v_losers))
       or exists(select 1 from public.attendance_conversation_labels_v1 where conversation_id=any(v_losers)) then
      raise exception 'conversation consolidation left state or label references for keeper %',g.keeper_id;
    end if;

    delete from public.conversations where id=any(v_losers);
    get diagnostics v_rows=row_count;
    if v_rows<>array_length(v_losers,1) then
      raise exception 'conversation consolidation expected to remove % rows, removed %',array_length(v_losers,1),v_rows;
    end if;
  end loop;
end
$migration$;


commit;

