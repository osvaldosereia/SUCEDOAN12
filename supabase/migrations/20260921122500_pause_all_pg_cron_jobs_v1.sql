-- Emergency operational pause requested on 2026-09-21.
-- Purpose: stop all user-defined pg_cron automations while Supabase/Firebase architecture is reorganized.
-- This does not drop jobs. It only marks them inactive so each one can be reviewed and selectively re-enabled later.

update cron.job
set active = false
where active = true;

comment on extension pg_cron is
  'Installed for scheduled jobs. All jobs intentionally paused on 2026-09-21 pending architecture/cost review.';
