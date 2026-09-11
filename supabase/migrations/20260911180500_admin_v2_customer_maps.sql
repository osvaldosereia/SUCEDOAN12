begin;

alter table public.customer_addresses
  add column if not exists google_maps_url text;

comment on column public.customer_addresses.google_maps_url is
  'Optional exact Google Maps URL/pin saved by Admin V2; UI can fall back to address search when null.';

commit;
