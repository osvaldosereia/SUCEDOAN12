# R10 — Comprovação fiscal SEFAZ, autorização atômica e saída para entrega

**Data:** 08/10/2026 (Cuiabá) · **Plano:** [Issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · **PR draft:** [#984](https://github.com/osvaldosereia/SUCEDOAN12/pull/984) · **Base:** R09 [#981](https://github.com/osvaldosereia/SUCEDOAN12/pull/981)

## Estado auditado na produção (apenas SELECT)
- A integração já tem `dispatch_fiscal_jobs`, unicidade `(order_id,fiscal_version)` e política `max_attempts=1`. **Nenhum segundo emissor** deve operar em paralelo.
- A função `mark_order_dispatch_fiscal_authorized_v1` marca autorização usando parâmetros e a Edge antiga podia confiar em `invoice.situation.authorized` sem checar o XML autorizado, chave e protocolo. Esse era um risco de liberação falsa.
- A `check_order_dispatch_fiscal_gate_v1` pode permitir saída em `dispatch_gate_mode=observe`, mesmo sem nota autorizada. A R10 propõe trigger independente **para pedidos inseridos no fluxo R07**, exigindo prova antes da saída.
- A R08 ainda bloqueia a geração por não existir uma fonte de **CFOP/CST/CSOSN de saída aprovada** por produto e regime. Não é permitido contornar esse bloqueio.

## Alterações implementadas em GitHub, sem produção
### 1. Motor de comprovação
`supabase/functions/_shared/order-fiscal-r10-sefaz-proof-v1.mjs`:
- Lê o XML de autorização `nfeProc` e seu protocolo `protNFe/infProt`.
- Confere `chNFe` e `infNFe Id`, dígito verificador da chave de 44 números (módulo 11), `cStat=100` ou `150`, `nProt` de 15 números, `dhRecbto`, ambiente de produção, CNPJ do emitente, valor `vNF` e vínculo exato com o pedido `VITRINE-{UUID}` e o ID NF-e do Bling.
- Não considera nota simplesmente `Gerada`, `Enviada`, `Rejeitada`, `Denegada` ou cancelada como autorizada.
- **Limitação deliberada:** comprova a coerência do documento/XML fornecido por leitura autenticada do Bling, mas **não verifica assinatura XMLDSig/cadeia ICP-Brasil de forma criptográfica**. Requer validação adicional em homologação antes de tratar como auditoria fiscal formal.

### 2. Reutilização do emissor antigo, com defesa opcional
`supabase/functions/admin-service-intelligence-v1/index.ts`:
- Os quatro caminhos que chamavam `mark_order_dispatch_fiscal_authorized_v1` agora passam por um wrapper comum `blingHubR10MarkOrLegacy` quando `ORDER_R10_SEFAZ_PROOF_ENABLED=true`.
- Obtém o token do Bling, confirma uma única NF-e relacionada à chave externa do pedido, consulta detalhes, baixa o XML via `/nfe/documento/{chave}?formato=xml`, descompacta e valida o protocolo.
- Só chama o novo finalizador atômico do banco com comprovante extraído por essa leitura. Nunca aceita XML fornecido pelo navegador, valor de cliente ou mero texto `Autorizada` como prova.
- Para pedidos sem NF-e, a opção R10 bloqueia a execução antiga de `/gerar-nfe` até existir pré-validação fiscal aprovada. **Essa implementação ainda não é o worker de emissão automática final**.

### 3. Gate de expedição com prova única
Contrato **DRAFT NÃO APLICADO** `supabase/sql/orders-r10-sefaz-authorization-gate-v1.sql`:
- Tabela privada de evidências, um pedido + NF-e + chave de 44 números + protocolo + hash SHA-256 do XML, com unicidade, RLS e função restrita a `service_role`.
- A RPC `ops2_r10_finalize_authorized_v1` confronta o fechamento R06, sincronização R07 `verified`, observação R09 `invoice_found`, outbox fiscal existente e ID NF-e. Numa única transação, registra a prova e atualiza `dispatch_fiscal_jobs` e `order_fiscal_controls`.
- Executar novamente com o **mesmo comprovante** é idempotente; prova diferente é rejeitada.
- Trigger `ops2_r10_guard_dispatch_v1` impede transição a `out_for_delivery` ou `delivered` para pedidos inscritos no fluxo R07 quando falta evidência coerente de SEFAZ, outbox e controles.
- A RPC `ops2_r10_rearm_fiscal_observation_v1` permite apenas **repetir GET** depois da geração/timeout, preservando contagem; não repete POST de NF-e.
- A RPC de tentativa de geração `ops2_r10_claim_fiscal_generation_v1` **devolve bloqueio intencional** `r8_approved_tax_attestation_not_integrated`, sem consumir tentativas, pois ainda não há atestado fiscal auditável da R08 para a venda.

## Validação e evidências
[**CI GitHub Actions R10 #37881625167 — SUCCESS**](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37881625167), PostgreSQL 17 descartável, Node 22, sem tokens ou dados reais.

Cenários sintéticos efetivamente executados:
- Chave de 44 dígitos com DV, cStat 100/150, rejeição 101/110 e outros estados, protocolo, CNPJ, ambiente, valor, ID da nota, chave externa e frescor.
- Fluxo prévio R02/R06/R07/R09 em base descartável e regressões R08.
- Emissão bloqueada enquanto não existir aprovação tributária R08; `attempts` do outbox não aumenta no bloqueio.
- `out_for_delivery` negado **antes** do recibo R10, autorizado após confirmação sintética e sem dupla autorização em replay; também libera a transição posterior a `delivered`.
- Falha de SQL/RPC para acesso público e leitura indevida; ledger service-only.

## Pré-requisitos ainda pendentes antes de uso real
1. Concluir clone canônico R02 e integração dos PRs R03–R09 em ordem, sem aplicar SQL draft por conta própria.
2. Fonte de aprovação tributária assinada/revisada por responsável fiscal (CFOP, CST/CSOSN, NCM/CEST aplicável, regime da empresa e requisitos IBS/CBS de 2026); só então criar o **claim transacional ativo para emissão única**.
3. Homologar XML gerado pelo Bling no formato realmente retornado, inclusive `nfeProc`, protocolos, hom/produção e autenticação de dados; revisar cadeia de assinatura XML e validação SEFAZ.
4. Testar em canário explicitamente autorizado e conferir a soma final, faltantes, despesas, valores da cesta e vínculo do XML com o pedido.
5. Manter sempre a confirmação real de SEFAZ e `dispatch_gate_mode=enforce` para novas operações antes da liberação logística.
6. Integrar retorno na tela do Admin para motivos de bloqueio; depois R11–R14 para expedição, UX, E2E e publicação controlada.

**Resultado atual:** código e CI sintética concluídos; **NÃO implantado, NÃO liberado para emitir NF-e e NÃO homologado fim-a-fim**. Flags OFF, nenhum cron ligado. Nenhuma transação comercial, WhatsApp real, pedido, estoque, NFC-e/NF-e ou SEFAZ modificados nesta rodada.
