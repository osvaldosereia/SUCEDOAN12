# Dona Antônia — atendente, cesta e vitrine curta

Atualizado em 09/09/2026.

## Decisão de UX

O WhatsApp continua sendo o centro da conversa. O caminho comercial definido é:

1. Cliente demonstra interesse em cesta básica.
2. Abrir seletor estruturado imediatamente, sem pergunta intermediária.
3. Cliente escolhe uma das 9 cestas ativas.
4. Perguntar uma única vez: **Quero assim** ou **Personalizar**.
5. **Quero assim**: seguir diretamente para o checkout determinístico no WhatsApp.
6. **Personalizar**: abrir a vitrine contextual `/cesta/?t=<token>` com a cesta já selecionada.
7. Na vitrine, alterações são salvas no carrinho oficial do Supabase.
8. Ao tocar em **Finalizar pedido**, a vitrine não tenta abrir `wa.me`, `whatsapp://` nem o aplicativo WhatsApp. O backend registra o retorno e enfileira a continuação da conversa. O cliente apenas volta à conversa.
9. O checkout reaproveita cadastro/endereço conhecidos e reúne dados faltantes em uma única mensagem; resumo e confirmação permanecem no WhatsApp.

A vitrine é usada para montar/personalizar. A conversa e o fechamento continuam no WhatsApp. Não será criado um segundo checkout web enquanto o fluxo atual puder ser concluído com menos passos no canal principal.

## Inteligência do atendente

As regras publicadas continuam sendo a base. O atendente deve:

- responder a pergunta atual antes de tentar vender;
- executar a próxima ação útil na mesma resposta quando a intenção estiver clara;
- usar português brasileiro natural, simples e cordial;
- não fingir ser humano nem inventar intimidade;
- não fazer entrevista campo a campo;
- usar preço, estoque, cesta, carrinho e regras comerciais somente das fontes determinísticas;
- nunca revelar preços individuais dos componentes da cesta;
- usar histórico confiável apenas para reduzir esforço e personalizar sem inferências sensíveis;
- respeitar handoff humano com prioridade absoluta;
- usar Flow/lista/botão/vitrine somente quando reduzirem passos.

A regra `basket_simple_sales_flow` foi ajustada para este caminho curto.

## Flow curto de escolha

Criado `whatsapp/flows/flow-cestas-escolha-v1.json`:

- somente duas telas: `CESTAS` e `ESCOLHIDA`;
- lista dinâmica com as cestas ativas e preço comercial;
- sem imagens no Flow curto para reduzir peso e falhas de carregamento;
- após a escolha, retorna ao WhatsApp para a decisão **Quero assim / Personalizar**;
- backend reaproveita `create_whatsapp_basket_session_v1`, carrinho e Data Exchange existentes.

A publicação automática na Meta foi preparada em `.github/workflows/release-flow-basket-choice-v1.yml`, mas a chamada Graph API retornou HTTP 401 com o `META_ACCESS_TOKEN` disponível no GitHub. Portanto o novo Flow permanece `draft`, sem `provider_id`, sem exposição a clientes.

Até a credencial Meta ser renovada, o atendimento não quebra: existe fallback determinístico com a lista interativa nativa das mesmas 9 cestas. A escolha nessa lista produz exatamente a mesma pergunta **Quero assim / Personalizar** e segue pelo mesmo carrinho/vitrine/checkout.

## Correção do retorno da vitrine

`basket-shop-v1` passou a finalizar o retorno no servidor por `complete_whatsapp_basket_storefront_v1` e iniciar o checkout pelo backend. `cesta/whatsapp-return.js` foi alterado para não forçar abertura de aplicativo nem usar deep link.

Isto remove do caminho crítico o comportamento Android/WhatsApp Business que tentava abrir o aplicativo e retornava/fechava a página.

## Segurança e rollout preservados

Nenhum gate global de Flow foi ativado nesta rodada. Permanecem preservados:

- `whatsapp_live_canary_percent = 1`;
- `experience_orchestrator_enabled = false`;
- `whatsapp_flow_data_exchange_enabled = false`;
- `whatsapp_flow_send_enabled = false`;
- Bling/fiscal não foram ativados.

O roteador de Flow antigo também recebeu guarda explícita para não tentar enviar Flow quando os gates estão desligados.

## Make

Os cenários existentes foram apenas auditados, sem recriação:

- `Dona Antônia - WhatsApp Inbound Controlado v1`: ativo, execuções recentes com sucesso;
- `Dona Antônia - WhatsApp Outbound Event-Driven v3`: ativo, execuções recentes com sucesso.

O desenho continua reaproveitando esses cenários e a fila existente, sem acrescentar um novo cenário e sem aumentar custo por uma arquitetura paralela.

## Próxima ativação segura

Quando houver credencial Meta válida:

1. publicar `flow-cestas-escolha-v1`;
2. registrar o `provider_id` retornado pela Meta;
3. validar Data Exchange e health status;
4. testar no número autorizado;
5. somente então habilitar os gates necessários, preservando o canary de 1% até nova autorização.
