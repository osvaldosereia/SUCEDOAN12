\set ON_ERROR_STOP on
-- Only for disposable PostgreSQL CI, never production.
create schema if not exists private;
create schema if not exists auth;
create role service_role nologin bypassrls;
create role anon nologin;
create role authenticated nologin;
create function auth.role() returns text language sql stable as
$$select current_setting('request.jwt.claim.role', true)$$;
create table public.whatsapp_accounts(
  id uuid primary key, slug text not null, phone_e164 text not null
);
create table private.whatsapp_ana_channel_release_v1(
  whatsapp_account_id uuid primary key references public.whatsapp_accounts(id),
  mode text not null, generation bigint not null
);
insert into public.whatsapp_accounts values
 ('00000000-0000-4000-8000-000000000018','dona-antonia-1018','+5565984491018'),
 ('00000000-0000-4000-8000-000000000975','dona-antonia-0975','+5565998150975');
insert into private.whatsapp_ana_channel_release_v1 values
 ('00000000-0000-4000-8000-000000000018','current',1),
 ('00000000-0000-4000-8000-000000000975','current',1);
