-- Applied to canonical Supabase 20260930022205
-- Dona Antônia Operations 2.0
create or replace function public.ops2_valid_cpf_cnpj_v1(p_document text)
returns boolean
language plpgsql
immutable
set search_path to ''
as $$
declare
  d text:=regexp_replace(coalesce(p_document,''),'[^0-9]','','g');
  i integer;
  s integer;
  w integer;
  digit integer;
begin
  if d ~ '^([0-9])\1+$' then return false; end if;

  if length(d)=11 then
    s:=0;
    for i in 1..9 loop
      s:=s+(substr(d,i,1)::integer)*(11-i);
    end loop;
    digit:=case when (s*10)%11=10 then 0 else (s*10)%11 end;
    if digit<>substr(d,10,1)::integer then return false; end if;

    s:=0;
    for i in 1..10 loop
      s:=s+(substr(d,i,1)::integer)*(12-i);
    end loop;
    digit:=case when (s*10)%11=10 then 0 else (s*10)%11 end;
    return digit=substr(d,11,1)::integer;
  end if;

  if length(d)=14 then
    s:=0;
    for i in 1..12 loop
      w:=case when i<=4 then 6-i else 14-i end;
      s:=s+(substr(d,i,1)::integer)*w;
    end loop;
    digit:=case when s%11<2 then 0 else 11-(s%11) end;
    if digit<>substr(d,13,1)::integer then return false; end if;

    s:=0;
    for i in 1..13 loop
      w:=case when i<=5 then 7-i else 15-i end;
      s:=s+(substr(d,i,1)::integer)*w;
    end loop;
    digit:=case when s%11<2 then 0 else 11-(s%11) end;
    return digit=substr(d,14,1)::integer;
  end if;

  return false;
end;
$$;

create or replace function public.ops2_papoai_flow_text_field_v1(p_text text,p_key text)
returns text
language sql
immutable
set search_path to ''
as $$
  select nullif(btrim(regexp_replace(line,'^[^:]+:\s*','','i')),'')
  from regexp_split_to_table(coalesce(p_text,''),E'\r?\n') line
  where lower(btrim(split_part(line,':',1)))=lower(btrim(coalesce(p_key,'')))
  limit 1
$$;

