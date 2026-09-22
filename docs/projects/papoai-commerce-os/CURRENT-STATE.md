# PapoAI Commerce OS — Current State

Atualizado: 2026-09-21 (America/Cuiaba)

## Checkpoint canônico

Repositório: `osvaldosereia/SUCEDOAN12`

Branch obrigatória: `papoai-commerce-os-r0a-spec-20260921`

HEAD confirmado no início desta retomada:
`0db4c6977d7331bd04080330ea4efeecdf087eb8`

O estado deste documento substitui os checkpoints antigos que terminavam na Edge v17.

## Runtime real

- Supabase: `ssbesxgaijknwsjbsbcz`
- Edge Function `papo-external-agent-v1`: **v28**
- status da Edge: **ACTIVE**
- `verify_jwt=false`: mantido porque o endpoint usa autenticação própria do PapoAI por API key e response bearer
- PapoAI Adapter: presente, `temporary_active`
- inbound do adapter: `active`
- outbound do adapter: `disabled`

A v28 é um hotfix sobre a v27: foi definido o helper `replacementOptionText(...)`, que era chamado no fluxo de substituição delegada mas não existia. Isso eliminou um erro de runtime possível nesse caminho sem alterar regra comercial, preço ou gate.

## Gates — continuam desligados

Estado confirmado diretamente no banco:

- Commerce Brain `enabled=false`
- `write_enabled=false`
- `ai_enabled=false`
- Conversation Governor `conversation_governor_enabled=false`
- Bling queue `bling_queue_enabled=false`
- learning enqueue `learning_enqueue_enabled=false`
- Agent learning write: OFF
- laboratório PapoAI: OFF

`canonical_message_persistence_enabled=true` continua instalado, mas a persistência canônica comercial só entra no caminho ativo quando o Commerce Brain estiver habilitado.

Nenhum gate foi ativado nesta retomada.

## Readiness formal

Consulta canônica:

`select public.get_papoai_commerce_activation_readiness_v1();`

Estado confirmado:

- `data_ready=true`
- `safety_ready=true`
- `transport_ready=true`
- `ready_for_external_homologation_test=true`
- `ready_for_production=false`

Catálogo:

- 9 cestas ativas
- 0 cestas vazias
- 306 produtos vendáveis
- 306/306 com imagem
- 0 divergências de `hidden_adjustment`

Capacidades de transporte:

- request: `verified_lab`
- session: `verified_lab`
- text reply: `verified_lab`
- media reply: `observed_ui`

Warning ainda aberto:

- `media_reply_observed_in_ui_but_not_physically_verified`

Bloqueios externos obrigatórios:

- `external_customer_e2e_test_pending`
- `rotate_exposed_homologation_api_key`
- `confirm_current_papoai_channel_agent_link`
- `production_activation_not_authorized`

Esses bloqueios NÃO devem ser contornados por código.

## Capacidades comerciais já programadas

### Transporte, segurança e precedência humana

- PapoAI Agente Externo → Supabase
- proteção contra loop entre números internos
- idempotência de turn/evento
- persistência canônica de mensagens
- learning atrás de double gate
- precedência humana canônica
- IA silenciosa quando há sinal humano/handoff
- safe AI mode claim
- activation readiness formal

### Atendimento e Governador

- decisões explícitas: `RESPOND / ASK / RECOMMEND / ACT`
- no máximo 2 perguntas segmentadoras por assunto
- pergunta somente quando o conjunto realmente exige qualificação
- `você decide` tratado como delegação
- após o limite de perguntas, prefere recomendar/agir em vez de continuar interrogando
- histórico limitado
- fallback determinístico quando IA está desligada

### Cestas, produtos e carrinho

- lista completa da cesta em uma única mensagem
- personalização de cesta
- `hidden_adjustment` protegido
- carrinho avulso
- busca de produtos
- ranking comercial
- seleção numerada de produtos, até 10 opções
- imagens disponíveis para produto específico quando útil
- repetição da última compra com condições atuais e sem repetir trocas históricas automaticamente

### Substituições

- substituição explícita com confirmação
- substituição delegada por valor
- motor único de substituição delegada
- ranking por utilidade + proximidade de valor
- preferência por mesma família/categoria e itens já presentes quando seguro
- no máximo 3 opções
- no máximo 2 produtos distintos na combinação
- diferença máxima configurada de 15%
- Supabase é autoridade de cálculo
- confirmação obrigatória antes de aplicar
- proteção contra carrinho alterado/stale

