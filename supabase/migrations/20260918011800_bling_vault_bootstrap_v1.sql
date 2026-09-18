begin;

create or replace function public.install_bling_api_credentials_v1(
  p_client_id text,
  p_client_secret text,
  p_refresh_token text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  if nullif(trim(coalesce(p_client_id,'')),'') is null then raise exception 'client_id_required'; end if;
  if nullif(trim(coalesce(p_client_secret,'')),'') is null then raise exception 'client_secret_required'; end if;
  if nullif(trim(coalesce(p_refresh_token,'')),'') is null then raise exception 'refresh_token_required'; end if;

  select id into v_id from vault.secrets where name='bling_api_client_id_v1' order by updated_at desc limit 1;
  if v_id is null then
    perform vault.create_secret(trim(p_client_id),'bling_api_client_id_v1','Bling API V3 Client ID - server-side only',null);
  else
    perform vault.update_secret(v_id,trim(p_client_id),'bling_api_client_id_v1','Bling API V3 Client ID - server-side only',null);
  end if;

  v_id:=null;
  select id into v_id from vault.secrets where name='bling_api_client_secret_v1' order by updated_at desc limit 1;
  if v_id is null then
    perform vault.create_secret(trim(p_client_secret),'bling_api_client_secret_v1','Bling API V3 Client Secret - server-side only',null);
  else
    perform vault.update_secret(v_id,trim(p_client_secret),'bling_api_client_secret_v1','Bling API V3 Client Secret - server-side only',null);
  end if;

  v_id:=null;
  select id into v_id from vault.secrets where name='bling_api_refresh_token_v1' order by updated_at desc limit 1;
  if v_id is null then
    perform vault.create_secret(trim(p_refresh_token),'bling_api_refresh_token_v1','Bling API V3 Refresh Token - server-side only',null);
  else
    perform vault.update_secret(v_id,trim(p_refresh_token),'bling_api_refresh_token_v1','Bling API V3 Refresh Token - server-side only',null);
  end if;

  return jsonb_build_object('ok',true,'stored',3);
end
$$;

revoke all on function public.install_bling_api_credentials_v1(text,text,text) from public,anon,authenticated;
grant execute on function public.install_bling_api_credentials_v1(text,text,text) to service_role;

commit;
