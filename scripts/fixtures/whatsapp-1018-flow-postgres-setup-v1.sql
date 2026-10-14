\set ON_ERROR_STOP on
-- Disposable PostgreSQL fixture: NEVER apply in a connected Supabase project.
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
create table private.whatsapp_ana_admin_versions_v1(
  id bigint primary key, version integer not null, configuration jsonb not null
);
create table private.whatsapp_ana_admin_runtime_v1(
  singleton boolean primary key, active_version_id bigint references private.whatsapp_ana_admin_versions_v1(id)
);
create table public.whatsapp_ana_jobs_v1(
  id uuid primary key, whatsapp_account_id uuid references public.whatsapp_accounts(id)
);
create function public.ops2_ana_active_config_v1() returns jsonb language sql as
$$select jsonb_build_object('ok',true,'version',1,'version_id',1,
 'configuration','{"behavior":{},"knowledge":[],"triggers":[],"test_cases":[]}'::jsonb)$$;
create function public.ops2_ana_begin_live_send_v1(uuid,text) returns jsonb language sql as
$$select '{"ok":true,"mock":true}'::jsonb$$;

insert into public.whatsapp_accounts values
 ('00000000-0000-4000-8000-000000000018','dona-antonia-1018','+5565984491018'),
 ('00000000-0000-4000-8000-000000000975','dona-antonia-0975','+5565998150975');
insert into private.whatsapp_ana_admin_versions_v1 values
 (1,1,'{"behavior":{},"knowledge":[],"triggers":[],"test_cases":[]}'::jsonb);
insert into private.whatsapp_ana_admin_runtime_v1 values (true,1);
