# Integração R02–R07 — do checkout original ao contrato Bling de itens separados

**Data:** 09/10/2026 · **Plano-mestre:** [Issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964). Base: [PR #1006 — R02–R06](https://github.com/osvaldosereia/SUCEDOAN12/pull/1006). Nenhum merge nem migração de produção.

## CI executado
[**GitHub Actions #37942451935 — SUCCESS**](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37942451935), Node 22 + PostgreSQL 17 efêmero. Executa o checkout canônico R02, os SQL originais de R03/R04/R05, a correção *draft* da brecha de `pending`, as RPCs verdadeiras de preparação/estoque R06, e **o contrato R07 original** `ops2_claim_bling_r7_sync_v1` / `ops2_finish_bling_r7_sync_v1`, carregados do commit fixo `1ab1d7e469ed17abbd1fe6dc92b08fea822e24a2`.

## O que mudou em relação aos testes anteriores

Anteriormente os testes isolados R07 usavam recibos sintéticos preparados manualmente. Agora o fluxo exporta os **recibos R06 realmente registrados após o checkout** para um arquivo NDJSON no runner. O código `scripts/test-orders-r2-r7-genuine-manifest-adapter.mjs` importa o adaptador R07 original `buildReconciledBlingSnapshot`, sem reescrever a integração. Para cada manifesto, confere produtos entregáveis, preço e quantidade, total comercial, diferença fiscal/serviços e número público R03. Calcula SHA-256 de payload real, compara replay com ordem estável de chaves e rejeita manifesto alterado. O hash computado é transferido para o PostgreSQL e usado nas **RPCs originais de claim/finish**.

### Dados fictícios da integração
- **Cesta com kits:** checkout R$160, falta higiene R$20, final **R$140**. Venda Bling simulada contém apenas **alimento R$50**; `commercial_delta` de **R$90**, preservando as outras despesas e evitando cobrar novamente o cartão visual da cesta. Nenhuma linha FALTOU entra na projeção.
- **Cesta molde:** checkout R$105, falta item de R$30, final **R$75**. Venda contém apenas **produto de R$60** e diferença comercial **R$15**. O pedido público semanal permanece idêntico.
- **Idempotência:** claim de pedido `processing` impede segunda gravação, hash diferente é bloqueado, `verified` exige um ID Bling (fictício neste teste), replay `verified` retorna `already_verified`. Para `uncertain`, repetição da chamada de claim não autoriza novo POST/PUT; deve haver GET remoto.
- **Privacidade e autorização:** tabela de intents com RLS, sem `SELECT` por `anon`; RPC de claim somente `service_role` no laboratório.

## Arquivos novos
- `.github/workflows/orders-r2-r7-bling-chain-ci.yml`: reaproveita toda a sequência anterior e adiciona consulta/exportação do recibo e Node 22, além do SQL da R07 original.
- `scripts/test-orders-r2-r7-genuine-manifest-adapter.mjs`: transformação dos recibos reais do teste em payload financeiro Bling e impressão somente de informações fictícias.
- `scripts/sql/orders-r2-r7-verified-intents-assertions.sql`: testes de claims, replay, estados incertos e bloqueio de alteração retroativa de valor.
- Este relatório.

O primeiro CI [#37942282471](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37942282471) identificou somente variável `total` ambígua na asserção PL/pgSQL; foi corrigida com `v_order_total` e a suíte passou no run #37942451935. A **integração R02–R06 com Meta pending corrigido** já passou no [run #37941479261](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37941479261).

## Limites / bloqueios para produção

1. Este CI **não contata o Bling**, nem comprova criação da venda ou verificação remota. Os IDs Bling usados pela SQL são explícita e exclusivamente fictícios.
2. As funções Meta R04/R05 usam botões fictícios registrados como assinados; webhook real, aprovação do template em 0975/1018 e autenticação Meta permanecem pendentes.
3. As funções R06/R07 e os gates SQL de R05 são apenas **drafts importados para testes**, sem migrations aplicadas ao Supabase produtivo. O R06 final precisa revisão de locks/estoque, saldo virtual do Bling e RLS com triggers reais.
4. O valor comercial `commercial_delta` deve ser interpretado pelo Bling com tributação aprovada (R08). Não inventar NF-e para confirmar essa diferença comercial. R08–R10 ainda não foram homologados junto à cadeia, e o claim fiscal fica bloqueado enquanto faltar aprovação de CFOP/CST/CSOSN, NCM/CEST e comprovante SEFAZ.
5. Ainda não foram testadas contas Meta reais, vários operadores concorrentes do Admin, rotas/expedição, notas fiscais reais, estados de indisponibilidade do Bling ou publicação. Nenhum dado de cliente, estoque, venda Bling, NF-e, WhatsApp ou saldo financeiro real foi modificado.

**Próxima rodada:** encadear R08–R10 com esta base e testar a recusa de emitir/expedir enquanto faltar tributo aprovado e XML de autorização SEFAZ. Planejar a consolidação das PRs/migrations com os bloqueios preservados.
