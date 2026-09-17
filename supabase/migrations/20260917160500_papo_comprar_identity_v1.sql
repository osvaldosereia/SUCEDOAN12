begin;

-- Segredo de entrada do webhook PapoAI -> Comprar.
-- É gerado uma única vez e nunca é exposto ao navegador.
do $$
begin
  if not exists (
    select 1 from vault.secrets
    where name='dona_antonia_papo_comprar_webhook_token_v1'
  ) then
    perform vault.create_secret(
      replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
      'dona_antonia_papo_comprar_webhook_token_v1',
      'Shared secret for authenticated PapoAI to Dona Antonia Comprar identity webhook'
    );
  end if;
end $$;

create or replace function public.get_dona_antonia_papo_comprar_webhook_token_v1()
returns text
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='dona_antonia_papo_comprar_webhook_token_v1'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.get_dona_antonia_papo_comprar_webhook_token_v1() from public, anon, authenticated;
grant execute on function public.get_dona_antonia_papo_comprar_webhook_token_v1() to service_role;

comment on function public.get_dona_antonia_papo_comprar_webhook_token_v1() is
  'Service-role-only getter for the PapoAI Comprar identity webhook shared secret.';

commit;
