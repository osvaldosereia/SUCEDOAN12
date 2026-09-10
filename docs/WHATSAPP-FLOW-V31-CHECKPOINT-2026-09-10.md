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

## Correções e testes recentes

- Handler V22 permanece exclusivo da candidata V8 estável; handlers legados não foram alterados.
- UX de quantidade calcula `saldo = min(6, estoque_atual) - quantidade_já_selecionada`.
- Produto já no limite de estoque/cap é removido de novas buscas.
- Guard de servidor rejeita payload manipulado que exceda o saldo disponível.
- `nfm_reply` já passou em smoke transacional com rollback: `return_to_chat=true` e `location_required=true` quando existe pedido confirmado.
- Meta DRAFT permanece sem chamada de `/publish`.

## Hardening de homologação desta rodada

Foi detectada divergência crítica no início da rodada: `experience_orchestrator_enabled`, `whatsapp_flow_data_exchange_enabled` e `whatsapp_flow_send_enabled` estavam `true`, contrariando o checkpoint anterior e a regra explícita do projeto. Os três foram imediatamente restaurados para `false`; canary permaneceu em 1%, escrita comercial permaneceu desligada e Bling permaneceu desligado.

Para que uma futura alteração acidental dos gates não exponha a candidata V8:

1. A Edge v41 agora exige `ownerHomologationAllowed(...)` para **toda** chamada não-ping de `flow-cestas-comercial-v8-stable`, independentemente do estado do gate global de Data Exchange. Fora da sessão de homologação do proprietário a resposta é `flow_candidate_homologation_only`.
2. O cenário Make `Dona Antônia - WhatsApp Outbound Event-Driven v3` teve sua rota `interactive.type=flow` endurecida: durante a homologação ela só aceita `recipient_e164` igual ao número autorizado de teste. As rotas de texto, áudio, imagem, botões e listas não foram alteradas.
3. A definição no Supabase registra `candidate_edge_owner_guard=true`, `outbound_flow_recipient_allowlist_enforced=true`, `edge_version=41` e `implementation_stage=v31_v22_homologation_isolation_hardened`.

## Gates obrigatórios — manter até autorização explícita

- `whatsapp_live_canary_percent = 1`
- `experience_orchestrator_enabled = false`
- `whatsapp_flow_data_exchange_enabled = false`
- `whatsapp_flow_send_enabled = false`
- `whatsapp_flow_commercial_write_enabled = false`
- `bling_order_sync_enabled = false`

Não aumentar rollout, não publicar o Flow e não ativar Bling sem autorização explícita do proprietário.

## Make confirmado nesta rodada

Continuam ativos somente os três cenários esperados e sem execuções incompletas:

- Dona Antônia - WhatsApp Inbound Controlado v1
- Dona Antônia - WhatsApp Outbound Event-Driven v3
- consultar no cpf

A rota Flow do cenário outbound está limitada ao número de homologação autorizado.

## Próximos passos seguros

1. Reconfirmar os seis gates antes de qualquer teste externo.
2. Fazer smoke de Data Exchange criptografado do DRAFT V31 usando somente sessão/número de homologação autorizado, ainda sem escrita comercial.
3. Testar visualmente no WhatsApp: 9 cestas, personalização, seções/termos, produto, quantidade restante, repetição do mesmo produto, upsell, revisão e cliente/endereço.
4. Validar `nfm_reply` real do DRAFT ao fechar o Flow e o retorno à conversa.
5. Corrigir qualquer divergência visual/contratual encontrada sem publicar.
6. Somente quando a homologação completa estiver verde, preparar checklist de publicação/rollout para autorização explícita do proprietário.

## Segurança

Nenhum gate comercial deve permanecer aberto nesta fase. A candidata V8 ganhou isolamento independente dos gates globais na Edge e na rota outbound. O V22 não é executável por `anon` ou `authenticated`; somente `service_role` possui EXECUTE. Testes mutáveis devem continuar usando transações com `ROLLBACK`.