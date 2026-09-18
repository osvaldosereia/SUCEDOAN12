# Customer & Marketing OS — CM-1.11 Marketing Brain OBSERVE/SUGGEST

Atualizado em 18/09/2026.

Status: **V1 PROGRAMADA — OBSERVE DISPONÍVEL; SUGGEST IMPLEMENTADO MAS COM IA BLOQUEADA**.

## Posição no roadmap

CM-1.11 vem depois do Opportunity Engine CM-1.10.

A sequência oficial continua sendo respeitada:

`Customer data → Product intelligence → Segment Engine → Commercial Profile → Opportunity Engine → Marketing Brain`.

As melhorias visuais do Customer 360 permanecem trabalho de homologação da CM-1.3 e não substituem nenhuma rodada do núcleo.

## Objetivo

O Marketing Brain não recebe uma base inteira e não escolhe clientes do zero.

Ele recebe uma oportunidade CM-1.10 já calculada e transforma essa oportunidade em um brief publicitário estruturado.

Saída obrigatória:

- objective;
- audience;
- insight;
- product;
- proposal;
- angle;
- offer;
- format;
- CTA;
- risks;
- reason;
- confidence.

## Dois modos

### OBSERVE

- ativo;
- determinístico;
- zero IA;
- zero custo de modelo;
- pode analisar oportunidade suppressed;
- registra o brief e a auditoria;
- não cria campanha;
- não cria template;
- não envia mensagem;
- não publica.

### SUGGEST

O caminho técnico foi programado, mas o gate permanece fechado.

Para rodar no futuro precisa simultaneamente:

- oportunidade com status suggested;
- sem exclusions;
- `opportunity_suggest_enabled=true`;
- `strategy_ai_enabled=true`;
- chamadas diárias > 0;
- orçamento diário de IA > 0;
- modelo configurado;
- credencial válida.

No estado atual esses gates permanecem fechados.

## Reuso da arquitetura

Não foi criado um segundo sistema de permissões.

CM-1.11 reutiliza:

- `ai_action_registry`;
- `ai_action_executions`;
- `marketing_runtime_config`;
- `marketing_events`;
- `admin-marketing-brain-v1`;
- Customer Protection;
- Opportunity Engine.

Ações registradas:

### marketing_opportunity_observe_v1

- enabled: true;
- execution_mode: observe;
- cost_class: none;
- external side effect: false.

### marketing_strategy_suggest_v1

- enabled: false;
- execution_mode: off;
- cost_class: low;
- external side effect: false.

## marketing_strategy_briefs

Nova entidade governada que registra o resultado do Brain.

Campos principais:

- opportunity_id;
- customer_id;
- strategy_key;
- mode;
- status;
- brief;
- context;
- ai_used;
- model task/model;
- reasoning effort;
- provider response id;
- usage;
- custos estimado/real;
- confidence;
- engine version;
- auditoria;
- external_side_effect=false.

## Contexto de IA sem PII

`get_marketing_opportunity_context_v1` monta o contexto para Brain sem:

- nome;
- telefone;
- CPF/CNPJ;
- endereço.

O contexto contém apenas fatos comerciais necessários:

- oportunidade;
- produtos candidatos;
- frequência;
- ticket/LTV;
- tempo desde compra;
- engajamento;
- pressão de marketing;
- segmentos;
- Customer Protection.

A interface administrativa pode mostrar o nome do cliente, mas esse nome não faz parte do contexto enviado ao modelo.

## Produtos

O Brain não pode inventar ou ampliar produtos.

Antes de OBSERVE/SUGGEST:

1. lê os product_candidates da oportunidade;
2. verifica novamente Product Marketing Readiness;
3. descarta produto que deixou de ser marketing-eligible;
4. no SUGGEST valida a saída e mantém somente IDs presentes no contexto.

## Guardrails antes do custo

SUGGEST recusa a chamada de IA antes de consultar o modelo quando:

- oportunidade está suppressed;
- existe exclusion;
- gate de IA está fechado;
- orçamento está fechado;
- limite diário foi atingido.

Isso evita gastar IA em cliente que não pode receber marketing.

## Custo

Nesta implantação:

- OBSERVE custa zero de IA;
- SUGGEST tem limite diário configurado em zero;
- orçamento diário de IA continua zero;
- nenhuma chamada paga foi executada para CM-1.11.

Quando SUGGEST for homologado, usage/model/custo poderão ser gravados no brief e na auditoria. A escolha de modelo continua configurável e será ativada somente com política de custo aprovada.

## Central de Marketing

A aba Campanhas ganhou **Oportunidades de clientes**.

Ela mostra:

- oportunidade;
- cliente no Admin;
- confiança;
- produtos candidatos;
- guardrails;
- botão Gerar brief OBSERVE;
- botão SUGGEST com IA.

SUGGEST fica desabilitado enquanto o gate estiver fechado ou a oportunidade estiver bloqueada.

O brief OBSERVE mostra objetivo, público, insight, ângulo, proposta, oferta, formato e CTA futuro.

## Segurança

Nenhuma rota CM-1.11:

- cria campanha automaticamente;
- envia WhatsApp;
- submete template;
- publica conteúdo;
- altera consentimento;
- libera suppression.

Todos os resultados usam `external_side_effect=false`.

## Próximo passo oficial

CM-1.12 — Meta Foundation.

Antes de avançar para LIVE, a fundação Meta deve modelar:

- Business Portfolio;
- WABA;
- phone number;
- tokens/permissions;
- webhooks;
- health;
- quality;
- templates;
- capabilities;
- status operacional.

A integração deve começar em modo de leitura/health e manter ações externas fail-closed.
