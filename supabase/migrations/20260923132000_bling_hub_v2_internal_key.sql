
do $$
begin
  if not exists(select 1 from vault.secrets where name='dona_antonia_bling_hub_key_v2') then
    perform vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'dona_antonia_bling_hub_key_v2',
      'Internal key for Dona Antonia Bling Hub v2 server-to-server calls',
      null
    );
  end if;
end $$;

create or replace function public.get_bling_hub_key_v2()
returns text
language sql
stable
security definer
set search_path=''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='dona_antonia_bling_hub_key_v2'
  order by updated_at desc
  limit 1
$$;

revoke all on function public.get_bling_hub_key_v2() from public,anon,authenticated;
grant execute on function public.get_bling_hub_key_v2() to service_role;
