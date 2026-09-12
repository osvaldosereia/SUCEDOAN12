begin;

-- The Admin V3 rules editor now represents only Dona Antônia's own attendance.
-- Preserve the existing basket intention by opening our shopping room instead of a Meta Flow.
update public.service_simple_rules
set response_mode = 'cta_url',
    tool_config = jsonb_build_object(
      'label','Ver cestas',
      'url','https://donaantonia.com.br/comprar/'
    ),
    updated_at = now()
where response_mode = 'basket_flow';

update public.service_simple_rules r
set stages = rewritten.stages,
    updated_at = now()
from (
  select x.id,
         jsonb_agg(
           case
             when (stage.value->>'response_mode') = 'basket_flow' then
               jsonb_set(
                 jsonb_set(stage.value,'{response_mode}',to_jsonb('cta_url'::text),false),
                 '{tool_config}',
                 jsonb_build_object(
                   'label','Ver cestas',
                   'url','https://donaantonia.com.br/comprar/'
                 ),
                 true
               )
             else stage.value
           end
           order by stage.ordinality
         ) as stages
  from public.service_simple_rules x
  cross join lateral jsonb_array_elements(coalesce(x.stages,'[]'::jsonb)) with ordinality as stage(value,ordinality)
  group by x.id
  having bool_or((stage.value->>'response_mode') = 'basket_flow')
) rewritten
where r.id = rewritten.id;

commit;
