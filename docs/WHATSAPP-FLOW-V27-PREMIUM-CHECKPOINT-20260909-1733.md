# WhatsApp Flow Dona Antônia — V27 Premium UX checkpoint

Data: 2026-09-09

## Objetivo desta rodada

Transformar a etapa de adicionais do Flow em uma experiência de compra rápida e visual, reduzindo cliques desnecessários e corrigindo os problemas observados no teste real do V26.

## UX consolidada

- Lista inicial continua preparada para 9 cestas com mídia.
- Personalização da cesta permanece opcional; componentes da cesta continuam sem preço individual.
- Depois da cesta, `Finalizar pedido` aparece como primeira ação. Adicionais não são obrigatórios.
- Escolhas únicas usam `ChipsSelector` com ação direta `data_exchange` em um toque.
- Seleção + botão `Continuar` fica reservada ao caso em que o cliente pode selecionar vários produtos.
- Lista de adicionais usa `CheckboxGroup` com mídia compacta (`media-size=regular`) e até 20 produtos reais por página.
- Cada linha pode receber foto pequena, nome e descrição com preço/embalagem.
- Depois da multisseleção, abre uma tela de quantidades apenas para os produtos escolhidos; quantidade inicial = 1 e limite continua validado por estoque/backend.
- Busca e categoria nunca carregam o catálogo inteiro. A consulta retorna somente subconjuntos vendáveis do Supabase.
- Paginação passou a suportar resultados além da primeira página, mantendo 20 itens por tela e busca limitada a 200 resultados relevantes por consulta, nunca aos 1.000+ produtos de uma vez.
- Revisão usa `total_label` produzido no backend, eliminando o bug visual `Total: ${data.total}`.
- Cliente existente continua seguindo para tela pré-preenchida de entrega/pagamento; novo cliente preenche somente os dados necessários.
- Tela de sucesso só é devolvida pelo handler V14 se existir `orders.confirmed_at` e `orders.total > 0`. Caso contrário vai para `FALHA_FINALIZACAO`, evitando `Pedido confirmado` junto com `R$ 0,00` / `Nenhum pedido iniciado`.

## Arquivos e backend

- JSON candidato: `whatsapp/flows/flow-cestas-comercial-v27.json`.
- Builder: `scripts/build-flow-v27-premium-ux.py`.
- Backend base premium: `supabase/migrations/20260909212500_whatsapp_flow_premium_ux_v38.sql`.
- Reconciliação: `supabase/migrations/20260909213600_whatsapp_flow_v27_reconcile_v39.sql`.
- Handler candidato: `handle_whatsapp_flow_commercial_exchange_v14` (wrapper estrito sobre V13).
- Edge `whatsapp-flow-data-exchange-v1` versão 19 contém rota específica para `flow-cestas-comercial-v4 -> handle_whatsapp_flow_commercial_exchange_v14`.
- Hidratação de mídia compacta em `card-images.ts` impõe orçamento individual de base64 para manter a resposta de até 20 linhas abaixo do teto do Data Channel.

## Validações executadas

- Meta Graph API v26.0: upload/validação do V27 em Flow de homologação retornou `success=true` e `validation_errors=[]`.
- Teste SQL de busca ampla (`a`): total limitado = 200; página 1 = 20; `has_more=true`; página 2 = 20.
- V13 mantém validação de que os IDs selecionados pertencem à página oferecida (`flow_product_option_ids`).
- V14 exige pedido realmente confirmado antes de renderizar sucesso.

## Estado de rollout

A candidata premium permanece isolada:

- `flow-cestas-comercial-v4`: `status=draft`;
- `provider_id=null` no orchestrator;
- `production_enabled=false`;
- `candidate_not_live=true`;
- `default_for_new_sessions=false`.

O Flow V3/V26 que já estava ativo antes desta rodada não foi substituído nem redirecionado. A validação Meta do V27 não publicou a candidata.

## Próximos passos seguros

1. Executar teste funcional completo do V27/V14 em sessão de homologação: cesta -> personalização -> finalizar direto e cesta -> adicionais -> quantidades -> revisão -> cliente existente/novo -> checkout.
2. Medir payload real com 20 imagens e, se necessário, reduzir automaticamente quantidade/tamanho das fotos sem reduzir a lista de textos/produtos.
3. Validar visual em aparelho Android real, principalmente densidade das 20 linhas e ergonomia da tela de quantidades.
4. Somente depois criar/vincular provider Meta definitivo para V4 e promover com autorização explícita.
