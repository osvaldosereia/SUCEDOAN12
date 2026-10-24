# Dona Antônia — Recuperação fiscal R2: notas existentes no Bling

**Data:** 2026-10-09. **Repositório:** `osvaldosereia/SUCEDOAN12`, `main`.
**Produção:** Supabase canônico `ssbesxgaijknwsjbsbcz`.

## Implementado nesta janela

- PR #1036: inspetor read-only `fiscal_nfe_draft_probe_v2`, com `GET /nfe/{id}`, linhas, valores, situação e validação de identidade com múltiplos sinais. Módulo puro `_shared/fiscal-r2-nfe-inspector.mjs`.
- PR #1038: `blingHubVitrineDispatchFiscalPreview` procura nota via `sale.notaFiscal.id` quando `GET /nfe?numeroLoja=...` retorna **HTTP 200 e nenhum resultado**. Falha HTTP/identidade impede reemissão.
- PR #1039: recuperador grava o ID comprovado na linha já existente de `dispatch_fiscal_jobs` (somente `review_required`, com CAS; sem alterar `order_fiscal_controls`).
- PR #1040: quando uma NF-e é descoberta após o erro antigo, a análise ignora o cooldown uma única vez para ler seu novo estado.
- PR #1041: salva `diagnostics.invoice_id` antes do bloqueio fiscal, para não repetir sondagens continuamente após reconhecer nota rejeitada.
- **Edge `admin-service-intelligence-v1` versão 244 ACTIVE**, deploy preservou todos os módulos compartilhados.
- Cron `fiscal-nfe-autorecovery-v1`, job 36, continua ativo a cada 5 minutos.
- CI específico de identidade/vínculo e regressões fiscal R1 e R2 aprovados.

## Prova de ponta a ponta: NF-e 000418

- Pedido Dona Antônia `DA-261008-2CA61EEB`, UUID `2ca61eeb-13cc-4ae1-943f-c6d66bde5ab1`.
- Pedido de venda Bling `27087386324`. **A API da venda retornou `notaFiscal.id=27090735788`**, que corresponde à NF-e número `000418`.
- API `GET /nfe/27090735788` retornou **situação 4 (Rejeitada)**, 72 linhas e chave de acesso presente. `numeroLoja` da nota veio NULL; o filtro antigo por esse campo não a encontrava.
- Soma das linhas da NF-e R$ **765,18**, idêntica ao subtotal fiscal do pedido. Outras despesas no pedido R$ **50,00**; total R$ **815,18**.
- **NCM não retornou no payload individual de itens**: o diagnóstico correto é `not_exposed` em 72 linhas, **não** `missing`. Não inventar 72 NCMs ausentes.
- Inspetor autenticado com fonte da venda validou `sale_invoice=true`, `contact=true`, `subtotal=true`, `identity_verified=true`, edição bloqueada (`state_not_editable`).
- Metadados persistidos no job `b816c1a1-4b08-4ea4-9823-e2fdb4eab006`:
  `bling_invoice_id=27090735788`, `bling_invoice_number=000418`, status ainda `review_required`, erro original `invoice_generation_uncertain`.
- O recuperador voltou a consultar e gravou evento `existing_invoice_rejected_or_terminal`, confirmado HTTP 200, sem emissão de uma segunda NF-e.
- `order_fiscal_controls` permanece `fiscal_status=ready`, `dispatch_fiscal_status=pending`, `bling_invoice_id=NULL`. **SEFAZ não autorizou a nota nesta rodada** e a expedição permanece bloqueada.
- A correção PR #1041 foi publicada depois do último evento acima; nova iteração fará registro `diagnostics.invoice_id` na janela cron seguinte. Na consulta imediata ao cron ainda havia chave de idempotência na mesma janela de 5 minutos (`processed=0`); não confundir com falha.

## Bloqueio fiscal efetivo

A NF-e 000418 está rejeitada, não é rascunho pendente. Documento oficial:
- https://developer.bling.com.br/changelogs, v325, 25/06/2025: `PUT /nfe/{idNotaFiscal}` restringe modificações fiscais após transmissão SEFAZ e com lançamentos.
- https://developer.bling.com.br/boas-praticas: PUT substitui recurso completo; campos omitidos podem ser zerados.
**Não tentar PUT fiscal parcial improvisado nem reenviar sem verificar procedimento aceito pelo Bling e SEFAZ.**

## Próxima rodada (R2b/R3) — alto impacto para autorizações reais

1. Pesquisar o procedimento específico de NF-e rejeitada no Bling v3 (corrigir mesma NF-e, eventos de rejeição, revalidação, eventual substituição), sem supor que `PUT` seja permitido.
2. Extrair erros da rejeição por via API oficial/retorno do emissor, especialmente cinco NCMs indicados na tela. Mapear precisamente item ↔ GTIN/SKU ↔ produto Bling ↔ XML fornecedor; evitar selecionar NCM pelo nome.
3. Implementar recuperação de **rascunhos ainda não enviados** com payload completo validado contra contrato OpenAPI; conferir inalterados dados de cliente, total, parcelas, impostos e composição antes/depois.
4. Para **rejeitadas transmitidas**, usar apenas o mecanismo oficial de correção/reenvio do Bling, mediante testes com nota canário e salvaguardas tributárias.
5. Priorizar preventivamente validações de todos os itens da venda antes de gerar NF-e: NCM vigente, CEST por matriz fiscal, GTIN, endereço e regime tributário homologados.
6. Homologar em um pedido real, exigir **retorno autorizado da SEFAZ**, depois expandir gradualmente sem automação global descontrolada.

**Critério de sucesso:** nota efetivamente autorizada depois de correção comprovada, sem duplicidade fiscal; não apenas diagnóstico.

Documentos anteriores: `FISCAL_AUTORECOVERY_HANDOFF_R1_2026-10-09.md`, issue #1030.
