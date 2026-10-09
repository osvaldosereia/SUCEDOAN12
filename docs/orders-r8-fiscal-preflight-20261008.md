# Rodada 8 — Pré-validação fiscal, somente leitura (08/10/2026)

**Plano mestre:** [#964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · **PR draft R08:** [#978](https://github.com/osvaldosereia/SUCEDOAN12/pull/978), base R07 #975.

## Situação verificada por consulta apenas de leitura
- `ops2_fiscal_dispatch_preflight_v1` calcula somas e conferência fiscal, mas invoca `refresh_order_fiscal_readiness_v1`, que faz `INSERT` e `UPDATE` em `order_fiscal_controls`. Portanto, não é seguro apresentá-la como consulta puramente diagnóstica.
- `preview_bling_invoice_eligibility_v1` também chama essa rotina com escrita. A nova R08 não chama nenhuma delas.
- No cadastro fiscal `product_fiscal_profiles`, a auditoria encontrou **856** registros `auto_validated`, **916** `pending`, **42** `blocked`; nas decisões ST **864** `applicable`, **92** `candidate`, **857** `unknown` e **1** `conflict`. Esses números são contagens no momento da auditoria, não garantias de classificação correta.
- `fiscal_rule_sets` tinha **1** conjunto em estado `draft`, sem conjunto ativo comprovado. Para emissão automática, a R08 exige regras **ativas e aprovadas**, não aceita rascunho.
- O estado `verified` de venda no Bling é necessário mas insuficiente como prova fiscal: precisa validação de identidade e conteúdo lido remotamente, ausência de nota fiscal anterior e confirmação da regra de tributação aplicável.
- A emissão NF-e demanda verificar tabelas oficiais vigentes e regras tributárias da operação efetiva. Em outubro/2026 o Portal NF-e mantém novas tabelas e atualizações para CFOP, NCM/uTrib, cClassTrib IBS/CBS; não derivar CFOP, CSOSN e CEST de um NCM isolado.

## Código implementado
### Motor puro de elegibilidade
`supabase/functions/_shared/order-fiscal-r8-preflight-v1.mjs` implementa `evaluateOrderFiscalR8(input)`:
- Compara `orders` com `order_separation_completions_v1` e manifesto congelado `metadata.r6_reconciliation`, exigindo `phase=completed`, `stock_applied=true` e linha `deliverable=true` coerente.
- Exige intent R07 `verified`, **hash SHA-256**, `bling_order_id` idêntico entre pedido, intent e `bling_hub_entity_links_v2`, manifesto não alterado após a sincronização.
- Reprova NF-e anterior, job fiscal em andamento, status do pedido já avançado/cancelado ou divergência em subtotal fiscal, desconto, outras despesas, valor oculto e total em centavos. Uma cesta visual não vira segunda mercadoria.
- Para cada mercadoria separada, verifica `product_fiscal_profiles` (NCM 8 dígitos, origem 0–8, status de revisão/validação, ausência de problemas, ST decidido) e vínculo ao produto no Bling. **CEST de sete dígitos apenas quando ST é aplicável**, com referência a regra ST; ST pendente/conflitante bloqueia.
- Exige autorização específica para tributação **de saída** (`CFOP` + `CST/CSOSN`) e conjunto legislativo MT ativo. Não inventa códigos de imposto com base no XML de compra.
- Exige prova de **leitura externa real** da venda no Bling, incluindo hash da fotografia R07, linhas comerciais equivalentes, nenhum vínculo de NF-e e leitura com menos de 5 minutos.

### Endpoint do Admin
`GET order_fiscal_r8_preflight?id=<uuid>` em `admin-products-live-v1` faz apenas SELECTs, devolve `blockers` e `requires_fiscal_review` ao pessoal autorizado do Admin; usuários viewer recebem 403. Falha ao buscar dados produz indisponibilidade 503, não autorização silenciosa. Não executa `ops2_fiscal_dispatch_preflight_v1`, `refresh_order_fiscal_readiness_v1`, `autoIssueFiscalAfterSeparation`, `POST` ou `PUT`.

**Flag `ORDER_R8_FISCAL_PREFLIGHT_ENABLED=false` por padrão.** Não existe ativação por esta PR.

**Defesa nos fluxos já existentes:** quando essa mesma flag for ativada em uma homologação controlada, tanto `orderFiscalIssueV4` (emissão manual) quanto `autoIssueFiscalAfterSeparation` (rotina automática legada) executam a R08 **antes** de invocar as RPCs históricas com escrita ou o hub fiscal. Quando o parecer retorna impedimento ou está indisponível, a emissão é bloqueada. Isso não substitui a checagem no hub remoto e a verificação do banco, que serão reforçadas em R09/R10.


### Fail-closed intencional
Duas provas ainda **não existem como fonte aprovada no runtime**: (1) regra de tributação de saída assinada por responsável fiscal e (2) leitura remota e comparação íntegra da venda Bling. O endpoint passa explicitamente `approved_sales_tax_rules=[]` e `bling_remote_evidence=null`, por isso retorna `ready=false` com esses impedimentos até novas integrações; os casos sintéticos positivos demonstram que a função pura funciona com provas apropriadas.

## Testes
GitHub Actions `.github/workflows/orders-r8-fiscal-preflight-ci.yml`: Node 22, transportes reais desligados, cenário fictício aprovado e cenários de erro. Inclui regressão R07 para itens realmente separados e idempotência. Nenhuma credencial ou conta real no CI. Provas de CI devem ser conferidas no commit atual de R08.

## Critérios de saída
- Resolver R02–R07 e conferir que as migrações, flags e os dados reais combinam.
- Definir/validar CFOP, CST/CSOSN e grupos fiscais por produto e empresa com contador/responsável tributário; verificar regras IBS/CBS e legislação MT vigentes.
- R09: observação read-only do Bling por GET, filas duráveis, reconciliação em caso de timeout, invariantes de content hash.
- R10: NF-e só é emitida uma vez com autorização SEFAZ verificável; a expedição segue bloqueada antes da autorização.
- R11–R14: entrega, UX, E2E e canário explícito.

**Produção intocada:** sem migrações, deploy, mensagens, venda Bling, alteração de estoque ou NF-e. R08 ainda não está homologada fim a fim.
