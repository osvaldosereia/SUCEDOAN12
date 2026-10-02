-- Dona Antônia — Central de Atendimento v2 / Fase 1
-- Reconcilia capturas inbound já recebidas pelo PapoAI que não chegaram ao histórico canônico.
-- Usa exclusivamente whatsapp_ingest_event_v1 para preservar resolução de conversa e idempotência.

create or replace function public.ops2_reconcile_papoai_inbound_v1(
  p_since timestamptz default (now() - interval '3 days'),
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_limit integer := least(500,greatest(1,coalesce(p_limit,500)));
  r record;
  v_account_id uuid;
  v_conversation_id uuid;
  v_customer_id uuid;
  v_phone text;
  v_source text;
  v_provider_message_id text;
  v_provider_conversation_id text;
  v_raw_type text;
  v_mime_type text;
  v_filename text;
  v_message_type text;
  v_text_body text;
  v_message_at timestamptz;
  v_description jsonb;
  v_location jsonb;
  v_media jsonb;
  v_message jsonb;
  v_result jsonb;
  v_event_id uuid;
  v_message_id uuid;
  v_existing_message_id uuid;
  v_processed integer := 0;
  v_duplicates integer := 0;
  v_skipped integer := 0;
  v_errors integer := 0;
  v_considered integer := 0;
begin
  for r in
    select i.*
    from public.papoai_webhook_inbox_v2 i
    where i.received_at >= coalesce(p_since,now()-interval '3 days')
      and coalesce(i.payload#>>'{event,type}',i.event_name,i.payload->>'event_name')='message.received'
      and nullif(i.metadata->>'canonical_message_id','') is null
    order by i.received_at asc,i.id asc
    limit v_limit
  loop
    v_considered:=v_considered+1;
    v_account_id:=null;v_conversation_id:=null;v_customer_id:=null;v_phone:=null;v_source:=null;
    v_provider_message_id:=null;v_provider_conversation_id:=null;v_description:=null;v_location:=null;v_media:=null;
    v_result:=null;v_event_id:=null;v_message_id:=null;v_existing_message_id:=null;

    begin
      begin v_conversation_id:=nullif(r.metadata->>'conversation_id','')::uuid; exception when others then v_conversation_id:=null; end;
      begin v_account_id:=nullif(r.metadata->>'whatsapp_account_id','')::uuid; exception when others then v_account_id:=null; end;
      begin v_customer_id:=nullif(r.metadata->>'customer_id','')::uuid; exception when others then v_customer_id:=null; end;

      if v_conversation_id is not null then
        select coalesce(v_account_id,c.whatsapp_account_id),coalesce(v_customer_id,c.customer_id),
               coalesce(nullif(r.metadata->>'canonical_phone_e164',''),c.wa_contact_e164),c.source
          into v_account_id,v_customer_id,v_phone,v_source
        from public.conversations c
        where c.id=v_conversation_id;
      end if;

      if v_account_id is null or v_conversation_id is null or nullif(btrim(coalesce(v_phone,'')),'') is null then
        v_skipped:=v_skipped+1;
        continue;
      end if;

      v_provider_message_id:=nullif(btrim(coalesce(
        r.metadata->>'whatsapp_message_id',
        r.payload#>>'{data,message,external_id}',
        r.external_message_id,
        r.payload#>>'{data,message,id}'
      )), '');
      if v_provider_message_id is null then
        v_skipped:=v_skipped+1;
        continue;
      end if;

      v_provider_conversation_id:=nullif(btrim(coalesce(r.payload#>>'{data,session,uid}',r.conversation_ref)),'');
      v_raw_type:=lower(nullif(btrim(coalesce(r.payload#>>'{data,message,type}',r.payload#>>'{data,message,mimetype}','unknown')),''));
      v_mime_type:=nullif(btrim(coalesce(r.payload#>>'{data,message,mimetype}',case when position('/' in coalesce(v_raw_type,''))>0 then v_raw_type end)), '');
      v_filename:=nullif(btrim(r.payload#>>'{data,message,filename}'),'');
      v_text_body:=nullif(btrim(coalesce(
        r.payload#>>'{data,message,content}',
        r.payload#>>'{data,message,body}',
        r.payload#>>'{data,message,text}',
        r.payload#>>'{data,message,caption}'
      )), '');

      v_message_at:=r.received_at;
      begin
        if nullif(r.metadata->>'occurred_at','') is not null then
          v_message_at:=(r.metadata->>'occurred_at')::timestamptz;
        elsif nullif(r.payload#>>'{data,message,created_at}','') is not null then
          v_message_at:=(r.payload#>>'{data,message,created_at}')::timestamptz;
        elsif nullif(r.payload#>>'{data,message,timestamp}','') ~ '^\d+(\.\d+)?$' then
          v_message_at:=to_timestamp((r.payload#>>'{data,message,timestamp}')::double precision);
        end if;
      exception when others then
        v_message_at:=r.received_at;
      end;

      if nullif(r.payload#>>'{data,message,description}','') is not null then
        begin v_description:=(r.payload#>>'{data,message,description}')::jsonb; exception when others then v_description:=null; end;
      end if;
      if v_description is not null
         and jsonb_typeof(v_description)='object'
         and (v_description->>'latitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
         and (v_description->>'longitude') ~ '^-?[0-9]+(\.[0-9]+)?$' then
        v_location:=jsonb_strip_nulls(jsonb_build_object(
          'name',nullif(btrim(v_description->>'name'),''),
          'address',nullif(btrim(v_description->>'address'),''),
          'latitude',(v_description->>'latitude')::numeric,
          'longitude',(v_description->>'longitude')::numeric
        ));
      end if;

      v_message_type:=case
        when v_location is not null then 'location'
        when v_raw_type='text' then 'text'
        when v_raw_type in ('audio','voice','ptt') or v_raw_type like 'audio/%' then 'audio'
        when v_raw_type='image' or v_raw_type like 'image/%' then 'image'
        when v_raw_type='document' or v_raw_type='file' or v_raw_type like 'application/%' then 'document'
        else 'unknown'
      end;

      if v_message_type in ('image','audio','document') then
        v_media:=jsonb_strip_nulls(jsonb_build_object(
          'kind',v_message_type,
          'mime_type',v_mime_type,
          'filename',v_filename,
          'has_provider_url',nullif(r.payload#>>'{data,message,media_url}','') is not null
        ));
      end if;

      v_message:=jsonb_strip_nulls(jsonb_build_object(
        'direction','inbound',
        'message_type',v_message_type,
        'provider_conversation_id',v_provider_conversation_id,
        'text_body',v_text_body,
        'status_current','received',
        'sender_kind','customer',
        'received_at',v_message_at,
        'customer_id',v_customer_id,
        'source',coalesce(nullif(v_source,''),'unknown'),
        'metadata',jsonb_strip_nulls(jsonb_build_object(
          'source','papoai',
          'raw_type',v_raw_type,
          'media',v_media,
          'location',v_location,
          'legacy_capture_id',r.id,
          'legacy_event_key',r.event_key,
          'legacy_conversation_id',v_conversation_id
        ))
      ));

      v_result:=public.whatsapp_ingest_event_v1(
        v_account_id,
        'papoai',
        r.event_key,
        'message.received',
        v_provider_message_id,
        v_phone,
        v_message_at,
        r.body_hash,
        coalesce(r.payload,'{}'::jsonb),
        v_message
      );

      if coalesce((v_result->>'ok')::boolean,false) is not true then
        v_errors:=v_errors+1;
        continue;
      end if;

      begin v_event_id:=nullif(v_result->>'event_id','')::uuid; exception when others then v_event_id:=null; end;
      begin v_message_id:=nullif(v_result->>'message_id','')::uuid; exception when others then v_message_id:=null; end;

      if coalesce((v_result->>'duplicate')::boolean,false) then
        v_duplicates:=v_duplicates+1;
        if v_message_id is null then
          select m.id into v_existing_message_id
          from public.whatsapp_messages_v1 m
          where m.whatsapp_account_id=v_account_id
            and m.provider='papoai'
            and m.provider_message_id=v_provider_message_id
          order by m.created_at desc
          limit 1;
          v_message_id:=v_existing_message_id;
        end if;
      else
        v_processed:=v_processed+1;
      end if;

      if v_message_id is null then
        v_errors:=v_errors+1;
        continue;
      end if;

      update public.papoai_webhook_inbox_v2
         set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
               'canonical_mirror',true,
               'canonical_reconciled_at',now(),
               'canonical_event_id',v_event_id,
               'canonical_message_id',v_message_id
             )),
             last_error=null
       where id=r.id;
    exception when others then
      v_errors:=v_errors+1;
    end;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'since',coalesce(p_since,now()-interval '3 days'),
    'limit',v_limit,
    'considered',v_considered,
    'processed',v_processed,
    'duplicates',v_duplicates,
    'skipped',v_skipped,
    'errors',v_errors
  );
end;
$$;

revoke all on function public.ops2_reconcile_papoai_inbound_v1(timestamptz,integer) from public;
revoke all on function public.ops2_reconcile_papoai_inbound_v1(timestamptz,integer) from anon;
revoke all on function public.ops2_reconcile_papoai_inbound_v1(timestamptz,integer) from authenticated;
grant execute on function public.ops2_reconcile_papoai_inbound_v1(timestamptz,integer) to service_role;
