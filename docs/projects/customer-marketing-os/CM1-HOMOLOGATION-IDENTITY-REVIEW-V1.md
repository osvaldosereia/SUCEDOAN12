# Homologação CM-1 — Revisão Humana de Identidade V1

Atualizado em 18/09/2026.

## Objetivo

Fechar a lacuna operacional entre a detecção de conflitos do Identity Resolver e a decisão humana segura na Central de Relacionamento.

## Situação encontrada

O backend já possuía:

- `identity_conflicts`;
- `identity_review`;
- validação de candidato pertencente à avaliação;
- gravação de `reviewed_at`, `reviewed_by` e `review_notes`;
- comportamento `review_only_no_merge`.

A Central de Relacionamento mostrava apenas contagens de pendências e não oferecia a fila detalhada nem controles de revisão.

## Implementação desta rodada

### Central de Relacionamento

Na área **Qualidade dos Dados** agora existe uma fila de conflitos com:

- data/origem/método do conflito;
- evidências compactas;
- cadastros candidatos;
- telefone e CPF/CNPJ mascarados;
- pedidos, LTV e última compra como contexto;
- escolha explícita de um candidato;
- opção “Nenhum candidato é seguro”;
- justificativa obrigatória;
- confirmação antes da gravação;
- aviso explícito de que não há merge de cadastros.

### API do Admin

`admin/relationship-api.js` passou a expor:

- `getIdentityConflicts()`;
- `reviewIdentityConflict()`.

### Backend

`customer-intelligence-v1` foi endurecida:

- somente avaliações com `decision='conflict'` podem usar o fluxo;
- avaliação precisa continuar `pending`;
- justificativa mínima obrigatória;
- candidato escolhido precisa estar na lista original;
- retorno declara `external_side_effect=false`;
- continua `review_only_no_merge`.

Edge Function implantada nesta rodada: **version 19**.

## Caso real pendente

Existe 1 conflito real:

- método: `conflicting_strong_signals`;
- 2 candidatos;
- sinal de canal/telefone conflitante;
- sem documento fornecido;
- sem Bling ID fornecido;
- canal não verificado.

Por segurança, a automação **não escolheu** um cadastro.

O responsável deve revisar manualmente pela Central.

## Instrumentação de catálogo

Foi confirmado no runtime implantado de `shopping-chat-products-v1`:

- action `track`;
- `catalog_search`;
- `product_view`;
- `record_catalog_interaction_v1`;
- `external_side_effect=false`.

Mesmo assim, os contadores reais continuam em zero.

Conclusão: não há evidência de falha do backend; os critérios 6 e 7 aguardam tráfego real do Comprar após o deploy.

Não criar fixture persistente para promovê-los.

## Opportunity lifecycle

As 75 oportunidades atuais estão `suppressed`.

Em 18/09/2026:

- oportunidades já vencidas: 0;
- primeira expiração real prevista: 23/09/2026.

Logo o critério 13 permanece `implemented` até existir evidência real de expiração/remoção.

## Estado após a rodada

- verified: 14;
- implemented: 6;
- blocked: 0;
- external side effects: 0;
- `external_activation_authorized=false`;
- Meta Direct OFF;
- canonical outbound OFF;
- Marketing publishing OFF;
- strategy AI OFF.

Esta rodada não abriu nenhum gate externo.
