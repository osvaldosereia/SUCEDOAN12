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

### Reconciliação das migrações

O Supabase tem 1.354 entradas no histórico aplicado e o GitHub, 75 arquivos. A comparação por versão, nome e SHA-256 associou 72 arquivos: 68 com SQL idêntico e 4 com texto diferente. Ficaram 3 arquivos do GitHub sem correspondência e 1.282 entradas no Supabase sem arquivo associado. Diferença textual pode ser formatação ou mudança de comportamento; a comparação não executa nem reaplica as migrações. As três migrações do checkout desta rodada têm versão e conteúdo idênticos nos dois lados.

Os quatro arquivos com texto diferente tratam da base de preço, automação do Instagram, exclusão de cliente e busca de produtos extras. Entre os três arquivos sem associação, o catálogo atual contém a busca de cliente por documento, a edição de cliente v3, a função de consentimento e as duas visões de estoque. A visão de lotes antigos já não existe. Esses fatos não comprovam que as versões antigas possam ser reaplicadas.

Para repetir a conferência, exporte o resultado da consulta abaixo como lista JSON fora do repositório e execute `node scripts/migration-inventory.mjs /caminho/inventario.json`. A consulta retorna somente nomes, versões e hashes.

~~~sql
select version, coalesce(name, '') as name,
  case when coalesce(cardinality(statements), 0) > 0 then
    encode(sha256(convert_to(btrim(replace(array_to_string(statements, E'\n'), E'\r\n', E'\n'), E' \t\n\r'), 'UTF8')), 'hex')
  end as digest
from supabase_migrations.schema_migrations
order by version;
~~~

### Critérios para liberar a homologação

1. Preparar a referência do esquema atual e validar sua restauração em um banco separado; manter o histórico antigo em produção.
2. Usar produtos, clientes e endereços fictícios. Desligar rotinas de publicação e reservar credenciais próprias para os testes de Bling e WhatsApp.
3. Registrar uma cesta de R$ 410,00 e conferir o mesmo valor na vitrine, no recibo, no Admin e no banco. Repetir com estoque insuficiente, desconto e alteração de preço antes da confirmação.
4. Criar e editar um cliente e dois endereços. Confirmar separação, retirada, entrega e acompanhamento. Conferir reenvio e prevenção de duplicação com serviços de teste.
