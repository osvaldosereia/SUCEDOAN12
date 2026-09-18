drop function if exists public.dispatch_marketing_preview_render_v1(uuid);
drop function if exists public.check_marketing_render_worker_key_v1(text);
delete from vault.secrets where name='marketing_render_worker_key_v1';

update public.marketing_runtime_config
set metadata = coalesce(metadata,'{}'::jsonb) - 'draft_preview_render_engine'
  || jsonb_build_object(
    'draft_preview_render_enabled',true,
    'draft_preview_render_engine','admin_marketing_media_magick_wasm',
    'draft_preview_render_max_source_bytes',5242880,
    'draft_preview_render_quality',82,
    'draft_preview_render_external_publish',false
  ),
updated_at=now()
where id=1;