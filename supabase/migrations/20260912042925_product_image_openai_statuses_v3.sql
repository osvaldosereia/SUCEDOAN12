alter table public.products drop constraint if exists products_image_ai_status_check;
alter table public.products add constraint products_image_ai_status_check
check (image_ai_status is null or image_ai_status = any (array['pending'::text,'processing'::text,'completed'::text,'error'::text,'rejected'::text,'source_rejected'::text,'needs_reprocess'::text]));