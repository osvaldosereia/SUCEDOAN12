-- Extend the existing internal editor source with the WhatsApp eligibility flag.
-- The authenticated Admin wrapper still owns authorization and forwards this
-- additive JSON field; the internal function ACL is intentionally unchanged.
create or replace function public.basket_mold_editor_v1(p_basket_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'basket_id', b.id,
    'basket_name', b.name,
    'basket_image_url', b.image_url,
    'mold_id', m.id,
    'hidden_adjustment', coalesce(m.hidden_adjustment, 0),
    'conditional_hidden_enabled', coalesce(m.conditional_hidden_enabled, false),
    'conditional_hidden_product_id', m.conditional_hidden_product_id,
    'conditional_hidden_adjustment', coalesce(m.conditional_hidden_adjustment, 0),
    'conditional_hidden_product',
      case when cp.id is null then null else jsonb_build_object(
        'product_id', cp.id,
        'name', cp.name,
        'sku', cp.sku,
        'gtin', cp.gtin,
        'image_url', cp.image_url,
        'packaging', cp.packaging,
        'is_active', cp.is_active
      ) end,
    'public_composition_count', coalesce(m.public_composition_count, 2),
    'metadata', coalesce(m.metadata, '{}'::jsonb),
    'positions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position_id', pos.id,
          'label', pos.label,
          'quantity', pos.quantity,
          'sort_order', pos.sort_order,
          'metadata', pos.metadata,
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'option_id', opt.id,
                'product_id', p.id,
                'name', p.name,
                'sku', p.sku,
                'gtin', p.gtin,
                'image_url', p.image_url,
                'is_active', p.is_active,
                'is_whatsapp_active', p.is_whatsapp_active,
                'sort_order', opt.sort_order,
                'metadata', opt.metadata
              ) order by opt.sort_order, opt.id
            )
            from public.basket_mold_position_options opt
            join public.products p on p.id = opt.product_id
            where opt.position_id = pos.id
          ), '[]'::jsonb)
        ) order by pos.sort_order, pos.id
      )
      from public.basket_mold_positions pos
      where pos.mold_id = m.id
    ), '[]'::jsonb)
  )
  from public.basket_templates b
  left join public.basket_molds m on m.basket_id = b.id
  left join public.products cp on cp.id = m.conditional_hidden_product_id
  where b.id = p_basket_id;
$function$;
