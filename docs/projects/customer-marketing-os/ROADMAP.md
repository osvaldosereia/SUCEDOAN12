# ROADMAP — Customer & Marketing OS

## Convenção

Este roadmap é exclusivo do Customer & Marketing OS.

Não confundir CM-1 com a Etapa 1 do roadmap geral Dona Antônia.

## CM-0 — Architecture Lock
**Concluída.**

Contratos centrais, convenções, fronteiras e modelo de evolução definidos.

## CM-1 — Fundação operacional
**Implementação concluída; homologação em andamento.**

- CM-1.1 Segurança e fundação — concluída
- CM-1.2 Identity Resolver — concluída
- CM-1.3 Customer 360 — backend concluído; UI em canary
- CM-1.4 Event Collector — concluída V1
- CM-1.5 Consent / Customer Protection — concluída V1
- CM-1.6 Product Marketing Profile — concluída V1
- CM-1.7 Product/Brand Graph — concluída V2
- CM-1.8 Segment Engine — concluída V1
- CM-1.9 Customer Commercial Profile — concluída V1
- CM-1.10 Opportunity Engine — concluída V1 + precision pass
- CM-1.11 Marketing Brain — concluída V1; SUGGEST fechado
- CM-1.12 Meta Foundation — concluída V1; read-only/fail-closed
- CM-1.13 Template Draft Assistant — concluída V1; draft/manual
- CM-1.14 PapoAI Adapter — concluída V1; outbound desligado
- CM-1.15 Central de Relacionamento — concluída V1; canary

## Homologação CM-1
**Em andamento.**

Estado atual:

- 14 verified;
- 6 implemented;
- 0 blocked;
- internal canary permitido;
- external activation não autorizada.

### Saídas restantes

- resolver/revisar conflito de identidade;
- observar eventos reais de busca;
- observar eventos reais de produto;
- validar lifecycle sem evidência artificial;
- homologar SUGGEST sem abrir automação externa indevida;
- obter amostra governada de custo de IA somente quando houver motivo real;
- validar PIN e interface no navegador;
- verificar Meta Policy Registry;
- homologar Meta Direct em modo seguro;
- reexecutar checklist.

### Avanço técnico — Meta Policy / Preflight

Concluído sem ativação externa:

- Policy Registry operacional: 8/8 regras ativas, fail-closed e com fonte;
- função de readiness do Policy Registry;
- hardening para remover fallback de Graph API;
- Meta Direct Edge v2;
- Admin Meta Direct v4;
- WABA e Phone Number ID observados.

Ainda pendente por evidência/gate:

- aceitação humana do Policy Registry;
- Graph API version verificada;
- permissões reais verificadas;
- webhook homologado;
- `direct_ready_flag=true` somente após os pré-requisitos;
- autorização externa separada.

## Encerramento CM-1

Somente declarar CM-1 concluída quando:

- `blocked_count=0`;
- todos os critérios tiverem evidência suficiente ou gate explicitamente aprovado;
- gates manuais obrigatórios estiverem validados;
- UI segura estiver homologada;
- nenhuma ativação externa tiver sido causada automaticamente;
- documentação desta pasta estiver atualizada.

## Depois da CM-1

A fase seguinte **não deve ser inventada automaticamente**.

Antes de CM-2 ou equivalente:

1. registrar decisão de escopo;
2. definir objetivos e acceptance criteria;
3. separar claramente o que é Customer OS e o que é Marketing Studio/publicação;
4. definir custos e política de IA;
5. definir plano de rollout;
6. criar novos gates antes de qualquer external activation.

A autorização para concluir homologação interna não equivale a autorização para ativação externa.
