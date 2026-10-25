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
- A Meta aceitou o JSON desta revisão sem erros no rascunho `Dona Antônia Cestas Básicas Dynamic V2`, ID `1817973829344642`, estado `DRAFT`.
- O Flow V1, ID `3300494700136506`, consta como `PUBLISHED` e não foi alterado.
- A Edge Function `whatsapp-1018-basket-flow-v1` está `ACTIVE`, versão 4. O runtime ainda não contém o carregador de imagens nem esta revisão do motor; por isso o teste interno no telefone ainda não foi executado. Como o Flow V1 publicado aponta para a mesma URL, a revisão mantém o motor antigo e usa o `flow_id` dentro do token assinado do canário para selecionar o motor V2.
- Os pré-requisitos de token Meta, Graph, número 1018, endpoint, chave privada, chave pública, correspondência entre as chaves e segredo do app aparecem `Pronto` no painel. Nenhum valor de segredo é incluído nesta documentação.
- A homologação deve usar somente o envio 1018 → 8360. Concluir o Flow registra uma solicitação para conferência humana, sem criar pedido, reservar estoque ou enviar mensagem adicional.

## Arquivos alterados nesta revisão

- `flow-dynamic-v1.json` — seis telas, navegação com `NavigationList`, imagens e editor reutilizável.
- `supabase/functions/whatsapp-1018-basket-flow-v1/engine.mjs` — paginação, edição por item, validação de estoque, resumo e recotação.
- `supabase/functions/whatsapp-1018-basket-flow-v1/engine-legacy-v1.mjs` — contrato do motor ativo, preservado para o Flow V1 publicado.
- `supabase/functions/whatsapp-1018-basket-flow-v1/flow-release-router.mjs` — seleciona o motor por ID assinado do Flow.
- `supabase/functions/whatsapp-1018-basket-flow-v1/images.mjs` — transformação de imagens e validação de host, caminho, formato, redirecionamento e tamanho.
- `supabase/functions/whatsapp-1018-basket-flow-v1/index.ts` — integração do carregador de imagem ao endpoint existente.
- `supabase/functions/admin-whatsapp-templates-v1/index.ts` — inclui o ID do Flow no token assinado do teste interno, sem alterar o remetente nem o destinatário.
- `scripts/test-whatsapp-1018-flow-dynamic.mjs` — rotas, cotação, resposta de atendimento, criptografia e limites de imagem.

## Próximas etapas

1. Publicar os commits desta revisão no PR e aguardar os checks específicos do Flow.
2. Implantar a revisão do endpoint pelo Supabase; a versão ativa atual é anterior ao carregador de imagens e à navegação deste JSON.
3. Usar **Testar rascunho no 8360** no Vitrine Admin, com remetente fixo 1018, e conferir fotos, alternativas, quantidade zero, estoque, total e a resposta no atendimento existente.
4. Manter o Flow em `DRAFT` até a homologação visual e funcional no aparelho. A publicação exige uma decisão operacional posterior no Vitrine Admin.

## Fontes

- Meta: [componentes de WhatsApp Flows](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components.md) e [endpoints de Data Exchange](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint.md).
- Supabase: [Storage Image Transformations](https://supabase.com/docs/guides/storage/serving/image-transformations).