Exemplo já validado:
retirar arroz de R$ 21,90 → +2 óleos +1 feijão → diferença R$ 0,17.

### Cliente, histórico e ofertas

- customer context v3
- preferências declaradas e inferidas
- inferência somente com evidência/confiança mínimas
- histórico e produtos frequentes
- ofertas explícitas
- oferta proativa somente com sinal forte
- no máximo 1 oferta proativa por carrinho
- cooldown de 7 dias após rejeição
- rastreamento de aceitação/rejeição

### Checkout e pedido

- checkout profile pendente
- coleta de nome/endereço em uma mensagem
- no máximo 2 perguntas para completar checkout
- cliente novo só é promovido/persistido definitivamente na confirmação final
- `customer_id` propagado para conversa, carrinho e pedido
- confirmação final em duas etapas/snapshot
- revalidação quando carrinho muda

### Bling

Migration instalada:
`papoai_bling_identity_guard_v1`

Função:
`get_papoai_commerce_bling_identity_readiness_v1(order_id)`

Política:

- se já existe `bling_contact_id`, a identidade pode ser reutilizada;
- sem `bling_contact_id`, precisa existir CPF/CNPJ resolvível;
- telefone sozinho NÃO é identidade suficiente para Bling;
- snapshot do pedido deve ser atualizado antes do queue;
- fila Bling permanece atrás de gate explícito.

## CI — estado desta retomada

Foram adicionados ao `.github/workflows/test-admin-v3.yml`:

- `scripts/test-papoai-activation-readiness-v1.mjs`
- `scripts/test-papoai-bling-identity-guard-v1.mjs`
- `scripts/test-papoai-delegated-replacement-render-v1.mjs`

Também foram adicionados gatilhos amplos e futuros para:

- `supabase/migrations/*papoai*.sql`
- `scripts/*papoai*.mjs`

Isso corrige a assimetria encontrada entre `push` e `pull_request`: o bloco de PR observava apenas parte dos arquivos PapoAI recentes.

Os contratos de activation readiness e Bling identity guard foram verificados diretamente contra as migrations e passaram.

GitHub Actions não executou automaticamente nesta branch porque:

- `push` do workflow está restrito a `main`;
- não existe PR aberto para esta branch.

Não considerar isso como CI verde; considerar apenas **contratos verificados localmente pela inspeção de fonte/banco** até existir um run real.

## Migrations recentes confirmadas como já aplicadas

Não reaplicar:

- `papoai_canonical_message_persistence_v1`
- `fix_papoai_learning_enqueue_truth_v1`
- `papoai_human_precedence_v1`
- `fix_papoai_handoff_priority_type_v1`
- `papoai_safe_ai_mode_claim_v1`
- `papoai_activation_readiness_v1`
- `papoai_bling_identity_guard_v1`

Além delas, toda a sequência PapoAI anterior de carrinho, Governador, substituição, contexto do cliente, ofertas e checkout também está registrada na migration history do projeto.

## Commits desta retomada

- `ce8720e2b38d7a9109eb8e5604418a1d2325f3c7`
  CI: activation readiness + Bling identity guard
- `cbef6ce8ba9647a302c4f8bf35eb6a98e7f9914a`
  CI: gatilhos amplos para migrations/testes PapoAI
- `2b4095d87989a921529a1471a4bf00835a634c80`
  fix: renderer da substituição delegada
- `d7d8e0942854d56a490f251f3521b822d816963e`
  teste de regressão do renderer
- `bdb01bf5bb3ff6f79f2a493c52248ff823d5062b`
  CI: executa regressão do renderer

## Regras arquiteturais obrigatórias

1. simplicidade para o cliente;
2. atendimento humano, curto e contextual;
3. responder diretamente quando já houver informação suficiente;
4. no máximo 2 perguntas segmentadoras quando realmente necessárias;
5. Supabase é a fonte de verdade;
6. IA interpreta/conversa, mas não calcula preço, total, estoque ou regra comercial;
7. cálculos e regras comerciais são determinísticos;
8. segurança, idempotência e precedência humana são obrigatórias;
9. baixo custo;
10. não duplicar infraestrutura existente;
11. não ativar produção automaticamente;
12. não ativar Bling automaticamente;
13. não ativar Commerce Brain automaticamente;
14. não reduzir ou remover os bloqueios externos do readiness.

## Próximo limite externo

A base de código pode continuar recebendo hardening, testes e observabilidade sem ativação.

A homologação real exige ação externa para resolver os quatro blockers do readiness. Produção continua proibida até autorização explícita posterior.
