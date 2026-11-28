# Estabilidade do site e do Admin

Revisão de 28/11/2026, horário de Cuiabá.

## Fluxos em uso

| Fluxo | Entrada e código | Verificação |
| --- | --- | --- |
| Cestas, ofertas e produtos | `site/index.html`, `site/app.js`, `site/storefront/basket.js`, `experimento-extras.js`, `storefront-v2` | Cinco cestas com o preço configurado, abatimento de variante indisponível e vigência da oferta. Prévia e revisão do pedido conferidas na vitrine. |
| Carrinho, cadastro e checkout | `site/storefront/checkout.js`, `storefront-v2`, `create_vitrine_cart_order_v3` | Cesta em prévia não entra na sacola. O servidor exige o total revisado, uma data disponível e as quantidades solicitadas. Mudança de preço exige nova confirmação. |
| Produtos, estoque, cestas, clientes e endereços | `site/admin/index.html`, `admin.js`, `catalog-admin.js`, `baskets-admin.js`, `site-admin-v1`, `admin-products-live-v1` | Contratos da grade e de cadastro validados com dados fictícios. Conferência de estoque e quantidades configuradas em leitura. |
| Pedidos, separação e acompanhamento | `site/admin/orders-admin.js`, `admin-orders-v1`, `order-separation-notify-v1`, `order-public-view-v1` | Testes de separação e conferência do código publicado. |
| Entrega | `site/admin/delivery-admin.js`, `delivery-ops-v1` | Data local, atribuição, roteamento, pagamento adiantado e ações de parada cobertos pelos testes. O URL anterior redireciona para o Admin. |
| Editor do WhatsApp | `site/admin/whatsapp-admin-fixed.js`, `whatsapp-template-button-support.js`, `admin-whatsapp-templates-v1` | Links públicos usam exemplos de 16 caracteres e os modelos antigos continuam aceitando os exemplos de 64. |

## Cálculo e gravação do pedido

A base de uma cesta usa a quantidade configurada de cada variante. O banco aplica a diferença entre essa composição e a seleção. As ofertas por rotação só valem dentro de sua janela. A API pública exige o total apresentado e o Postgres o confere antes de registrar o pedido. Se a reserva encontra itens indisponíveis durante a transação, a gravação é revertida. A data também é revalidada na confirmação.

## Código retirado e compatibilidade

- Duas cópias byte a byte idênticas do editor do WhatsApp não tinham mais carregamento no Admin. A página mantém uma entrada.
- A interface separada do entregador foi aposentada no commit `0795b439`. Seu JavaScript e CSS foram retirados. O endereço que redireciona para Entregas continua disponível.
- Foram retirados o módulo de leitura leve e a reconstrução automática de cestas no envio. O checkout encaminha a seleção revisada ou pede que o cliente confira a versão atual.
- `experimento-extras.js` é usado pela vitrine principal. `extras.js` ainda atende `versao-anterior.html`. Os endereços de compatibilidade e o outro build em `/site2/` foram preservados porque podem ter acessos diretos externos.

## Publicação e homologação

Rode `node --test` com Node.js 24 antes de publicar. Os testes simulam as fronteiras com o banco e com as integrações. A verificação desta rodada consultou as funções publicadas e exercitou o cálculo do Postgres sem registrar pedidos reais. A criação de cadastro e endereço no Admin foi verificada por contrato com dados de teste. O pedido de ponta a ponta em homologação, incluindo notificações e Bling, ainda depende de um ambiente separado.

O inventário encontrou 1.354 versões no histórico aplicado do Supabase e 75 arquivos versionados no GitHub, com 37 identificadores de versão em comum. Algumas migrações foram registradas com identificadores diferentes. Antes de usar esse histórico para recriar o banco, conferir as equivalências por nome e conteúdo, preparar uma referência de esquema e validar a restauração longe da produção. As novas migrações desta rodada já usam o mesmo identificador no banco e no GitHub.
