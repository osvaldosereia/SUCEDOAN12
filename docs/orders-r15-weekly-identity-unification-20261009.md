# R15 — Consolidação da identidade semanal entre R02–R03 e R14

**Projeto:** Dona Antônia · **Data:** 09/10/2026 · **PR draft:** [#1032](https://github.com/osvaldosereia/SUCEDOAN12/pull/1032) · **Plano:** [issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964).

## Origem do conflito

R02 (checkout real e cestas) ficou integrada à antiga cadeia R02–R14, por fim representada no [PR #1029](https://github.com/osvaldosereia/SUCEDOAN12/pull/1029). Já a [R02+R03 #1026](https://github.com/osvaldosereia/SUCEDOAN12/pull/1026) manteve um histórico paralelo de correções da numeração semanal.

O arquivo **com o mesmo nome de migration e mesma versão `20261008032000`** tinha dois corpos distintos:

| Cadeia | Conteúdo | Risco |
|---|---|---|
| R02–R14 antes da R15 | `ops2_next_order_public_code_4d_v1`, número de 4 dígitos | Retorna ao formato antigo, divergindo da orientação vigente |
| R02+R03 #1026 | `ops2_next_order_public_code_weekly_v1`, `DD|MM|YYYY - NNN` em `America/Cuiaba` | Formato correto, mas fora da cadeia final |

Além da migration, seis consumidores da cadeia R14 limitavam ou rejeitavam o código semanal:

- `montar/app.js` tinha validação `AA001` / `1234`;
- `vitrine/admin/index.html` rejeitava código com data;
- `admin-orders-v1` rejeitava o identificador longo enviado via Meta;
- `admin-order-vitrine-send-v1` usava corte em 5 caracteres;
- `order-separation-notify-v1` usava corte em 5 caracteres;
- `admin-products-live-v1` truncava o código público na consulta ao snapshot.

**Supabase de produção foi consultado somente por SELECT**: não há linha para `version='20261008032000'` em `supabase_migrations.schema_migrations` no momento da auditoria. Não se deduz daí que o restante das 1.186 migrations remotas coincida com o checkout local; jamais executar `db push` global.

## Implementado nesta branch

1. Substituído somente o arquivo de migration `supabase/migrations/20261008032000_order_public_identity_at_creation_v1.sql`, ainda não aplicado, pelo código revisto da R03 #1026, que gera o identificador semanal no `INSERT`, protege a imutabilidade e mantém os padrões históricos válidos para consulta. **Nenhuma migração foi executada remotamente.**
2. Portadas precisamente as **7–11 linhas de código** pertinentes aos seis consumidores (mudanças cirúrgicas, não substituição por versões antigas dos arquivos enormes), preservando os recursos de R04–R14 presentes em `admin-products-live-v1` e na tela Admin.
3. `scripts/test-orders-r15-weekly-unification-v1.mjs`: valida migration semanal em vez de gerador de 4 dígitos, formatos completos nos seis consumidores, preservação de compatibilidade legada, snapshot/checkout e gate R14 ainda **BLOCKED**.
4. Workflow integrado `.github/workflows/orders-r2-r7-bling-chain-ci.yml` e laboratório R02 `.github/workflows/orders-r2-isolated-hml-ci.yml` usam **a migration LOCAL da branch** na fase R03. O arquivo que seria publicado não pode ser substituído silenciosamente por uma cópia fixa de outra branch durante os testes.
5. Ambos os workflows aceitam a branch R15, e o contrato R15 roda antes dos testes SQL/Meta e do fluxo fiscal. O PR #1032 tem base R14 #1029; R03 #1026 continua separado e não deve ser mesclado integralmente sem avaliar os conflitos de consumidores.

## Critérios e limitações

- Os workflows executam PostgreSQL17 descartável com dados fictícios; **não comprovam RLS, todos os triggers e migrações reais**. A auditoria R13 registrou 29/30 triggers ausentes do clone e 11/11 diferenças de RLS. Portanto R14 continua **BLOCKED**.
- Para produção, é necessário verificar se a versão da migration continua não aplicada e reconciliar as alterações na `main`, que teve evolução paralela em pedidos/fiscal/XML. Não substituir versões aplicadas ou usar `migration repair` automático.
- Não ativar emissão fiscal automática: CFOP/CST/CSOSN e regras IBS/CBS carecem de revisão/aprovação, além de ensaio real Bling/SEFAZ e autorização fiscal. O código R10 deliberadamente bloqueia geração sem atestado tributário.
- Confirmar e homologar templates Meta dos números 0975 e 1018, assinatura do webhook, texto/áudio, numerador semanal, idempotência, status no Admin e observação GET fiscal real em staging.
- A verificação GitHub verde significa **testes isolados**, não implantação. Nenhuma NF-e, mensagem WhatsApp, estoque, preço, venda, entrega ou registro de cliente foi alterado.

## Próximo passo

Consolidar os demais fragmentos R03 preservados na PR #1026, comparar a sequência fiscal/numeração com a `main` atual e obter um clone canônico de staging com RLS/triggers e migrações selecionadas. Somente após resolver as divergências efetuar teste E2E/canário humano aprovado.

**Sem merge, SQL aplicado, deploy ou operações de cliente nesta rodada.**
