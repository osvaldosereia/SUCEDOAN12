# Resultados da homologação do index modular

Data do teste: 17 de julho de 2026.

## Segurança da mudança

- O `index.html` de produção não foi alterado.
- A página paralela usa `noindex, nofollow`.
- O verificador confirmou, byte a byte, o conteúdo e a ordem dos 9 blocos de CSS e dos 5 blocos de JavaScript extraídos.
- Todos os 5 arquivos JavaScript passaram na validação de sintaxe com `node --check`.
- Os 9 recursos da página paralela responderam com HTTP 200 no servidor local.

## Testes funcionais no navegador

- Página inicial e lista de produtos carregaram sem erros ou avisos no console.
- Busca por `arroz` retornou 7 produtos.
- Página do produto `Arroz Tio Bonini Unidade 5kg` abriu corretamente.
- Inclusão do produto na compra atualizou quantidade, subtotal e total.
- A gaveta da compra abriu com o item e o total corretos.
- As rotas de categorias e informações da loja carregaram corretamente.
- Em viewport móvel de 390 × 844 pixels, a página não apresentou rolagem horizontal; busca e navegação inferior permaneceram visíveis.

## Medidas dos arquivos

| Cenário | Tamanho bruto | Tamanho gzip estimado |
| --- | ---: | ---: |
| `index.html` atual | 517.615 bytes | 108.107 bytes |
| HTML modular | 13.486 bytes | 3.885 bytes |
| HTML modular + CSS + JavaScript | 518.023 bytes | 111.002 bytes |

O HTML inicial ficou 97,4% menor. Na primeira visita, a soma gzip estimada dos arquivos separados ficou cerca de 2,7% maior que o arquivo único, devido à perda de compressão compartilhada e às requisições adicionais. O benefício esperado aparece principalmente na manutenção e nas visitas seguintes, quando CSS e JavaScript podem ser reutilizados pelo cache sem baixar novamente todo o HTML.

## Decisão de publicação

Esta homologação não substitui o site principal. A troca do `index.html` deve acontecer em uma alteração futura e separada, somente após revisão visual e aprovação explícita.
