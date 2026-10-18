# Rodada 16/20 — Elegibilidade e emissão NF-e

Branch de trabalho do PR #1121. Nenhuma NF-e foi emitida.

## Caminhos auditados

- orderFiscalStatusV4 cruza pedido, preview_bling_invoice_eligibility_v1, order_fiscal_controls e prévia do Hub.
- Emissão exige status ready, elegibilidade, ausência de bloqueios, configuração habilitada e ausência de geração já tentada em estado incerto.
- O estado autorizado pode derivar de controle fiscal ou resposta do Bling; o despacho exige autorizado.
- orderFiscalIssueV4 rejeita viewer, exige confirmação explícita EMITIR_NFE, executa preflight e devolve replay sem emissão quando já autorizado.
- O Admin confirma a ação antes de chamar order_fiscal_issue_v4 e consulta o estado novamente após sucesso ou erro.
- A emissão automática pós-separação repete o preflight, tenta reconciliar até cinco vezes e distingue autorizado, rejeitado e processamento.

## Riscos pendentes

1. O preflight e a chamada de emissão não são atômicos; concorrência entre ações automáticas e humanas exige lock persistido no Hub.
2. Timeout depois de POST ao Bling pode representar emissão externa efetiva; jamais repetir sem reconciliação.
3. A verificação de idempotência da geração depende do Hub e das tabelas de jobs; contrato completo será investigado na rodada 17.
4. O status autorizado não substitui conferência de chave, protocolo e documento fiscal, assunto das rodadas 17–18.
5. Testes estáticos não validam SEFAZ, XML, autorização fiscal nem situação real do Bling.

## Proteção

scripts/test-admin-fiscal-eligibility-issuance-contract.mjs criado e incluído no workflow de regressão. Sem mudança de regra de emissão.
