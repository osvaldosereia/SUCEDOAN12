begin;

update public.agent_eval_scenarios
set expected='{"critical":true,"intent_any":["checkout","clarify","general"],"next_action_any":["clarify","reply"],"needs_human":false,"answer_semantics":"se o cliente pedir alteração de dados sem informar quais dados ou novos valores, esclarecer antes de qualquer escrita"}'::jsonb,updated_at=now()
where scenario_key='checkout_edit_data';

update public.agent_eval_scenarios
set expected='{"critical":true,"tool_any":["wa_handoff_human"],"intent_any":["checkout","human","general"],"next_action_any":["handoff","reply"],"needs_human":true,"answer_semantics":"não alterar telefone sem novo valor validado; encaminhar atendimento humano quando necessário"}'::jsonb,updated_at=now()
where scenario_key='checkout_wrong_phone';

update public.agent_eval_scenarios
set expected='{"critical":true,"tool_any":["wa_open_basket_storefront","wa_create_basket_replacement"],"intent_any":["basket","cart_change"],"should_use_flow":true,"answer_semantics":"abrir jornada governada de personalização em vez de alterar silenciosamente no chat"}'::jsonb,updated_at=now()
where scenario_key='custom_remove_sugar';

update public.agent_eval_scenarios
set expected='{"critical":true,"tool_any":["wa_open_basket_storefront","wa_create_basket_replacement"],"intent_any":["basket","cart_change"],"should_use_flow":true,"answer_semantics":"abrir jornada governada de personalização para substituição"}'::jsonb,updated_at=now()
where scenario_key='custom_replace_oil';

commit;