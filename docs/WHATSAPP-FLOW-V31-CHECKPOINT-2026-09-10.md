# WhatsApp Flow Dona Antônia — checkpoint V31 / V22

Data: 2026-09-10
Branch: `flow-v29-fast-owner-test`

## Estado atual

Candidato oficial de homologação: `flow-cestas-comercial-v8-stable`.

- Flow JSON: `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json`
- Flow JSON version: `7.3`
- Data API version: `3.0`
- Handler determinístico: `handle_whatsapp_flow_commercial_exchange_v22`
- Edge Function: `whatsapp-flow-data-exchange-v1`, versão implantada 41
- Meta Flow DRAFT: `2579927222524475`
- Meta validation: PASS, `validation_errors=[]`
- Estado Meta: DRAFT; NÃO publicado
- Exposição a clientes: desabilitada

## Fluxo validado no backend

1. INIT retorna 9 cestas reais.
2. Seleção de cesta abre personalização com composição real e preço comercial da cesta; preços individuais dos componentes permanecem ocultos.
3. Personalização pode ser concluída sem alteração ou editar item/quantidade.
4. Adicionais usam seções macro e termos dinâmicos; nunca carregam o catálogo inteiro.
5. Exemplo validado: Mercearia -> Arroz retornou apenas 6 produtos reais com preços reais.
6. Busca direta continua disponível quando a intenção já está clara.
7. Seleção de produto abre detalhe com preço, imagem única opcional e quantidade.
8. Quantidade total por adicional é limitada por `min(6, estoque_atual)`, com validação no servidor.
9. O V21 impede que seleções repetidas do mesmo produto ultrapassem o limite acumulado.
10. O V22 também aplica esse limite na interface: a tela oferece somente o saldo restante e remove das novas listas produtos que já atingiram o máximo permitido para o carrinho.
11. Produtos extras são acumulados em `flow_pending_addons` entre rodadas.
12. Upsell/cross-sell retorna até 6 sugestões reais e opcionais; seguir sem adicionar é permitido.
13. Revisão usa total determinístico: preço comercial da cesta + produtos extras/upsell. Nunca soma ou revela preços individuais dos componentes da cesta.
14. Cliente existente e endereço são reaproveitados sem pedir novamente.
15. Formas de pagamento: PIX, dinheiro, cartão crédito/débito e alimentação/refeição, conforme regras vigentes.
16. Com escrita comercial desligada, checkout termina em homologação sem criar pedido.
17. `nfm_reply` reconhece a V8 estável; quando existe pedido confirmado, retorna ao chat com `location_required=true` e pede localização pelo WhatsApp.
18. Make inbound encaminha `interactive_type=nfm_reply` ao ingest do Supabase.
19. Make outbound possui rota específica para `interactive.type=flow`.

## Hardening de homologação

Foi detectada divergência crítica em rodada anterior: `experience_orchestrator_enabled`, `whatsapp_flow_data_exchange_enabled` e `whatsapp_flow_send_enabled` estavam `true`, contrariando a regra explícita do projeto. Os três foram imediatamente restaurados para `false`; canary permaneceu em 1%, escrita comercial permaneceu desligada e Bling permaneceu desligado.

A causa estrutural era o guard legado `guard_whatsapp_flow_rollout_v1()`: ele aceitava autorizações antigas existentes nas definições V1–V3, permitindo que os gates globais fossem religados mesmo enquanto a V8 ainda estava em homologação.

Foram implantadas três defesas independentes:

1. **Edge v41:** toda chamada não-ping de `flow-cestas-comercial-v8-stable` exige `ownerHomologationAllowed(...)`, independentemente do gate global de Data Exchange. Fora da sessão autorizada a resposta é `flow_candidate_homologation_only`.
2. **Make outbound:** a rota `interactive.type=flow` do cenário `Dona Antônia - WhatsApp Outbound Event-Driven v3` exige o número de homologação autorizado. As demais rotas do atendimento não foram alteradas.
3. **Lock no banco:** `guard_whatsapp_flow_rollout_v1()` foi endurecido. Enquanto `flow-cestas-comercial-v8-stable` estiver com `candidate_not_live=true` e `customer_exposure=false`, o banco recusa qualquer tentativa de elevar canary acima de 1% ou ligar orquestrador, Data Exchange, envio de Flow ou escrita comercial. A tentativa retorna `whatsapp_flow_v31_homologation_locked`, independentemente das autorizações legadas V1–V3.

