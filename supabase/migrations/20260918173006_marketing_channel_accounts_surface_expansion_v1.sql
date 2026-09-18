alter table public.marketing_channel_accounts
  drop constraint if exists marketing_channel_accounts_channel_check;

alter table public.marketing_channel_accounts
  add constraint marketing_channel_accounts_channel_check
  check (channel = any (array[
    'whatsapp_status'::text,
    'instagram_story'::text,
    'facebook_story'::text,
    'instagram_feed'::text,
    'instagram_reel'::text,
    'facebook_post'::text,
    'facebook_reel'::text,
    'instagram_carousel'::text,
    'pinterest_pin'::text,
    'google_business_post'::text
  ]));

with desired(channel,provider,display_name,capabilities) as (
  values
    ('instagram_feed','meta','Dona Antônia · Instagram Feed','{"media":"image","connection_required":true}'::jsonb),
    ('instagram_story','meta','Dona Antônia · Instagram Story','{"media":"image","connection_required":true}'::jsonb),
    ('instagram_reel','meta','Dona Antônia · Instagram Reel','{"media":"video","connection_required":true}'::jsonb),
    ('instagram_carousel','meta','Dona Antônia · Instagram Carrossel','{"media":"carousel","connection_required":true}'::jsonb),
    ('facebook_post','meta','Dona Antônia · Facebook Post','{"media":"image","connection_required":true}'::jsonb),
    ('facebook_story','meta','Dona Antônia · Facebook Story','{"media":"image","connection_required":true}'::jsonb),
    ('facebook_reel','meta','Dona Antônia · Facebook Reel','{"media":"video","connection_required":true}'::jsonb),
    ('pinterest_pin','pinterest','Dona Antônia · Pinterest','{"media":"image","link":true,"connection_required":true}'::jsonb),
    ('whatsapp_status','meta','Dona Antônia · WhatsApp Status','{"media":"image","manual_confirmation_required":true,"connection_required":true}'::jsonb)
)
insert into public.marketing_channel_accounts(channel,provider,display_name,status,capabilities,metadata)
select d.channel,d.provider,d.display_name,'disconnected',d.capabilities,
       jsonb_build_object('seed_version','marketing_channels_v2','external_publish_enabled',false)
from desired d
where not exists(
  select 1 from public.marketing_channel_accounts a
  where a.channel=d.channel and a.provider=d.provider
);