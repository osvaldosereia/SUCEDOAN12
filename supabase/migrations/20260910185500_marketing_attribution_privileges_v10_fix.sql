begin;

-- Defense in depth: the attribution ledger is append-only even for service-role paths.
revoke update, delete, truncate, references, trigger on table public.marketing_attribution_touchpoints from service_role;
grant select, insert on table public.marketing_attribution_touchpoints to service_role;

commit;
