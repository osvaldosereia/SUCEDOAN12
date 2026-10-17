-- Correct the legacy reservation role without relaxing the allocation constraint.
do $migration$
declare
 v_target regprocedure := 'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure;
 v_definition text;
 v_old text := '''allocation_role'',''legacy''';
 v_new text := '''allocation_role'',''legacy_full''';
begin
 select pg_get_functiondef(v_target) into v_definition;
 if position(v_old in v_definition)=0 then
   if position(v_new in v_definition)>0 then return; end if;
   raise exception 'legacy_allocation_role_patch_target_not_found';
 end if;
 if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 then
   raise exception 'legacy_allocation_role_patch_ambiguous';
 end if;
 execute replace(v_definition,v_old,v_new);
end $migration$;
