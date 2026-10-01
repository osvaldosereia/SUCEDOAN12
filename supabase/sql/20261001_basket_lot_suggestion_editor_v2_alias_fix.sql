-- Fix PL/pgSQL variable/table alias collision in basket_lot_suggestion_save_v2.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.basket_lot_suggestion_save_v2(uuid,integer,numeric,jsonb,text)'::regprocedure) into v_def;
  v_new:=replace(v_def,'max(p.name) product_name','max(pr.name) product_name');
  v_new:=replace(v_new,'join public.products p on p.id=i.suggested_product_id','join public.products pr on pr.id=i.suggested_product_id');
  if v_new=v_def then raise exception 'basket_lot_suggestion_save_v2 alias patch anchor not found'; end if;
  execute v_new;
end $$;
