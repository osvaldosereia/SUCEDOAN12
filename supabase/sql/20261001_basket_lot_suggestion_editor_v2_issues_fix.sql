-- Fix PL/pgSQL variable/column collision for issues in basket_lot_suggestion_save_v2.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.basket_lot_suggestion_save_v2(uuid,integer,numeric,jsonb,text)'::regprocedure) into v_def;
  v_new:=replace(v_def,"issues jsonb:='[]'::jsonb;","v_issues jsonb:='[]'::jsonb;");
  v_new:=replace(v_new,'issues:=issues||','v_issues:=v_issues||');
  v_new:=replace(v_new,'issues=issues,','issues=v_issues,');
  v_new:=replace(v_new,"'issues',issues","'issues',v_issues");
  if v_new=v_def then raise exception 'basket_lot_suggestion_save_v2 issues patch anchor not found'; end if;
  execute v_new;
end $$;
