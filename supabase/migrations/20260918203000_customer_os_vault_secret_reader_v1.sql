-- Customer & Marketing OS
-- Safe service-role-only Vault reader for the Meta WhatsApp readonly diagnostics.

create or replace function public.get_customer_os_vault_secret_v1(p_name text)
returns text
language sql
security definer
set search_path = pg_catalog, public, vault
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.name = p_name
  limit 1
$$;

revoke all on function public.get_customer_os_vault_secret_v1(text) from public;
revoke all on function public.get_customer_os_vault_secret_v1(text) from anon;
revoke all on function public.get_customer_os_vault_secret_v1(text) from authenticated;
grant execute on function public.get_customer_os_vault_secret_v1(text) to service_role;
