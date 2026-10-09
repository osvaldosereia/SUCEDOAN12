# R02–R10 — Cadeia integrada com comprovante SEFAZ e gate de expedição (laboratório)

**Data:** 09/10/2026 · **Projeto:** Dona Antônia · plano [#964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · base: [R02–R09 #1015](https://github.com/osvaldosereia/SUCEDOAN12/pull/1015).

## Integração realizada

Esta rodada estende o mesmo laboratório PostgreSQL 17 das etapas anteriores:

1. Checkout **original** de R02, com itens de cesta e molde fictícios, regras de mínimo e estoque.
2. Número público semanal R03, invariável do checkout à entrega.
3. Botão Meta e aprovação fictícios da R04/R05; separação não liberada sem confirmação.
4. Separação e falta efetivas no PostgreSQL com as RPCs R06 canônicas; cesta R$160→R$140 e despesas R$90, molde R$105→R$75.
5. Manifesto R06 exclusivo usado no adaptador e intents R07 originais; a cesta é `verified` (GET externo simulado) e o molde fica `uncertain`, sem segunda tentativa.
6. Validador R08 original permanece **bloqueado** até aprovação contábil real de NCM/CEST/CFOP/CST/CSOSN, regras MT e leitura Bling real.
7. R09 original observa apenas o pedido com Bling `verified`; dois trabalhadores concorrentes disputam exclusivamente uma tarefa `FOR UPDATE SKIP LOCKED`; cliente com Bling `uncertain` permanece bloqueado.
8. R10 original cria tabela de evidências e trigger de expedição **somente no banco descartável**. O recibo SEFAZ é um XML **sintético**, produzido em memória, com chave de 44 dígitos, protocolo e `cStat=100` válidos matematicamente; nenhum XML foi assinado, enviado ou autenticado pela SEFAZ. O teste exercita os mesmos RPCs SQL R10 e proíbe saída antes da evidência.

### Arquivos da rodada

- `scripts/sql/orders-r2-r10-genuine-dispatch-assertions.sql`: utiliza os verdadeiros UUIDs gerados pelo checkout R02 e verifica que a autorização registrada pela R10 sintética é associada ao pedido original de cesta, preservando número público semanal e R$90 de despesas comerciais. O pedido molde R07 incerto não gera outbox, não pode ser despachado e não pode reclamar uma geração fiscal.
- `scripts/test-orders-r2-r10-genuine-sefaz-proof.mjs`: invoca **o verificador R10 original** contra o pedido original e seu total final separado, mas com documento/protocolo **fictícios**. Valida código 100; rejeita 101/110/301/302/539, valor errado, chave adulterada, nota de outro pedido e nota apenas gerada.
- `.github/workflows/orders-r2-r7-bling-chain-ci.yml`: estendido para carregar a R10 original do **SHA fixo `a3e7975ba2bc8c3e8707abd12b15c3cae5163a11`**; mantém R02–R09 no mesmo banco, não cria um segundo emissor nem acessa serviços externos.
- A fixture `r10-source/scripts/sql/orders-r10-hml-fixture.sql`, as asserções R10 originais e o SQL `orders-r10-sefaz-authorization-gate-v1.sql` são usados diretamente da versão já programada na [PR #984](https://github.com/osvaldosereia/SUCEDOAN12/pull/984), **não reimplementados**.

## Critérios de conclusão técnica

- Cesta: R$160→R$140, original R03 igual ao recibo R06 e à nota simulada R10.
- O pedido de molde R07 `uncertain` não pode ser interpretado como venda confirmada para emitir nota, não recebe trabalho fiscal e continua bloqueado na expedição.
- Documento sintético com `cStat=100`, protocolo, chave e valor corretos permite atualizar controles fiscais **somente no banco de teste**. Prova diferente ou duplicada é recusada.
- Tentativa de emissão fiscal antes de atestado tributário R08 permanece **expressamente bloqueada** pela RPC `ops2_r10_claim_fiscal_generation_v1`.
- Não ocorre HTTP Bling, Meta, SEFAZ, cron, migration, deploy ou gravação no Supabase canônico.

## Pendências reais para implantação

O teste integrado não equivale à operação real. Ainda faltam aprovação formal das regras fiscais de **saída** (inclusive implicações IBS/CBS de 2026), cadastro e conversões tributárias, ligação ao Bling real, conferência da autorização SEFAZ e da cadeia XML em homologação, RLS/SQL/policies do clone Supabase, templates Meta aprovados, integração de motoristas, pagamentos e tela Admin.

O SQL R10 continua um **draft**, com feature flag desligada; **nenhum emissor de NF-e automático foi habilitado**. R10 não verifica criptograficamente XMLDSig por si só, apenas campos do protocolo e GET autenticado do provedor no desenho futuro.

A publicação em produção deverá passar por migrations oficiais, PRs encadeados revisados, E2E real com canário e rollback aprovado. Proibição de duplicar POST fiscal após timeout permanece.
