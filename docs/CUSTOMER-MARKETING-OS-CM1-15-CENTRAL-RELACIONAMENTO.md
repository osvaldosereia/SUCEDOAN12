# Customer & Marketing OS — CM-1.15 Central de Relacionamento

Atualizado em 18/09/2026.

Status: **V1 IMPLEMENTADA — BACKEND ATIVO; INTERFACE EM CANARY; LIBERAÇÃO GLOBAL AINDA FECHADA**.

## Objetivo

Consolidar em uma única superfície operacional os principais read models construídos nas rodadas CM-1.1 a CM-1.14.

A Central não cria um novo CRM paralelo. Ela lê o Customer OS e o Marketing OS já existentes.

## Arquitetura

A tentativa inicial de criar um novo Edge Function dedicado atingiu o limite de funções do plano atual do Supabase.

Decisão arquitetural:

- não aumentar o plano apenas por conveniência;
- não duplicar infraestrutura;
- reutilizar o Edge seguro `customer-intelligence-v1`;
- adicionar somente as actions `relationship_overview` e `relationship_audit`.

Isso reduz custo e mantém o boundary de autenticação já testado.

## Read models

A migration CM-1.15 criou:

### relationship_brand_summary_v1

Agrega por marca:

- quantidade de produtos;
- produtos marketing-ready;
- bloqueados;
- ofertas prontas;
- estoque;
- compras conhecidas;
- readiness médio.

### relationship_quality_summary_v1

Consolida qualidade:

- clientes;
- completude;
- qualidade cadastral;
- histórico de compras;
- conflitos de identidade;
- consentimento;
- supressões;
- produtos bloqueados;
- imagens/custos/estoque ausentes;
- erros Meta;
- erros do provider adapter.

### relationship_command_summary_v1

Une:

- Customer Commercial Profile;
- Segment Engine;
- Opportunity Engine;
- Product Marketing Profile;
- Product/Brand Graph;
- Marketing Brain;
- Template Draft Assistant;
- Meta Foundation;
- PapoAI Adapter;
- marcas;
- qualidade dos dados.

Todos os read models retornam `external_side_effect=false`.

## Backend seguro

`customer-intelligence-v1` recebeu:

- `relationship_overview`;
- `relationship_audit`.

O endpoint já exige:

- JWT válido;
- usuário cadastrado em `admin_users`;
- admin ativo.

Nenhum endpoint público foi criado para a Central.

## Interface

Nova página:

`admin/relacionamento.html`

Áreas:

1. Visão Geral;
2. Clientes;
3. Segmentos;
4. Oportunidades;
5. Produtos;
6. Marcas;
7. Marketing Brain;
8. Templates;
9. Meta Foundation;
10. Qualidade dos Dados;
11. Auditoria.

A interface é responsiva, com mais área de respiro e navegação própria.

## Estado atual da base no smoke test

Snapshot observado durante CM-1.15:

- clientes: 505;
- clientes com histórico de compra: 31;
- recorrentes: 6;
- perfis com 75%+ de completude: 179;
- oportunidades ativas: 75;
- oportunidades liberadas para marketing: 0;
- oportunidades suprimidas pelos guardrails: 75;
- produtos totais: 1.814;
- produtos marketing-ready: 671;
- produtos bloqueados: 1.143;
- readiness médio: aproximadamente 87,5%;
- marcas distintas no read model: 376;
- templates locais: 3;
- templates ready-for-submit: 0;
- consentimentos positivos de marketing: 0;
- Meta Direct: ainda não pronto;
- outbound Meta: desligado;
- PapoAI adapter: temporary_active;
- outbound do PapoAI adapter: disabled.

O fato de marketing permitido estar em zero é esperado enquanto não houver consentimento canônico positivo. A Central não enfraquece essa regra.

## Auditoria

A aba Auditoria reúne em ordem temporal:

- `ai_action_executions`;
- `marketing_events`;
- `channel_provider_event_receipts`;
- `meta_control_plane_errors`.

Ela é somente leitura.

## Canary e segurança

`relationshipUiEnabled=false`.

A interface global permanece escondida.

Existe um canary manual:

- `relationshipCanaryEnabled=true`;
- parâmetro: `relationship_os`;
- valor: `canary`.

A página continua exigindo PIN e uma sessão Supabase Auth válida.

A liberação global somente deve ocorrer após validação manual do PIN no navegador pelo responsável. O PIN não deve ser descoberto ou testado automaticamente.

## Custo

IA da CM-1.15: **zero**.

A Central agrega dados existentes usando SQL e código determinístico.

Também foi evitado custo adicional de infraestrutura ao reutilizar `customer-intelligence-v1` devido ao limite atual de Edge Functions.

## Critério de saída da rodada

Concluído estruturalmente:

- read models consolidados;
- backend seguro;
- interface completa;
- navegação canary;
- auditoria;
- zero side effect;
- sem IA;
- sem envio Meta;
- sem campanha automática.

Pendente para liberação global:

- teste manual do login PIN no navegador;
- inspeção visual canary;
- homologação ponta a ponta CM-1.

## Próxima etapa

**Homologação CM-1.**

Executar o checklist completo da definição de “CM-1 pronta”, preservando todos os gates de consentimento, custo e ações externas.
