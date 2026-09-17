begin;

-- A ponte reutiliza o webhook outbound já existente no Vault, sem expor a URL no repositório.
-- O token da rota PapoAI é derivado do segredo de entrada já provisionado e salvo como segredo próprio.
do $$
declare
  v_source text;
  v_token text;
begin
  if not exists (
    select 1 from vault.secrets
    where name='dona_antonia_papo_comprar_outbound_make_token_v1'
  ) then
    select decrypted_secret into v_source
    from vault.decrypted_secrets
    where name='dona_antonia_papo_comprar_webhook_token_v1'
    order by created_at desc
    limit 1;

    if nullif(v_source,'') is null then
      raise exception 'papo_comprar_source_secret_missing';
    end if;

    v_token:=encode(extensions.digest(v_source||':papo-comprar-outbound-v1','sha256'),'hex');
    perform vault.create_secret(
      v_token,
      'dona_antonia_papo_comprar_outbound_make_token_v1',
      'Token isolado da ponte PapoAI para entrega do link do Comprar'
    );
  end if;
end
$$;

create or replace function public.get_dona_antonia_papo_comprar_outbound_bridge_v1()
returns jsonb
language sql
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'url',(
      select decrypted_secret
      from vault.decrypted_secrets
      where name='dona_antonia_whatsapp_outbound_make_webhook'
      order by created_at desc
      limit 1
    ),
    'token',(
      select decrypted_secret
      from vault.decrypted_secrets
      where name='dona_antonia_papo_comprar_outbound_make_token_v1'
      order by created_at desc
      limit 1
    )
  );
$$;

revoke all on function public.get_dona_antonia_papo_comprar_outbound_bridge_v1() from public,anon,authenticated;
grant execute on function public.get_dona_antonia_papo_comprar_outbound_bridge_v1() to service_role;

commit;
