-- Limit the Customer OS Vault reader to the single WhatsApp readonly token used by Meta diagnostics.

create or replace function public.get_customer_os_vault_secret_v1(p_name text)
returns text
language sql
security definer
set search_path = pg_catalog, public, vault
as $$
  select case
    when p_name='dona_antonia_whatsapp_access_token_v1'
      then (
        select ds.decrypted_secret
        from vault.decrypted_secrets ds
        where ds.name='dona_antonia_whatsapp_access_token_v1'
        limit 1
      )
    else null
  end
$$;

revoke all on function public.get_customer_os_vault_secret_v1(text) from public;
revoke all on function public.get_customer_os_vault_secret_v1(text) from anon;
revoke all on function public.get_customer_os_vault_secret_v1(text) from authenticated;
grant execute on function public.get_customer_os_vault_secret_v1(text) to service_role;
