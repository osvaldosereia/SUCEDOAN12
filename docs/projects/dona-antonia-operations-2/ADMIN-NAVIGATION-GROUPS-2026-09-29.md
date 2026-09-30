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


## Revisão mobile V6.1
Commit: `74f8ca1df65b843ce3d19a173e895a6e55d47282`.

A navegação móvel recebeu uma segunda revisão específica:
- topbar ficou mais baixa e sem a linha separada de "Abrir vitrine";
- o atalho "Abrir vitrine" foi movido para **Sistema** no celular;
- os 5 grupos principais ocupam uma grade compacta de 3 colunas, sem rolagem horizontal;
- em telas muito estreitas, os rótulos reduzem de forma controlada sem se sobrepor;
- os submenus abrem em painel largo abaixo da navegação, com alvos de toque de 46 px;
- telas até 360 px usam submenu de uma coluna;
- foram adicionadas proteções contra overflow horizontal em painéis, formulários, cabeçalhos e imagens;
- o JavaScript inline foi novamente validado antes do commit.

Nenhuma regra de negócio, endpoint ou tabela do Supabase foi alterada nesta revisão.
