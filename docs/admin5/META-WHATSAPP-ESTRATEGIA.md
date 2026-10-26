# Admin5 — estratégia de catálogo e atendimento WhatsApp

**Snapshot:** 2026-10-26  
**Projeto Supabase canônico:** `Dona Antônia` (`ssbesxgaijknwsjbsbcz`)

## Pesquisa oficial da Meta

### Catálogo e mensagens

- O catálogo Commerce deve ser carregado por feed ou pela API Commerce e conectado à conta WhatsApp Business. A Meta descreve catálogo, mensagens de catálogo e mensagens de múltiplos produtos como partes complementares da experiência.
- Uma mensagem de catálogo abre o catálogo completo. Uma mensagem de múltiplos produtos mostra até 30 produtos em seções; por isso ela funciona melhor para seleções por categoria e campanhas curadas do que como substituto de um catálogo com centenas de itens.
- Mensagens interativas em lista aceitam até 10 linhas no total. As oito seções pedidas cabem no primeiro menu: Cestas Básicas, Mercearia, Limpeza, Lavanderia, Higiene, Beleza, Casa e Pet.
- Ao tocar e enviar um carrinho do catálogo, o WhatsApp pode gerar um evento de pedido no webhook. O sistema deve cruzar cada `product_retailer_id` com o ID estável exportado pela Dona Antônia.
- Fora da janela de atendimento ao cliente, mensagens iniciadas pela empresa exigem template aprovado. Mensagens livres, listas e interações devem respeitar a janela indicada pelo backend.

### WhatsApp Flows

- Um Flow pode coletar dados estruturados dentro do WhatsApp depois que o cliente escolhe os produtos.
- Flows dinâmicos usam endpoint de troca de dados com payload criptografado e par de chaves da empresa. O endpoint tem prazo curto; a documentação oficial alerta para timeout de 10 segundos.
- A ordem recomendada é catálogo/carrinho → validar produto, preço e saldo no Supabase → Flow para entrega e pagamento → resumo → confirmação humana → pedido canônico. Um formulário Flow não substitui a checagem de estoque nem a confirmação do pedido.

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
- [Meta — Flows best practices](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/bestpractices)
- [Meta — Product catalog data specifications](https://www.facebook.com/business/help/120325381656392)
- [Meta — Product Catalog Items Batch](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/items_batch)
- [Meta — Catalog Batch API](https://developers.facebook.com/documentation/ads-commerce/catalog/guides/manage-catalog-items/catalog-batch-api)

## Estratégia de programação

### Rodada 1 — Admin5 sem novo backend

- Reutilizar o chat canônico e a sessão atual, com filas dos dois canais e somente texto no composer.
- Reutilizar Produtos, Cestas e Pedidos existentes; limitar a tela de produtos a busca, status e preço.
- Criar o painel de catálogo que lê só `products.is_active = true`, atribui uma das oito seções e mostra pendências.
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

### Classificação atual

Os campos existentes não correspondem diretamente às oito seções solicitadas. A taxonomia agrupa Limpeza com Lavanderia, Higiene com Beleza e Casa com Pet; 23 ativos não têm `whatsapp_category`. O campo de subcategoria tem 94 itens em Lavanderia, 83 em Limpeza/Limpeza da Casa, 26 em Higiene Pessoal, 158 em Alimentos/Bebidas/Mercearia e poucos em Casa e Utilidades. O resto exige regra explícita ou revisão humana.

Regras sugeridas para classificação inicial:

- **MERCEARIA:** Alimentos, Bebidas e Mercearia.
- **LIMPEZA:** Limpeza da Casa e Limpeza.
- **LAVANDERIA:** Lavanderia, Amaciantes, Sabão em Pó e equivalentes.
- **HIGIENE:** Higiene Pessoal, higiene bucal, sabonetes, papel e fraldas.
- **BELEZA:** cabelo, maquiagem, esmaltes, perfumes e tratamento capilar; separar por nome/subcategoria.
- **CASA:** Casa e Utilidades, Cozinha e utilidades domésticas.
- **PET:** ração e produtos claramente identificados para cães/gatos.
- **CESTAS BÁSICAS:** variantes comerciais das cestas, após confirmar produtos, preço e identificador de cada composição.

Toda regra de texto é sugestão, não confirmação. O operador deve resolver itens ambíguos antes da primeira publicação.

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
