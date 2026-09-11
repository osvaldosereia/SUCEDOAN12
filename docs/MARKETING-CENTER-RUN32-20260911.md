# Marketing Center — Run 32 — 2026-09-11

## Escopo
Somente Marketing Dona Antônia. Sem Make. Nenhum publisher real, Instagram/Messenger/Ads, provider pago ou gasto externo foi ativado.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN31-20260911.md` relidos antes das alterações.
- PR #254 auditada e mantida na branch isolada `feat/marketing-center-v1-20260910`; nenhum rebase/merge forçado.
- `main` auditada em `5b2e67c474ba41da704f95bc24920b9e3cb6a2ed`, avançando fora do módulo Marketing.
- GitHub Actions no HEAD da Run 31 continuava sem workflow run associado; não declarar CI verde sem execução real.
- Supabase `ssbesxgaijknwsjbsbcz` auditado antes da DDL. O schema real de Marketing e as funções de métricas/diagnóstico/triagem foram conferidos.

## Bloco implementado — SLA redigido da triagem V19
Criada a migration `20260911114000_marketing_render_triage_sla_v19.sql` com a função server-only `marketing_render_triage_sla_v1()`.

Características:
- somente leitura;
- `SECURITY INVOKER`;
- `public`, `anon` e `authenticated` sem EXECUTE;
- `service_role` com EXECUTE;
- limiar de atenção fixo em 1 hora;
- limiar crítico fixo em 6 horas;
- mede separadamente `pending_review` e `approved` aguardando execução;
- retorna apenas contadores e estado agregado `healthy|warning|critical`;
- não retorna request IDs, job IDs, actor IDs, idempotency key, erro bruto ou payload de job;
- `external_side_effect=false`;
- nenhuma mutação, retry, requeue, chamada de provider ou publicação.

A migration foi aplicada com sucesso no Supabase real. A leitura de homologação retornou `ok=true`, `status=healthy`, todos os contadores warning/critical em zero, redaction integral e `external_side_effect=false`.

Privilégios homologados:
- anon execute = false;
- authenticated execute = false;
- service_role execute = true.

## CI/contrato
Criado `scripts/test-marketing-render-triage-sla-v1.mjs`, cobrindo:
- SECURITY INVOKER;
- privilégios server-only;
- limiares 1h/6h;
- redaction;
- external_side_effect=false;
- ausência de endpoints OpenAI/Meta/Pinterest/Google;
- ausência de insert/update/delete, request/requeue/execute.

O workflow `.github/workflows/marketing-center-v1.yml` foi atualizado para executar explicitamente esse contrato.

## Estado real após a rodada
Contagens:
- assets = 0;
- render jobs = 0;
- publication jobs = 0;
- triage requests = 0;
- eventos Marketing com efeito externo = 0.

Gates preservados:
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
A V19 foi deliberadamente mantida no banco + contrato de CI. Ela ainda não foi ligada à Edge/UI porque isso exigiria alterar novamente o contrato de listagem do Admin; esse é o próximo bloco seguro. Não foi introduzido polling, alerta automático, retry ou execução automática baseada em SLA.

## Próximo bloco seguro
1. Confirmar se o GitHub criou execução real do `Marketing Center V1` para o novo HEAD.
2. Integrar `marketing_render_triage_sla_v1()` à ação `list` da Edge com fail-closed de redaction/external_side_effect.
3. Exibir o estado SLA na aba Renderer somente leitura, sem polling e sem approve/execute.
4. Manter IA paga, requeue real e todos os publishers OFF/dry-run.

O Marketing ainda não está integralmente concluído/homologado.