create or replace function public.ops2_apply_papoai_customer_flow_v2(
  p_event_key text,
  p_phone text,
  p_name text,
  p_document text default null,
  p_address text default null,
  p_district text default null,
  p_city text default null,
  p_state text default 'MT',
  p_conversation_ref text default null,
  p_capture_id uuid default null,
  p_flow_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event text:=nullif(left(btrim(coalesce(p_event_key,'')),220),'');
  v_phone text:=public.canonical_whatsapp_e164_br_v2(p_phone);
  v_name text:=nullif(left(btrim(regexp_replace(coalesce(p_name,''),'\s+',' ','g')),180),'');
  v_doc text:=regexp_replace(coalesce(p_document,''),'[^0-9]','','g');
  v_doc_valid boolean:=false;
  v_customer_id uuid;
  v_doc_customer_id uuid;
  v_identity jsonb;
  v_created boolean:=false;
  v_profile_status text;
  v_provisional_id uuid;
  v_conversation_id uuid;
  v_whatsapp_account_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_order_suffix text;
  v_order_count integer:=0;
  v_address_id uuid;
  v_street text:=nullif(left(btrim(regexp_replace(coalesce(p_address,''),'\s+',' ','g')),300),'');
  v_district text:=nullif(left(btrim(regexp_replace(coalesce(p_district,''),'\s+',' ','g')),180),'');
  v_city text:=nullif(left(btrim(regexp_replace(coalesce(p_city,''),'\s+',' ','g')),120),'');
  v_state text:=upper(nullif(left(btrim(coalesce(p_state,'')),2),''));
  v_existing public.papoai_customer_flow_events_v1%rowtype;
  v_prior_text text;
  v_orders_linked integer:=0;
  v_merged boolean:=false;
begin
  if v_event is null then raise exception 'flow_event_key_required'; end if;
  if v_phone is null then raise exception 'invalid_phone'; end if;
  if v_name is null or length(v_name)<2 then raise exception 'customer_name_required'; end if;
  if v_state is null then v_state:='MT'; end if;

  select * into v_existing
  from public.papoai_customer_flow_events_v1
  where event_key=v_event;
  if found then
    return coalesce(v_existing.result,'{}'::jsonb)
      || jsonb_build_object('ok',v_existing.status='processed','duplicate',true,'event_key',v_event);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ops2:papoai-flow-v2:'||public.normalize_phone_digits(v_phone),0));

  v_doc_valid:=public.ops2_valid_cpf_cnpj_v1(v_doc);
  if v_doc_valid then
    select id into v_doc_customer_id
    from public.customers
    where regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g')=v_doc
    order by is_active desc,updated_at desc
    limit 1;
  end if;

  if v_doc_customer_id is not null then
    v_customer_id:=v_doc_customer_id;

    -- A site checkout may have created a provisional identity minutes earlier.
    -- Merge only that explicitly provisional, non-ERP identity; never arbitrary legacy customers.
    select c.id into v_provisional_id
    from public.customers c
    join public.customer_identity_profiles_v1 ip on ip.customer_id=c.id
    where c.id<>v_customer_id
      and ip.identity_status='provisional'
      and c.bling_contact_id is null
      and nullif(regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g'),'') is null
      and public.normalize_phone_digits(c.primary_whatsapp_e164)=public.normalize_phone_digits(v_phone)
    order by c.created_at desc
    limit 1
    for update;

    if v_provisional_id is not null then
      update public.orders
         set customer_id=v_customer_id,
             customer_snapshot=coalesce(customer_snapshot,'{}'::jsonb)
               || jsonb_build_object('customer_id',v_customer_id,'identity_merged_from',v_provisional_id),
             updated_at=now()
       where customer_id=v_provisional_id;

      update public.conversations
         set customer_id=v_customer_id,updated_at=now()
       where customer_id=v_provisional_id;

      update public.catalog_sessions
         set customer_id=v_customer_id
       where customer_id=v_provisional_id;

      update public.customer_phones
         set customer_id=v_customer_id,is_primary=false
       where customer_id=v_provisional_id
         and not exists(
           select 1 from public.customer_phones x
           where x.customer_id=v_customer_id and x.phone_e164=public.customer_phones.phone_e164
         );

      delete from public.customer_phones cp
       where cp.customer_id=v_provisional_id
         and exists(
           select 1 from public.customer_phones x
           where x.customer_id=v_customer_id and x.phone_e164=cp.phone_e164
         );

      update public.customers
         set primary_whatsapp_e164=null,is_active=false,updated_at=now()
       where id=v_provisional_id;

      update public.customer_identity_profiles_v1
         set identity_status='merged',
             metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('merged_into',v_customer_id,'merged_at',now()),
             updated_at=now()
       where customer_id=v_provisional_id;
      v_merged:=true;
    end if;

    update public.customers
       set name=case
             when nullif(btrim(coalesce(name,'')),'') is null then v_name
             else name
           end,
           primary_whatsapp_e164=case
             when primary_whatsapp_e164 is null
              and not exists(select 1 from public.customers x where x.id<>v_customer_id and x.primary_whatsapp_e164=v_phone)
             then v_phone else primary_whatsapp_e164 end,
           is_active=true,updated_at=now()
     where id=v_customer_id;

    if not exists(
      select 1 from public.customer_phones cp
      where cp.customer_id=v_customer_id
        and public.normalize_phone_digits(cp.phone_e164)=public.normalize_phone_digits(v_phone)
    ) and not exists(
      select 1 from public.customer_phones cp
      where cp.customer_id<>v_customer_id and cp.phone_e164=v_phone
    ) then
      insert into public.customer_phones(customer_id,phone_e164,source,is_primary,verified_at)
      values(v_customer_id,v_phone,'papoai_flow',false,now())
      on conflict(phone_e164) do nothing;
    end if;
    v_created:=false;
  else
    v_identity:=public.ensure_storefront_customer_v2(v_phone,v_name,v_event);
    if coalesce((v_identity->>'ok')::boolean,false) is not true then
      insert into public.papoai_customer_flow_events_v1(event_key,phone_e164,status,result)
      values(v_event,v_phone,'review_required',
        jsonb_build_object('ok',false,'error',coalesce(v_identity->>'error','identity_failed'),'external_write',false));
      return jsonb_build_object('ok',false,'error',coalesce(v_identity->>'error','identity_failed'),'review_required',true);
    end if;
    v_customer_id:=(v_identity->>'customer_id')::uuid;
    v_created:=coalesce((v_identity->>'created')::boolean,false);

    update public.customers
       set name=v_name,
           cpf_cnpj=case
             when v_doc_valid
              and not exists(
                select 1 from public.customers x
                where x.id<>v_customer_id
                  and regexp_replace(coalesce(x.cpf_cnpj,''),'[^0-9]','','g')=v_doc
              )
             then v_doc
             else cpf_cnpj end,
           is_active=true,updated_at=now()
     where id=v_customer_id;
  end if;

  if v_doc_valid then
    update public.customers
       set cpf_cnpj=case
         when nullif(regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g'),'') is null
          and not exists(
            select 1 from public.customers x
            where x.id<>v_customer_id
              and regexp_replace(coalesce(x.cpf_cnpj,''),'[^0-9]','','g')=v_doc
          )
         then v_doc else cpf_cnpj end,
           updated_at=now()
     where id=v_customer_id;
  end if;

  insert into public.customer_identity_profiles_v1(
    customer_id,identity_status,created_from,canonical_phone_e164,last_source_key,verified_at,metadata,updated_at
  ) values(
    v_customer_id,'verified_flow','papoai_flow',v_phone,coalesce(p_flow_token,v_event),now(),
    jsonb_strip_nulls(jsonb_build_object(
      'flow_capture_id',p_capture_id,'flow_token',p_flow_token,
      'document_received',nullif(v_doc,''),'document_valid',v_doc_valid,
      'provisional_merged',v_merged
    )),now()
  )
  on conflict(customer_id) do update set
    identity_status='verified_flow',
    canonical_phone_e164=excluded.canonical_phone_e164,
    last_source_key=excluded.last_source_key,
    verified_at=now(),
    metadata=coalesce(public.customer_identity_profiles_v1.metadata,'{}'::jsonb)||excluded.metadata,
    updated_at=now();

  -- User-submitted Flow data is treated as the latest confirmed delivery address.
  if v_street is not null or v_district is not null or v_city is not null then
    select id into v_address_id
    from public.customer_addresses
    where customer_id=v_customer_id and is_active=true
    order by is_default desc,last_confirmed_at desc nulls last,updated_at desc
    limit 1
    for update;

    if v_address_id is null then
      insert into public.customer_addresses(
        customer_id,label,street,number,neighborhood,city,state,is_default,is_active,last_confirmed_at,created_at,updated_at
      ) values(
        v_customer_id,'Entrega',v_street,null,v_district,v_city,v_state,true,true,now(),now(),now()
      )
      returning id into v_address_id;
    else
      update public.customer_addresses
         set street=coalesce(v_street,street),
             number=case when v_street is not null then null else number end,
             neighborhood=coalesce(v_district,neighborhood),
             city=coalesce(v_city,city),
             state=coalesce(v_state,state),
             is_default=true,is_active=true,last_confirmed_at=now(),updated_at=now()
       where id=v_address_id;
      update public.customer_addresses
         set is_default=false,updated_at=now()
       where customer_id=v_customer_id and id<>v_address_id and is_default=true;
    end if;
  end if;

  -- Conversation was normally resolved by the capture processor first.
  if p_capture_id is not null then
    begin
      select nullif(metadata->>'conversation_id','')::uuid,
             nullif(metadata->>'whatsapp_account_id','')::uuid
        into v_conversation_id,v_whatsapp_account_id
      from public.papoai_webhook_inbox_v2 where id=p_capture_id;
    exception when others then
      v_conversation_id:=null;v_whatsapp_account_id:=null;
    end;
  end if;

  if v_conversation_id is null and nullif(btrim(coalesce(p_conversation_ref,'')),'') is not null then
    select id,whatsapp_account_id into v_conversation_id,v_whatsapp_account_id
    from public.conversations
    where referral->>'papoai_session_uid'=p_conversation_ref
      and public.normalize_phone_digits(wa_contact_e164)=any(public.phone_variants_br(v_phone))
    order by updated_at desc limit 1;
  end if;

  if v_conversation_id is not null then
    update public.conversations
       set customer_id=v_customer_id,updated_at=now()
     where id=v_conversation_id
       and (customer_id is null or customer_id=v_customer_id
            or customer_id in (
              select ip.customer_id from public.customer_identity_profiles_v1 ip
              where ip.identity_status='merged' and ip.metadata->>'merged_into'=v_customer_id::text
            ));
  end if;

  -- Prefer the explicit order number that the site sent to PapoAI before the Flow.
  if p_capture_id is not null then
    select coalesce(i.payload#>>'{data,message,content}',i.payload#>>'{data,message,text}',i.payload#>>'{data,message,body}','')
      into v_prior_text
    from public.papoai_webhook_inbox_v2 i
    join public.papoai_webhook_inbox_v2 cur on cur.id=p_capture_id
    where i.received_at between cur.received_at-interval '24 hours' and cur.received_at
      and public.normalize_phone_digits(i.phone_candidate)=any(public.phone_variants_br(v_phone))
      and coalesce(i.payload#>>'{data,message,content}',i.payload#>>'{data,message,text}',i.payload#>>'{data,message,body}','') ~* '(?m)^NUMERO:\s*'
    order by i.received_at desc
    limit 1;

    v_order_suffix:=upper(nullif(substring(coalesce(v_prior_text,'') from '(?im)^NUMERO:\s*([A-Z0-9-]+)'),''));
  end if;

  if v_order_suffix is not null then
    select count(*),(array_agg(o.id order by o.created_at desc))[1]
      into v_order_count,v_order_id
    from public.orders o
    where o.source in ('vitrine','storefront_v2')
      and upper(right(coalesce(o.order_number,''),length(v_order_suffix)))=v_order_suffix
      and public.normalize_phone_digits(o.phone_e164)=any(public.phone_variants_br(v_phone))
      and (o.customer_id is null or o.customer_id=v_customer_id
           or o.customer_id in (
             select ip.customer_id from public.customer_identity_profiles_v1 ip
             where ip.identity_status='merged' and ip.metadata->>'merged_into'=v_customer_id::text
           ));
    if v_order_count<>1 then v_order_id:=null; end if;
  end if;

  if v_order_id is null and p_capture_id is not null then
    select count(*),(array_agg(o.id order by o.created_at desc))[1]
      into v_order_count,v_order_id
    from public.orders o
    join public.papoai_webhook_inbox_v2 cur on cur.id=p_capture_id
    where o.source in ('vitrine','storefront_v2')
      and o.created_at between cur.received_at-interval '6 hours' and cur.received_at+interval '15 minutes'
      and public.normalize_phone_digits(o.phone_e164)=any(public.phone_variants_br(v_phone))
      and (o.customer_id is null or o.customer_id=v_customer_id
           or o.customer_id in (
             select ip.customer_id from public.customer_identity_profiles_v1 ip
             where ip.identity_status='merged' and ip.metadata->>'merged_into'=v_customer_id::text
           ));
    if v_order_count<>1 then v_order_id:=null; end if;
  end if;

  if v_order_id is not null then
    update public.orders
       set customer_id=v_customer_id,
           conversation_id=coalesce(conversation_id,v_conversation_id),
           whatsapp_account_id=coalesce(whatsapp_account_id,v_whatsapp_account_id),
           phone_e164=v_phone,
           customer_snapshot=coalesce(customer_snapshot,'{}'::jsonb)
             || jsonb_strip_nulls(jsonb_build_object(
               'customer_id',v_customer_id,'name',v_name,'phone_e164',v_phone,
               'cpf_cnpj',case when v_doc_valid then v_doc else null end,
               'identity_status','verified_flow','papoai_flow_linked_at',now()
             )),
           delivery_address=coalesce(delivery_address,'{}'::jsonb)
             || jsonb_strip_nulls(jsonb_build_object(
               'source_customer_id',v_customer_id,'customer_name',v_name,'phone',v_phone,
               'street',v_street,'neighborhood',v_district,'city',v_city,'state',v_state
             )),
           updated_at=now()
     where id=v_order_id
     returning order_number into v_order_number;
    get diagnostics v_orders_linked=row_count;
  end if;

  begin perform public.refresh_customer_purchase_profile(v_customer_id); exception when others then null; end;

  select identity_status into v_profile_status
  from public.customer_identity_profiles_v1 where customer_id=v_customer_id;

  insert into public.papoai_customer_flow_events_v1(
    event_key,phone_e164,customer_id,conversation_id,customer_created,orders_linked,status,result
  ) values(
    v_event,v_phone,v_customer_id,v_conversation_id,v_created,v_orders_linked,'processed',
    jsonb_build_object(
      'ok',true,'customer_id',v_customer_id,'customer_created',v_created,
      'identity_status',v_profile_status,'conversation_id',v_conversation_id,
      'orders_linked',v_orders_linked,'order_id',v_order_id,'order_number',v_order_number,
      'document_valid',v_doc_valid,'address_saved',v_address_id is not null,
      'provisional_merged',v_merged,'external_order_created',false
    )
  );

  return jsonb_build_object(
    'ok',true,'duplicate',false,'event_key',v_event,'customer_id',v_customer_id,
    'customer_created',v_created,'identity_status',v_profile_status,
    'conversation_id',v_conversation_id,'orders_linked',v_orders_linked,
    'order_id',v_order_id,'order_number',v_order_number,
    'document_valid',v_doc_valid,'address_saved',v_address_id is not null,
    'provisional_merged',v_merged,'external_order_created',false
  );
end;
$$;

revoke all on function public.ops2_apply_papoai_customer_flow_v2(text,text,text,text,text,text,text,text,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.ops2_apply_papoai_customer_flow_v2(text,text,text,text,text,text,text,text,text,uuid,text)
  to service_role;

create or replace function public.ops2_process_papoai_flow_capture_v2(p_capture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.papoai_webhook_inbox_v2%rowtype;
  v_text text;
  v_token text;
  v_consent text;
  v_name text;
  v_doc text;
  v_address text;
  v_district text;
  v_city text;
  v_bridge jsonb;
  v_result jsonb;
begin
  select * into r from public.papoai_webhook_inbox_v2 where id=p_capture_id for update;
  if not found then return jsonb_build_object('ok',false,'error','capture_not_found'); end if;

  v_text:=coalesce(r.payload#>>'{data,message,content}',r.payload#>>'{data,message,text}',r.payload#>>'{data,message,body}','');
  v_token:=public.ops2_papoai_flow_text_field_v1(v_text,'flow_token');
  if v_token is null then return jsonb_build_object('ok',true,'skipped',true,'reason','not_flow_text'); end if;

  v_consent:=lower(coalesce(public.ops2_papoai_flow_text_field_v1(v_text,'data_sharing_consent'),''));
  if v_consent not in ('true','1','yes','sim') then
    update public.papoai_webhook_inbox_v2
       set status='review_required',last_error='flow_consent_missing_or_false',
           processed_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)
             || jsonb_build_object('structured_mode','papoai_flow_text_v2','structured_processed',false)
     where id=p_capture_id;
    return jsonb_build_object('ok',false,'error','flow_consent_missing_or_false');
  end if;

  v_name:=public.ops2_papoai_flow_text_field_v1(v_text,'custom_5');
  v_doc:=public.ops2_papoai_flow_text_field_v1(v_text,'custom_3');
  v_address:=public.ops2_papoai_flow_text_field_v1(v_text,'custom_4');
  v_district:=public.ops2_papoai_flow_text_field_v1(v_text,'custom_1');
  v_city:=public.ops2_papoai_flow_text_field_v1(v_text,'custom_2');

  v_bridge:=public.papoai_ensure_conversation_v2(p_capture_id);
  if coalesce((v_bridge->>'ok')::boolean,false) is not true then
    update public.papoai_webhook_inbox_v2
       set status='review_required',last_error=coalesce(v_bridge->>'error','conversation_bridge_failed'),
           processed_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)
             || jsonb_build_object('structured_mode','papoai_flow_text_v2','structured_processed',false)
     where id=p_capture_id;
    return v_bridge||jsonb_build_object('flow_detected',true);
  end if;

  v_result:=public.ops2_apply_papoai_customer_flow_v2(
    v_token,
    r.phone_candidate,
    v_name,
    v_doc,
    v_address,
    v_district,
    v_city,
    'MT',
    coalesce(r.conversation_ref,v_bridge->>'conversation_id'),
    p_capture_id,
    v_token
  );

  update public.papoai_webhook_inbox_v2
     set status=case when coalesce((v_result->>'ok')::boolean,false) then 'processed' else 'review_required' end,
         last_error=case when coalesce((v_result->>'ok')::boolean,false) then null else coalesce(v_result->>'error','flow_processing_failed') end,
         processed_at=now(),
         metadata=coalesce(metadata,'{}'::jsonb)
           || jsonb_strip_nulls(jsonb_build_object(
             'structured_mode','papoai_flow_text_v2',
             'structured_processed',coalesce((v_result->>'ok')::boolean,false),
             'flow_token',v_token,
             'customer_id',v_result->>'customer_id',
             'conversation_id',coalesce(v_result->>'conversation_id',v_bridge->>'conversation_id'),
             'orders_linked',coalesce((v_result->>'orders_linked')::integer,0),
             'order_id',v_result->>'order_id',
             'order_number',v_result->>'order_number',
             'document_valid',coalesce((v_result->>'document_valid')::boolean,false)
           ))
   where id=p_capture_id;

  return v_result||jsonb_build_object('flow_detected',true,'flow_token',v_token);
end;
$$;

revoke all on function public.ops2_process_papoai_flow_capture_v2(uuid) from public,anon,authenticated;
grant execute on function public.ops2_process_papoai_flow_capture_v2(uuid) to service_role;

create or replace function public.ops2_auto_process_papoai_flow_v2()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_text text;
begin
  if new.status='normalized'
     and old.status is distinct from new.status
     and new.event_name='message.received'
  then
    v_text:=coalesce(new.payload#>>'{data,message,content}',new.payload#>>'{data,message,text}',new.payload#>>'{data,message,body}','');
    if v_text ~* '(?m)^flow_token\s*:' then
      perform public.ops2_process_papoai_flow_capture_v2(new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ops2_auto_process_papoai_flow_v2 on public.papoai_webhook_inbox_v2;
create trigger trg_ops2_auto_process_papoai_flow_v2
after update of status,event_name on public.papoai_webhook_inbox_v2
for each row
execute function public.ops2_auto_process_papoai_flow_v2();

create or replace function public.ops2_apply_papoai_customer_flow_v1(
  p_event_key text,
  p_phone text,
  p_name text,
  p_conversation_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return public.ops2_apply_papoai_customer_flow_v2(
    p_event_key,p_phone,p_name,null,null,null,null,'MT',p_conversation_ref,null,null
  );
end;
$$;
revoke all on function public.ops2_apply_papoai_customer_flow_v1(text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.ops2_apply_papoai_customer_flow_v1(text,text,text,text)
  to service_role;
