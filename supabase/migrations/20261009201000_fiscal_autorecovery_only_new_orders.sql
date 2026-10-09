-- User decision 2026-10-09: only new orders from this point forward.
-- The worker was paused at 2026-10-09 20:08:06.484578+00.
-- Never retry, edit or reconcile older invoices through the autonomous queue.
alter table public.fiscal_nfe_recovery_control_v1
  add column if not exists min_order_created_at timestamptz;
update public.fiscal_nfe_recovery_control_v1
   set min_order_created_at=coalesce(min_order_created_at,updated_at)
 where id=true;
alter table public.fiscal_nfe_recovery_control_v1
  alter column min_order_created_at set not null;
do $$
begin
 if not exists(
   select 1 from pg_constraint
    where conname='fiscal_nfe_autorecovery_cutover_floor_v1'
      and conrelid='public.fiscal_nfe_recovery_control_v1'::regclass
 ) then
   alter table public.fiscal_nfe_recovery_control_v1
   add constraint fiscal_nfe_autorecovery_cutover_floor_v1
   check (min_order_created_at >= '2026-10-09 20:08:06.484578+00'::timestamptz);
 end if;
end $$;
comment on column public.fiscal_nfe_recovery_control_v1.min_order_created_at is
  'Strict lower bound for autonomous fiscal recovery: orders and fiscal jobs created before this instant cannot be processed. Never move backwards.';
