-- Dona Antônia — Central de Atendimento v2 / Fase 1
-- Cache privado de mídia recebida do PapoAI. Sem backfill automático e sem cron.

create table if not exists public.attendance_media_cache_v1 (
  message_id uuid primary key references public.whatsapp_messages_v1(id) on delete cascade,
  object_path text not null unique,
  mime_type text null,
  filename text null,
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists attendance_media_cache_v1_expires_idx
  on public.attendance_media_cache_v1(expires_at);

alter table public.attendance_media_cache_v1 enable row level security;

revoke all on table public.attendance_media_cache_v1 from public;
revoke all on table public.attendance_media_cache_v1 from anon;
revoke all on table public.attendance_media_cache_v1 from authenticated;
grant select, insert, update, delete on table public.attendance_media_cache_v1 to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'attendance-media-v1',
  'attendance-media-v1',
  false,
  20971520,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/x-wav',
    'video/mp4',
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip','application/octet-stream'
  ]::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types,
  updated_at=now();
