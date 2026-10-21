# Prévia pública do catálogo Dona Antônia

Painel independente para consultar produtos e cestas disponíveis na vitrine. Não solicita senha e funciona em modo somente leitura.

## Arquitetura
- `index.html`: entrada estática em `/catalogo-admin/`.
- `src/public-api.js`: permite apenas consultas GET ao endpoint público `storefront-v2`, usando a chave publicável.
- `src/api.js`: adapta respostas públicas para a interface.
- `src/app.js`: navegação, busca, paginação e telas de consulta.
- `styles.css`: interface responsiva para celular e desktop.

A prévia não usa sessão administrativa, não chama gateways de escrita e não consulta dados internos do Bling. A lista reflete apenas itens que a vitrine já disponibiliza. Cadastro e edição precisarão de autenticação real no servidor.

## Bling
Status e reconciliação permanecem protegidos e não são consultados nesta prévia.
