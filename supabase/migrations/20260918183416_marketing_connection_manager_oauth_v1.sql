-- Marketing Admin V1 / Round 8 — OAuth connection manager.
-- No publishing gate is enabled by this migration.

create table if not exists public.marketing_oauth_sessions(
  id uuid primary key default gen_random_uuid(),
  provider text not null check(provider in ('meta','pinterest')),
  admin_user_id uuid not null references public.admin_users(user_id) on delete cascade,
  state_hash text not null unique,
  redirect_uri text not null,
  status text not null default 'started' check(status in ('started','exchanged','completed','failed','expired')),
  candidate_accounts jsonb not null default '[]'::jsonb,
  secret_refs jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now()+interval '15 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(jsonb_typeof(candidate_accounts)='array'),
  check(jsonb_typeof(secret_refs)='object'),
  check(jsonb_typeof(metadata)='object')
);

create index if not exists marketing_oauth_sessions_user_provider_idx
  on public.marketing_oauth_sessions(admin_user_id,provider,created_at desc);
create index if not exists marketing_oauth_sessions_expiry_idx
  on public.marketing_oauth_sessions(status,expires_at);

alter table public.marketing_oauth_sessions enable row level security;
revoke all on table public.marketing_oauth_sessions from public,anon,authenticated;
grant select,insert,update,delete on table public.marketing_oauth_sessions to service_role;

create or replace function public.marketing_vault_put_secret_v1(
  p_name text,p_secret text,p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'vault','public','pg_temp'
as $$
declare v_id uuid;
begin
  if coalesce(p_name,'') !~ '^dona_antonia_marketing_[a-z0-9_]+$' then
    return jsonb_build_object('ok',false,'error','invalid_secret_name');
  end if;
  if length(coalesce(p_secret,''))<8 then
    return jsonb_build_object('ok',false,'error','secret_too_short');
  end if;

  select id into v_id
  from vault.secrets
  where name=p_name
  order by created_at desc
  limit 1;

  if v_id is null then
    select vault.create_secret(
      p_secret,p_name,coalesce(p_description,'Dona Antônia Marketing credential'),null
    ) into v_id;
  else
    perform vault.update_secret(
      v_id,p_secret,p_name,coalesce(p_description,'Dona Antônia Marketing credential'),null
    );
  end if;

  return jsonb_build_object('ok',true,'secret_id',v_id,'name',p_name);
end;
$$;

revoke all on function public.marketing_vault_put_secret_v1(text,text,text)
from public,anon,authenticated;
grant execute on function public.marketing_vault_put_secret_v1(text,text,text)
to service_role;

create or replace function public.marketing_vault_get_secret_v1(p_name text)
returns text
language plpgsql
security definer
set search_path to 'vault','public','pg_temp'
as $$
declare v text;
begin
  if coalesce(p_name,'') !~ '^dona_antonia_marketing_[a-z0-9_]+$' then return null; end if;
  select decrypted_secret into v
  from vault.decrypted_secrets
  where name=p_name
  order by created_at desc
  limit 1;
  return v;
end;
$$;

revoke all on function public.marketing_vault_get_secret_v1(text)
from public,anon,authenticated;
grant execute on function public.marketing_vault_get_secret_v1(text)
to service_role;

create or replace function public.marketing_vault_delete_secret_v1(p_name text)
returns boolean
language plpgsql
security definer
set search_path to 'vault','public','pg_temp'
as $$
declare n integer;
begin
  if coalesce(p_name,'') !~ '^dona_antonia_marketing_oauth_[a-z0-9_]+$' then return false; end if;
  delete from vault.secrets where name=p_name;
  get diagnostics n=row_count;
  return n>0;
end;
$$;

revoke all on function public.marketing_vault_delete_secret_v1(text)
from public,anon,authenticated;
grant execute on function public.marketing_vault_delete_secret_v1(text)
to service_role;

-- Reuse the Meta App Secret already stored by the Dona Antônia Meta setup,
-- but move it to the strict Marketing namespace without exposing the value.
do $$
declare v_secret text;
begin
  if not exists(
    select 1 from vault.secrets
    where name='dona_antonia_marketing_meta_app_secret_v1'
  ) then
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name='dona_antonia_meta_app_secret_v1'
    order by created_at desc
    limit 1;

    if nullif(v_secret,'') is not null then
      perform vault.create_secret(
        v_secret,
        'dona_antonia_marketing_meta_app_secret_v1',
        'Meta App Secret · Marketing OAuth',
        null
      );
    end if;
  end if;
end $$;

update public.marketing_runtime_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'connection_manager_version','marketing_connections_v1',
  'marketing_oauth_enabled',true,
  'marketing_oauth_redirect_uri','https://donaantonia.com.br/admin/marketing-oauth-callback.html',
  'meta_graph_version',coalesce(nullif(metadata->>'meta_graph_version',''),'v26.0'),
  'meta_oauth_scopes',jsonb_build_array(
    'pages_show_list','pages_read_engagement','pages_manage_posts',
    'instagram_basic','instagram_content_publish'
  ),
  'meta_app_secret_ref','dona_antonia_marketing_meta_app_secret_v1',
  'pinterest_oauth_scopes',jsonb_build_array('boards:read','pins:read','pins:write'),
  'pinterest_app_secret_ref','dona_antonia_marketing_pinterest_app_secret_v1',
  'oauth_session_ttl_seconds',900,
  'oauth_external_publish',false
),updated_at=now()
where id=1;

create or replace function public.marketing_provider_connection_snapshot_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with r as (
  select metadata from public.marketing_runtime_config where id=1
),
c as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,
    'channel',channel,
    'provider',provider,
    'display_name',display_name,
    'external_account_id',external_account_id,
    'status',status,
    'last_verified_at',last_verified_at,
    'token_expires_at',token_expires_at,
    'credential_present',(credential_ref is not null),
    'identity_name',coalesce(
      metadata->>'page_name',
      metadata->>'instagram_username',
      metadata->>'board_name'
    ),
    'board_id',metadata->>'board_id'
  ) order by channel),'[]'::jsonb) channels
  from public.marketing_channel_accounts
)
select jsonb_build_object(
  'version','marketing_connections_v1',
  'redirect_uri',(select metadata->>'marketing_oauth_redirect_uri' from r),
  'meta',jsonb_build_object(
    'app_id_set',coalesce(nullif((select metadata->>'meta_oauth_app_id' from r),''),'')<>'',
    'app_secret_set',exists(
      select 1 from vault.secrets
      where name='dona_antonia_marketing_meta_app_secret_v1'
    ),
    'graph_version',(select metadata->>'meta_graph_version' from r),
    'scopes',coalesce((select metadata->'meta_oauth_scopes' from r),'[]'::jsonb)
  ),
  'pinterest',jsonb_build_object(
    'app_id_set',coalesce(nullif((select metadata->>'pinterest_oauth_app_id' from r),''),'')<>'',
    'app_secret_set',exists(
      select 1 from vault.secrets
      where name='dona_antonia_marketing_pinterest_app_secret_v1'
    ),
    'scopes',coalesce((select metadata->'pinterest_oauth_scopes' from r),'[]'::jsonb)
  ),
  'channels',(select channels from c),
  'external_side_effect',false
)
$$;

revoke all on function public.marketing_provider_connection_snapshot_v1()
from public,anon,authenticated;
grant execute on function public.marketing_provider_connection_snapshot_v1()
to service_role;
