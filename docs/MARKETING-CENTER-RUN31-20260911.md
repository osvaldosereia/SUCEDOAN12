# Marketing Center — Run 31 — 2026-09-11

## Escopo
Somente Marketing Dona Antônia. Sem Make. Nenhum publisher real, Instagram/Messenger/Ads, provider pago ou gasto externo foi ativado.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN30-20260911.md` relidos.
- PR #254 auditada: aberta na branch isolada `feat/marketing-center-v1-20260910`, `mergeable=false`; nenhum rebase/merge forçado.
- `main` auditada em `3a3922fed93fbb9c2810ce69d6aba1921a68fa77`, avançando por Product Studio; fora do escopo.
- GitHub Actions no HEAD da Run 30 continuava sem workflow run associado.
- Supabase `ssbesxgaijknwsjbsbcz` auditado: Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render determinístico/IA OFF, publishing global e seis canais OFF, atribuição OFF, triagem OFF, requeue OFF, kill switch da triagem ON, aprovação obrigatória e limites diários zero.

## Bloco implementado — UI dos contadores V18
A aba Renderer agora apresenta, a partir da resposta redigida `action=list` da Edge `admin-marketing-render-triage-v1`:
- pendentes;
- aprovadas;
- bloqueadas;
- executadas;
- canceladas;
- total;
- buckets de idade de pendências `<15m`, `15–60m`, `1–6h`, `6–24h`, `>24h`;
- idade da pendência mais antiga;
- idade da aprovação mais antiga.

A UI continua sem polling contínuo e sem `approve`/`execute`. Cancelamento permanece limitado a `pending_review`. Nenhum retry/requeue é disparado pela visualização.

## Fail-closed no navegador
`assertTriageList` foi endurecido para exigir simultaneamente:
- `metrics.external_side_effect=false`;
- redaction de snapshots de elegibilidade/resultado;
- redaction de idempotency key;
- redaction de IDs de atores;
- redaction de erro bruto;
- redaction de payload de job.

Se a Edge relaxar esse contrato, os contadores são recusados pelo Admin.

## CI
Criado `scripts/test-marketing-render-triage-summary-ui-v1.mjs` cobrindo:
- presença dos contadores e buckets V18;
- uso somente da resposta redigida de `list`;
- fail-closed de `external_side_effect` e `job_payload_exposed`;
- ausência de approve/execute na UI;
- ausência de polling de triagem;
- ausência de endpoints de OpenAI/Meta/Pinterest/Google.

O workflow `.github/workflows/marketing-center-v1.yml` foi atualizado para executar esse contrato. No fechamento desta rodada, GitHub ainda retornava 0 workflow runs para o HEAD consultado; não declarar CI verde sem execução real.

## Verificação Supabase
`marketing_render_triage_metrics_v1()` retornou:
- `ok=true`;
- todos os contadores = 0;
- todos os buckets = 0;
- oldest pending/approved = 0;
- todas as flags de redaction = false;
- `external_side_effect=false`.

Contagens reais após a rodada:
- assets = 0;
- render jobs = 0;
- publication jobs = 0;
- triage requests = 0;
- eventos Marketing com efeito externo = 0.

Security Advisor foi executado. Marketing permanece no padrão server-only/RLS sem novo `SECURITY DEFINER`; persistem avisos globais/preexistentes fora do escopo, incluindo funções de outras frentes e Leaked Password Protection desabilitado.

## Gates preservados
- Marketing OFF;
- execution_mode OFF;
- canary 0%;
- kill switch ON;
- triagem OFF;
- requeue OFF;
- kill switch da triagem ON;
- aprovação obrigatória;
- geração/render/IA OFF;
- publicação global e seis canais OFF;
- atribuição OFF;
- budgets/limites zero.

## Próximo bloco seguro
1. Confirmar execução real do `Marketing Center V1` no HEAD atual.
2. Se CI verde, revisar conflitos atuais da PR #254 apenas no escopo Marketing e documentar estratégia de reconciliação sem rebase/merge forçado.
3. Em seguida, avançar somente em controles administrativos seguros que não habilitem requeue/publishers; candidatos: exportação redigida de diagnóstico/triagem e observabilidade de SLA da triagem, ambos somente leitura.
4. Manter IA paga, requeue real e todos os publishers OFF/dry-run.

O Marketing ainda não está integralmente concluído/homologado.
