create or replace function public.run_basket_lot_suggestions_daily_v1() returns jsonb language plpgsql security definer set search_path to '' as $$
declare cfg public.basket_lot_automation_settings%rowtype;begin select * into cfg from public.basket_lot_automation_settings where id=1;if not found or cfg.enabled<>true then return jsonb_build_object('ok',true,'skipped',true,'reason','automation_disabled');end if;return public.generate_basket_lot_suggestions_v1((clock_timestamp() at time zone cfg.timezone)::date,'cron',false);end;$$;
revoke all on function public.run_basket_lot_suggestions_daily_v1() from public,anon,authenticated;
grant execute on function public.run_basket_lot_suggestions_daily_v1() to service_role;

do $$
declare jid bigint;begin select jobid into jid from cron.job where jobname='basket-lot-suggestions-daily-v1' limit 1;if jid is not null then perform cron.unschedule(jid);end if;perform cron.schedule('basket-lot-suggestions-daily-v1','5 12 * * *','select public.run_basket_lot_suggestions_daily_v1();');end $$;
