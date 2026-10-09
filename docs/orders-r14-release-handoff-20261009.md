# R14 — Gate de evidências para pré-publicação da Dona Antônia (09/10/2026)

**Plano:** [Issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · **Base de trabalho:** R13 [PR #1024](https://github.com/osvaldosereia/SUCEDOAN12/pull/1024) · **Repositório:** `osvaldosereia/SUCEDOAN12`.

## Decisão e estado REAL

A R14 não deve executar um deploy nem habilitar emissão de notas por conta própria. O estado atual é **BLOCKED — não apto a produção**. O novo gate exige comprovação positiva em homologação canônica antes de recomendar sequer um canário humano.

A inspeção dos registros GitHub mostrou:
- [R02 cestas PR #994](https://github.com/osvaldosereia/SUCEDOAN12/pull/994) concluída em laboratório; [CI 37928068917](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37928068917) aprovada, inclusive concorrência de cestas.
- [R02+R03 PR #1026](https://github.com/osvaldosereia/SUCEDOAN12/pull/1026) passou a testar número público semanal com checkout real em banco sintético, mas permanece em branch/PR draft, separada da cadeia R04–R13.
- [R02–R10 PR #1016](https://github.com/osvaldosereia/SUCEDOAN12/pull/1016), [R11 PR #1019](https://github.com/osvaldosereia/SUCEDOAN12/pull/1019), [R12 PR #1021](https://github.com/osvaldosereia/SUCEDOAN12/pull/1021) e [R13 PR #1024](https://github.com/osvaldosereia/SUCEDOAN12/pull/1024) estão em desenvolvimento isolado, **não integrados ao main**.
- O checkpoint canônico R13 documenta 11 tabelas críticas presentes no laboratório, mas **29 dos 30 gatilhos canônicos ainda não reproduzidos** e **11/11 ajustes de RLS divergentes**, além de cinco tabelas críticas com `TRUNCATE/TRIGGER/REFERENCES` indevidos para papéis públicos. RLS não impede `TRUNCATE`.
- R08/R10 mantêm a emissão deliberadamente bloqueada enquanto não houver classificação tributária de saída aprovada, prova de leitura Bling e autorização SEFAZ autêntica.

## Programa executável em CI

`scripts/orders-r14-release-gate.mjs` analisa evidências recebidas em JSON, produz relatório estruturado e nunca executa mutações externas. Permite `--require-ready` para sair com código 2 quando o projeto não está apto para revisão de canário. Mesmo que todas as verificações internas retornem PASS, os campos `deployment_authorized` e `canary_automatically_enabled` permanecem **false**: aprovação e implantação continuam processos humanos segregados.

Nove bloqueios independentes:
1. Cadeia única de PRs mesclada e testada, sem migrations conflitantes, deployment staging rastreável e mesmo SHA;
2. Paridade do clone canônico (tabelas, triggers, RLS, privilégios, ACLs default e assinaturas de RPC);
3. Checkout real, mínimo R$ 75, disputa de estoque, cestas divididas, moldes, números imutáveis e autoridade de estoque Bling;
4. Meta dos canais 0975/1018: templates aprovados, webhook assinado, CONFIRMADO, rejeição de texto e idempotência;
5. Venda Bling: soma final de separados, vínculo de produtos, fingerprint e dedupe após resposta ambígua;
6. Tributação de saída revisada por profissional habilitado (CFOP, CST/CSOSN, NCM/CEST, IBS/CBS);
7. NF-e com tentativa única, leitura de XML/protocolo e confirmação SEFAZ verdadeira;
8. Entrega com bloqueio antes de nota, custódia/rota, pagamento dividido e retornos;
9. Backup restaurado em staging, rollback ensaiado, monitoramento/falhas e aceite operacional/fiscal.

## Arquivos novos

- `scripts/orders-r14-release-gate.mjs`: motor puro + CLI read-only; exige comprovantes de staging, timestamps recentes e origem HTTPS declarada, além das condições semânticas. **Atenção: um JSON offline não autentica cryptograficamente que uma fonte é legítima; o campo `verified` ainda depende de validação independente do responsável pelo release.**
- `scripts/fixtures/orders-r14-release-evidence-20261009.json`: fotografia de bloqueios observados; os campos não comprovados ficam `false/null`. Não registra dados pessoais, chaves, pedidos ou notas.
- `scripts/test-orders-r14-release-gate.mjs`: prova de bloqueio de RLS/triggers, tributos, canais Meta, checkout, SEFAZ, prova expirada, permissão de deploy e testagem com uma fotografia sintética totalmente preenchida (sem emitir autorização real).
- `.github/workflows/orders-r14-release-gate-ci.yml`: Node 22, sem credenciais, flags de Bling/Meta/fiscal OFF, registra relatório como artefato e `GITHUB_STEP_SUMMARY`. A **passagem do CI exige que a verificação estrita retorne bloqueio** (código 2); não se trata de liberar produção.

## Resultado técnico

[**CI R14 #37977261186 — SUCCESS**](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37977261186). A verificação gera o relatório `blocked` com nove grupos pendentes. O teste unitário prova que até uma fotografia hipotética com todas as evidências marcadas como válidas **não executa deploy ou nota**.

## Ações necessárias para realmente concluir o projeto

- Consolidar as duas trilhas de PRs recentes (**#1026 e #1024**) em uma única branch, resolver migrations/compatibilidade e homologar o checkout no mesmo ambiente que fiscal/logística.
- Substituir o clone simplificado da R13 por um staging canônico fiel, incluindo gatilhos e RLS essenciais; corrigir grants de forma revisada, com migração e rollback.
- Confirmar templates oficiais nos canais Meta, reconciliação Bling com leitura remota, revisão tributária (incluindo regras 2026) e prova da autorização SEFAZ.
- Executar teste completo com pedidos fictícios e um canário real estritamente aprovado por operador/responsável fiscal, com monitoramento e reversão. A automação agendada **não deve** fazer deploy ou emissão fiscal por conta própria.

**Nada foi implantado nem alterado na produção.** R14 tem gate de revisão programado e testado, mas o projeto permanece não homologado para publicação.
