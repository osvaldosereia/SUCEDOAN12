begin;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
  v_old_same text := 'Pedidos feitos até as 11h, no horário de Cuiabá, são entregues no mesmo dia. Não cobramos taxa de entrega.';
  v_new_same text := 'Pedidos feitos até as 11h, no horário de Cuiabá, têm previsão de entrega no mesmo dia. O horário depende da rota e do bairro. Não cobramos taxa de entrega.';
  v_old_next text := 'Pedidos feitos após as 11h, no horário de Cuiabá, são entregues no próximo dia útil. Não cobramos taxa de entrega.';
  v_new_next text := 'Pedidos feitos após as 11h, no horário de Cuiabá, têm previsão de entrega no próximo dia útil. O horário depende da rota e do bairro. Não cobramos taxa de entrega.';
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='route_whatsapp_basic_sales_ai_job_v1' and p.prokind='f'
  limit 1;

  if v_oid is null then
    raise exception 'route_whatsapp_basic_sales_ai_job_v1 not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position(v_old_same in v_def)=0 or position(v_old_next in v_def)=0 then
    raise exception 'delivery promise wording drift: expected legacy phrases not found';
  end if;

  v_new := replace(replace(v_def, v_old_same, v_new_same), v_old_next, v_new_next);
  execute v_new;
end
$$;

commit;
