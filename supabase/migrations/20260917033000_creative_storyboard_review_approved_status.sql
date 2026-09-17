alter table public.creative_storyboard_keyframes
  drop constraint if exists creative_storyboard_keyframes_status_check;

alter table public.creative_storyboard_keyframes
  add constraint creative_storyboard_keyframes_status_check
  check (status = any (array[
    'planned'::text,
    'generating'::text,
    'ready'::text,
    'review'::text,
    'approved'::text,
    'error'::text,
    'stale'::text
  ]));
