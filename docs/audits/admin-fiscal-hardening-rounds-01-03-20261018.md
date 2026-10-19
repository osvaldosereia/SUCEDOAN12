# Saneamento fiscal — Rodadas 01–03 de 15

Branch: fix/admin-fiscal-hardening-20261018 (derivada da auditoria de 20 rodadas).

## Rodada 01 — DANFE

Corrigida a interface openCurrentDanfe: identificador de nota isolado não autoriza mais abrir o documento. O endpoint order_fiscal_document_pdf agora consulta orderFiscalStatusV4 e retorna HTTP 409 fiscal_authorization_required_before_document antes de chamar o Hub se authorized não for true. Reforçado o teste de contrato de DANFE para exigir os dois gates.

Limite: o endpoint continua dependendo da fidelidade da situação fiscal retornada pelo Hub e controles canônicos. Nenhuma NF-e ou PDF real foi emitido.

## Rodada 02 — Emissão duplicada e concorrência

Inspecionados orderFiscalIssueV4, autoIssueFiscalAfterSeparation, orderFiscalStatusV4, migração fiscal_nfe_autorecovery_v1.sql e testes de recuperação. A emissão exige preflight, confirmação humana, checagem de autorização, estado de job e delega ao Hub. O teste de concorrência real e a exclusão mútua persistida do Hub ainda não foram demonstrados; **não classificar como corrigido**. Não alterar emissão fiscal sem validar lock/idempotência transacional na implementação efetiva do Hub.

## Rodada 03 — Recuperação e expedição

Inspecionados orderFiscalRecheckV1, orderFiscalRecoverBlingV1 e orderDispatchStartV4. A rechecagem reconcilia, a recuperação da venda exige separação concluída, e a saída exige autorização fiscal. Os cenários de timeout pós-POST, recuperação de NF-e já existente e divergência de status SEFAZ exigem homologação com ambiente isolado e acesso à implementação do Hub.

## Estado e próximos passos

- Corrigido no código: gate de DANFE no Admin e na Edge Function; testes de contrato ampliados.
- Pendente: concorrência/idempotência fiscal ponta a ponta, resposta incerta do Bling, evidência do Hub e validação SEFAZ.
- Não houve deploy, merge, emissão de NF-e ou alteração de dados reais.
- Não declarar rodadas 02 e 03 homologadas apenas com inspeção estática.
