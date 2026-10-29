CREATE OR REPLACE FUNCTION public.whatsapp_papoai_guard_drain_v1(p_limit integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 q record; e jsonb; c jsonb; v jsonb; s jsonb; err jsonb; res jsonb;
 a uuid; phone text; wamid text; status_value text; occurred timestamptz;
 event_key text; receipt jsonb; count_done integer:=0; count_failed integer:=0;
 v_failed_message text; v_attempts integer; v_ts text; v_phone text; v_eventid uuid;
begin
 if current_user not in ('service_role','postgres') then raise exception 'Acesso negado'; end if;
 if (select coalesce(active_until>now(),false) from public.whatsapp_papoai_guard_v1 where id=1)
    then return jsonb_build_object('paused',true,'processed',0); end if;
 for q in
  select * from public.whatsapp_papoai_status_queue_v1
  where processed_at is null and needs_review=false and next_attempt_at<=now()
  order by id for update skip locked limit least(greatest(p_limit,1),25)
 loop
  begin
   for e in select value from jsonb_array_elements(coalesce(q.payload->'entry','[]'::jsonb))
   loop
    for c in select value from jsonb_array_elements(coalesce(e->'changes','[]'::jsonb))
    loop
     v:=coalesce(c->'value','{}'::jsonb);
     phone:=v->'metadata'->>'phone_number_id';
     select id into a from public.whatsapp_accounts where phone_number_id=phone and is_active=true limit 1;
     if a is null then raise exception 'account_unresolved'; end if;
     for s in select value from jsonb_array_elements(coalesce(v->'statuses','[]'::jsonb))
     loop
      status_value:=lower(s->>'status');
      if status_value='deleted' then status_value:='cancelled'; end if;
      if status_value not in ('sent','delivered','read','failed','cancelled') then continue; end if;
      wamid:=nullif(btrim(s->>'id'),'');
      if wamid is null then raise exception 'status_missing_message_id'; end if;
      v_ts:=s->>'timestamp';
      if v_ts ~ '^[0-9]{9,12}$' then occurred:=to_timestamp(v_ts::double precision); else occurred:=q.received_at; end if;
      v_phone:=nullif(regexp_replace(coalesce(s->>'recipient_id',''),'[^0-9]','','g'),'');
      if v_phone is not null then v_phone:='+'||v_phone; end if;
      err:=coalesce(s->'errors'->0,'{}'::jsonb);
      event_key:='status:'||wamid||':'||status_value||':'||to_char(occurred at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
      res:=public.whatsapp_ingest_event_v1(a,'meta',event_key,'message.status.'||status_value,
          wamid,v_phone,occurred,q.payload_hash,s,null);
      if coalesce((res->>'ok')::boolean,false)=false then
        raise exception 'status_capture_failed: %',left(coalesce(res->>'error','unknown'),90);
      end if;
      receipt:=public.whatsapp_record_status_v1(a,'meta',wamid,status_value,occurred,now(),
          err->>'code',err->>'title',coalesce(err->>'message',err->'error_data'->>'details'),s);
      -- Envios feitos pelo PapoAI podem estar associados ao mesmo WAMID
      -- usando provider=papoai. Atualize esse registro somente se Meta
      -- não possuir a mensagem e existir associação inequívoca.
      if coalesce((receipt->>'ok')::boolean,false)=false and
         receipt->>'error'='message_not_found' and exists (
           select 1 from public.whatsapp_messages_v1 m
           where m.whatsapp_account_id=a and m.provider_message_id=wamid and m.provider='papoai'
         ) then
        receipt:=public.whatsapp_record_status_v1(a,'papoai',wamid,status_value,occurred,now(),
          err->>'code',err->>'title',coalesce(err->>'message',err->'error_data'->>'details'),s);
      end if;
      if coalesce((receipt->>'ok')::boolean,false)=false then
        raise exception 'status_record_failed: %',left(coalesce(receipt->>'error','unknown'),90);
      end if;
      v_eventid:=nullif(res->>'event_id','')::uuid;
      if v_eventid is not null then
       update public.whatsapp_webhook_events_v1
       set status='normalized',processed_at=now(),last_error=null where id=v_eventid;
      end if;
     end loop;
    end loop;
   end loop;
   update public.whatsapp_papoai_status_queue_v1 set processed_at=now(),last_error=null where id=q.id;
   count_done:=count_done+1;
  exception when others then
   v_failed_message:=left(sqlerrm,240);
   v_attempts:=q.attempts+1;
   update public.whatsapp_papoai_status_queue_v1 set
     attempts=v_attempts,
     needs_review=v_attempts>=8,
     next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^least(v_attempts,7))::integer)),
     last_error=v_failed_message
   where id=q.id;
   count_failed:=count_failed+1;
  end;
 end loop;
 return jsonb_build_object('processed',count_done,'retrying',count_failed);
end $function$
