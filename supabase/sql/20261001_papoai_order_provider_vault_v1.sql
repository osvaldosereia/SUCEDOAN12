-- Dona Antônia — PapoAI order provider URLs from Supabase Vault
-- Keeps webhook URLs encrypted in Vault and exposes them only to service_role.

create or replace function public.ops2_papoai_order_provider_url_v1(p_channel text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_name text;
  v_secret text;
begin
  v_name:=case btrim(coalesce(p_channel,''))
    when '0975' then 'papoai_order_template_webhook_0975_url_v1'
    when '1018' then 'papoai_order_template_webhook_1018_url_v1'
    else null
  end;

  if v_name is null then return null; end if;

  select ds.decrypted_secret
    into v_secret
  from vault.decrypted_secrets ds
  where ds.name=v_name
  order by ds.updated_at desc nulls last, ds.created_at desc
  limit 1;

  return nullif(btrim(coalesce(v_secret,'')),'');
end;
$$;

revoke all on function public.ops2_papoai_order_provider_url_v1(text) from public,anon,authenticated;
grant execute on function public.ops2_papoai_order_provider_url_v1(text) to service_role;