Teste do lock: uma tentativa transacional de definir `whatsapp_flow_send_enabled=true` foi bloqueada; após o teste os seis gates continuaram nos valores obrigatórios.

Migration persistida: `supabase/migrations/20260910053000_whatsapp_flow_v31_homologation_rollout_lock.sql`.

A definição no Supabase registra `candidate_edge_owner_guard=true`, `outbound_flow_recipient_allowlist_enforced=true`, `edge_version=41` e `implementation_stage=v31_v22_homologation_isolation_hardened`.

## Contrato comercial automatizado no CI

Foi criado `scripts/validate-flow-v31-commercial-contract.py` e integrado ao workflow `.github/workflows/validate-flow-v31-stable.yml`.

O validador bloqueia regressões antes da Meta e confere:

- versões `7.3` / Data API `3.0` e chaves raiz permitidas;
- IDs de tela únicos e integridade completa do `routing_model`;
- cesta visual com imagem e seleção via Data Exchange;
- personalização sem campos/textos de preço individual dos componentes;
- três rodadas de `SECOES -> TERMOS -> PRODUTOS -> PRODUTO`;
- seções macro e busca direta (`section_keys` + `direct_query`);
- termos como buscas dinâmicas (`term_selected_v2`);
- listas de produtos sem `NavigationList`, `Image` ou `media-size` na candidata estável;
- dados de produtos dinâmicos e escolha de quantidade no detalhe;
- upsell/cross-sell explicitamente opcional;
- revisão encaminhando cliente existente/novo e ambos chegando a `FINALIZAR`;
- `FINALIZAR` terminal com contrato de conclusão;
- exemplos estáticos limitados a no máximo 20 itens, evitando embutir catálogo grande no Flow.

GitHub Actions `Validate WhatsApp Flow V31 Stable`, run #6 (`34444649933`): **SUCCESS** em 2026-09-10. O contrato comercial V31 completo passou sem flexibilização de regras.

## Gates obrigatórios — manter até autorização explícita

- `whatsapp_live_canary_percent = 1`
- `experience_orchestrator_enabled = false`
- `whatsapp_flow_data_exchange_enabled = false`
- `whatsapp_flow_send_enabled = false`
- `whatsapp_flow_commercial_write_enabled = false`
- `bling_order_sync_enabled = false`

Os seis valores foram reconfirmados nesta rodada diretamente em `public.automation_config`: `1 / false / false / false / false / false`.
Não aumentar rollout, não publicar o Flow e não ativar Bling sem autorização explícita do proprietário.

## Make confirmado nesta rodada

Continuam ativos somente os três cenários esperados e sem execuções incompletas:

- Dona Antônia - WhatsApp Inbound Controlado v1
- Dona Antônia - WhatsApp Outbound Event-Driven v3
- consultar no cpf

A rota Flow do cenário outbound continua limitada ao número de homologação autorizado.

## Supabase confirmado nesta rodada

A definição `flow-cestas-comercial-v8-stable` permanece:

- `status=ready`;
- `provider_id=2579927222524475`;
- `handler_version=v22`;
- `candidate_not_live=true`;
- `customer_exposure=false`;
- `default_for_new_sessions=false`;
- `edge_version=41`;
- `implementation_stage=v31_v22_homologation_isolation_hardened`.

## Próximos passos seguros

1. Reconfirmar os seis gates antes de qualquer teste externo.
2. Preparar/usar caminho de smoke de homologação que preserve os gates globais desligados e utilize somente sessão/número do proprietário.
3. Fazer smoke de Data Exchange criptografado do DRAFT V31 sem escrita comercial.
4. Testar visualmente no WhatsApp: 9 cestas, personalização, seções/termos, produto, quantidade restante, repetição do mesmo produto, upsell, revisão e cliente/endereço.
5. Validar `nfm_reply` real do DRAFT ao fechar o Flow e o retorno à conversa.
6. Corrigir qualquer divergência visual/contratual encontrada sem publicar.
7. Somente quando a homologação completa estiver verde, preparar checklist de publicação/rollout para autorização explícita do proprietário.

## Segurança

A candidata V8 está protegida em três camadas: banco, Edge e outbound Make. O V22 não é executável por `anon` ou `authenticated`; somente `service_role` possui EXECUTE. Nenhum gate comercial foi deixado aberto nesta rodada.