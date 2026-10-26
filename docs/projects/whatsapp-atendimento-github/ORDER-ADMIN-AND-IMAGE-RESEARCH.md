# Pesquisa complementar — catálogo, imagens, pedidos e Bling

Projeto: WhatsApp Atendimento GitHub — SUCEDOAN12  
Branch consultada: project/whatsapp-atendimento-github-20261025  
Data: 25/10/2026  
Status: pesquisa concluída. O anexo operacional de 26/10/2026 registra alterações greenfield subsequentes; nenhuma tabela, dado, função ANA ou callback do Vitrine foi alterado.

## Decisão posterior do usuário — 26/10/2026

Esta decisão substitui as hipóteses históricas deste documento que colocavam produtos, imagens ou estoque no GitHub. O Admin novo lê e edita somente os produtos associados às cestas atuais, diretamente no `public.products` Supabase. O estoque válido vem do Supabase (`ops2_loose_sellable_stock_v1.effective_sellable_stock`), com reserva dos pedidos confirmados no schema novo. Imagens seguem o `products.image_url` e o mesmo bucket `product-images` usado pelo Vitrine. O repositório GitHub guarda a configuração das cestas e rascunhos de Flow; não mantém banco de produtos, cópia de saldo nem arquivo de imagem do novo projeto. A implementação continua greenfield e não reutiliza código ou contratos do Vitrine.

### Complemento operacional — Edge Functions e chaves da outbox — 26/10/2026

As funções greenfield de checkout, roteamento Meta e outbox foram implantadas após confirmar tabelas privadas e fila vazia. O callback externo Meta permaneceu inalterado. Para evitar novos secrets no caminho padrão, o sistema deriva chaves distintas via HKDF-SHA-256: AES-GCM para payload privado e bearer interno do worker. Secrets explícitos continuam aceitos e o campo de IV identifica a versão da chave usada. O worker só despacha com gate explícito habilitado. Referências primárias: [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets) para variáveis padrão do runtime e [MDN Web Crypto `deriveKey`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey) para derivação HKDF/AES-GCM.

A derivação usa o segredo Meta como raiz: uma rotação requer drenar a fila primeiro, ou manter uma chave explícita estável para itens pendentes.

## Resumo executivo

A pesquisa confirma que o novo catálogo GitHub pode ser pequeno. A configuração ativa do Vitrine Admin contém cinco tamanhos de cesta ligados a produtos e **61 produtos distintos usados como opções**. Os 61 registros têm URL de imagem WebP: 59 apontam para Supabase Storage e 2 para imagens já hospedadas no GitHub. A URL existente ainda precisa ser baixada e validada; a consulta verificou preenchimento e extensão, não o conteúdo, tamanho ou qualidade visual dos arquivos.

O repositório SUCEDOAN12 está configurado como **público**. Produtos e imagens podem ser versionados ali, mas o ajuste interno que não deve ser exposto ao cliente não deve ser salvo no repositório. O Admin e o Flow terão que obter essa regra somente no servidor.

O Vitrine Admin já tem uma operação extensa de pedidos, separação, integração com Bling, emissão/acompanhamento de NF-e, expedição e conclusão. O gargalo para o novo projeto é compatibilizar o pedido produzido a partir do catálogo GitHub com esse motor, que atualmente consulta o catálogo e o estoque de produtos no Supabase.

## 1. Fonte correta para o recorte de produtos

A tela atual de configuração de cesta usa a configuração de tipos, quantidades e opções do Admin. A interface está em [basket-admin-flow.js](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/vitrine/admin/basket-admin-flow.js) e chama [basket-admin-api.js](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/vitrine/admin/basket-admin-api.js). O endpoint de configuração do Flow na aplicação atual lê tabelas basket_admin_* dentro de [storefront-v2](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/supabase/functions/storefront-v2/index.ts).

A consulta somente de leitura cruzou cestas ativas, tipos de produto ativos, quantidades maiores que zero e opções cadastradas por tipo. O resultado observado foi:

| Tamanho ativo | Opções de produto configuradas |
|---|---:|
| Econômica | 24 |
| Mini | 55 |
| Pequena | 60 |
| Média | 60 |
| Grande | 60 |
| Distintos entre os cinco tamanhos | **61** |

As contagens por tamanho incluem opções repetidas em mais de uma cesta; 61 é a união de produtos distintos. “Doação” e “Família” aparecem como tipos ativos, mas não tinham relação de cesta/opções com quantidade positiva na configuração consultada.

