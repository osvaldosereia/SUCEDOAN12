-- SI5 pilot trigger: a random 256-bit credential, encrypted in Vault and SHA-256
-- fingerprint stored separately. This is only an internal invocation capability.
-- No product, order, fiscal or catalog updates. No schedule.
create table if not exists public.si5_internal_trigger_guard_v1 (
 id boolean primary key default true check (id),
 secret_sha256 text not null check(secret_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now()
);
alter table public.si5_internal_trigger_guard_v1 enable row level security;
revoke all on public.si5_internal_trigger_guard_v1 from public,anon,authenticated;
grant select on public.si5_internal_trigger_guard_v1 to service_role;

do $$
declare token_value text;
begin
 if not exists (select 1 from vault.secrets where name='si5_internal_trigger_v1') then
   token_value := encode(gen_random_bytes(32),'hex');
   perform vault.create_secret(token_value,'si5_internal_trigger_v1',
     'SI5 internal pg_net invocation token. Do not disclose or use in browser.');
   insert into public.si5_internal_trigger_guard_v1(id,secret_sha256)
   values (true,encode(digest(token_value,'sha256'),'hex'))
   on conflict (id) do nothing;
 end if;
end $$;
comment on table public.si5_internal_trigger_guard_v1 is
 'Internal SI5 webhook authorization digest. Plain token stored only encrypted in Vault.';
