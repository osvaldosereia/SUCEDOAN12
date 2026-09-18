# Customer & Marketing OS — Homologação CM-1

Atualizado em 18/09/2026.

Status: **HOMOLOGAÇÃO INTERNA LIBERADA; ATIVAÇÃO EXTERNA NÃO AUTORIZADA**.

## Snapshot automático

Foi criado:

`cm1_homologation_readiness_v1()`

O snapshot é somente leitura e existe para evitar que a homologação dependa de interpretação manual de dezenas de flags.

Ele nunca autoriza ativação externa.

Campo fixo de segurança:

`external_activation_authorized=false`

## Estado observado

Resultado do snapshot após CM-1.15:

- blockers: 0;
- safe_for_internal_homologation: true;
- external_activation_authorized: false;
- channel_accounts WhatsApp outbound: false;
- channel_accounts AI: false;
- channel_accounts auto reply: false;
- canary canonical: 0%;
- Marketing runtime: disabled;
- Marketing execution mode: off;
- Marketing kill switch: ativo;
- Marketing publishing: false;
- publicações/dia: 0;
- orçamento diário de IA no Marketing: 0;
- WhatsApp Direct: disabled;
- release mode Direct: off;
- PapoAI adapter outbound: disabled;
- runtime templates enabled: 0;
- erros Meta abertos: 0;
- conflitos de identidade pendentes: 0;
- efeitos externos de Marketing nos últimos 7 dias: 0;
- efeitos externos de AI Actions nos últimos 7 dias: 0.

## Warnings atuais

### no_positive_marketing_consent

Nenhum cliente possui consentimento canônico positivo para marketing.

Isso não é um erro.

É exatamente o comportamento fail-closed esperado. Por isso as oportunidades continuam suprimidas.

### legacy_automation_outbound_live_but_canonical_gate_closed

A tabela legada `automation_config` ainda registra:

- automation_enabled=true;
- outbound_enabled=true;
- whatsapp_release_mode=live;
- canary legado de 1%.

Entretanto, os gates canônicos atuais estão fechados:

- `channel_accounts.outbound_enabled=false`;
- `channel_accounts.canary_percent=0`;
- Meta Direct não está ready;
- `whatsapp_direct_config.enabled=false`;
- `whatsapp_direct_config.release_mode=off`;
- auto reply legado=false;
- AI legado=false;
- conversation worker=false.

Por isso a inconsistência foi classificada como **warning**, não blocker.

Ela deve ser tratada na limpeza pós-homologação, evitando alterar uma configuração legada antes de confirmar que nenhum fluxo antigo ainda depende dela.

## Teste representativo read-only

Foi selecionado um cliente com histórico real, sem alterar seus dados.

O pipeline retornou:

- timeline events: 22;
- product stats: 41;
- conversations: 4;
- carts: 3;
- dynamic segments: 11;
- profile orders: 7;
- opportunities: 2;
- contact policy decision: suppressed.

Isso confirma que, para um perfil real existente, Customer 360, histórico comercial, Segment Engine, Opportunity Engine e Customer Protection conseguem trabalhar sobre a mesma identidade canônica.

Nenhuma mensagem foi enviada.

## Evidências já acumuladas das rodadas anteriores

### Ingestão/identidade

O smoke do PapoAI Adapter confirmou:

- evento recebido pelo adapter;
- Identity Resolver matched;
- normalized event criado;
- receipt criado;
- provider contact state criado;
- idempotência;
- external_side_effect=false.

A fixture foi removida depois do teste.

### Marketing

- Opportunity Engine detecta oportunidades;
- todas permanecem suprimidas quando proteção não libera;
- Marketing Brain OBSERVE funciona sem IA;
- SUGGEST permanece gateado;
- campanha automática não é criada;
- publicação permanece bloqueada.

### Templates

- versionamento v1→v2 já validado em fixture;
- template continua DRAFT;
- enabled=false;
- meta_status=not_submitted;
- nenhum submit Meta ocorreu.

## Gates manuais ainda pendentes

O snapshot mantém explicitamente como pending:

- customer_os_pin_browser_validation;
- relationship_center_pin_browser_validation;
- meta_policy_registry_verification;
- meta_direct_homologation.

A liberação global do Customer OS e da Central de Relacionamento não deve ocorrer antes do teste manual de PIN no navegador pelo responsável.

## Próxima rodada de homologação

1. manter CI verde;
2. validar visualmente a Central no canary;
3. testar login com PIN pelo responsável;
4. revisar warnings da configuração legada;
5. fazer checklist funcional da jornada do cliente;
6. manter Meta Direct e publishing desligados;
7. somente depois decidir sobre limpeza legada e qualquer canary externo.

## Segurança

A homologação atual permite apenas teste interno.

Ela não:

- autoriza campanha;
- autoriza marketing;
- ativa Meta Direct;
- habilita templates;
- aumenta orçamento de IA;
- abre outbound do adapter;
- muda consentimento.
