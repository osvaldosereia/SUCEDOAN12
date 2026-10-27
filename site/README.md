# Catálogo Dona Antônia

O catálogo está em /site/ e não altera a página raiz do repositório. Ele usa HTML, CSS e JavaScript nativos, consulta somente o Edge Function storefront-v2 existente e reaproveita as imagens de img/.

## Operação atual

- A vitrine lê as cinco cestas básicas e as composições ativas no Supabase existente.
- O preço mostrado vem da cotação do molde da cesta; os preços individuais dos produtos não aparecem.
- A seleção inicial usa o produto disponível de menor preço em cada posição.
- A busca do checkout consulta o cadastro e o endereço existentes. O resumo do pedido é compartilhado pelo seletor nativo do celular ou copiado para a área de transferência.
- Meta/WhatsApp API, Bling e gravação de pedidos não são chamados.
- O admin autentica pela conta Supabase existente e usa o endpoint autenticado de moldes para validar o acesso. A consulta de clientes é somente leitura.

## Limite do admin de clientes

O endpoint antigo que oferecia customers e save_customer (admin-v3-api / customer-intelligence-v1) responde como aposentado no projeto ativo. Como esta entrega foi limitada ao GitHub e não deve alterar o Supabase, a tela permite consultar o cliente pelo telefone, mas mantém o salvamento desativado. A edição persistente precisa de uma função administrativa ativa e autorizada; não há chave privilegiada no código do navegador.

## Publicação

Os arquivos usam os recursos existentes em img/. Com a publicação estática do repositório, o caminho da loja é /site/ e o do admin é /site/admin/.

