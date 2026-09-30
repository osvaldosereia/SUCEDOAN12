begin;

-- Defense in depth for immutable marketing revision history.
-- The append-only trigger already blocks mutation; this also removes table-level mutation privileges.
revoke update, delete, truncate, references, trigger on table public.marketing_asset_revisions from service_role;
grant select, insert on table public.marketing_asset_revisions to service_role;

commit;
