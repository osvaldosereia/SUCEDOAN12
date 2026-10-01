-- Regression: creating a new family with an existing derived key must not overwrite it.
-- Safe: all changes rollback.
begin;

select set_config('request.jwt.claim.sub',(
  select user_id::text from public.admin_users where is_active=true order by created_at limit 1
),true);

do $$
declare
  f record;
  before_count integer;
  after_count integer;
  rejected boolean:=false;
begin
  select r.family_key,r.label into f
  from public.basket_lot_substitution_rules r
  order by r.sort_order,r.family_key
  limit 1;
  if not found then raise exception 'no substitution family available'; end if;

  select count(*) into before_count
  from public.basket_lot_substitution_products
  where family_key=f.family_key;

  begin
    perform public.basket_lot_substitution_family_save_admin_v1(
      null,f.label,true,array[]::uuid[],'duplicate-regression'
    );
  exception when others then
    if sqlerrm='family_already_exists' then rejected:=true; else raise; end if;
  end;

  if rejected is not true then raise exception 'duplicate family creation was not rejected'; end if;
  select count(*) into after_count
  from public.basket_lot_substitution_products
  where family_key=f.family_key;
  if after_count<>before_count then raise exception 'existing family products were changed'; end if;
end $$;

rollback;
