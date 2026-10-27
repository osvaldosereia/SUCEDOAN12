# Catálogo Dona Antônia

O catálogo público está em `/site/`; o painel administrativo fica em `/site/admin/`. A interface usa HTML, CSS e JavaScript nativos para reduzir dependências e carregar rapidamente em celulares. As cinco fotos quadradas recuperadas do histórico do GitHub ficam em `assets/cestas/`.

## Catálogo público

- Na abertura, carrega somente o nome e a foto de cada cesta. Busca preço, composição e disponibilidade quando a pessoa toca em **Ver Produtos** e busca as marcas/opções somente ao tocar em **Personalizar**. As imagens usam carregamento assíncrono e lazy loading nas cestas abaixo da primeira linha e nos produtos.
- A opção padrão configurada no admin é selecionada primeiro; se não estiver disponível, a loja escolhe a alternativa disponível mais barata.
- Exibe o preço configurado da cesta, sem mostrar valores individuais dos produtos.
- Busca o telefone no cadastro de clientes do Supabase pelo fluxo `customer_lookup` / `lookup_customer_by_phone`, com fallback para um único telefone principal ativo quando o cadastro antigo também associa o mesmo número a outro cliente.
- Ao confirmar, o navegador envia o pedido ao fluxo `submit_order`. A função registra o pedido para o Admin, reserva o estoque e inicia o envio de WhatsApp pelo fluxo servidor.
- A página não chama o Bling diretamente. O acesso privilegiado ao banco fica nas Edge Functions e não é enviado ao navegador.

## Administração

- O código temporário `Eomc2020` abre o painel. A validação também é feita pela Edge Function `site-admin-v1`.
- Em **Cestas**, o administrador adiciona e remove posições, define quantidades, busca e marca marcas/opções, escolhe o produto padrão e informa o preço final. O valor acompanha os preços dos produtos padrão e as quantidades, preservando o ajuste cadastrado para a cesta.
- Kits sem composição podem ser desativados para saírem da vitrine; o filtro **Inativas** permite reativá-los depois.
- Em **Produtos**, o administrador busca cadastros e edita campos comerciais, preços, estoque, categorias, descrições e flags. O seletor ao lado de cada produto ativa ou desativa o produto direto na lista; produtos não são apagados fisicamente.
- **Clientes** permanece em consulta somente leitura.
- As alterações administrativas são gravadas no Supabase por uma função servidor. A chave privilegiada não é enviada ao navegador. Nenhuma migração nem alteração estrutural foi feita no banco.

O código de acesso é provisório e ficará visível no código do site enquanto a autenticação definitiva não for implantada. Meta e Bling permanecem desconectados.
