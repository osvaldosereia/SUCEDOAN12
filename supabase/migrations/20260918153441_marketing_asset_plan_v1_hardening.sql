create unique index if not exists marketing_assets_campaign_content_role_unique_v1
on public.marketing_assets (campaign_id, ((edit_spec->>'content_role')))
where campaign_id is not null
  and status <> 'archived'
  and nullif(trim(coalesce(edit_spec->>'content_role','')),'') is not null;

update public.marketing_content_templates
set status='approved'
where template_key in (
  'square_offer',
  'vertical_story_status',
  'pinterest_vertical',
  'instagram_carousel_card',
  'vertical_video_offer'
)
and status='draft';

insert into public.marketing_events(entity_type,entity_id,event_type,data,external_side_effect)
select
  'campaign',
  '75cd51f4-fcdc-4c39-85d9-2b6438d5ba5d',
  'asset_plan_created',
  jsonb_build_object(
    'version','marketing_asset_plan_v1',
    'created_count',5,
    'reused_count',0,
    'roles',jsonb_build_array('feed_square','story_status','pinterest_pin','instagram_carousel','reel_light_10s'),
    'ai_used',false,
    'source','round3_pilot_validation'
  ),
  false
where not exists (
  select 1 from public.marketing_events
  where entity_type='campaign'
    and entity_id='75cd51f4-fcdc-4c39-85d9-2b6438d5ba5d'
    and event_type='asset_plan_created'
);