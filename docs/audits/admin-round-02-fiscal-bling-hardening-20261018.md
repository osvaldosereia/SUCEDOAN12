# Rodada 02 — hardening fiscal/Bling (18/10/2026)

## Escopo e execução
Branch `fix/admin-fiscal-hardening-20261018`; PR draft #1126. Produção não alterada. Sem emissão real de NF-e, sem envio WhatsApp, sem lançamentos financeiros ou movimentações Bling.

### Defeito encontrado e corrigido
A consulta `orderFiscalStatusV4` computa `can_issue` a partir de status `ready`, elegibilidade, autorização existente, bloqueios, habilitação/canary e `generationAttempted` para uma tentativa de geração incerta. Entretanto, `orderFiscalIssueV4` checava somente `hard_blockers` antes de executar `fiscal_dispatch_canary_human_execute`. O fluxo automático `autoIssueFiscalAfterSeparation` também checava bloqueios e `issue_enabled`, mas não impedia `generationAttempted`.

Ambos os fluxos agora exigem `before.can_issue === true` **antes da escrita fiscal externa**, preservando o retorno idempotente de notas já autorizadas, a confirmação humana no endpoint manual e os demais gates existentes. Uma tentativa incerta exige reconciliação, em vez de nova geração.

### Evidência e testes
- `scripts/test-admin-fiscal-eligibility-issuance-contract.mjs`: contratos reforçados para os caminhos manual e automático, incluindo ordem de validação antes do Hub.
- `scripts/test-admin-fiscal-runtime-guards.mjs`: execução das funções reais extraídas do endpoint com dependências simuladas, verificando ausência de chamadas externas para recuperação pendente, emissão desabilitada, bloqueio financeiro, replay autorizado, usuário viewer e ausência de confirmação humana.
- `.github/workflows/admin-print-queue-panel.yml`: novo teste registrado no workflow.
- **Pendente até resultado do CI**: não considerar a nova suíte aprovada apenas por ter sido escrita. A rodada 01 tem homologação SQL isolada registrada separadamente; isso não homologa fiscal ponta a ponta.

### Limites objetivos
- O Hub Bling e o serviço de emissão fiscal não foram executados em sandbox; não existe prova de emissão, rejeição SEFAZ, timeout real nem conciliação pós-falha com API externa.
- A função `orderFiscalStatusV4` usa prévia fiscal e job remoto. A consistência concorrente entre leitura da prévia e emissão precisa ser garantida no Hub/DB, pois o gate do Admin não é bloqueio transacional distribuído.
- Não alterar configuração fiscal de produção, criar notas ou disparar integração externa sem janela de homologação segura e evidência de sandbox.
- Status: **correção de segurança fiscal implementada; rodada 02 não integralmente homologada ponta a ponta**.
