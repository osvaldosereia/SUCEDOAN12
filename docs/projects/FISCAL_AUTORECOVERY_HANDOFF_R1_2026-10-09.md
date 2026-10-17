# Dona Antônia — Recuperação inteligente de NF-e — Handoff R1

## REGRA ATUAL — SOMENTE NOVOS PEDIDOS (DECISÃO DO PROPRIETÁRIO EM 09/10/2026)

**ESTA REGRA PREVALECE SOBRE TODO O PLANO HISTÓRICO ABAIXO:** não analisar, corrigir, recriar, retransmitir ou emitir NF-e de pedidos antigos. Evitar qualquer replay em lote ou canário de NF-e 000418 e de outros casos anteriores, mesmo se aparecerem em logs. Esses casos são referência histórica de testes, não alvos de operação.

- Cutover estrito: **2026-10-09 20:08:06.484578 UTC (16h08:06 em Cuiabá)**. Apenas pedidos `orders.created_at >= cutover` e trabalhos `dispatch_fiscal_jobs.created_at >= cutover` podem entrar na recuperação autônoma.
- Controle persistente: `fiscal_nfe_recovery_control_v1.min_order_created_at`, com restrição SQL que impede retroceder o cutoff.
- GitHub: PR #1048 integrado à `main`; Edge `admin-service-intelligence-v1` v247 ACTIVE; cron `fiscal-nfe-autorecovery-v1` ativo a cada 5 minutos.
- Verificação feita durante a mudança: **0 novos pedidos elegíveis**, **0 falhas fiscais novas**, **9 trabalhos antigos excluídos**; os históricos foram preservados, não alterados.
- A R2 deve priorizar **o fluxo fiscal de novas vendas**, validando o vínculo com a venda e a nota, a correção de dados seguros e a autorização SEFAZ. Não reutilizar notas antigas como canário real.
- A emissão fiscal global continua dependendo da configuração `fiscal_runtime_config` e não deve ser confundida com o monitoramento de erros.

---


Data: 2026-10-09. Repositório: `osvaldosereia/SUCEDOAN12`, fonte `main`.
Escopo: Bling API v3, Supabase canônico `ssbesxgaijknwsjbsbcz`.

## Estado confirmado e implantado
- PR [#1028](https://github.com/osvaldosereia/SUCEDOAN12/pull/1028): classificador multicausal, verificação documental do NCM, reconciliação, auditoria, agendamento de 5 minutos.
- PR [#1031](https://github.com/osvaldosereia/SUCEDOAN12/pull/1031): varredura NCM remoto; não presumir que NCM do Supabase significa NCM correto na nota gerada.
- PR [#1033](https://github.com/osvaldosereia/SUCEDOAN12/pull/1033): R1 concluída. Retry de lock OAuth (800/1800/3200 ms); cooldown de 10 min para falhas transitórias e 4h para erros fiscais estáveis; consulta HTTP de NF-e inconclusiva NÃO equivale a inexistência; proteção de não duplicar POST.
- Function `admin-service-intelligence-v1`: **v239 ACTIVE** no Supabase. Publicada com arquivos compartilhados anteriores preservados.
- `admin-products-live-v1` v162 (inalterada nesta R1).
- Cron `fiscal-nfe-autorecovery-v1`, job 36, agendado a cada **5 minutos** e ativo. Não confundir com execução da programação do ChatGPT.
- CI: `Fiscal Recovery R1 Auth Backoff`, `Fiscal NFe Auto Recovery V1`, `Fiscal NCM Remote Gap V2`, `Pedidos Fiscal Flow V4`, `Checkout Hotfix CI` e `Verify admin order WhatsApp UI integration` aprovados.

## Observações verificadas
Foram examinados 14 jobs históricos de emissão: 5 autorizados e 9 em `review_required`.
Classificação dos bloqueados: 2 com timeout `invoice_generation_uncertain`, 2 com NCM ausente explícito, 1 com endereço inválido e 4 com mensagem genérica de falha.
O erro NCM no Bling **não significa necessariamente** que a coluna `products.ncm` do Supabase está vazia: a nota em rascunho ou o item fiscal podem estar divergentes.
Exemplos:
- NF-e `000418`, ID Bling `27090735788` na captura do usuário, contém cinco NCM recusados. **Ainda não foi verificado pela API o vínculo seguro dessa NF-e com um pedido específico**; não associar ao pedido de Elis Artes só pela semelhança temporal.
- Pedido `2ca61eeb-13cc-4ae1-943f-c6d66bde5ab1` teve timeout da geração, `external_side_effect=true`; **não repetir geração sem reconciliar**.
- Pedido `822a74d6-08f4-486d-bf92-81615734022b` tem erro NCM na tentativa de geração, mas GET de produtos devolveu NCM local/remoto presente; precisa conferir **itens da nota em rascunho**.
- Antes da R1, `worker_exception: oauth_busy` ocorreu em duas auditorias; foi resolvido em código e coberto por CI, mas uma recuperação/autorização real pós-R1 ainda precisa ser comprovada.

## R2 — execução imediatamente seguinte
1. Estudar payload GET `/nfe/{idNotaFiscal}` e `PUT /nfe/{idNotaFiscal}` na documentação oficial Bling v3 (changelog 03/09/2025 confirma PUT), incluindo limites de edição por situação.
2. Localizar notas em rascunho que resultaram de `/pedidos/vendas/{id}/gerar-nfe`, vinculando **por ID de venda, identidade fiscal/total/cliente e referência imutável**, nunca por nome ou número parcial.
3. Distinguir rascunho, rejeitada, em processamento e autorizada. Nunca sobrescrever NF-e autorizada nem transmitir duas vezes.
4. Corrigir NCM em linha de NF-e **apenas quando** houver consenso fiscal comprovado e código vigente. Tratar NCM inválido, endereço e múltiplos erros na mesma nota em dependência; antes de tentar envio verificar que TODOS foram resolvidos.
5. Testar contrato com API mock, validar o produto e o total antes/depois; canário de uma nota real; registrar cStat/retorno SEFAZ.
6. Meta de operação: medir **notas efetivamente autorizadas após recuperação**, não só eventos `diagnosticados`.

## R3–R5
- Matriz fiscal MT homologada para CEST, CFOP, CSOSN/CST, IBS/CBS, situação da operação e optante Simples Nacional.
- Correção de endereço apenas com cadastro anterior confirmado, sem inventar informações.
- Fluxo pedido separado -> NF-e autorizada -> expedição, com status e resolução visível no Vitrine/Admin.
- Métricas: erro original, resolvido automaticamente, precisou intervenção, ainda bloqueado, tempo até autorização e duplicatas evitadas.

## Guardas irrenunciáveis
Não recriar NF-e após timeout sem reconciliação, não presumir ausência de nota quando o Bling devolve 429/5xx, não escolher NCM por nome, não editar nota autorizada, não liberar entrega sem autorização fiscal, nunca afirmar que uma nota foi autorizada sem retorno Bling/SEFAZ.

Issue guia: https://github.com/osvaldosereia/SUCEDOAN12/issues/1030.
Referência: https://developer.bling.com.br/changelogs (PUT /nfe/{idNotaFiscal}); https://developer.bling.com.br/referencia.
