# Sala de Compra leve V2

## Objetivo
Transformar a compra em um chat visual compacto, mantendo Agent Core, Supabase, carrinho, cadastro, pagamento, localização e confirmação existentes.

## Jornada
1. WhatsApp abre a Sala com contexto do cliente/intenção.
2. Cestas em carrossel curto.
3. Cesta escolhida vira um bloco vertical único: foto, nome, valor, itens em linhas horizontais com quantidade e controles −/+.
4. Rodapé da cesta mostra o total atualizado e ações `Adicionar mais produtos` / `Finalizar pedido`.
5. Extras usam seleção de interesses, chips de categoria e carrossel horizontal paginado, em ordem alfabética e lazy loading.
6. Finalização aparece em bloco cinza separado e estreito: cadastro somente quando necessário, pagamento, endereço, localizador e confirmação.

## Regras de leveza
- HTML/CSS/JS sem framework.
- Imagens `loading=lazy`, `decoding=async`, `fetchPriority=low`.
- Produtos carregados em páginas de 12 conforme rolagem horizontal.
- Nenhum catálogo completo é enviado ao cliente.

## Segurança
`shopping-chat-products-v1` aceita somente origem Dona Antônia e token aleatório válido de uma sessão aberta. O endpoint só expõe catálogo fisicamente verificado, ativo, WhatsApp ativo e com estoque.
