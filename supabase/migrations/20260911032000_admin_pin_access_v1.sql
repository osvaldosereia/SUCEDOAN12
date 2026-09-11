create table if not exists public.admin_pin_access_config (
  id smallint primary key default 1 check (id=1),
  pin_hash text not null,
  enabled boolean not null default true,
  max_attempts integer not null default 5 check (max_attempts between 3 and 20),
  lock_minutes integer not null default 15 check (lock_minutes between 1 and 1440),
  updated_at timestamptz not null default now()
);
alter table public.admin_pin_access_config enable row level security;
revoke all on table public.admin_pin_access_config from anon, authenticated;

create table if not exists public.admin_pin_access_attempts (
  fingerprint text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.admin_pin_access_attempts enable row level security;
revoke all on table public.admin_pin_access_attempts from anon, authenticated;

-- O PIN nunca fica em texto puro no banco: somente hash bcrypt.
insert into public.admin_pin_access_config(id,pin_hash,enabled,max_attempts,lock_minutes,updated_at)
values (1,'$2y$10$V.JTpLJ.KWWtYA/HeTWKEeIwTFsdHmIfE8N4pJCRZa6csKPAi6IvS',true,5,15,now())
on conflict (id) do update set
  pin_hash=excluded.pin_hash,
  enabled=true,
  max_attempts=5,
  lock_minutes=15,
  updated_at=now();

create or replace function public.verify_admin_pin_access_v1(p_pin text,p_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_cfg public.admin_pin_access_config%rowtype;
  v_attempt public.admin_pin_access_attempts%rowtype;
  v_now timestamptz:=now();
  v_valid boolean:=false;
  v_attempts integer:=0;
  v_blocked_until timestamptz;
begin
  if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('allowed',false,'reason','invalid_client');
  end if;
  select * into v_cfg from public.admin_pin_access_config where id=1;
  if not found or v_cfg.enabled is not true then
    return jsonb_build_object('allowed',false,'reason','disabled');
  end if;
  select * into v_attempt from public.admin_pin_access_attempts where fingerprint=p_fingerprint for update;
  if found and v_attempt.blocked_until is not null and v_attempt.blocked_until>v_now then
    return jsonb_build_object('allowed',false,'reason','rate_limited','retry_after_seconds',greatest(1,ceil(extract(epoch from (v_attempt.blocked_until-v_now)))::integer));
  end if;
  if found and v_attempt.window_started_at < v_now-interval '15 minutes' then
    v_attempt.attempts:=0;
    v_attempt.window_started_at:=v_now;
    v_attempt.blocked_until:=null;
  end if;
  v_valid:=extensions.crypt(coalesce(p_pin,''),v_cfg.pin_hash)=v_cfg.pin_hash;
  if v_valid then
    delete from public.admin_pin_access_attempts where fingerprint=p_fingerprint;
    return jsonb_build_object('allowed',true,'reason','ok');
  end if;
  v_attempts:=coalesce(v_attempt.attempts,0)+1;
  if v_attempts>=v_cfg.max_attempts then
    v_blocked_until:=v_now+make_interval(mins=>v_cfg.lock_minutes);
  end if;
  insert into public.admin_pin_access_attempts(fingerprint,attempts,window_started_at,blocked_until,updated_at)
  values(p_fingerprint,v_attempts,coalesce(v_attempt.window_started_at,v_now),v_blocked_until,v_now)
  on conflict(fingerprint) do update set attempts=excluded.attempts,window_started_at=excluded.window_started_at,blocked_until=excluded.blocked_until,updated_at=excluded.updated_at;
  return jsonb_build_object('allowed',false,'reason',case when v_blocked_until is not null then 'rate_limited' else 'invalid_pin' end,'remaining_attempts',greatest(0,v_cfg.max_attempts-v_attempts),'retry_after_seconds',case when v_blocked_until is null then 0 else v_cfg.lock_minutes*60 end);
end;
$function$;

revoke all on function public.verify_admin_pin_access_v1(text,text) from public,anon,authenticated;
grant execute on function public.verify_admin_pin_access_v1(text,text) to service_role;
