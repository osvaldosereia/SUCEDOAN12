do $$
begin
  if not exists(select 1 from vault.secrets where name='marketing_render_worker_key_v1') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'marketing_render_worker_key_v1',
      'Internal key for Dona Antonia deterministic marketing renderer'
    );
  end if;
end $$;

create or replace function public.check_marketing_render_worker_key_v1(p_key text)
returns boolean
language sql
security definer
set search_path to ''
as $$
  select coalesce(
    extensions.digest(coalesce(p_key,''),'sha256') =
    extensions.digest((
      select decrypted_secret
      from vault.decrypted_secrets
      where name='marketing_render_worker_key_v1'
      order by created_at desc
      limit 1
    ),'sha256'),
    false
  );
$$;

revoke all on function public.check_marketing_render_worker_key_v1(text) from public,anon,authenticated;
grant execute on function public.check_marketing_render_worker_key_v1(text) to service_role;

create or replace function public.dispatch_marketing_preview_render_v1(p_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_secret text;
  v_asset public.marketing_assets%rowtype;
  v_request bigint;
begin
  if p_asset_id is null then
    return jsonb_build_object('ok',false,'reason','asset_required','external_side_effect',false);
  end if;
  select * into v_asset from public.marketing_assets where id=p_asset_id;
  if not found then
    return jsonb_build_object('ok',false,'reason','asset_not_found','external_side_effect',false);
  end if;
  if v_asset.status not in ('draft','failed','rendered') then
    return jsonb_build_object('ok',false,'reason','asset_not_preview_renderable','status',v_asset.status,'external_side_effect',false);
  end if;
  if v_asset.generation_mode<>'no_ai' then
    return jsonb_build_object('ok',false,'reason','preview_render_no_ai_only','external_side_effect',false);
  end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='marketing_render_worker_key_v1'
  order by created_at desc limit 1;
  if nullif(v_secret,'') is null then
    return jsonb_build_object('ok',false,'reason','worker_secret_missing','external_side_effect',false);
  end if;
  v_request:=net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/marketing-render-worker-v1',
    headers:=jsonb_build_object('Content-Type','application/json','x-da-marketing-render-key',v_secret),
    body:=jsonb_build_object('event','render_asset_preview','asset_id',p_asset_id),
    timeout_milliseconds:=120000
  );
  insert into public.marketing_events(entity_type,entity_id,event_type,data,external_side_effect)
  values('asset',p_asset_id::text,'preview_render_dispatched',
    jsonb_build_object('request_id',v_request,'render_worker','marketing-render-worker-v1'),false);
  return jsonb_build_object('ok',true,'dispatched',true,'request_id',v_request,'asset_id',p_asset_id,'external_side_effect',false);
exception when others then
  return jsonb_build_object('ok',false,'reason','dispatch_failed','external_side_effect',false);
end;
$$;

revoke all on function public.dispatch_marketing_preview_render_v1(uuid) from public,anon,authenticated;
grant execute on function public.dispatch_marketing_preview_render_v1(uuid) to service_role;

update public.marketing_runtime_config
set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
  'draft_preview_render_enabled', true,
  'draft_preview_render_engine', 'magick_wasm',
  'draft_preview_render_max_source_bytes', 5242880,
  'draft_preview_render_quality', 82,
  'draft_preview_render_external_publish', false
),
updated_at=now()
where id=1;