-- Make Flow-only product groups follow the live mold positions without changing public molds.
-- Keep the composition and prices in basket_molds untouched.
update public.basket_admin_product_types pt
set metadata=jsonb_set(
  coalesce(pt.metadata,'{}'::jsonb),
  '{flow_v1}',
  coalesce(pt.metadata->'flow_v1','{}'::jsonb)
    || case pt.name
      when 'Miojo' then jsonb_build_object(
        'enabled',true,
        'sort_order',6,
        'selection_mode','multiple',
        'max_quantity',10,
        'position_labels',jsonb_build_array('Macarrão Lámen Carne Apti 70 g')
      )
      when 'Macarrão' then jsonb_build_object(
        'enabled',true,
        'sort_order',5,
        'selection_mode','multiple',
        'max_quantity',10
      )
      else jsonb_build_object('enabled',true)
    end,
  true
),
updated_at=now()
where pt.name in ('Desinfetante','Miojo','Macarrão');

with mapped_quantities as (
  select
    bt.id as basket_type_id,
    pt.id as product_type_id,
    coalesce(sum(mp.quantity),0)::numeric as quantity
  from public.basket_admin_product_types pt
  join public.basket_admin_basket_types bt
    on bt.is_active and bt.linked_basket_id is not null
  left join public.basket_molds bm
    on bm.basket_id=bt.linked_basket_id
  left join public.basket_mold_positions mp
    on mp.mold_id=bm.id
    and (
      (
        pt.name in ('Desinfetante','Miojo')
        and coalesce(pt.metadata->'flow_v1'->'position_labels','[]'::jsonb) ? mp.label
      )
      or (
        pt.name='Macarrão'
        and mp.label=any(pt.legacy_labels)
        and not exists (
          select 1
          from public.basket_admin_product_types override_type
          where override_type.id<>pt.id
            and coalesce(override_type.metadata->'flow_v1'->'position_labels','[]'::jsonb) ? mp.label
        )
      )
    )
  where pt.name in ('Desinfetante','Miojo','Macarrão')
  group by bt.id,pt.id
)
insert into public.basket_admin_quantities(
  basket_type_id,product_type_id,quantity,updated_at
)
select basket_type_id,product_type_id,quantity,now()
from mapped_quantities
on conflict (basket_type_id,product_type_id)
do update set quantity=excluded.quantity,updated_at=now();
