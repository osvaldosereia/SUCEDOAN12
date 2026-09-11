# Marketing Center — Run 34 — 2026-09-11

## Escopo
Somente Marketing da Dona Antônia. Sem Make. Nenhum rollout externo, canary, IA paga, Ads, Instagram/Messenger ou publisher foi habilitado.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` e Run 33 relidos antes das alterações.
- PR #254 permaneceu aberta e isolada, com `mergeable=false`; nenhum rebase/merge forçado foi executado.
- `main` avançou em outra frente para `d37d3aa4a380cb50b3f97de1d1091f7be74bd561` (`chore: process product studio image batch`), sem mudança de escopo Marketing nesta rodada.
- Supabase confirmou 0 `marketing_assets`, 0 `marketing_render_jobs`, 0 `marketing_publication_jobs`, 0 `marketing_render_triage_requests` e 0 `marketing_events.external_side_effect=true`.
- `marketing_readiness_v1()` confirmou Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA OFF, publishing global e seis canais OFF, triagem/requeue OFF, kill switch da triagem ON, aprovação obrigatória e budgets zero.
- SLA V19 real retornou `healthy`, warning/critical em zero, thresholds 3600/21600 s, redaction integral e `external_side_effect=false`.

## Implementação
### Renderer — SLA V19 somente leitura
`admin-v3/marketing-render-observability-v1.js` agora:
- exibe o SLA da triagem na própria aba Renderer;
- apresenta estado `Saudável`, `Atenção` ou `Crítico`;
- mostra pendências e aprovações aguardando execução em warning/critical;
- mostra explicitamente os thresholds operacionais de 1 h e 6 h;
- permanece sem polling de dados: atualização ocorre somente no carregamento/refresh manual já existente;
- não adiciona `approve`, `execute` ou qualquer requeue automático.

### Fail-closed no navegador
Antes de renderizar o SLA, o Admin exige:
- `external_side_effect=false`;
- status na allowlist `healthy|warning|critical`;
- todos os marcadores de redaction para request/job/actor/idempotency/raw error/job payload em `false`;
- thresholds exatamente 3600 s e 21600 s.

Qualquer relaxamento desse contrato bloqueia a apresentação do SLA.

### Contrato de teste
`scripts/test-marketing-render-triage-sla-v1.mjs` passou a cobrir também a UI:
- mount e binding do SLA;
- allowlist de status e fail-closed de side effect/redaction/thresholds;
- ausência de `approve`/`execute`;
- ausência de polling automático da triagem;
- ausência de endpoints Meta/OpenAI/Pinterest/Google.

O workflow existente `Marketing Center V1` já executa esse teste e também faz `node --check` do arquivo do Renderer.

## Evidência / CI
- Commits funcionais desta rodada: `a76923751b0d29378e432a19c70ecf22a32a05ae` e `9947bb1f1dc4b46415e1435cc2de963e57bb2345`.
- GitHub Actions continuou com 0 workflow runs associados ao HEAD funcional consultado. Portanto CI não é declarado verde sem evidência real.
- O ambiente de container desta execução não possui resolução de rede para clonar o repositório; por isso não foi usado como substituto para o CI.

## Estado de segurança ao final
Nenhum dado operacional foi criado pela rodada e nenhum efeito externo ocorreu. Todos os gates de execução/publicação permanecem fechados, canary continua 0% e todos os budgets permanecem zero.

## Próximo bloco seguro
1. confirmar uma execução real do CI quando o GitHub disponibilizá-la;
2. revisar os conflitos da PR #254 somente no subconjunto Marketing, sem rebase/merge forçado e sem absorver alterações de outras frentes;
3. depois, evoluir observabilidade/fluxo de aprovação apenas em modo somente leitura/dry-run, mantendo requeue e publishers reais OFF.

O Marketing ainda não está integralmente concluído/homologado programaticamente.