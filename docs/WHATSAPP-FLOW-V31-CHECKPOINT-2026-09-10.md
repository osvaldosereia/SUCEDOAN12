# WhatsApp Flow Dona Antônia — checkpoint V31 / V20

Data: 2026-09-10
Branch: `flow-v29-fast-owner-test`

## Estado atual

Candidato oficial de homologação: `flow-cestas-comercial-v8-stable`.

- Flow JSON: `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json`
- Flow JSON version: `7.3`
- Data API version: `3.0`
- Handler determinístico: `handle_whatsapp_flow_commercial_exchange_v20`
- Edge Function: `whatsapp-flow-data-exchange-v1`, versão implantada 36
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
8. Quantidade é limitada por `min(6, estoque_atual)`. Tentativa forçada acima do estoque é rejeitada no servidor.
9. Produtos extras são acumulados em `flow_pending_addons` entre rodadas.
10. Upsell/cross-sell retorna até 6 sugestões reais e opcionais; seguir sem adicionar é permitido.
11. Revisão usa total determinístico: preço comercial da cesta + produtos extras/upsell. Nunca soma ou revela preços individuais dos componentes da cesta.
12. Cliente existente e endereço são reaproveitados sem pedir novamente.
13. Formas de pagamento: PIX, dinheiro, cartão crédito/débito e alimentação/refeição, conforme regras vigentes.
14. Com escrita comercial desligada, checkout termina em homologação sem criar pedido.
15. `nfm_reply` foi atualizado para reconhecer a V8 estável; quando houver pedido confirmado, retorna ao chat e pede localização no WhatsApp.
16. Make inbound já encaminha `interactive_type=nfm_reply` ao ingest do Supabase.
17. Make outbound possui rota específica para `interactive.type=flow`.

## Correções desta rodada

- Criados handlers V19/V20 sobre o V18 sem alterar os handlers legados usados pelos Flows anteriores.
- `product_id` preservado no detalhe da V31 para o payload `add_product`.
- Imagem de produto no detalhe usa asset comprimido `products/<uuid>.jpg`; listas de produtos permanecem text-only.
- Limite de quantidade corrigido para estoque real e máximo comercial 6, com validação também no servidor.
- Criado `format_whatsapp_flow_session_preview_v1` para total/resumo determinísticos em homologação.
- Compatibilidade do `nfm_reply` ampliada para `flow-cestas-comercial-v8-stable`.
- Funções V20/preview/nfm restritas ao `service_role`.
- Duas trigger functions legadas de roteamento de cesta tiveram EXECUTE removido de `anon` e `authenticated`; o advisor deixou de apontar esse risco.
- Meta rejeitou inicialmente a propriedade interna `_diagnostic`; o builder e o CI foram corrigidos para aceitar apenas as chaves raiz do schema Meta.
- Artefato regenerado e reenviado ao mesmo DRAFT; validação oficial passou sem erros.

## Gates obrigatórios — manter até autorização explícita

- `whatsapp_live_canary_percent = 1`
- `experience_orchestrator_enabled = false`
- `whatsapp_flow_data_exchange_enabled = false`
- `whatsapp_flow_send_enabled = false`
- `whatsapp_flow_commercial_write_enabled = false`
- `bling_order_sync_enabled = false`

Não aumentar rollout, não publicar o Flow e não ativar Bling sem autorização explícita do proprietário.

## Próximos passos seguros

1. Fazer smoke de Data Exchange criptografado do DRAFT V31 usando somente sessão/número de homologação autorizado, ainda sem escrita comercial.
2. Testar visualmente no WhatsApp: 9 cestas, personalização, seções/termos, produto, quantidade, upsell, revisão e cliente/endereço.
3. Validar `nfm_reply` real do DRAFT ao fechar o Flow e o retorno à conversa.
4. Corrigir qualquer divergência visual/contratual encontrada sem publicar.
5. Somente quando a homologação completa estiver verde, preparar checklist de publicação/rollout para autorização explícita do proprietário.

## Segurança

O Supabase Advisor continua mostrando avisos gerais preexistentes de tabelas com RLS sem policies e proteção contra senhas vazadas desabilitada. Os avisos específicos de SECURITY DEFINER executáveis por `anon/authenticated` nas duas rotas legadas de cesta foram corrigidos nesta rodada. Nenhum gate comercial foi aberto.