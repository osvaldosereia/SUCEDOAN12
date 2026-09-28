# Operations 2.0 — Compras/XML · Financeiro Bling v2

Data: 2026-09-28

## Problema encontrado

O processamento de XML estava funcional, mas o lançamento financeiro usava criação manual de parcelas em `POST /contas/pagar`. As NF-e empresariais elegíveis estavam retornando HTTP 400 e ficando em `finance_status=review`.

Na auditoria desta rodada foram observadas 13 NF-e empresariais pendentes, totalizando R$ 29.298,04. Nenhuma foi relançada automaticamente durante a correção.

## Correção implementada

- escrita financeira principal alterada para a ação nativa da própria NF-e no Bling: `POST /nfe/{idNotaFiscal}/lancar-contas`;
- `/contas/pagar` passou a ser usado como leitura/conciliação antes e depois do lançamento;
- a reconciliação procura as parcelas por fornecedor, vencimento, valor e, quando disponível, referência do documento;
- lançamento externo só ocorre depois da reconciliação;
- erro de lançamento não bloqueia mais nova tentativa financeira por a nota já estar com os produtos processados;
- notas duplicadas passam por reconciliação somente leitura;
- ciclo diário de XML também reconcilia pendências financeiras sem criar contas antigas;
- XML CPF continua bloqueado para financeiro empresarial;
- entrada de estoque permanece separada e exige confirmação humana.

## Auditoria persistida

`purchase_xml_documents` recebeu:
- `finance_attempt_count`
- `finance_last_attempt_at`
- `finance_last_error`
- `finance_posted_at`
- `finance_reconciled_at`
- `finance_method`

## Central / Precisa de você

Pendências financeiras de XML agora geram `ops_attention.type=purchase_finance`, com chave idempotente por documento. A pendência é resolvida automaticamente quando o financeiro é conciliado/confirmado.

Backfill da rodada:
- 13 alertas abertos;
- total financeiro pendente: R$ 29.298,04;
- nenhuma escrita retroativa automática dessas 13 notas.

## Admin

Ao expandir uma NF-e em Compras/XML, a tela passa a mostrar:
- situação financeira;
- ID da NF-e no Bling;
- número de tentativas;
- último erro;
- contas conciliadas;
- botão **Reconciliar com Bling**;
- botão **Lançar contas no Bling / Tentar lançamento novamente** quando aplicável.

O lançamento manual exige confirmação explícita e executa reconciliação antes da escrita.

## Deploy

- módulo `purchase-xml-v1` atualizado no GitHub;
- `admin-service-intelligence-v1` publicado como **v185 ACTIVE**;
- migration `purchase_xml_finance_reliability_v2` aplicada no Supabase canônico;
- cron diário `purchase-xml-daily-v1` mantido às 06:00 de Cuiabá.

## Regra de segurança para legado

As 13 NF-e antigas não devem ser lançadas em lote sem reconciliação. Algumas podem já possuir contas criadas/pagas manualmente no Bling. O sistema deve primeiro reconciliar; apenas ausência comprovada permite lançamento.


## Validação produtiva

O ciclo diário foi disparado manualmente após o deploy e retornou HTTP 200.

Validação do reconciliador:
- `write_external=false` durante a varredura de pendências;
- notas antigas não foram relançadas em lote;
- o ciclo passou a rever também lançamentos aceitos pelo Bling que ainda não possuem conciliação confirmada;
- quando a conta não é encontrada com segurança, a NF-e fica/regride para `review` e mantém alerta aberto.

Validação do novo caminho nativo:
- NF-e novas/importadas durante a rodada usaram `POST /nfe/{idNotaFiscal}/lancar-contas`;
- também houve caso em que a conta já existia e foi reconhecida por `reconcile_existing`, sem nova escrita;
- snapshot de 2026-09-28 após a validação: **18 NF-e conciliadas**, total **R$ 34.682,17**, sendo 16 pelo lançamento nativo e 2 encontradas por reconciliação;
- **15 NF-e permanecem em revisão**, total **R$ 31.273,76**, com alerta aberto e sem lançamento automático pelo ciclo de reconciliação;
- duas notas cujo POST nativo havia sido aceito, mas cuja conta ainda não pôde ser confirmada, foram corretamente mantidas/reabertas para revisão em vez de serem consideradas sucesso definitivo.

Há uma importação manual iniciada por outra execução em andamento no momento deste snapshot; portanto os totais podem crescer à medida que ela concluir. O critério de segurança permanece o mesmo: somente `posted + finance_reconciled_at` é considerado financeiro confirmado.
