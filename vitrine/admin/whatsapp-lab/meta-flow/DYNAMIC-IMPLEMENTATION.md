# Dona Antônia · Flow dinâmico de cestas

**Revisão de usabilidade:** 25/10/2026  
**Flow:** JSON 7.3 · Data API 3.0  
**Homologação:** somente remetente 1018 → destinatário interno 8360

## Experiência do cliente

1. A pessoa escolhe um dos cinco tamanhos e compara as três combinações com as marcas e os preços consultados naquele momento.
2. O catálogo mostra fotos, nome, marca, quantidade atual, preço unitário e subtotal por item. Ele usa `NavigationList`, com até 14 produtos por página e retorno à lista depois de editar um item.
3. Um único editor é reutilizado para cada produto aberto. A pessoa pode escolher uma alternativa com foto, ver preço e estoque atuais e digitar a quantidade de 0 a 10; zero remove o produto.
4. Cada alteração atualiza a cotação com `basket_mold_quote`. A tela final mostra nomes e quantidades numa lista compacta, o total em campo separado e o aviso de que o atendimento confirma preço e disponibilidade.
5. Ao concluir, a resposta `nfm_reply` é tratada pelo webhook e aparece no atendimento existente. A conclusão registra uma solicitação para conferência humana; não cria pedido, reserva estoque nem envia outra mensagem ao cliente.

O catálogo vem do `storefront-v2` e dos dados comerciais do Supabase. O JSON não contém preço nem produto comercial fixo. O Flow aceita até 30 posições, usando duas páginas quando a cesta tem mais de 14. Cada tela de catálogo tem no máximo 17 linhas (16 produtos e a ação de revisar), dentro do limite de 20 itens da Meta. O JSON declara sete ligações de rota apenas no sentido de avanço; a Meta rejeita a declaração redundante das rotas de retorno.

### Fotos e segurança de carregamento

- A consulta ao banco confirmou que as imagens de produtos existentes usam HTTPS e vêm de `ssbesxgaijknwsjbsbcz.supabase.co` ou do caminho público de imagens do repositório `osvaldosereia/SUCEDOAN12` no `raw.githubusercontent.com`.
- Imagens do bucket público `product-images` são transformadas pelo Storage em WebP de 240 × 190 px, qualidade 60. O endpoint permite apenas esses hosts e caminhos, recusa redirecionamentos, confere o tipo e a assinatura do arquivo e limita a leitura a 27 KB por imagem.
- Se a foto estiver ausente ou inválida, o item continua disponível em texto. Falha na imagem não interrompe o Flow.

## Navegação e payloads

| Tela | Função |
| --- | --- |
| `TAMANHO` | Carrega os cinco tamanhos ativos |
| `COMBINACAO` | Compara marcas, disponibilidade e preços das três combinações |
| `ITENS_UM` / `ITENS_DOIS` | Catálogo paginado com fotos e preço atualizado |
| `ITEM_EDIT` | Alternativas e quantidade para um único item; retorna à página de origem |
| `RESUMO` | Cotação final e confirmação de solicitação |

A sessão mantém uma cópia assinada dos itens e dos identificadores de posição. O endpoint valida o canário, a tela de origem, o produto alternativo, a quantidade e o estoque antes de cotar. Não há escrita em cesta, pedido ou estoque. Indisponibilidade do catálogo ou da cotação interrompe a etapa e não é convertida em confirmação.

## Estado operacional verificado

Verificado pelo painel oficial da Meta e pelo Vitrine Admin em 25/10/2026:

- O PR [#1410](https://github.com/osvaldosereia/SUCEDOAN12/pull/1410) está aberto. Esta revisão remove as rotas recíprocas rejeitadas pela Meta e mantém o retorno à lista no motor de navegação.
- A Meta aceitou o JSON desta revisão sem erros no rascunho `Dona Antônia Cestas Básicas Dynamic V2`, ID `1817973829344642`, estado `DRAFT`. O endpoint retornado pela Meta para esse Flow é `https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-1018-basket-flow-v1`.
- O Flow V1, ID `3300494700136506`, consta como `PUBLISHED` e não foi alterado.
- A Edge Function `whatsapp-1018-basket-flow-v1` está `ACTIVE` versão 5, e `admin-whatsapp-templates-v1` está `ACTIVE` versão 27. A leitura após a implantação confirmou o roteador V1/V2: tokens assinados com o ID do Flow V1 continuam no motor legado; o canário V2 entra no editor novo.
- O primeiro teste no aparelho retornou HTTP `427` (`flow_session_unavailable`). O token do convite inicial usava a validade padrão de 45 minutos, embora o convite tenha sido aberto várias horas depois. O emissor agora assina o convite inicial por 24 horas; os estados usados durante a edição continuam com validade de 45 minutos.
- Os pré-requisitos de token Meta, Graph, número 1018, endpoint, chave privada, chave pública, correspondência entre as chaves e segredo do app aparecem `Pronto` no painel. Nenhum valor de segredo é incluído nesta documentação.
- Após a implantação, o Vitrine Admin confirmou que a Meta aceitou um novo envio de teste somente de `1018` para `8360`. O endpoint fixo registrou respostas HTTP `200` durante esse novo teste; não houve `427` no intervalo consultado. O aparelho ainda precisa abrir a mensagem mais recente e confirmar a navegação visual e a resposta descriptografada. A mensagem de teste anterior permanece expirada.

## Arquivos alterados nesta revisão

- `flow-dynamic-v1.json` — seis telas, navegação com `NavigationList`, imagens e editor reutilizável.
- `supabase/functions/whatsapp-1018-basket-flow-v1/engine.mjs` — paginação, edição por item, validação de estoque, resumo e recotação.
- `supabase/functions/whatsapp-1018-basket-flow-v1/engine-legacy-v1.mjs` — contrato do motor ativo, preservado para o Flow V1 publicado.
- `supabase/functions/whatsapp-1018-basket-flow-v1/flow-release-router.mjs` — seleciona o motor por ID assinado do Flow.
- `supabase/functions/whatsapp-1018-basket-flow-v1/images.mjs` — transformação de imagens e validação de host, caminho, formato, redirecionamento e tamanho.
- `supabase/functions/whatsapp-1018-basket-flow-v1/index.ts` — integração do carregador de imagem ao endpoint existente.
- `supabase/functions/admin-whatsapp-templates-v1/index.ts` — inclui o ID do Flow e dá 24 horas de validade ao convite inicial do teste interno, mantendo o remetente e o destinatário fixos.
- `scripts/test-whatsapp-1018-flow-dynamic.mjs` — inclui regressão de convite aberto após oito horas e preserva a expiração de 45 minutos dos estados de edição; também cobre rotas, cotação, atendimento, criptografia e limites de imagem.

## Próximas etapas

1. Abrir no aparelho interno `8360` a mensagem de teste mais recente enviada por `1018` e confirmar que a resposta é descriptografada; não reutilizar o convite anterior, que expirou.
2. Revisar fotos, alternativas, quantidade zero, estoque e total; concluir o teste interno e conferir o cartão no atendimento existente, confirmando que nenhum pedido ou reserva foi criado.
3. Manter o Flow em `DRAFT` até a conferência visual e funcional terminar. A publicação exige uma decisão operacional posterior no Vitrine Admin.

No commit `698378d8664711654a0360086a09b795e47bdb27`, os checks `WhatsApp 1018 Dynamic Flow CI`, `WhatsApp 1018 Basket Lab CI` e `WhatsApp Meta Central CI` passaram. Os checks amplos `Checkout Hotfix CI` e `Basket product carousel` falharam em contratos de checkout/carrossel não alterados por este PR.

## Fontes

- Meta: [componentes de WhatsApp Flows](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components.md) e [endpoints de Data Exchange](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint.md).
- Supabase: [Storage Image Transformations](https://supabase.com/docs/guides/storage/serving/image-transformations).
