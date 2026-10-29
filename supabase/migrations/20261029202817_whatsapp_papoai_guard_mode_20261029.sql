
-- Proteção de campanhas PapoAI: não bloqueia webhooks e não descarta eventos.
create table if not exists public.whatsapp_papoai_guard_v1 (
  id integer primary key check (id=1),
  active_until timestamptz,
  updated_at timestamptz not null default now(),
  last_activated_at timestamptz,
  last_deactivated_at timestamptz
);
insert into public.whatsapp_papoai_guard_v1(id) values(1) on conflict do nothing;
alter table public.whatsapp_papoai_guard_v1 enable row level security;
revoke all on public.whatsapp_papoai_guard_v1 from public,anon,authenticated;
grant select,update on public.whatsapp_papoai_guard_v1 to service_role;

create table if not exists public.whatsapp_papoai_status_queue_v1 (
  id bigint generated always as identity primary key,
  payload_hash text not null unique,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  processed_at timestamptz,
  last_error text,
  needs_review boolean not null default false
);
create index if not exists whatsapp_papoai_status_queue_pending_idx
  on public.whatsapp_papoai_status_queue_v1(next_attempt_at,id)
  where processed_at is null and needs_review=false;
alter table public.whatsapp_papoai_status_queue_v1 enable row level security;
revoke all on public.whatsapp_papoai_status_queue_v1 from public,anon,authenticated;
grant select,insert,update on public.whatsapp_papoai_status_queue_v1 to service_role;

create or replace function public.whatsapp_papoai_guard_status_v1()
returns jsonb language sql security invoker set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'active', coalesce(g.active_until>now(),false),
    'active_until',g.active_until,
    'updated_at',g.updated_at,
    'pending',(select count(*) from public.whatsapp_papoai_status_queue_v1 q where q.processed_at is null and q.needs_review=false),
    'review_required',(select count(*) from public.whatsapp_papoai_status_queue_v1 q where q.needs_review=true and q.processed_at is null),
    'processed',(select count(*) from public.whatsapp_papoai_status_queue_v1 q where q.processed_at is not null),
    'last_activated_at',g.last_activated_at
  )
  from public.whatsapp_papoai_guard_v1 g where g.id=1
$$;
revoke all on function public.whatsapp_papoai_guard_status_v1() from public,anon,authenticated;
grant execute on function public.whatsapp_papoai_guard_status_v1() to service_role;

create or replace function public.whatsapp_papoai_guard_set_v1(p_active boolean,p_minutes integer default 120)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp
as $$
declare v_until timestamptz;
begin
 if current_user not in ('service_role','postgres') then raise exception 'Acesso negado'; end if;
 if p_active and (p_minutes < 15 or p_minutes > 180) then raise exception 'Duração fora do limite'; end if;
 v_until:=case when p_active then now()+make_interval(mins=>p_minutes) else null end;
 update public.whatsapp_papoai_guard_v1 set
  active_until=v_until,updated_at=now(),
  last_activated_at=case when p_active then now() else last_activated_at end,
  last_deactivated_at=case when not p_active then now() else last_deactivated_at end
 where id=1;
 insert into public.admin_audit_logs(action,entity_type,entity_id,details)
 values('papoai_guard_mode','whatsapp_guard','1',
  jsonb_build_object('active',p_active,'duration_minutes',case when p_active then p_minutes else 0 end,'active_until',v_until));
 return public.whatsapp_papoai_guard_status_v1();
end $$;
revoke all on function public.whatsapp_papoai_guard_set_v1(boolean,integer) from public,anon,authenticated;
grant execute on function public.whatsapp_papoai_guard_set_v1(boolean,integer) to service_role;

-- Único INSERT durável por lote de confirmações. Se banco falhar, webhook falha
-- sem confirmar a Meta, permitindo a repetição legítima.
create or replace function public.whatsapp_papoai_guard_buffer_v1(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp
as $$
declare v_active boolean;v_count integer:=0;v_hash text;
begin
 if current_user not in ('service_role','postgres') then raise exception 'Acesso negado'; end if;
 select active_until>now() into v_active from public.whatsapp_papoai_guard_v1 where id=1;
 if not coalesce(v_active,false) then return jsonb_build_object('buffered',false); end if;
 if p_payload->>'object'<>'whatsapp_business_account' then raise exception 'invalid_provider'; end if;
 if jsonb_typeof(p_payload->'entry')<>'array' then raise exception 'invalid_payload'; end if;
 v_hash:=md5(p_payload::text);
 insert into public.whatsapp_papoai_status_queue_v1(payload_hash,payload)
 values(v_hash,p_payload) on conflict(payload_hash) do nothing;
 get diagnostics v_count=row_count;
 return jsonb_build_object('buffered',true,'duplicate',v_count=0);
end $$;
revoke all on function public.whatsapp_papoai_guard_buffer_v1(jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_papoai_guard_buffer_v1(jsonb) to service_role;

-- Cron consome até 12 lotes / 10 segundos. A transação de cada item é atômica:
-- erro não confirma nem remove o evento; reprograma com backoff.
create or replace function public.whatsapp_papoai_guard_drain_v1(p_limit integer default 12)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp
as $$
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
end $$;
revoke all on function public.whatsapp_papoai_guard_drain_v1(integer) from public,anon,authenticated;
grant execute on function public.whatsapp_papoai_guard_drain_v1(integer) to service_role;

-- Serviço de filas já usa pg_cron no projeto; um único worker limita concorrência.
do $cron$
begin
 if not exists(select 1 from cron.job where jobname='dona-papoai-guard-drain-v1') then
  perform cron.schedule('dona-papoai-guard-drain-v1','10 seconds',
    'select public.whatsapp_papoai_guard_drain_v1(12)');
 end if;
end $cron$;
