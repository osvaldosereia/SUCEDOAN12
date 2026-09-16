insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'creative-studio-renders','creative-studio-renders',false,157286400,
  array['video/mp4','image/jpeg','image/png','image/webp','application/json']::text[]
)
on conflict(id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
