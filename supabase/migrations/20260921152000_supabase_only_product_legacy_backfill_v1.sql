-- Dona Antonia: freeze Firebase fields as historical-only and promote Supabase product data.
-- Safe backfill: never overwrites a non-empty operational value.

update public.products
set gondola = nullif(btrim(firebase_snapshot->>'gondola'),'')
where nullif(btrim(gondola),'') is null
  and nullif(btrim(firebase_snapshot->>'gondola'),'') is not null;

update public.products
set shelf = nullif(btrim(coalesce(firebase_snapshot->>'prateleira',firebase_snapshot->>'shelf')),'')
where nullif(btrim(shelf),'') is null
  and nullif(btrim(coalesce(firebase_snapshot->>'prateleira',firebase_snapshot->>'shelf')),'') is not null;

update public.products
set image_source_url = coalesce(
      nullif(btrim(image_original_url),''),
      nullif(btrim(image_firebase_source_url),'')
    ),
    image_source_origin = coalesce(
      nullif(btrim(image_source_origin),''),
      case
        when nullif(btrim(image_original_url),'') is not null then 'supabase_legacy_original_backfill'
        when nullif(btrim(image_firebase_source_url),'') is not null then 'legacy_cached_source_backfill'
        else null
      end
    ),
    updated_at = now()
where nullif(btrim(image_source_url),'') is null
  and (
    nullif(btrim(image_original_url),'') is not null
    or nullif(btrim(image_firebase_source_url),'') is not null
  );

comment on column public.products.firebase_key is
  'LEGACY ONLY: identifier preserved for migration/audit. Firebase is not an authoritative runtime source.';

comment on column public.products.firebase_snapshot is
  'LEGACY ONLY: immutable historical migration snapshot kept in Supabase. Runtime must not query Firebase.';

comment on column public.products.image_firebase_source_url is
  'LEGACY ONLY: cached historical source URL. Prefer image_source_url/image_original_url; no live Firebase lookup.';
