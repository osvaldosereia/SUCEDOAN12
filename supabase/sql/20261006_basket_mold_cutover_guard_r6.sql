-- Dona Antônia · Cestas Molde · R6
-- Guard server-side do cutover: moldes legacy_first só podem vender depois que as fontes físicas zerarem.

begin;

create or replace function public.basket_mold_cutover_ready_v1(p_basket_id uuid)
returns boolean
language plpgsql
stable
set search_path=''
as $$
declare
  v_metadata jsonb;
  v_source text;
begin
  select metadata into v_metadata
  from public.basket_molds
  where basket_id=p_basket_id;

  if not found then return false; end if;
  if coalesce(v_metadata->>'transition_mode','mold_only')<>'legacy_first' then return true; end if;

  for v_source in
    select jsonb_array_elements_text(coalesce(v_metadata->'legacy_source_basket_ids','[]'::jsonb))
  loop
    if exists(
      select 1
      from public.basket_commercial_catalog_v1 c
      where c.source_kind='basket'
        and c.commercial_id::text=v_source
        and c.model_active=true
        and c.category_active=true
        and c.public_lot_id is not null
        and coalesce(c.public_available,0)>0
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.basket_mold_cutover_ready_v1(uuid) from public,anon,authenticated;
grant execute on function public.basket_mold_cutover_ready_v1(uuid) to service_role;

-- Defense in depth: even a manipulated Edge payload cannot bypass legacy-first.
do $patch$
declare
  v_target regprocedure := 'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure;
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(v_target) into v_def;
  v_old := $old$      select * into v_mold from public.basket_molds where basket_id=v_basket.id;
      if not found then raise exception 'basket_mold_not_configured'; end if;
$old$;
  v_new := $new$      select * into v_mold from public.basket_molds where basket_id=v_basket.id;
      if not found then raise exception 'basket_mold_not_configured'; end if;
      if not public.basket_mold_cutover_ready_v1(v_basket.id) then
        raise exception 'basket_mold_legacy_pending';
      end if;
$new$;
  if position(v_old in v_def)=0 then raise exception 'r6_basket_mold_checkout_guard_anchor_missing'; end if;
  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end;
$patch$;

revoke all on function public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb) to service_role;

commit;
