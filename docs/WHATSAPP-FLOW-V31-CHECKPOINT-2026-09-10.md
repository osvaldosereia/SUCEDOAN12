# WhatsApp Flow Dona Antônia — checkpoint V31 / V22

Data: 2026-09-10
Branch: `flow-v29-fast-owner-test`

## Estado atual

Candidato oficial de homologação: `flow-cestas-comercial-v8-stable`.

- Flow JSON: `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json`
- Flow JSON version: `7.3`
- Data API version: `3.0`
- Handler determinístico: `handle_whatsapp_flow_commercial_exchange_v22`
- Edge Function: `whatsapp-flow-data-exchange-v1`, versão implantada 40
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

## Correções e testes mais recentes

- Criado handler V22 sobre o V21 sem alterar handlers legados.
- UX de quantidade agora calcula `saldo = min(6, estoque_atual) - quantidade_já_selecionada`.
- Teste real transacional: produto com estoque 2 e 1 unidade já selecionada exibiu somente a opção de adicionar mais 1 unidade.
- Teste real transacional: o mesmo produto, já com 2 unidades selecionadas para estoque 2, foi removido de nova busca de Arroz; a lista caiu de 6 para 5 opções e `maxed_product_present=false`.
- O guard de servidor do V21 continua abaixo do V22, portanto payload manipulado continua sendo rejeitado.
- Detectada divergência de deploy: Edge v39 ainda roteava a candidata V8 para V20. Corrigida sem alterar módulos auxiliares; Edge v40 agora roteia exclusivamente `flow-cestas-comercial-v8-stable` para V22.
- Migration persistida em `supabase/migrations/20260910042100_whatsapp_flow_v22_remaining_addon_quantity_ux.sql`.
- Metadados da definição atualizados para `handler_version=v22` e `implementation_stage=v31_handler_v22_remaining_quantity_ux`.
- V22 é executável apenas por `service_role`; `anon` e `authenticated` permanecem sem EXECUTE.
- `nfm_reply` foi auditado: `process_whatsapp_flow_nfm_reply_legacy_v1` inclui explicitamente `flow-cestas-comercial-v8-stable`, valida pedido confirmado e deduplica retorno.
- Smoke transacional de `nfm_reply` com token sintético e rollback retornou `return_to_chat=true`, `location_required=true` e a orientação para envio da localização. Nenhum dado sintético permaneceu persistido.
- A emissão normal de token permaneceu bloqueada pelo gate do orquestrador, como esperado; nenhum gate foi aberto para realizar o smoke.
- Meta DRAFT permanece sem chamada de `/publish`.

## Gates obrigatórios — manter até autorização explícita

- `whatsapp_live_canary_percent = 1`
- `experience_orchestrator_enabled = false`
- `whatsapp_flow_data_exchange_enabled = false`
- `whatsapp_flow_send_enabled = false`
- `whatsapp_flow_commercial_write_enabled = false`
- `bling_order_sync_enabled = false`

Os seis valores foram reconfirmados em `public.automation_config` nesta rodada. Não aumentar rollout, não publicar o Flow e não ativar Bling sem autorização explícita do proprietário.

## Make confirmado nesta rodada

Continuam ativos somente os três cenários esperados e sem execuções incompletas:

- Dona Antônia - WhatsApp Inbound Controlado v1
- Dona Antônia - WhatsApp Outbound Event-Driven v3
- consultar no cpf

## Próximos passos seguros

1. Fazer smoke de Data Exchange criptografado do DRAFT V31 usando somente sessão/número de homologação autorizado, ainda sem escrita comercial.
2. Testar visualmente no WhatsApp: 9 cestas, personalização, seções/termos, produto, quantidade restante, repetição do mesmo produto, upsell, revisão e cliente/endereço.
3. Validar `nfm_reply` real do DRAFT ao fechar o Flow e o retorno à conversa; o contrato backend já passou em smoke transacional.
4. Corrigir qualquer divergência visual/contratual encontrada sem publicar.
5. Somente quando a homologação completa estiver verde, preparar checklist de publicação/rollout para autorização explícita do proprietário.

## Segurança

Nenhum gate comercial foi aberto. O V22 não é executável por `anon` ou `authenticated`; somente `service_role` possui EXECUTE. Testes mutáveis desta rodada foram executados em transações com `ROLLBACK`. Os avisos gerais preexistentes do Supabase Advisor permanecem fora do escopo desta mudança.