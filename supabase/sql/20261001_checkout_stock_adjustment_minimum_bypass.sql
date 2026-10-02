do $$
declare
  v_sql text;
  v_old text := 'if v_total<75 then raise exception ''minimum_order''; end if;';
  v_new text := 'if v_total<75 and coalesce((v_customer->>''stock_adjusted_retry'')::boolean,false)=false then raise exception ''minimum_order''; end if;';
begin
  select pg_get_functiondef('public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure)
    into v_sql;
  if position(v_old in v_sql)=0 then
    raise exception 'minimum_order_guard_not_found';
  end if;
  execute replace(v_sql,v_old,v_new);
end;
$$;

revoke all on function public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb) to service_role;
