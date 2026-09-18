# Customer & Marketing OS — CM-1 Acceptance Checklist

Atualizado em 18/09/2026.

Status: **20 critérios modelados · 14 verificados · 6 implementados aguardando evidência/gate · 0 bloqueados · ativação externa NÃO autorizada**.

## Objetivo

Transformar a definição oficial de “CM-1 pronta” em um checklist executável e auditável, evitando que a conclusão dependa de memória ou interpretação manual.

A função canônica é:

`cm1_acceptance_checklist_v1()`

Ela é somente leitura, service-role only e nunca autoriza envio, campanha ou ativação externa.

## Estados

- **verified**: há evidência real observada no runtime/banco;
- **implemented**: capacidade implementada e coberta por contrato/smoke, porém ainda sem evidência real suficiente ou com gate propositalmente fechado;
- **blocked**: falta implementação ou existe condição impeditiva.

O checklist também mantém:

- `ready_for_manual_canary`;
- `cm1_complete=false`;
- `external_activation_authorized=false`.

## Snapshot atual

Resultado após implantação:

- critérios totais: 20;
- verified: 14;
- implemented: 6;
- blocked: 0;
- ready_for_manual_canary: true;
- CM-1 completa: false;
- ativação externa autorizada: false.

## Critérios verificados

1. cliente entra em contato;
3. Customer 360 atualiza;
4. conversa vira evento;
5. catálogo vira evento;
8. carrinho vira evento;
9. pedido vira evento;
10. perfil comercial recalcula;
11. afinidades atualizam;
12. segmento muda dinamicamente;
14. consentimento é respeitado;
16. tudo fica auditado;
17. nenhuma ação externa indevida é executada;
19. tarefas determinísticas não usam IA sem necessidade;
20. arquitetura permanece pronta para conexão direta Meta.

## Critérios implementados aguardando evidência/gate

### 2 — Sistema resolve identidade

O Provider Adapter já vinculou clientes e identidades reais, porém existe **1 conflito de identidade pendente de revisão**.

A arquitetura não faz merge silencioso. Enquanto existir conflito real pendente, o critério não é promovido para verified.

### 6 — Busca vira evento

`record_catalog_interaction_v1` está implantado e o Comprar envia `catalog_search`.

Smoke determinístico comprovou:

- primeira chamada cria um evento;
- repetição dentro da janela vira duplicate;
- nenhum side effect externo.

A fixture foi removida após o teste. O status permanecerá implemented até tráfego real pós-deploy produzir `catalog_search`.

### 7 — Produto visualizado vira evento

O detalhe do produto no Comprar agora envia `product_view`.

O mesmo smoke confirmou gravação e deduplicação. O status passa automaticamente para verified quando houver uso real pós-deploy.

### 13 — Oportunidade é criada/removida

O Opportunity Engine possui oportunidades reais e lifecycle implementado. A criação já está observada.

A remoção/expiração é coberta por engine e testes, mas não mantemos fixture artificial persistente somente para aumentar o contador de homologação.

### 15 — Marketing Brain consegue sugerir estratégia

A capacidade está pronta, porém SUGGEST permanece intencionalmente fechado durante a homologação:

- strategy AI disabled;
- daily calls = 0;
- orçamento de IA = 0;
- nenhum brief artificial é criado apenas para satisfazer o checklist.

### 18 — Custo de IA é medido

O ledger `ai_action_executions` possui:

- `estimated_cost_brl`;
- `actual_cost_brl`.

Ainda não houve execução de IA governada nesta etapa, portanto há capacidade de medição, mas não uma amostra real de custo.

## Instrumentação nova do Comprar

Foi adicionada instrumentação canônica para:

- `catalog_search`;
- `product_view`.

Frontend:

`comprar/products.js`

Backend:

`shopping-chat-products-v1`

Collector:

`record_catalog_interaction_v1`

Características:

- server-side;
- sessão opaca obrigatória;
- dedupe;
- sem IA;
- sem publicação;
- sem envio externo.

## Central de Relacionamento

A aba **Homologação CM-1** agora mostra:

- 20 critérios;
- status individual;
- evidências compactas;
- número de verificados;
- número de implementados;
- bloqueios;
- gates manuais.

A interface continua em canary e continua exigindo sessão segura.

## Gates manuais

Continuam pendentes:

- validação do PIN do Customer OS no navegador;
- validação do PIN da Central de Relacionamento;
- verificação do Meta Policy Registry;
- homologação do Meta Direct;
- autorização explícita para ativação externa.

Nenhum desses gates é alterado pelo acceptance checklist.

## CI

Foram adicionados:

- `scripts/test-cm-1-acceptance-checklist.mjs`;
- `scripts/test-cm-1-catalog-interactions.mjs`.

Também foi atualizado o teste legado PapoAI → Comprar para refletir a arquitetura Provider Adapter CM-1.14, removendo a expectativa antiga de `lookup_customer_by_phone` dentro do webhook do PapoAI.

O workflow legado de vendas conversacionais também foi ajustado para os arquivos atuais do Admin/Customer OS.

## Regra de conclusão

CM-1 somente pode ser declarada concluída quando:

1. nenhum critério estiver blocked;
2. os critérios implemented restantes tiverem evidência suficiente ou justificativa de gate aprovada;
3. os gates manuais obrigatórios forem validados pelo responsável;
4. a UI segura for homologada no navegador;
5. nenhuma ativação externa ocorrer por consequência automática da homologação.
