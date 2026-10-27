# Catálogo Dona Antônia

O catálogo público está em `/site/`; o painel administrativo fica em `/site/admin/`. A interface usa HTML, CSS e JavaScript nativos para reduzir dependências e carregar rapidamente em celulares. As cinco fotos quadradas recuperadas do histórico do GitHub ficam em `assets/cestas/`.

## Catálogo público

- Carrega os resumos das cestas e busca as opções disponíveis quando uma cesta é aberta. A opção padrão configurada no admin é selecionada primeiro; se não estiver disponível, a loja escolhe a alternativa disponível mais barata.
- Exibe o preço configurado da cesta, sem mostrar valores individuais dos produtos.
- Consulta clientes e endereços existentes para o pedido. O resumo pode ser compartilhado pelo seletor do celular ou copiado.
- Não chama Meta/WhatsApp API, Bling nem grava pedidos.

## Administração

- O código temporário `Eomc2020` abre o painel. A validação também é feita pela Edge Function `site-admin-v1`.
- Em **Cestas**, o administrador adiciona e remove posições, define quantidades, busca e marca marcas/opções, escolhe o produto padrão e informa o preço final. O valor acompanha os preços dos produtos padrão e as quantidades, preservando o ajuste cadastrado para a cesta.
- Em **Produtos**, o administrador busca cadastros e edita campos comerciais, preços, estoque, categorias, descrições e flags. Produtos podem ser ativados e desativados; não são apagados fisicamente.
- **Clientes** permanece em consulta somente leitura.
- As alterações administrativas são gravadas no Supabase por uma função servidor. A chave privilegiada não é enviada ao navegador. Nenhuma migração nem alteração estrutural foi feita no banco.

O código de acesso é provisório e ficará visível no código do site enquanto a autenticação definitiva não for implantada. Meta e Bling permanecem desconectados.

