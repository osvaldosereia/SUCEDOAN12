# Marketing Center — Run 29 — 2026-09-11

## Escopo
Somente Marketing Dona Antônia. Sem Make. Nenhum publisher real, Ads, Instagram/Messenger, provider de IA ou gasto externo foi ativado.

## Auditoria antes das alterações
- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN28-20260911.md` relidos.
- PR #254 auditada: aberta na branch isolada `feat/marketing-center-v1-20260910`, `mergeable=false`; nenhum rebase/merge forçado.
- `main` auditada em `d4bccda3a12da845795de54c75f2e3c81503ba9f`, avançando por Product Studio; fora do escopo desta rodada.
- Supabase `ssbesxgaijknwsjbsbcz` permaneceu `ACTIVE_HEALTHY`.
- Gates reais auditados em `marketing_runtime_config`: Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA OFF, publishing global e seis canais OFF, atribuição OFF, triagem OFF, requeue OFF, kill switch de triagem ON, aprovação obrigatória e budgets zero.
- Contagens reais antes/depois: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests e 0 eventos Marketing com efeito externo.

## Implementado — V18 métricas compactas de triagem
Criado e aplicado `marketing_render_triage_metrics_v1()` como read model exclusivamente de leitura:
- `SECURITY INVOKER`;
- server-only: `anon=false`, `authenticated=false`, `service_role=true`;
- contadores globais por `pending_review | approved | blocked | executed | cancelled`;
- buckets de idade das pendências: `<15m`, `15–60m`, `1–6h`, `6–24h`, `>24h`;
- idade da pendência mais antiga e da aprovação mais antiga ainda não executada;
- redaction explícita para snapshots, idempotency key, actor ids, erro bruto e payload do job;
- `external_side_effect=false` obrigatório;
- nenhuma mutação de render job, retry, requeue, chamada de provider ou publicação.

Homologação real sem fixtures retornou todos os contadores em zero e `external_side_effect=false`.

## Edge `admin-marketing-render-triage-v1`
A ação `list` agora compõe os contadores V18 junto da projeção redigida já existente.
- Edge implantada no Supabase como versão 5, `ACTIVE`, `verify_jwt=true`;
- fail-closed para ausência de `external_side_effect=false`;
- fail-closed se qualquer flag de redaction do read model for relaxada;
- nenhuma chamada a Meta, Pinterest, Google, OpenAI ou publisher foi adicionada;
- `approve/execute` continuam fora da UI e restritos a owner no backend.

## Testes/CI
Adicionado `scripts/test-marketing-render-triage-metrics-v1.mjs`, cobrindo:
- criação da RPC V18;
- SECURITY INVOKER e privilégios server-only;
- todos os estados e buckets de idade;
- redaction completa;
- ausência de mutação/provider;
- consumo pela Edge e comportamento fail-closed.

O workflow `Marketing Center V1` passou a executar explicitamente este novo contrato.

No HEAD `f981e1973dabdff8f2b75c1a069ec3707c9684b4`, GitHub ainda retornou `total_count=0` para check-runs. CI não deve ser declarado verde sem execução real.

## Security Advisor
Security Advisor executado após a V18.
- Nenhum novo `SECURITY DEFINER` foi introduzido pelo Marketing.
- `marketing_render_triage_requests` continua no padrão RLS/server-only sem policy pública, deliberado neste módulo.
- WARNs de `SECURITY DEFINER` encontrados pertencem a Flow/Agent Workflow e ficaram fora de escopo.
- aviso global de leaked-password protection permanece fora do escopo do Marketing.

## Gates preservados
- Marketing OFF;
- execution_mode OFF;
- canary 0%;
- kill switch ON;
- triagem OFF;
- requeue OFF;
- kill switch de triagem ON;
- aprovação obrigatória;
- geração/renderer/IA OFF;
- publicação global e seis canais OFF;
- atribuição OFF;
- budgets/limites zero.

## Próximo bloco seguro
1. Confirmar execução real do GitHub Actions `Marketing Center V1` no HEAD novo e corrigir apenas falhas de Marketing.
2. Levar `summary`, buckets de idade e oldest pending/approved para a aba Renderer de forma compacta, somente leitura e sem polling.
3. Homologar cancel/replay owner/operator com fixture + ROLLBACK apenas se a ferramenta permitir normalmente, sem contornar segurança.
4. Manter requeue real OFF e publishers exclusivamente OFF/dry-run.

O Marketing ainda não está integralmente concluído/homologado.