Uma consulta às tabelas antigas basket_templates e basket_template_items encontra 29 produtos distintos entre itens e alternativas. Esse conjunto é menor porque não representa todas as opções de marcas/produtos presentes na configuração atual do Admin. Para a carga inicial, usar a configuração ativa basket_admin_* como fonte principal e reconciliar a diferença com o modelo antigo. Não migrar os 1.928 registros da tabela operacional public.products.

## 2. Imagens e tratamento para WhatsApp

As 61 opções configuradas têm image_url não vazio e extensão WebP. A consulta agrupada por host encontrou:

- 59 imagens em Supabase Storage;
- 2 imagens no GitHub Raw.

Isso confirma que existe uma origem para cada imagem configurada, não que cada arquivo ainda esteja acessível, tenha dimensões apropriadas ou fique nítido em um aparelho real.

O código atual do Flow contém uma boa referência técnica em [images.mjs](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/supabase/functions/whatsapp-1018-basket-flow-v1/images.mjs). Ele só busca domínios e caminhos aprovados, rejeita redirecionamentos, valida MIME/assinatura do arquivo, impõe limite de 27.000 bytes e converte a imagem para Base64 antes de devolvê-la ao componente Image do Flow. Para arquivos de Supabase Storage, aplica uma transformação de 240×190, qualidade 60 e WebP. Imagens GitHub Raw não são redimensionadas por esse helper; o caminho aceito exige URL com commit SHA.

O teste de referência [test-whatsapp-1018-flow-dynamic.mjs](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/scripts/test-whatsapp-1018-flow-dynamic.mjs) cobre carregamento de WebP, rejeição de host/caminho não aprovado, limite de bytes e inclusão de miniatura na etapa do produto.

Recomendação de implementação:

1. Copiar somente as 61 imagens referenciadas pelas opções escolhidas para a pasta de imagens do novo projeto.
2. Salvar no JSON do produto um caminho relativo estável, não Base64 nem URL temporária do Supabase.
3. Produzir uma miniatura pré-otimizada para o Flow, inicialmente 240×190 WebP com alvo de até 27 KB, pois o loader GitHub Raw não transforma a imagem.
4. Manter uma variante maior apenas se o Admin precisar de uma visualização maior; escolher resolução/qualidade após comparar uma folha de contato e telas reais em WhatsApp.
5. Registrar origem, SHA-256, dimensões e bytes no manifesto da migração; rejeitar arquivo quebrado ou imagem que não passe por revisão visual.
6. Fazer o runtime montar a URL GitHub a partir do commit da configuração utilizada, para que cesta, produto e imagem pertençam à mesma revisão.

Ainda não baixei, copiei, comprimi ou abri visualmente nenhuma dessas imagens.

## 3. Flow e vínculo com os números

O Admin atual consulta as APIs da Meta por meio de [admin-whatsapp-templates-v1](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/supabase/functions/admin-whatsapp-templates-v1/index.ts) e dos helpers em [whatsapp-meta-flows-v1.mjs](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/supabase/functions/_shared/whatsapp-meta-flows-v1.mjs). O serviço cobre operações de lista/detalhe, criação, envio de JSON, validação, configuração de endpoint/chave, publicação e canário.

A implementação de gestão de Flow consultada fixa a conta dona-antonia-1018. O Supabase tem dois registros de whatsapp_accounts, mas isso não significa que o gerenciador atual já ofereça configuração de Flow independente para os dois números. A tabela ops2_meta_whatsapp_flow_bindings_v1 existia sem vínculos preenchidos na consulta.

O Flow de cesta em [engine.mjs](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/supabase/functions/whatsapp-1018-basket-flow-v1/engine.mjs) é um canário protegido. Seu código demonstra alternativas, imagem, seleção de quantidade de 0 a 10 e recálculo por serviço. Ele consulta o serviço atual de cesta/estoque do Supabase. O comentário do runtime declara que ele não cria pedidos nem envia o resumo final ao WhatsApp. A tela de resumo existente também mostra preços unitários, então sua apresentação não atende ao formato pedido para o novo checkout.

O novo projeto deve tratar cada número por um vínculo explícito de conta, WABA, phone number, Flow ID, endpoint e chave pública. O mesmo desenho pode ser aplicado aos dois canais sem assumir que eles usam o mesmo WABA.

## 4. Pedidos, separação e integração com Bling

A interface operacional atual está em [08-orders-detail.part.js.txt](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/vitrine/admin/runtime-src/08-orders-detail.part.js.txt). O fluxo de separação também tem cliente próprio em [montar/app.js](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/montar/app.js). As ações de servidor ficam principalmente em [admin-products-live-v1](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/supabase/functions/admin-products-live-v1/index.ts), enquanto a integração/orquestração com o Bling está em [admin-service-intelligence-v1](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/supabase/functions/admin-service-intelligence-v1/index.ts).

