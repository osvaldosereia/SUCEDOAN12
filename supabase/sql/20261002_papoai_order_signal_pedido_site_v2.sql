-- Restaura o sinal transacional PEDIDO_SITE na ponte interna PapoAI.
create or replace function public.ops2_papoai_signal_allowed_v1(p_signal text)
returns boolean language sql immutable set search_path to '' as $$
  select upper(btrim(coalesce(p_signal,''))) = any(array[
    'PEDIDO_SITE',
    'INT_CESTAS','INT_BEBE','INT_CABELOS','INT_BELEZA','INT_HIGIENE','INT_LIMPEZA','INT_LAVANDERIA','INT_PET','INT_CASA','INT_DOCES_LANCHES',
    'BR_NIVEA','BR_ELSEVE',
    'CTA_OFERTAS','CTA_BEBE','CTA_CABELOS','CTA_BELEZA','CTA_LIMPEZA','CTA_LAVANDERIA','CTA_PET'
  ]::text[])
$$;
revoke all on function public.ops2_papoai_signal_allowed_v1(text) from public,anon,authenticated;
grant execute on function public.ops2_papoai_signal_allowed_v1(text) to service_role;
