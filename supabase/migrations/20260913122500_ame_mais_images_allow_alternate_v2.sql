alter table public.ame_mais_images drop constraint if exists ame_mais_images_kind_check;
alter table public.ame_mais_images add constraint ame_mais_images_kind_check check (kind in ('hero','lifestyle','detail','alternate'));
