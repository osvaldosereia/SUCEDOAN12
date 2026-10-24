-- Dona Antônia · hardening pós-deploy de Cestas/Kits.
-- 1) cobre o FK de categoria usado pelos templates internos;
-- 2) remove execução pública da mutação SECURITY DEFINER, preservando service_role.

create index if not exists basket_kit_templates_category_id_idx
  on public.basket_kit_templates(category_id);

revoke execute on function public.apply_basket_kit_lot_commercial_v3(uuid,text,numeric,text,uuid)
  from public, anon, authenticated;

grant execute on function public.apply_basket_kit_lot_commercial_v3(uuid,text,numeric,text,uuid)
  to service_role;
