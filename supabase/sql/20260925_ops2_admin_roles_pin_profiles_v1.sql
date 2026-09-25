-- Dona Antonia Operations 2.0
-- Role-ready PIN authentication foundation.
-- Preserves the current owner PIN hash without exposing plaintext.

alter table public.admin_users
  drop constraint if exists admin_users_role_check;

alter table public.admin_users
  add constraint admin_users_role_check
  check (role in ('owner','supervisor','operator','driver','viewer'));

create table if not exists public.admin_pin_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.admin_users(user_id) on delete cascade,
  label text not null,
  pin_hash text not null,
  enabled boolean not null default true,
  max_attempts integer not null default 5 check (max_attempts between 3 and 20),
  lock_minutes integer not null default 15 check (lock_minutes between 1 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_pin_profiles enable row level security;

-- Migrate the existing shared owner PIN into a profile without changing it.
insert into public.admin_pin_profiles(
  user_id,label,pin_hash,enabled,max_attempts,lock_minutes
)
select
  u.user_id,
  coalesce(nullif(trim(u.display_name),''),'Proprietário'),
  c.pin_hash,
  c.enabled,
  c.max_attempts,
  c.lock_minutes
from public.admin_users u
cross join public.admin_pin_access_config c
where u.role='owner'
  and u.is_active=true
  and c.id=1
order by u.created_at
limit 1
on conflict(user_id) do nothing;

create or replace function public.verify_admin_pin_profile_v2(
  p_pin text,
  p_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_attempt public.admin_pin_access_attempts%rowtype;
  v_profile record;
  v_now timestamptz:=now();
  v_attempts integer:=0;
  v_max_attempts integer:=5;
  v_lock_minutes integer:=15;
  v_blocked_until timestamptz;
begin
  if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('allowed',false,'reason','invalid_client');
  end if;

  select * into v_attempt
  from public.admin_pin_access_attempts
  where fingerprint=p_fingerprint
  for update;

  if found and v_attempt.blocked_until is not null and v_attempt.blocked_until>v_now then
    return jsonb_build_object(
      'allowed',false,
      'reason','rate_limited',
      'retry_after_seconds',greatest(1,ceil(extract(epoch from (v_attempt.blocked_until-v_now)))::integer)
    );
  end if;

  if found and v_attempt.window_started_at < v_now-interval '15 minutes' then
    v_attempt.attempts:=0;
    v_attempt.window_started_at:=v_now;
    v_attempt.blocked_until:=null;
  end if;

  select
    p.id,p.user_id,p.label,p.max_attempts,p.lock_minutes,
    u.role,u.display_name,u.is_active
  into v_profile
  from public.admin_pin_profiles p
  join public.admin_users u on u.user_id=p.user_id
  where p.enabled=true
    and u.is_active=true
    and extensions.crypt(coalesce(p_pin,''),p.pin_hash)=p.pin_hash
  order by
    case u.role
      when 'owner' then 0
      when 'supervisor' then 1
      when 'operator' then 2
      when 'driver' then 3
      else 4
    end,
    p.created_at
  limit 1;

  if found then
    delete from public.admin_pin_access_attempts
    where fingerprint=p_fingerprint;

    update public.admin_pin_profiles
       set updated_at=now()
     where id=v_profile.id;

    return jsonb_build_object(
      'allowed',true,
      'reason','ok',
      'user_id',v_profile.user_id,
      'role',v_profile.role,
      'display_name',coalesce(v_profile.display_name,v_profile.label)
    );
  end if;

  select
    coalesce(max(max_attempts),5),
    coalesce(max(lock_minutes),15)
  into v_max_attempts,v_lock_minutes
  from public.admin_pin_profiles
  where enabled=true;

  v_attempts:=coalesce(v_attempt.attempts,0)+1;
  if v_attempts>=v_max_attempts then
    v_blocked_until:=v_now+make_interval(mins=>v_lock_minutes);
  end if;

  insert into public.admin_pin_access_attempts(
    fingerprint,attempts,window_started_at,blocked_until,updated_at
  ) values (
    p_fingerprint,v_attempts,coalesce(v_attempt.window_started_at,v_now),v_blocked_until,v_now
  )
  on conflict(fingerprint) do update
  set attempts=excluded.attempts,
      window_started_at=excluded.window_started_at,
      blocked_until=excluded.blocked_until,
      updated_at=excluded.updated_at;

  return jsonb_build_object(
    'allowed',false,
    'reason',case when v_blocked_until is not null then 'rate_limited' else 'invalid_pin' end,
    'remaining_attempts',greatest(0,v_max_attempts-v_attempts),
    'retry_after_seconds',case when v_blocked_until is null then 0 else v_lock_minutes*60 end
  );
end;
$$;

revoke all on function public.verify_admin_pin_profile_v2(text,text)
  from public,anon,authenticated;
grant execute on function public.verify_admin_pin_profile_v2(text,text)
  to service_role;
