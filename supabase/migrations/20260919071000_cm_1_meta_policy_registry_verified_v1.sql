-- CM-1 homologation: Meta Policy Registry verified sources v1
-- Internal policy knowledge only. Does NOT authorize Meta Direct, outbound, publishing or template submission.

insert into public.meta_policy_registry(
  policy_key,version,title,capability,rule_text,restrictions,requirements,
  source_url,effective_at,reviewed_at,status,fail_closed,metadata,updated_at
)
values
(
  'whatsapp_opt_in_required',1,'Opt-in obrigatório para contato proativo','outbound',
  'Contato proativo pelo WhatsApp exige que a pessoa tenha fornecido o número e concedido permissão para receber mensagens ou chamadas.',
  '{"when_missing":"suppress","marketing_without_opt_in":false}'::jsonb,
  '{"phone_number_provided":true,"opt_in_evidence_required":true}'::jsonb,
  'https://business.whatsapp.com/policy',null,now(),'active',true,
  '{"source_kind":"official_whatsapp_business_messaging_policy","source_reviewed_on":"2026-09-18","section":"Create a Quality Experience"}'::jsonb,now()
),
(
  'whatsapp_opt_out_required',1,'Opt-out deve ser respeitado','outbound',
  'Pedidos para interromper, bloquear ou cancelar comunicações devem ser respeitados, inclusive quando recebidos fora do WhatsApp.',
  '{"after_opt_out":"suppress","override_allowed":false}'::jsonb,
  '{"suppression_record_required":true,"customer_request_has_priority":true}'::jsonb,
  'https://business.whatsapp.com/policy',null,now(),'active',true,
  '{"source_kind":"official_whatsapp_business_messaging_policy","source_reviewed_on":"2026-09-18","section":"Create a Quality Experience"}'::jsonb,now()
),
(
  'whatsapp_business_initiated_template_required',1,'Template aprovado para iniciar conversa','templates',
  'Conversa iniciada pela empresa deve usar Message Template aprovado e o template deve ser usado para sua finalidade designada.',
  '{"free_form_business_initiated":false,"unapproved_template":false}'::jsonb,
  '{"approved_template_required":true,"designated_purpose_required":true}'::jsonb,
  'https://business.whatsapp.com/policy',null,now(),'active',true,
  '{"source_kind":"official_whatsapp_business_messaging_policy","source_reviewed_on":"2026-09-18","section":"WhatsApp Business Platform Specific Terms"}'::jsonb,now()
),
(
  'whatsapp_customer_service_window_24h',1,'Janela de atendimento de 24 horas','messaging',
  'Resposta sem Message Template é permitida dentro de 24 horas da última mensagem do usuário; fora dessa janela, somente Message Template aprovado pode ser enviado.',
  '{"free_form_outside_window":false,"window_hours":24}'::jsonb,
  '{"last_user_message_at_required":true,"approved_template_outside_window":true}'::jsonb,
  'https://business.whatsapp.com/policy',null,now(),'active',true,
  '{"source_kind":"official_whatsapp_business_messaging_policy","source_reviewed_on":"2026-09-18","section":"WhatsApp Business Platform Specific Terms"}'::jsonb,now()
),
(
  'whatsapp_automation_human_escalation',1,'Automação exige rota clara para atendimento humano','automation',
  'Automação pode responder na janela de 24 horas, mas deve haver caminhos rápidos, claros e diretos de escalonamento para atendimento humano ou suporte equivalente.',
  '{"automation_without_escalation":false}'::jsonb,
  '{"human_escalation_path_required":true}'::jsonb,
  'https://business.whatsapp.com/policy',null,now(),'active',true,
  '{"source_kind":"official_whatsapp_business_messaging_policy","source_reviewed_on":"2026-09-18","section":"WhatsApp Business Platform Specific Terms"}'::jsonb,now()
),
(
  'whatsapp_data_privacy_sensitive_identifiers',1,'Proteção de dados e identificadores sensíveis','data_protection',
  'O negócio deve obter avisos, permissões e consentimentos necessários, manter política de privacidade aplicável e não solicitar ou compartilhar identificadores financeiros ou pessoais sensíveis completos pelo WhatsApp.',
  '{"full_payment_card_number":false,"full_financial_account_number":false,"full_personal_id_number":false}'::jsonb,
  '{"privacy_notices_and_permissions_required":true,"applicable_law_required":true}'::jsonb,
  'https://business.whatsapp.com/policy',null,now(),'active',true,
  '{"source_kind":"official_whatsapp_business_messaging_policy","source_reviewed_on":"2026-09-18","section":"Protect Data and Comply with Law"}'::jsonb,now()
),
(
  'whatsapp_commerce_policy_required',1,'Comércio deve respeitar Meta Commerce Policy','commerce',
  'Catálogos e experiências de comércio no WhatsApp devem cumprir a Meta Commerce Policy, os termos aplicáveis e a legislação pertinente.',
  '{"prohibited_commerce_items":"block"}'::jsonb,
  '{"commerce_policy_check_required":true,"applicable_law_required":true}'::jsonb,
  'https://business.whatsapp.com/policy',null,now(),'active',true,
  '{"source_kind":"official_whatsapp_business_messaging_policy","source_reviewed_on":"2026-09-18","section":"Policy for WhatsApp Commerce Features"}'::jsonb,now()
),
(
  'whatsapp_regulated_verticals_fail_closed',1,'Verticais reguladas devem falhar fechado','commerce',
  'Produtos e serviços regulados ou restritos exigem verificação específica de país, idade, licenças e regras aplicáveis; na ausência dessa verificação, o sistema deve bloquear promoção e comércio via WhatsApp.',
  '{"unknown_eligibility":"block","age_or_country_unknown":"block"}'::jsonb,
  '{"country_check_required":true,"age_check_when_applicable":true,"license_check_when_applicable":true}'::jsonb,
  'https://business.whatsapp.com/policy',null,now(),'active',true,
  '{"source_kind":"official_whatsapp_business_messaging_policy","source_reviewed_on":"2026-09-18","section":"Prohibited Organizations and Restrictions on Use / Regulated Verticals"}'::jsonb,now()
)
on conflict(policy_key) do update set
  version=excluded.version,
  title=excluded.title,
  capability=excluded.capability,
  rule_text=excluded.rule_text,
  restrictions=excluded.restrictions,
  requirements=excluded.requirements,
  source_url=excluded.source_url,
  effective_at=excluded.effective_at,
  reviewed_at=excluded.reviewed_at,
  status=excluded.status,
  fail_closed=excluded.fail_closed,
  metadata=excluded.metadata,
  updated_at=now();

