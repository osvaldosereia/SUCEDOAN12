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

O catálogo vem do `storefront-v2` e dos dados comerciais do Supabase. O JSON não contém preço nem produto comercial fixo. O Flow aceita até 30 posições, usando duas páginas quando a cesta tem mais de 14. Cada tela de catálogo tem no máximo 17 linhas (16 produtos e a ação de revisar), dentro do limite de 20 itens da Meta. O JSON usa nove ligações de rota, abaixo do limite documentado de dez.

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

Na verificação desta revisão:

- O PR [#1410](https://github.com/osvaldosereia/SUCEDOAN12/pull/1410) está aberto. As alterações desta revisão precisam passar pelas verificações e pela validação Meta antes de integração.
- A Edge Function `whatsapp-1018-basket-flow-v1` está `ACTIVE`, versão 4, no Supabase. Isso confirma uma versão anterior implantada; não confirma que este código revisado esteja no runtime.
- O gerenciador do Vitrine Admin mostra o rascunho `Dona Antônia Cestas Básicas Dynamic V1`, ID `3300494700136506`, estado `DRAFT`, com relatório sem erros para o JSON então carregado. Esse relatório não valida automaticamente esta revisão do JSON.
- O mesmo painel mostra endpoint fixo pronto, chave pública registrada e segredo do app pronto. A chave privada e a correspondência entre as chaves estão `Pendente`; por isso o teste criptografado do endpoint e a publicação não estão liberados.
- Nenhuma publicação do Flow, alteração do atendimento publicado ou mensagem para cliente real é parte desta revisão.

## Arquivos alterados nesta revisão

- `flow-dynamic-v1.json` — seis telas, navegação com `NavigationList`, imagens e editor reutilizável.
- `supabase/functions/whatsapp-1018-basket-flow-v1/engine.mjs` — paginação, edição por item, validação de estoque, resumo e recotação.
- `supabase/functions/whatsapp-1018-basket-flow-v1/images.mjs` — transformação de imagens e validação de host, caminho, formato, redirecionamento e tamanho.
- `supabase/functions/whatsapp-1018-basket-flow-v1/index.ts` — integração do carregador de imagem ao endpoint existente.
- `scripts/test-whatsapp-1018-flow-dynamic.mjs` — rotas, cotação, resposta de atendimento, criptografia e limites de imagem.

## Verificação pendente

1. Rodar os testes locais e os checks do CI do PR.
2. Enviar este JSON pelo painel **Marketing → Flows Meta** ao rascunho acima e guardar o relatório oficial da Meta. Corrigir qualquer incompatibilidade antes do teste no telefone.
3. Liberar endpoint e teste 1018 → 8360 somente quando o estado seguro das chaves estiver `Pronto` no painel. O teste não deve usar o número 0975.
4. Homologar no aparelho a seleção de tamanho, as fotos, as alternativas, quantidade zero, estoque, total e o texto que aparece depois da conclusão.
5. Publicar somente depois da validação Meta e da homologação interna, usando o fluxo existente do Vitrine Admin.

## Fontes

- Meta: [componentes de WhatsApp Flows](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components.md) e [endpoints de Data Exchange](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint.md).
- Supabase: [Storage Image Transformations](https://supabase.com/docs/guides/storage/serving/image-transformations).
