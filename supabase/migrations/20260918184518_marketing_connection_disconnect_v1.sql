-- Marketing Admin V1 / Round 8 — local provider disconnect.
-- Deletes only final provider credentials in the strict Marketing namespace.
create or replace function public.marketing_vault_delete_provider_secret_v1(p_name text)
returns boolean
language plpgsql
security definer
set search_path to 'vault','public','pg_temp'
as $$
declare n integer;
begin
  if coalesce(p_name,'') !~ '^dona_antonia_marketing_(meta_page_[a-z0-9_]+|pinterest_access_v1|pinterest_refresh_v1)$' then
    return false;
  end if;
  delete from vault.secrets where name=p_name;
  get diagnostics n=row_count;
  return n>0;
end;
$$;
revoke all on function public.marketing_vault_delete_provider_secret_v1(text) from public,anon,authenticated;
grant execute on function public.marketing_vault_delete_provider_secret_v1(text) to service_role;
