# Site público Dona Antônia

Aplicação estática para pedidos em `/site/`, separada da interface administrativa.

## Organização

- `index.html`: estrutura sem conteúdo de catálogo embutido.
- `styles.css`: identidade visual, mobile-first, controles com alvos de toque amplos e suporte a movimento reduzido.
- `src/app.js`: telas, estado de sessão, interação e renderização segura de conteúdo.
- `src/api.js`: adaptador para a API pública existente `storefront-v2`.
- `src/cart.js`: apresentação ordenada do pedido e montagem do payload do checkout.
- `src/customer.js`: normalização do WhatsApp e resumo do endereço do cadastro; consulta e alteração usam `customer_lookup` e `customer_register` na API atual.
- `tests/`: testes da lógica de carrinho com Node.js nativo.

## Desempenho e confiabilidade

- Sem framework, dependências de runtime ou bundle obrigatório.
- Módulos ES carregados pelo navegador; cache local de cesta/carrinho com nova consulta dos dados atuais.
- Fotos sob demanda com `loading="lazy"` e `decoding="async"`.
- Timeout de rede, estado de erro compreensível e reenvio explícito.
- Conteúdo dinâmico escapado antes da renderização.
- O checkout envia o pedido à mesma função pública usada pela vitrine anterior; não processa pagamentos.

## Verificação

```sh
node --test site/tests/*.test.mjs
node --check site/src/app.js
node --check site/src/api.js
```
