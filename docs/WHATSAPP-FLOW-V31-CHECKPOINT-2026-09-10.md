# WhatsApp Flow Dona Antônia — checkpoint V31 / V21

Data: 2026-09-10
Branch: `flow-v29-fast-owner-test`

## Estado atual

Candidato oficial de homologação: `flow-cestas-comercial-v8-stable`.

- Flow JSON: `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json`
- Flow JSON version: `7.3`
- Data API version: `3.0`
- Handler determinístico: `handle_whatsapp_flow_commercial_exchange_v21`
- Edge Function: `whatsapp-flow-data-exchange-v1`, versão implantada 38
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
8. Quantidade é limitada por `min(6, estoque_atual)`, com validação também no servidor.
9. O V21 soma seleções repetidas do mesmo produto em rodadas diferentes e impede que o total acumulado ultrapasse `min(6, estoque_atual)`.
10. Produtos extras são acumulados em `flow_pending_addons` entre rodadas.
11. Upsell/cross-sell retorna até 6 sugestões reais e opcionais; seguir sem adicionar é permitido.
12. Revisão usa total determinístico: preço comercial da cesta + produtos extras/upsell. Nunca soma ou revela preços individuais dos componentes da cesta.
13. Cliente existente e endereço são reaproveitados sem pedir novamente.
14. Formas de pagamento: PIX, dinheiro, cartão crédito/débito e alimentação/refeição, conforme regras vigentes.
15. Com escrita comercial desligada, checkout termina em homologação sem criar pedido.
16. `nfm_reply` reconhece a V8 estável; quando houver pedido confirmado, retorna ao chat e pede localização no WhatsApp.
17. Make inbound encaminha `interactive_type=nfm_reply` ao ingest do Supabase.
18. Make outbound possui rota específica para `interactive.type=flow`.

## Correções mais recentes

- Criado handler V21 sobre o V20 sem alterar handlers legados.
- Adicionado guard de estoque agregado para o mesmo produto em múltiplas rodadas.
- Exemplo real de regressão: produto com estoque 2 e 2 unidades já selecionadas rejeitou nova tentativa de 5 unidades com `quantity_exceeds_available_stock`, `available_quantity=0`, `already_selected_quantity=2`, `maximum_total_quantity=2`.
- Edge Function atualizada para v38, roteando somente `flow-cestas-comercial-v8-stable` ao V21.
- Migration persistida em `supabase/migrations/20260910033600_whatsapp_flow_v21_aggregate_addon_stock_guard.sql`.
- Metadados da definição atualizados para `handler_version=v21` e `implementation_stage=v31_handler_v21_aggregate_stock_guard`.
- `product_id` permanece preservado no detalhe da V31 para o payload `add_product`.
- Imagem de produto no detalhe usa asset comprimido `products/<uuid>.jpg`; listas de produtos permanecem text-only.
- `format_whatsapp_flow_session_preview_v1` mantém total/resumo determinísticos em homologação.
- Compatibilidade do `nfm_reply` permanece ativa para `flow-cestas-comercial-v8-stable`.
- Funções comerciais de homologação permanecem restritas ao `service_role`.
- Meta DRAFT permanece validado sem erros e sem chamada de `/publish`.

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
2. Testar visualmente no WhatsApp: 9 cestas, personalização, seções/termos, produto, quantidade, repetição do mesmo produto, upsell, revisão e cliente/endereço.
3. Validar `nfm_reply` real do DRAFT ao fechar o Flow e o retorno à conversa.
4. Corrigir qualquer divergência visual/contratual encontrada sem publicar.
5. Somente quando a homologação completa estiver verde, preparar checklist de publicação/rollout para autorização explícita do proprietário.

## Segurança

Nenhum gate comercial foi aberto. O V21 não é executável por `anon` ou `authenticated`; somente `service_role` possui EXECUTE. Os avisos gerais preexistentes do Supabase Advisor permanecem fora do escopo desta mudança.