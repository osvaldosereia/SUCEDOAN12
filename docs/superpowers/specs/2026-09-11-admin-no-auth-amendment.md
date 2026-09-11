# Emenda — Admin sem autenticação

Data: 2026-09-11

O usuário confirmou explicitamente que o Admin deve abrir diretamente, sem senha, PIN, autorização de aparelho, sessão protegida ou login.

Requisitos:

- remover `accessNotice` e qualquer link para `setup-admin` do fluxo oficial;
- remover dependência de `da_admin_v3_auth`, `access_token`, `refresh_token` e refresh de sessão do Admin;
- o endpoint oficial do Admin passa a ser público (`verify_jwt=false`);
- manter `service_role` somente no servidor/Edge Function, nunca no navegador;
- o Admin oficial terá somente Produtos, Cestas básicas e Clientes;
- qualquer pessoa com o URL do Admin poderá acessá-lo e editar dados; esta exposição foi aceita explicitamente pelo usuário.
