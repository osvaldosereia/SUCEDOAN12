# Vitrine/Admin — navegação agrupada

Data: 2026-09-29

## Motivo
O menu horizontal do Vitrine/Admin passou a ter módulos suficientes para ultrapassar a largura disponível no desktop e no mobile, deixando itens à direita fora da área visível.

## Implementação
A navegação foi reorganizada em 5 grupos com submenus abertos por clique:

- **Operação:** Central, Pedidos, Separação, Expedição, Entregador, Fechamento.
- **Catálogo:** Produtos, Cestas, Validades.
- **Comercial:** Orçamentos, Clientes.
- **Estoque:** Compras/XML, Balanço, Gôndolas.
- **Sistema:** Mais.

## Comportamento
- submenu abre para baixo;
- grupo da tela atual fica destacado;
- submenu fecha após escolher uma tela;
- clique fora fecha o submenu;
- tecla Escape fecha o submenu;
- no mobile os grupos viram uma grade e o submenu abre abaixo de toda a barra, sem depender de rolagem horizontal;
- nenhum endpoint, tabela ou regra do Supabase foi alterado.

## Validação
Antes do commit, o JavaScript inline do Admin foi compilado estaticamente e foi validada a presença única das 15 rotas de navegação.

Commit principal: `5c9f7e1f01e20fdcff0daf4666b4eb81af9369ec`.
