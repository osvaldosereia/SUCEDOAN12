insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'creative-studio-assets','creative-studio-assets',false,26214400,
  array['image/jpeg','image/png','image/webp','image/svg+xml','audio/mpeg','audio/ogg','audio/wav','audio/mp4','application/json','model/gltf+json','model/gltf-binary']::text[]
)
on conflict(id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
