-- Dona Antônia · Cestas Molde · limite de composições públicas 1–6
begin;

alter table public.basket_molds
  drop constraint if exists basket_molds_public_composition_count_check;

alter table public.basket_molds
  add constraint basket_molds_public_composition_count_check
  check (public_composition_count between 1 and 6);

do $patch$
declare
  v_target regprocedure := 'public.save_basket_mold_v1(uuid,numeric,integer,jsonb,text)'::regprocedure;
  v_def text;
begin
  select pg_get_functiondef(v_target) into v_def;
  if position('p_public_composition_count > 4' in v_def)=0 then
    raise exception 'basket_mold_composition_limit_anchor_missing';
  end if;
  v_def:=replace(v_def,'p_public_composition_count > 4','p_public_composition_count > 6');
  execute v_def;
end
$patch$;

notify pgrst, 'reload schema';
commit;
