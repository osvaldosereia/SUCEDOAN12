alter table public.creative_video_projects
  drop constraint if exists creative_video_projects_status_check;

alter table public.creative_video_projects
  add constraint creative_video_projects_status_check
  check (status = any (array[
    'draft'::text,
    'collecting_assets'::text,
    'curating'::text,
    'ready'::text,
    'rendering'::text,
    'review'::text,
    'story_approved'::text,
    'storyboard_approved'::text,
    'completed'::text,
    'archived'::text
  ]));
