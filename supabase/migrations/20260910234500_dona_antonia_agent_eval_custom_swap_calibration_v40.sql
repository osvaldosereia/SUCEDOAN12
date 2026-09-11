begin;
update public.agent_eval_scenarios
set expected=jsonb_set(expected,'{next_action_any}','["reply","start_basket_flow","cart","show_baskets"]'::jsonb,true),updated_at=now()
where scenario_key='custom_swap';
commit;
