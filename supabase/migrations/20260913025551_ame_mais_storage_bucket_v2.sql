insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('ame-mais','ame-mais',true,10485760,array['image/jpeg','image/png','image/webp','application/json']::text[])
on conflict (id) do update set
  name=excluded.name,
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
