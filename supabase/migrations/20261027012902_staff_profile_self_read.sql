-- A signed-in employee can read only their own role and enabled state.
-- Provisioning and role changes remain a trusted server/owner operation.
GRANT SELECT ON TABLE public.staff_profiles TO authenticated;

CREATE POLICY staff_profiles_read_self
ON public.staff_profiles
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);