A sequência implementada no Vitrine Admin é:

1. Pedido recebido e confirmado no serviço canônico.
2. Responsável atribuído à separação; cada item é marcado como separado ou faltante.
3. O servidor verifica versão do pedido e responsável para rejeitar alterações conflitantes.
4. Ao concluir, o backend calcula o resultado da separação, atualiza estoque/reservas e leva o pedido ao marco ready.
5. O backend confirma/sincroniza a venda com o Bling como Verificado e, conforme a configuração fiscal, tenta iniciar a NF-e. Há consulta, recuperação e ação humana de emissão com pré-validação.
6. A expedição exige NF-e autorizada; se o Bling for a autoridade de estoque, a baixa física é integrada antes da saída.
7. A conclusão da entrega registra forma e valor efetivamente recebidos; depois, o fluxo sincroniza o pedido como Atendido no Bling e registra atenção quando a integração falha.

Os principais contratos estão nas funções order_separation_get, order_separation_assign, order_separation_item_set, order_separation_complete, order_fiscal_status, order_fiscal_issue_v4, order_dispatch_start_v4 e order_delivery_complete_v3. A migration [orders_fiscal_flow_v4.sql](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/supabase/migrations/20261005010000_orders_fiscal_flow_v4.sql) descreve o fluxo canônico ready → NF-e autorizada → out_for_delivery → delivered com pagamento.

## 5. Compatibilidade que precisa ser resolvida antes do checkout

Não é seguro ligar o novo catálogo diretamente ao criador atual de pedidos. A função SQL create_canonical_cart_order_v2 encaminha para create_vitrine_cart_order_v1. Para linhas do tipo produto, o criador atual busca public.products por ID e usa preço/estoque desse catálogo. Para cestas, ele também consulta basket_templates, itens e lotes do Supabase.

O fluxo fiscal também não é totalmente independente do catálogo: o helper buildSnapshot de admin-products-live-v1 ignora linhas sem product_id e busca SKU/GTIN/nome em public.products. A coluna order_items.product_id é nullable no schema, mas isso não basta para que a separação e o Bling tratem uma linha sem referência local corretamente. O serviço fiscal resolve fontes canônicas específicas e ainda não declara a nova origem whatsapp_flow_github.

Há uma estrutura boa de rascunho/confirmação em [20260925_ops2_papoai_order_drafts_v2.sql](https://github.com/osvaldosereia/SUCEDOAN12/blob/main/supabase/sql/20260925_ops2_papoai_order_drafts_v2.sql): revisão, hash do resumo, expiração, mensagem enviada, confirmação e prevenção de duplicidade. No momento da leitura, papoai_order_drafts_v2 não tinha registros. A confirmação chama o criador canônico acima, portanto essa estrutura serve como referência, mas não está pronta para receber o novo catálogo sem um adaptador.

A primeira etapa de programação deve provar uma entrada de pedido por snapshot que mantenha GitHub como fonte de produto/preço e transporte os identificadores necessários para separação e Bling (SKU, GTIN e Bling product ID). Não se deve copiar a tabela de produtos para o Supabase ou fingir que o fluxo atual suporta esse contrato sem prova.

## 6. Limites desta pesquisa

- A leitura foi somente de código, metadados, schema e consultas de contagem/listagem de dados de cesta/produto.
- Nenhum registro individual de cliente foi lido.
- Nenhuma imagem foi baixada ou alterada.
- Nenhum arquivo de produto/cesta foi importado.
- Nenhum pedido foi escrito, alterado ou enviado ao Bling.
- Nenhuma chamada de envio, publicação ou configuração foi feita na Meta.
- O repositório é público; qualquer conteúdo versionado no branch, inclusive arquivos novos, pode ser lido publicamente.


## Decisão vigente após orientação do usuário — 25/10/2026

A pesquisa das telas, funções, tabelas e rotinas do Vitrine Admin serve somente para compreender as regras comerciais, o conjunto de produtos, os requisitos externos e os pontos de integração. O código novo não reutilizará nem copiará esses módulos, esquemas, RPCs, endpoints ou máquina de estados. O novo Admin, o runtime de Flow, o gestor de pedidos, o modelo de dados transacional e os conectores Meta/Bling serão implementados do zero. O cadastro de cliente existente permanece a única leitura Supabase explicitamente prevista; os pedidos usam modelo novo e isolado. A versão vigente do plano está em IMPLEMENTATION-PLAN-LUNA-MAX.md.
