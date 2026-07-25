# Estrutura do site público

Esta pasta reúne os arquivos compartilhados e a documentação da loja pública Dona Antônia.

## Estrutura ativa

- `app-next/`: aplicação modular usada pelo catálogo, carrinho e checkout.
- `site-public/assets/`: estilos e recursos compartilhados pelas páginas institucionais.
- `scripts/gerar-merchant.js`: gera o feed público `merchant.xml` a partir do Firebase.
- `scripts/gerar-sitemap.js`: gera `sitemap.xml` e `robots.txt`.

## Arquivos que permanecem na raiz de propósito

Os arquivos abaixo precisam conservar URLs públicas simples e estáveis. Eles não devem ser movidos sem redirecionamentos e revisão do Google Merchant Center/Search Console:

- `index.html`
- `CNAME`
- `robots.txt`
- `sitemap.xml`
- `merchant.xml`
- `sobre-nos.html`
- `contato.html`
- `politica-de-entrega.html`
- `politica-de-troca.html`
- `politica-de-privacidade.html`
- `termos-de-uso.html`

## Antes de excluir qualquer arquivo

1. Pesquise o nome e o caminho no repositório inteiro.
2. Verifique referências em HTML, JavaScript, CSS, JSON, workflows e automações externas.
3. Confirme se a URL não está cadastrada no Merchant Center, Search Console, Make, Firebase ou campanhas.
4. Remova primeiro a referência e publique.
5. Exclua o arquivo somente em uma segunda alteração, após validar produção.

## Regras de manutenção

- Não criar versões paralelas do `index.html` por workflow.
- Não duplicar CSS institucional dentro de cada página.
- Não salvar dados fictícios em páginas públicas.
- Manter políticas, feed, checkout e Merchant Center consistentes.
- Toda alteração pública deve passar pelo teste modular e pelo validador `scripts/check-public-site.mjs`.
