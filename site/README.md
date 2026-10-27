# Catálogo Dona Antônia

O catálogo está em /site/ e não altera a página raiz do repositório. Ele usa HTML, CSS e JavaScript nativos, consulta somente o Edge Function storefront-v2 existente e inclui as cinco fotos quadradas recuperadas do histórico do próprio GitHub.

## Operação atual

- A vitrine lê as cinco cestas básicas no Supabase e busca os produtos mais baratos quando uma cesta é aberta. A página inicial carrega apenas os cinco resumos leves.
- O preço mostrado vem da cotação do molde da cesta; os preços individuais dos produtos não aparecem.
- A seleção inicial usa o produto disponível de menor preço em cada posição.
- A busca do checkout consulta o cadastro e o endereço existentes. O resumo do pedido é compartilhado pelo seletor nativo do celular ou copiado para a área de transferência.
- Meta/WhatsApp API, Bling e gravação de pedidos não são chamados.
- O admin abre com um código temporário e lista as composições e opções existentes no Supabase sob demanda. A consulta de clientes é somente leitura.
- O código é validado no JavaScript do navegador como acesso provisório; não substitui autenticação no servidor.
- Nenhuma tabela, configuração, cliente ou produto foi alterado no Supabase.

## Limite do admin de clientes

O endpoint antigo que oferecia customers e save_customer (admin-v3-api / customer-intelligence-v1) responde como aposentado no projeto ativo. Como esta entrega foi limitada ao GitHub e não deve alterar o Supabase, a tela permite consultar o cliente pelo telefone, mas mantém o salvamento desativado. A edição persistente precisa de uma função administrativa ativa e autorizada; não há chave privilegiada no código do navegador.

## Publicação

As imagens quadradas estão em `assets/cestas/`. Com a publicação estática do repositório, o caminho da loja é /site/ e o do admin é /site/admin/.
