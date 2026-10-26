# Admin5 — estratégia de catálogo e atendimento WhatsApp

**Snapshot:** 2026-10-26  
**Projeto Supabase canônico:** `Dona Antônia` (`ssbesxgaijknwsjbsbcz`)

## Pesquisa oficial da Meta

### Catálogo e mensagens

- O catálogo Commerce deve ser carregado por feed ou pela API Commerce e conectado à conta WhatsApp Business. A Meta descreve catálogo, mensagens de catálogo e mensagens de múltiplos produtos como partes complementares da experiência.
- Uma mensagem de catálogo abre o catálogo completo. Uma mensagem de múltiplos produtos mostra até 30 produtos em seções; por isso ela funciona melhor para seleções por categoria e campanhas curadas do que como substituto de um catálogo com centenas de itens.
- Mensagens interativas em lista aceitam até 10 linhas no total. As oito seções pedidas cabem no primeiro menu: Cestas Básicas, Mercearia, Limpeza, Lavanderia, Higiene, Beleza, Casa e Pet.
- A Central de Ajuda do WhatsApp diz que cada item do catálogo precisa de título único, imagem e país de origem; link de site aparece como informação opcional nesse fluxo. O mapeamento do Commerce API/feed ainda deve ser confirmado separadamente antes de exportar ou sincronizar.
- Ao tocar e enviar um carrinho do catálogo, o WhatsApp pode gerar um evento de pedido no webhook. O sistema deve cruzar cada `product_retailer_id` com o ID estável exportado pela Dona Antônia.
- Fora da janela de atendimento ao cliente, mensagens iniciadas pela empresa exigem template aprovado. Mensagens livres, listas e interações devem respeitar a janela indicada pelo backend.

### WhatsApp Flows

- Há uma jornada de cesta personalizada já aprovada para prototipação: selecionar tamanho e preço inicial; escolher o arroz primeiro; depois percorrer um tipo de produto por etapa com foto, preço unitário e quantidade; atualizar o total e fechar com resumo. A solicitação deve virar rascunho sujeito à confirmação humana.
- A Meta oferece componentes próprios de Flow e um componente de carrossel de imagens. O Flow não deve ser tratado como uma página web customizável; antes de fechar a interface, validar no Flow Builder se o desenho de múltiplas opções com quantidades por produto cabe nos componentes e limites vigentes. Se não couber com clareza, usar catálogo/carrinho nativo para escolher itens e Flow para endereço/entrega.
- Para compra de produtos avulsos, o catálogo com carrinho nativo é o caminho principal: o cliente visualiza e escolhe produtos, e o Flow pode complementar com dados estruturados de entrega/pagamento.
- Flows dinâmicos usam endpoint de troca de dados com payload criptografado e par de chaves da empresa. O endpoint tem prazo curto; a documentação oficial alerta para timeout de 10 segundos.
- A ordem recomendada é menu/lista → catálogo/carrinho ou Flow de cesta → validar produto, preço e saldo no Supabase → Flow para dados de entrega/pagamento quando necessário → resumo → confirmação humana → pedido canônico. O Flow não substitui a checagem de estoque nem a confirmação do pedido.

### Custos e janela de atendimento

- A janela de atendimento continua determinando quando o atendente pode enviar mensagem livre; fora dela, a empresa precisa usar template aprovado.
- A página de preços da Meta registra cobrança por mensagem para mensagens de serviço a partir de 1º de outubro de 2026. Portanto, o atendimento de texto pelo Admin5 não deve ser tratado como custo zero; confirmar a tabela vigente por mercado e a configuração de cada WABA antes de projetar volume.

### Catálogo por dois canais

O banco tem dois números ativos (0975 e 1018), ligados a WABAs diferentes. Antes de sincronizar, consultar a associação de catálogo e testar leitura para cada WABA. O mesmo snapshot de produtos pode alimentar ambos, mas o vínculo e o estado de aprovação precisam ser verificados separadamente.

### Fontes oficiais

