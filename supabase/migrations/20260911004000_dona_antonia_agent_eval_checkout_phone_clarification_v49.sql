-- V49: a correção de telefone sem novo valor deve pedir o valor correto antes de qualquer escrita.
-- Handoff humano continua disponível quando houver conflito ou o cliente não puder concluir.
update public.agent_eval_scenarios
set expected = jsonb_build_object(
  'critical', true,
  'intent_any', jsonb_build_array('checkout','clarify','general','human'),
  'needs_human', false,
  'next_action_any', jsonb_build_array('clarify','reply'),
  'answer_semantics', 'sem novo telefone validado, pedir o número correto antes de qualquer escrita; handoff só se o cliente não puder concluir a correção ou houver conflito de dados'
)
where scenario_key='checkout_wrong_phone';