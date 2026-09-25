-- Emergency operational pause requested on 2026-09-21.
-- Purpose: stop all user-defined pg_cron automations while Supabase/Firebase architecture is reorganized.
-- Jobs are preserved and can be selectively re-enabled later with cron.alter_job(..., active => true).

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where active = true loop
    perform cron.alter_job(r.jobid, active => false);
  end loop;
end
$$;

comment on extension pg_cron is
  'Installed for scheduled jobs. All jobs intentionally paused on 2026-09-21 pending architecture/cost review.';
