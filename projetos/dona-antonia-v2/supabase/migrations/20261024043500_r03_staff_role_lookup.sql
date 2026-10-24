-- Expose only the signed-in caller's role through the default public API schema.
-- Business tables remain in the unexposed da_next schema.
create or replace function public.get_my_staff_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select assignment.role::text
  from da_next.staff_role_assignments as assignment
  where assignment.user_id = auth.uid()
    and assignment.revoked_at is null
  limit 1;
$function$;

revoke all on function public.get_my_staff_role() from public, anon, authenticated;
grant execute on function public.get_my_staff_role() to authenticated;

comment on function public.get_my_staff_role() is
  'Returns only the authenticated caller’s active staff role; no role or user ID can be supplied by the caller.';

notify pgrst, 'reload schema';
