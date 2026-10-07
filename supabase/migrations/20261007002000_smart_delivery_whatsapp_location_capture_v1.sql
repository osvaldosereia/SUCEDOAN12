create or replace function public.capture_whatsapp_location_evidence_v1()
returns trigger language plpgsql security definer set search_path = public as $$
declare loc jsonb; lat numeric; lng numeric; src text;
begin
  if new.message_type <> 'location' then return new; end if;
  loc := coalesce(new.metadata->'location','{}'::jsonb);
  if loc = '{}'::jsonb then return new; end if;
  begin
    lat := nullif(loc->>'latitude','')::numeric;
    lng := nullif(loc->>'longitude','')::numeric;
  exception when others then return new;
  end;
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then return new; end if;
  src := case when new.direction='inbound' then 'customer_whatsapp' else 'business_whatsapp' end;
  insert into public.customer_location_evidence_v1(customer_id,conversation_id,whatsapp_message_id,source,direction,latitude,longitude,label,address_text,confidence,captured_at,metadata)
  values (new.customer_id,new.conversation_id,new.id,src,new.direction,lat,lng,nullif(loc->>'name',''),nullif(loc->>'address',''),'unconfirmed',coalesce(new.received_at,new.sent_at,new.created_at,now()),jsonb_build_object('provider',new.provider,'provider_message_id',new.provider_message_id,'location_url',loc->>'url'))
  on conflict (whatsapp_message_id) where whatsapp_message_id is not null
  do update set customer_id=coalesce(excluded.customer_id,customer_location_evidence_v1.customer_id),conversation_id=coalesce(excluded.conversation_id,customer_location_evidence_v1.conversation_id),latitude=excluded.latitude,longitude=excluded.longitude,label=coalesce(excluded.label,customer_location_evidence_v1.label),address_text=coalesce(excluded.address_text,customer_location_evidence_v1.address_text),updated_at=now();
  return new;
end; $$;
create trigger whatsapp_location_evidence_v1 after insert or update of customer_id,metadata,message_type on public.whatsapp_messages_v1 for each row execute function public.capture_whatsapp_location_evidence_v1();