- [Meta — Catalogs overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/catalogs-overview/)
- [Meta — Catalog messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/catalog-messages/)
- [Meta — Multi-product messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/multi-product-messages/)
- [Meta — Interactive list messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages)
- [Meta — Order message webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/order)
- [Meta — Share products with WhatsApp users](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/share-products)
- [Meta — Flows endpoint implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint)
- [Meta — Flow components](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components)
- [Meta — Flow components changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/changelogs)
- [Meta — Flows best practices](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/bestpractices)
- [Meta — Pricing updates for service messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages)
- [WhatsApp — About catalog](https://faq.whatsapp.com/405903568419894)
- [Meta — Product catalog data specifications](https://www.facebook.com/business/help/120325381656392)
- [Meta — Product Catalog Items Batch](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/items_batch)
- [Meta — Catalog Batch API](https://developers.facebook.com/documentation/ads-commerce/catalog/guides/manage-catalog-items/catalog-batch-api)

## Estratégia de programação

### Rodada 1 — Admin5 sem novo backend

- Reutilizar o chat canônico e a sessão atual, com filas dos dois canais e somente texto no composer.
- Reutilizar Produtos, Cestas e Pedidos existentes; limitar a tela de produtos a busca, status e preço.
- Criar o painel de catálogo que lê só `products.is_active = true`, atribui uma das oito seções e mostra pendências.
- Baixar um CSV interno para revisão dos produtos ativos, com seção sugerida e campos incompletos; o arquivo não é feed de importação Meta.
- Manter qualquer chamada que altere catálogo da Meta desabilitada nesta rodada.

### Rodada 2 — saneamento e mapeamento

- Corrigir ativos sem preço/imagem e revisar nome, marca e disponibilidade.
- Revisar produtos classificados em grupos combinados ou ambíguos.
- Criar persistência compartilhada para as correções de seção; nesta versão as correções ficam no navegador do operador.
- Definir como as cestas com variantes de arroz e preços diferentes serão representadas como itens únicos da Meta.

### Rodada 3 — sincronização Meta

- Obter, sem imprimir token, os catálogos conectados aos dois WABAs e verificar as permissões do token server-side.
- Implementar sincronização em Edge Function autenticada; navegador nunca chama Graph API com token.
- Criar prévia de inclusões, atualizações e remoções. Remoção deve ser explícita; filtro de ativos por si só não pode apagar registros sem revisão.
- Usar IDs estáveis derivados do UUID/SKU; nunca gerar IDs diferentes a cada exportação.
- Rodar primeiro um lote canário e comparar o resultado remoto com o snapshot aprovado.

### Rodada 4 — pedido nativo e Flow

- Receber o webhook de pedido do catálogo e gravar um rascunho no pedido/conversa existentes.
- Revalidar ativo, preço e saldo no banco, sem confiar no preço contido no evento de catálogo.
- Usar Flow para endereço, dia de entrega e pagamento. A confirmação do Flow gera rascunho revisável, não pedido confirmado automaticamente.
- Aproveitar os endpoints de Flow já implantados; revisar seu estado atual antes de criar qualquer função nova.

## Dados encontrados

### Produtos ativos

Consulta feita no banco canônico em 2026-10-26:

| Verificação | Ativos |
| --- | ---: |
| Total `is_active = true` | 388 |
| Sem nome | 0 |
| Sem preço positivo | 42 |
| Sem imagem | 49 |
| Sem marca | 60 |
| Sem descrição curta/longa | 209 |
| Nome + preço + imagem preenchidos | 331 |
| Sem GTIN | 2 |

Os valores de falta se sobrepõem. Não devem ser somados para estimar o total pendente. Cinco ativos têm estoque bruto zero; para disponibilidade Meta, usar a fonte de saldo vendável oficial, não o campo bruto isolado.
O schema de `products` não tem uma coluna dedicada a país de origem. Como a Central de Ajuda do WhatsApp pede país de origem por item, a prévia marca essa informação como pendente até localizar uma fonte confiável ou cadastrá-la; não vou presumir que todos os produtos sejam de origem brasileira.

### Classificação atual

Os campos existentes não correspondem diretamente às oito seções solicitadas. A taxonomia combina Limpeza/Lavanderia e Higiene/Beleza, e 23 ativos não têm `whatsapp_category`. A auditoria das subcategorias permite organizar os 388 produtos ativos sem deixar item sem seção; a distribuição calculada ficou assim:

| Seção | Produtos ativos |
| --- | ---: |
| MERCEARIA | 182 |
| LIMPEZA | 83 |
| LAVANDERIA | 94 |
| HIGIENE | 26 |
| BELEZA | 0 |
| CASA | 3 |
| PET | 0 |

As cinco cestas ativas para WhatsApp são listadas separadamente em CESTAS BÁSICAS. Beleza e Pet permanecem visíveis, mesmo vazias, para receber futuros ativos. A regra usa primeiro sinais de uso do produto e subcategorias mantidas no cadastro; depois separa os grupos combinados. Isso evita tratar “perfume” de amaciante/limpador como Beleza ou “PET” no material da embalagem de óleo como produto Pet. O operador ainda pode corrigir a seção na tela antes de qualquer publicação.

Regras sugeridas para classificação inicial:

- **MERCEARIA:** Alimentos, Bebidas e Mercearia.
- **LIMPEZA:** Limpeza da Casa e Limpeza.
- **LAVANDERIA:** Lavanderia, Amaciantes, Sabão em Pó e equivalentes.
- **HIGIENE:** Higiene Pessoal, higiene bucal, sabonetes, papel e fraldas.
- **BELEZA:** cabelo, maquiagem, esmaltes, perfumes corporais, hidratantes e protetor solar; separar por nome e contexto da subcategoria, sem usar palavras ambíguas como “perfume” isoladamente.
- **CASA:** Casa e Utilidades, Cozinha e utilidades domésticas.
- **PET:** ração e produtos claramente identificados para cães/gatos.
- **CESTAS BÁSICAS:** variantes comerciais das cestas, após confirmar produtos, preço e identificador de cada composição.

O snapshot atual recebeu uma seção sugerida para cada produto ativo. A classificação é editável e ainda precisa de revisão humana antes da primeira publicação.

Na revisão desta rodada, a regra anterior desviava oito produtos de Limpeza/Lavanderia para Beleza por causa da palavra “perfume” e um óleo de soja para Pet por causa de “PET” na embalagem. A classificação agora usa o contexto da subcategoria e palavras de uso mais específicas. A nova auditoria dos 388 ativos resultou na distribuição acima, sem itens sem seção. Não houve alteração nos produtos no Supabase.

### Cestas

O banco atual tem cinco cestas ativas para WhatsApp e um kit de limpeza fora da publicação de WhatsApp. As cinco cestas têm preços-base salvos como R$ 92, R$ 175, R$ 230, R$ 340 e R$ 410. Eles diferem dos preços aprovados mais recentemente na conversa, que também variam pela marca do arroz. Por isso, as cestas aparecem no Admin5 para revisão, mas não são incluídas em qualquer arquivo de publicação nesta versão.

## Escolhas entre recursos Meta

| Recurso | Uso recomendado |
| --- | --- |
| Catálogo completo | Cliente abre e procura os produtos disponíveis no WhatsApp. |
| Lista interativa | Menu inicial com as oito seções e escolhas rápidas de atendimento. |
| Múltiplos produtos | Seleção curada de até 30 itens de uma seção; paginar ou oferecer “ver mais”. |
| Pedido de catálogo | Receber a seleção do cliente como rascunho reconciliável no Supabase. |
| WhatsApp Flow | Coletar entrega/pagamento depois de validar o carrinho; manter resumo e confirmação humana. |
| Template aprovado | Reabrir conversa quando a janela de serviço estiver encerrada. |

## Critérios antes de ligar atualização remota

1. O catálogo correto foi identificado para cada WABA.
2. A Meta aceitou um canário e os IDs de produto ficaram estáveis.
3. Produtos inativos não aparecem no feed; ativos incompletos aparecem na fila de pendência.
4. A diferença entre snapshot e catálogo remoto pode ser revisada antes de aplicar.
5. Um pedido recebido volta ao produto correto e usa preço/saldo atuais.
6. O fluxo tem rollback por WABA e não muda o checkout, pedidos ou Bling sem homologação própria.
