# Sucedona12 · Vitrine Admin

Painel operacional simples para atendimento, pedidos, catálogo, clientes e orçamentos. O backend Supabase é mantido em supabase/.

## Áreas do Admin

- **Atendimento:** conversas dos números 0975 e 1018; texto, áudio, imagem e vídeo.
- **Pedidos:** fluxo operacional e fiscal mantido.
- **Produtos e Cestas:** cadastro de produtos e montagem de cestas com custo interno e preço de venda.
- **Clientes:** cadastrar e editar.
- **ANA:** gestão de comportamento, conhecimento, automações, testes e histórico.
- **Orçamentos:** aplicação integrada ao Supabase e ao Bling.
- **Bling técnico:** diagnósticos das conexões Bling, Meta e Supabase.

A abertura do sistema direciona para Atendimento. Os fluxos de pedido, montagem, orçamento e link público do pedido permanecem disponíveis.

## Runtime do Admin

O JavaScript de operação é gerado de arquivos menores em vitrine/admin/runtime-src/:

    node scripts/build-vitrine-admin-runtime.mjs
    node scripts/build-vitrine-admin-runtime.mjs --check

Os testes de contrato e escopo ficam em scripts/. Nenhum valor de token ou chave deve ser escrito em documentação ou no código-fonte.
