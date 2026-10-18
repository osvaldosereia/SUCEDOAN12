# Rodada 17/20 — Fiscal Bling, estados incertos e recuperação

Escopo: auditoria de código versionado, sem emissão de NF-e ou consulta real ao Bling/SEFAZ.

## Fluxo encontrado

- orderFiscalStatusV4 agrega elegibilidade, order_fiscal_controls, prévia do Hub e evento mais recente em fiscal_nfe_recovery_events_v1.
- A regra generationAttempted bloqueia nova emissão quando o job está generating ou review_required, já houve tentativa e não há invoice_id confirmado.
- orderFiscalIssueV4 exige confirmação humana EMITIR_NFE, preflight, bloqueios vazios e devolve replay quando já autorizado.
- Depois do envio, chama fiscal_dispatch_reconcile; em falha consulta novamente o status e retorna diagnósticos.
- orderFiscalRecheckV1 executa somente reconciliação e consulta, sem solicitar emissão.
- orderFiscalRecoverBlingV1 exige separação física concluída e estoque aplicado, reconcilia vínculo e estado do pedido antes da emissão.
- A migração 20261009190000_fiscal_nfe_autorecovery_v1.sql define controle com limite de três tentativas, eventos únicos e campo external_write.

## Riscos residuais

1. O bloqueio de emissão duplicada é parcialmente derivado de estado consultado antes da operação remota; a exclusão mútua efetiva depende do Hub e do banco.
2. Timeout ou falha após POST não comprova ausência de NF-e. Reconciliação deve preceder nova tentativa.
3. Confirmar se jobs e eventos são persistidos antes de cada escrita externa e se retentativas obedecem ao limite.
4. O campo authorized agrega sinais locais e externos; validar consistência com protocolo SEFAZ e situação fiscal.
5. Não foram executados testes de concorrência ou chamadas fiscais reais.

## Entrega

scripts/test-admin-fiscal-uncertain-recovery-contract.mjs criado e integrado ao workflow. Sem alteração funcional de emissão.
