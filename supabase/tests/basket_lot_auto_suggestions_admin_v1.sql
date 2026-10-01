-- Regression for admin approval flow. Run in a disposable transaction.
begin;

do $$
declare
  admin_id uuid;d date:=(clock_timestamp() at time zone 'America/Cuiaba')::date;s_id uuid;before_count int;after_count int;res jsonb;lot_id uuid;enabled boolean;
begin
  select user_id into admin_id from public.admin_users where is_active=true order by created_at limit 1;
  if admin_id is null then raise exception 'active admin user required for regression'; end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.generate_basket_lot_suggestions_v1(d,'regression_admin',true);
  if coalesce((public.basket_lot_suggestions_admin_v1('pending')->>'ok')::boolean,false) is not true then raise exception 'admin list failed'; end if;
  select id into s_id from public.basket_lot_suggestions where suggestion_date=d and status='pending' and buildability_status='ready' order by created_at limit 1;
  if s_id is null then raise exception 'no ready suggestion available'; end if;
  select count(*) into before_count from public.basket_stock_lots;
  res:=public.basket_lot_suggestion_approve_v1(s_id,'Regressão');
  lot_id:=nullif(res#>>'{lot,lot_id}','')::uuid;
  if lot_id is null then raise exception 'approval returned no lot'; end if;
  select count(*) into after_count from public.basket_stock_lots;
  if after_count<>before_count+1 then raise exception 'approval did not create exactly one lot'; end if;
  select sale_enabled into enabled from public.basket_stock_lots where id=lot_id;
  if enabled is distinct from false then raise exception 'approved suggestion unexpectedly enabled public sale'; end if;
end $$;

rollback;
