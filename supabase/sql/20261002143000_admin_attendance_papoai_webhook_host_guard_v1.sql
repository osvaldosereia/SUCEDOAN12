-- Dona Antônia — guarda adicional do transporte do Atendimento.
-- O host foi observado nos webhooks oficiais já usados pela integração de pedidos.

create or replace function public.ops2_papoai_attendance_provider_url_v1(p_channel text)
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
    when '0975' then 'papoai_attendance_text_webhook_0975_url_v1'
    when '1018' then 'papoai_attendance_text_webhook_1018_url_v1'
    else null
  end;
  if v_name is null then return null; end if;

  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds
  where ds.name=v_name
  order by ds.updated_at desc nulls last,ds.created_at desc
  limit 1;

  v_secret:=nullif(btrim(coalesce(v_secret,'')),'');
  if v_secret is null or v_secret !~* '^https://webpublic\.papoai\.com\.br(?:/|$)' then
    return null;
  end if;
  return v_secret;
end;
$$;

create or replace function public.ops2_papoai_attendance_provider_store_v1(p_channel text,p_url text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_name text;
  v_url text;
  v_secret_id uuid;
  v_description text;
begin
  v_name:=case btrim(coalesce(p_channel,''))
    when '0975' then 'papoai_attendance_text_webhook_0975_url_v1'
    when '1018' then 'papoai_attendance_text_webhook_1018_url_v1'
    else null
  end;
  if v_name is null then return jsonb_build_object('ok',false,'error','unsupported_channel'); end if;

  v_url:=nullif(btrim(coalesce(p_url,'')),'');
  if v_url is null or length(v_url)>2048 or v_url !~* '^https://webpublic\.papoai\.com\.br(?:/|$)' then
    return jsonb_build_object('ok',false,'error','invalid_provider_url','channel',p_channel);
  end if;

  v_description:=format('Dona Antônia PapoAI attendance text webhook %s',p_channel);
  select s.id into v_secret_id
  from vault.secrets s
  where s.name=v_name
  order by s.updated_at desc nulls last,s.created_at desc
  limit 1;

  if v_secret_id is null then
    v_secret_id:=vault.create_secret(v_url,v_name,v_description,null);
  else
    perform vault.update_secret(v_secret_id,v_url,v_name,v_description,null);
  end if;

  return jsonb_build_object('ok',true,'channel',p_channel,'stored',true);
end;
$$;

revoke all on function public.ops2_papoai_attendance_provider_url_v1(text) from public,anon,authenticated;
grant execute on function public.ops2_papoai_attendance_provider_url_v1(text) to service_role;
revoke all on function public.ops2_papoai_attendance_provider_store_v1(text,text) from public,anon,authenticated;
grant execute on function public.ops2_papoai_attendance_provider_store_v1(text,text) to service_role;
