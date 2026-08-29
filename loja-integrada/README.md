# CanecaFácil · Loja Integrada

Integração comercial do ecossistema de canecas com a Loja Integrada.

## Fonte de verdade

- **Admin Canecas / Firebase**: cadastro criativo da caneca, canais ativos, arte horizontal, mockups e metadados de sincronização.
- **Loja Integrada**: vitrine, carrinho, checkout, pagamento, clientes, pedidos e frete.
- **Make**: ponte segura entre Admin Canecas e API Loja Integrada. Credenciais nunca ficam no navegador ou neste repositório.
- **Caneca Print**: produção/impressão a partir da arte aprovada.

## Campos de canal no produto Firebase

- `ativo`: visibilidade/operação Dona Antônia.
- `loja_integrada_ativo`: publicação na Loja Integrada.
- `canecafacil_ativo`: espelho de compatibilidade para CanecaFácil.
- `loja_integrada_personalizavel`: informa se o modelo aceita personalização.
- `loja_integrada.produto_id`: ID do produto na Loja Integrada.
- `loja_integrada.seo_id`: ID de SEO.
- `loja_integrada.url`: URL comercial.
- `loja_integrada.sync_status`: `nao_publicado`, `pendente`, `enviando`, `sincronizado` ou `erro`.

## Personalizador

A página `personalizar/` recebe `?model=<firebaseKey>`, carrega o modelo do Firebase e chama o mesmo webhook Make usando `action: personalize_mug_model`.

Produtos marcados como personalizáveis recebem na descrição comercial um link com classe `cf-personalize-link` apontando para essa página.

O arquivo `personalizador-embed-v1.js` transforma esse link em modal/iframe quando a loja estiver usando um tema compatível com **Incluir código HTML/JavaScript**. No novo tema padrão da Loja Integrada, scripts de página de produto não podem ser instalados; nesse caso o link externo continua funcionando normalmente.

## Segurança

Nunca adicionar ao GitHub:

- Personal Token / Authorization da Loja Integrada;
- tokens GitHub;
- credenciais OpenAI;
- credenciais Bling ou transportadoras.

As credenciais da Loja Integrada ficam exclusivamente no cenário Make privado.
