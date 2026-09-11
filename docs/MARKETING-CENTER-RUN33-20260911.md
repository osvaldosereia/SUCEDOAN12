# Marketing Center — Run 33 — 2026-09-11

## Escopo
Somente Marketing Dona Antônia. Sem Make. Nenhum publisher real, Instagram/Messenger/Ads, provider pago, IA paga ou gasto externo foi ativado.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN32-20260911.md` relidos antes das alterações.
- PR #254 auditada e mantida na branch isolada `feat/marketing-center-v1-20260910`; nenhum rebase/merge forçado.
- A PR continuava `mergeable=false`.
- `main` auditada em `2a9ac3dcdf8620d9c8c31076c54d5198dceb3397`, avançando em Product Studio, fora do módulo Marketing.
- GitHub Actions para o HEAD da Run 32 continuava sem workflow run associado; não declarar CI verde sem execução real.
- Supabase `ssbesxgaijknwsjbsbcz` auditado antes da alteração: `marketing_render_triage_sla_v1` e `marketing_render_triage_metrics_v1` continuam `SECURITY INVOKER`, anon/authenticated sem EXECUTE e service_role com EXECUTE.
- A leitura real de `marketing_render_triage_sla_v1()` retornou `ok=true`, `status=healthy`, warning/critical em zero, redaction integral e `external_side_effect=false`.

## Bloco implementado — integração SLA V19 na Edge
A ação `list` da Edge `admin-marketing-render-triage-v1` agora consulta `marketing_render_triage_sla_v1()` e devolve o agregado seguro como `sla` junto dos contadores de triagem.

Fail-closed adicionado:
- erro da RPC => `triage_sla_failed`;
- ausência de `external_side_effect=false` => `unsafe_triage_sla`;
- status fora de `healthy|warning|critical` => bloqueio;
- qualquer exposição de request IDs, job IDs, actor IDs, idempotency key, erro bruto ou payload de job => `unsafe_triage_sla_redaction`.

Não foi adicionado polling, alerta automático, retry, requeue, approve/execute no Admin ou chamada a provider externo.

## Deploy
A Edge `admin-marketing-render-triage-v1` foi implantada no Supabase como versão 6:
- status `ACTIVE`;
- `verify_jwt=true`;
- fonte implantada conferida depois do deploy;
- nenhuma mudança de gate ou publisher.

## Testes/contrato
`scripts/test-marketing-render-triage-sla-v1.mjs` foi ampliado para verificar também o contrato da Edge:
- chamada explícita à RPC V19;
- fail-closed de erro/efeito externo/redaction;
- allowlist de estados SLA;
- inclusão de `sla` na resposta redigida da ação `list`;
- ausência de endpoints Meta/OpenAI/Pinterest/Google.

O workflow `Marketing Center V1` já executa esse teste, portanto não foi necessário criar novo job de CI.

## Estado real após a rodada
Contagens confirmadas após o deploy:
- assets = 0;
- render jobs = 0;
- publication jobs = 0;
- triage requests = 0;
- eventos Marketing com efeito externo = 0.

Gates confirmados diretamente em `marketing_runtime_config`:
- Marketing OFF;
- execution_mode OFF;
- canary 0%;
- kill switch ON;
- geração OFF;
- render determinístico OFF;
- IA imagem/vídeo OFF;
- publicação global OFF;
- WhatsApp Status OFF;
- Instagram Stories OFF;
- Facebook Stories OFF;
- Instagram carrossel OFF;
- Pinterest OFF;
- Google Perfil da Empresa OFF;
- atribuição OFF;
- triagem OFF;
- requeue OFF;
- kill switch da triagem ON;
- aprovação obrigatória;
- budgets/limites diários zero.

## Delimitação desta rodada
O SLA já está disponível de forma segura no contrato server-side da aba Renderer, mas ainda não foi renderizado visualmente no Admin. A UI continua sem polling e sem approve/execute. A integração visual fica para a próxima rodada para manter a mudança pequena e verificável.

## Próximo bloco seguro
1. Confirmar se o GitHub criou execução real do `Marketing Center V1` para o novo HEAD.
2. Renderizar `sla.status`, warning/critical de `pending_review` e `approved_waiting_execution`, e os thresholds 1h/6h na aba Renderer, somente leitura.
3. Endurecer o fail-closed do navegador para rejeitar SLA sem `external_side_effect=false` ou redaction integral.
4. Manter IA paga, requeue real e todos os publishers OFF/dry-run.

O Marketing ainda não está integralmente concluído/homologado.
