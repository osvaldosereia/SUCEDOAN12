-- Dona Antônia — ponte interna de sinais de pedido para PapoAI
-- Runtime nasce OFF. Nenhum webhook é chamado até ativação explícita posterior.

create table if not exists public.ops2_papoai_order_signal_runtime_v1 (
  id integer primary key check (id=1),
  mode text not null default 'off' check (mode in ('off','canary','live')),
  canary_order_id uuid references public.orders(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.ops2_papoai_order_signal_runtime_v1(id,mode)
values (1,'off') on conflict (id) do nothing;
alter table public.ops2_papoai_order_signal_runtime_v1 enable row level security;
revoke all on table public.ops2_papoai_order_signal_runtime_v1 from public,anon,authenticated;
grant all on table public.ops2_papoai_order_signal_runtime_v1 to service_role;

create table if not exists public.ops2_papoai_order_signal_outbox_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  phone_e164 text not null,
  channel_origin text not null check (channel_origin in ('0975','1018')),
  signal_key text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','retry','failed','suppressed')),
  attempt_count integer not null default 0 check (attempt_count>=0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  external_ref text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id,channel_origin,signal_key)
);
create index if not exists ops2_papoai_order_signal_outbox_dispatch_idx
  on public.ops2_papoai_order_signal_outbox_v1(status,available_at,created_at)
  where status in ('pending','retry');
alter table public.ops2_papoai_order_signal_outbox_v1 enable row level security;
revoke all on table public.ops2_papoai_order_signal_outbox_v1 from public,anon,authenticated;
grant all on table public.ops2_papoai_order_signal_outbox_v1 to service_role;

create or replace function public.ops2_papoai_signal_allowed_v1(p_signal text)
returns boolean language sql immutable set search_path to '' as $$
  select upper(btrim(coalesce(p_signal,''))) = any(array[
    'INT_CESTAS','INT_BEBE','INT_CABELOS','INT_BELEZA','INT_HIGIENE','INT_LIMPEZA','INT_LAVANDERIA','INT_PET','INT_CASA','INT_DOCES_LANCHES',
    'BR_NIVEA','BR_ELSEVE',
    'CTA_OFERTAS','CTA_BEBE','CTA_CABELOS','CTA_BELEZA','CTA_LIMPEZA','CTA_LAVANDERIA','CTA_PET'
  ]::text[])
$$;
revoke all on function public.ops2_papoai_signal_allowed_v1(text) from public,anon,authenticated;
grant execute on function public.ops2_papoai_signal_allowed_v1(text) to service_role;

create or replace function public.ops2_enqueue_papoai_order_signals_v1(
  p_order_id uuid,p_channel_origin text,p_phone_e164 text,p_signal_keys text[]
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_mode text; v_canary uuid; v_channel text; v_phone text; v_signal text; v_count integer:=0;
begin
  select mode,canary_order_id into v_mode,v_canary from public.ops2_papoai_order_signal_runtime_v1 where id=1;
  v_mode:=coalesce(v_mode,'off');
  if v_mode='off' then return jsonb_build_object('ok',true,'skipped',true,'reason','runtime_off','enqueued',0); end if;
  if v_mode='canary' and p_order_id is distinct from v_canary then
    return jsonb_build_object('ok',true,'skipped',true,'reason','not_canary_order','enqueued',0);
  end if;
  if p_order_id is null then return jsonb_build_object('ok',false,'error','order_id_required'); end if;
  v_channel:=btrim(coalesce(p_channel_origin,''));
  if v_channel not in ('0975','1018') then return jsonb_build_object('ok',false,'error','unsupported_channel'); end if;
  v_phone:=public.canonical_whatsapp_e164_br_v2(p_phone_e164);
  if v_phone is null then return jsonb_build_object('ok',false,'error','invalid_phone'); end if;
  foreach v_signal in array coalesce(p_signal_keys,array[]::text[]) loop
    v_signal:=upper(btrim(coalesce(v_signal,'')));
    if public.ops2_papoai_signal_allowed_v1(v_signal) then
      insert into public.ops2_papoai_order_signal_outbox_v1(order_id,phone_e164,channel_origin,signal_key,status)
      values(p_order_id,v_phone,v_channel,v_signal,'pending')
      on conflict(order_id,channel_origin,signal_key) do nothing;
      if found then v_count:=v_count+1; end if;
    end if;
  end loop;
  return jsonb_build_object('ok',true,'enqueued',v_count,'mode',v_mode);
end $$;
revoke all on function public.ops2_enqueue_papoai_order_signals_v1(uuid,text,text,text[]) from public,anon,authenticated;
grant execute on function public.ops2_enqueue_papoai_order_signals_v1(uuid,text,text,text[]) to service_role;

create or replace function public.ops2_claim_papoai_order_signal_v1()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_mode text; v_canary uuid; v_item public.ops2_papoai_order_signal_outbox_v1%rowtype;
begin
  select mode,canary_order_id into v_mode,v_canary from public.ops2_papoai_order_signal_runtime_v1 where id=1;
  v_mode:=coalesce(v_mode,'off');
  if v_mode='off' then return jsonb_build_object('ok',true,'found',false,'reason','runtime_off'); end if;
  update public.ops2_papoai_order_signal_outbox_v1 set status='retry',locked_at=null,updated_at=now(),last_error=coalesce(last_error,'stale_sending_recovered')
    where status='sending' and locked_at<now()-interval '15 minutes' and attempt_count<5
      and (v_mode='live' or order_id=v_canary);
  with next_item as (
    select id from public.ops2_papoai_order_signal_outbox_v1
    where status in ('pending','retry') and available_at<=now() and attempt_count<5
      and (v_mode='live' or order_id=v_canary)
    order by available_at,created_at for update skip locked limit 1
  )
  update public.ops2_papoai_order_signal_outbox_v1 q set status='sending',attempt_count=q.attempt_count+1,locked_at=now(),updated_at=now(),last_error=null
    from next_item n where q.id=n.id returning q.* into v_item;
  if not found then return jsonb_build_object('ok',true,'found',false); end if;
  return jsonb_build_object('ok',true,'found',true,'item',to_jsonb(v_item));
end $$;
revoke all on function public.ops2_claim_papoai_order_signal_v1() from public,anon,authenticated;
grant execute on function public.ops2_claim_papoai_order_signal_v1() to service_role;

create or replace function public.ops2_finish_papoai_order_signal_v1(
  p_outbox_id uuid,p_status text,p_external_ref text default null,p_last_error text default null,p_retry_after_seconds integer default 300
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_status text:=lower(btrim(coalesce(p_status,''))); v_item public.ops2_papoai_order_signal_outbox_v1%rowtype;
begin
  if v_status not in ('sent','retry','failed','suppressed') then return jsonb_build_object('ok',false,'error','invalid_status'); end if;
  update public.ops2_papoai_order_signal_outbox_v1 set status=v_status,
    external_ref=case when v_status='sent' then nullif(btrim(coalesce(p_external_ref,'')),'') else external_ref end,
    last_error=case when v_status='sent' then null else nullif(left(coalesce(p_last_error,''),500),'') end,
    sent_at=case when v_status='sent' then now() else sent_at end,
    available_at=case when v_status='retry' then now()+make_interval(secs=>greatest(60,least(coalesce(p_retry_after_seconds,300),3600))) else available_at end,
    locked_at=null,updated_at=now()
  where id=p_outbox_id returning * into v_item;
  if not found then return jsonb_build_object('ok',false,'error','outbox_not_found'); end if;
  return jsonb_build_object('ok',true,'status',v_item.status,'attempt_count',v_item.attempt_count);
end $$;
revoke all on function public.ops2_finish_papoai_order_signal_v1(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.ops2_finish_papoai_order_signal_v1(uuid,text,text,text,integer) to service_role;

create or replace function public.ops2_papoai_signal_provider_url_v1(p_channel text,p_signal text)
returns text language plpgsql security definer set search_path to '' as $$
declare v_channel text:=btrim(coalesce(p_channel,'')); v_signal text:=upper(btrim(coalesce(p_signal,''))); v_name text; v_secret text;
begin
  if v_channel not in ('0975','1018') or not public.ops2_papoai_signal_allowed_v1(v_signal) then return null; end if;
  v_name:='papoai_signal_webhook_'||v_channel||'_'||lower(v_signal)||'_v1';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name=v_name order by ds.updated_at desc nulls last,ds.created_at desc limit 1;
  return nullif(btrim(coalesce(v_secret,'')),'');
end $$;
revoke all on function public.ops2_papoai_signal_provider_url_v1(text,text) from public,anon,authenticated;
grant execute on function public.ops2_papoai_signal_provider_url_v1(text,text) to service_role;

create or replace function public.ops2_papoai_signal_provider_store_v1(p_channel text,p_signal text,p_url text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_channel text:=btrim(coalesce(p_channel,'')); v_signal text:=upper(btrim(coalesce(p_signal,''))); v_url text:=nullif(btrim(coalesce(p_url,'')),''); v_name text; v_secret_id uuid;
begin
  if v_channel not in ('0975','1018') then return jsonb_build_object('ok',false,'error','unsupported_channel'); end if;
  if not public.ops2_papoai_signal_allowed_v1(v_signal) then return jsonb_build_object('ok',false,'error','unsupported_signal'); end if;
  if v_url is null or length(v_url)>2048 or v_url !~* '^https://[^[:space:]]+$' then return jsonb_build_object('ok',false,'error','invalid_https_url'); end if;
  v_name:='papoai_signal_webhook_'||v_channel||'_'||lower(v_signal)||'_v1';
  select s.id into v_secret_id from vault.secrets s where s.name=v_name order by s.updated_at desc nulls last,s.created_at desc limit 1;
  if v_secret_id is null then v_secret_id:=vault.create_secret(v_url,v_name,'Dona Antônia PapoAI internal order signal',null);
  else perform vault.update_secret(v_secret_id,v_url,v_name,'Dona Antônia PapoAI internal order signal',null); end if;
  return jsonb_build_object('ok',true,'channel',v_channel,'signal',v_signal,'stored',true);
end $$;
revoke all on function public.ops2_papoai_signal_provider_store_v1(text,text,text) from public,anon,authenticated;
grant execute on function public.ops2_papoai_signal_provider_store_v1(text,text,text) to service_role;