create or replace function public.meta_policy_registry_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_required text[]:=array[
    'whatsapp_opt_in_required',
    'whatsapp_opt_out_required',
    'whatsapp_business_initiated_template_required',
    'whatsapp_customer_service_window_24h',
    'whatsapp_automation_human_escalation',
    'whatsapp_data_privacy_sensitive_identifiers',
    'whatsapp_commerce_policy_required',
    'whatsapp_regulated_verticals_fail_closed'
  ];
  v_missing text[];
  v_stale integer:=0;
  v_not_fail_closed integer:=0;
  v_without_source integer:=0;
begin
  select coalesce(array_agg(k order by k),'{}'::text[])
    into v_missing
  from unnest(v_required) as k
  where not exists(
    select 1
    from public.meta_policy_registry p
    where p.policy_key=k and p.status='active'
  );

  select count(*)::int into v_stale
  from public.meta_policy_registry p
  where p.policy_key=any(v_required)
    and (p.reviewed_at is null or p.reviewed_at < now()-interval '30 days');

  select count(*)::int into v_not_fail_closed
  from public.meta_policy_registry p
  where p.policy_key=any(v_required)
    and p.fail_closed is not true;

  select count(*)::int into v_without_source
  from public.meta_policy_registry p
  where p.policy_key=any(v_required)
    and nullif(btrim(coalesce(p.source_url,'')),'') is null;

  return jsonb_build_object(
    'version','cm1-meta-policy-registry-v1',
    'ready',cardinality(v_missing)=0 and v_stale=0 and v_not_fail_closed=0 and v_without_source=0,
    'required_count',cardinality(v_required),
    'active_required_count',cardinality(v_required)-cardinality(v_missing),
    'missing_keys',to_jsonb(v_missing),
    'stale_count',v_stale,
    'not_fail_closed_count',v_not_fail_closed,
    'without_source_count',v_without_source,
    'freshness_days',30,
    'external_side_effect',false,
    'external_activation_authorized',false
  );
end
$function$;

revoke all on function public.meta_policy_registry_readiness_v1()
from public,anon,authenticated;
grant execute on function public.meta_policy_registry_readiness_v1()
to service_role;
