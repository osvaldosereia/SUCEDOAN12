-- Marketing Admin V1 / Round 8 — connection manager hardening v2.
-- Fail-closed: removes unverified Graph version default, corrects Pinterest scopes,
-- and automatically cleans expired OAuth temporary credentials.

update public.marketing_runtime_config
set metadata=
  case
    when coalesce(metadata->>'meta_graph_version_source','')=''
         and metadata->>'meta_graph_version'='v26.0'
      then (metadata-'meta_graph_version')
    else metadata
  end
  ||jsonb_build_object(
    'meta_graph_version_source',case when coalesce(metadata->>'meta_graph_version_source','')='' then 'manual_required' else metadata->>'meta_graph_version_source' end,
    'pinterest_oauth_scopes',jsonb_build_array('boards:read','boards:write','pins:read','pins:write'),
    'oauth_cleanup_enabled',true,
    'oauth_cleanup_version','marketing_oauth_cleanup_v1'
  ),
  updated_at=now()
where id=1;

create or replace function public.marketing_oauth_cleanup_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public','vault','pg_temp'
as $$
declare
  s record;
  ref text;
  cleaned_sessions integer:=0;
  deleted_secrets integer:=0;
  n integer:=0;
begin
  for s in
    select id,secret_refs
    from public.marketing_oauth_sessions
    where status in ('started','exchanged','failed')
      and expires_at<=now()
    for update skip locked
  loop
    if jsonb_typeof(coalesce(s.secret_refs->'pages','{}'::jsonb))='object' then
      for ref in select value from jsonb_each_text(coalesce(s.secret_refs->'pages','{}'::jsonb))
      loop
        if ref ~ '^dona_antonia_marketing_oauth_[a-z0-9_]+$' then
          delete from vault.secrets where name=ref;
          get diagnostics n=row_count;
          deleted_secrets:=deleted_secrets+n;
        end if;
      end loop;
    end if;

    foreach ref in array array[
      nullif(s.secret_refs->>'access',''),
      nullif(s.secret_refs->>'refresh','')
    ]
    loop
      if ref is not null and ref ~ '^dona_antonia_marketing_oauth_[a-z0-9_]+$' then
        delete from vault.secrets where name=ref;
        get diagnostics n=row_count;
        deleted_secrets:=deleted_secrets+n;
      end if;
    end loop;

    update public.marketing_oauth_sessions
    set status='expired',
        candidate_accounts='[]'::jsonb,
        secret_refs='{}'::jsonb,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('cleaned_at',now()),
        updated_at=now()
    where id=s.id;
    cleaned_sessions:=cleaned_sessions+1;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'cleaned_sessions',cleaned_sessions,
    'deleted_temp_secrets',deleted_secrets,
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.marketing_oauth_cleanup_v1()
from public,anon,authenticated;
grant execute on function public.marketing_oauth_cleanup_v1()
to service_role;
