# Marketing Center — Run 59 — 2026-09-12

## Escopo desta rodada

Continuação autônoma exclusivamente do módulo Marketing da Dona Antônia, sem Make e sem rollout real. Foram preservados todos os gates existentes: integrações externas e publicação continuam OFF, canary permanece 0%, kill switch ON e nenhum canal pago/Instagram/Messenger/Ads foi ativado.

## Auditoria antes de alterar

- `docs/RETOMADA-DONA-ANTONIA.md` relido antes de qualquer mudança.
- checkpoint anterior relido: `docs/MARKETING-CENTER-RUN58-20260912.md`.
- PR isolada mantida: `#276` / `feat/marketing-center-clean-20260911`.
- a `main` avançou durante a rodada em frentes de Admin/Atendimento e também recebeu uma entrada de “Imagens IA” no Admin V3 (`f3c3f54ad31b7223e989811dd6ddfd7935ef7703`), seguida de mudanças de Atendimento (`a5af33ef985b10a6a9cab70bd7fac7cfde499694`). Para não conflitar, esta rodada não conectou o Marketing ao loader público nem ao `admin-v3/index.html`.

### Supabase — pré-auditoria

Projeto `ssbesxgaijknwsjbsbcz`:

- Marketing `enabled=false`;
- `execution_mode=off`;
- `canary_percent=0`;
- `kill_switch=true`;
- geração, render determinístico, IA imagem e IA vídeo OFF;
- publicação global e os 6 publishers OFF;
- aprovação obrigatória;
- budgets diários de publicação/IA/custo = 0;
- triage/requeue OFF e triage kill switch ON;
- 15/15 tabelas `marketing%` com RLS;
- 20 funções Marketing auditadas, 0 `SECURITY DEFINER`, 0 EXECUTE para `anon` e 0 para `authenticated`;
- 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests, 0 channel accounts, 8 eventos internos e 0 eventos externos.

Nenhuma migration, Edge Function, Storage, segredo ou configuração externa foi alterada.

## TDD — RED

Antes da implementação foi criado o contrato:

- `scripts/test-marketing-review-session-surface-readonly-ui-v1.mjs`

E o workflow `.github/workflows/marketing-center-clean-v1.yml` foi atualizado para exigir a nova superfície.

O run `34703175494` terminou em `failure`, como esperado, no passo **Syntax check dormant private Marketing UI and local tooling**, porque `admin-v3/marketing-review-session-surface-readonly-v1.js` ainda não existia. Os demais passos foram pulados após essa falha. Isso comprova o RED antes do código de produção.

## Implementação

Novo arquivo:

- `admin-v3/marketing-review-session-surface-readonly-v1.js`

API privada/dormente:

- `getStatus(session)`;
- `renderStatusHtml(session)`;
- `mountCurrent(root, session)`.

### Regras de segurança

- exibe somente estado sanitizado `current | superseded | stale`, asset e revisão;
- não exibe blockers brutos, hashes completos, spec, legenda, approval payload, SVG, PNG ou request body;
- não usa rede, Supabase, Storage, filesystem, providers, credenciais ou persistência browser;
- não possui approve, schedule, publish, execute ou requeue;
- continua ausente de `admin/app-lite.js` e `admin-v3/index.html`, portanto permanece dormente;
- sessão `superseded` ou `stale` falha fechado antes de qualquer mutação no DOM;
- `mountCurrent` revalida o estado imediatamente antes da escrita para reduzir janela TOCTOU e impedir montagem silenciosa após invalidação/supersessão.

Commit funcional: `7a38c40a06e61d01103920690f5640874b71c93f`.

## TDD — GREEN

O run `34703254377` terminou `completed/success`.

Passaram o syntax-check, todos os contratos Marketing anteriores e o novo passo:

- **Validate dormant fail-closed Marketing review session surface**.

O job `103578621573` concluiu com sucesso e todos os passos de validação do Marketing ficaram verdes.

## Pós-auditoria Supabase

Estado confirmado novamente após a implementação:

- Marketing OFF;
- `execution_mode=off`;
- canary 0%;
- kill switch ON;
- geração/render/IA OFF;
- os 6 publishers OFF;
- aprovação obrigatória;
- budgets zero;
- triage/requeue OFF;
- 0 assets;
- 0 render jobs;
- 0 publication jobs;
- 0 triage requests;
- 0 channel accounts;
- 8 eventos internos;
- 0 eventos externos;
- 15/15 tabelas Marketing com RLS;
- 20 funções Marketing, 0 `SECURITY DEFINER`, 0 EXECUTE `anon`, 0 EXECUTE `authenticated`.

Nenhum efeito externo foi produzido.

## Estado do projeto

O Marketing ainda **não está integralmente concluído/homologado programaticamente**. A automação recorrente ainda deve permanecer ativa.

## Próximo bloco seguro

Criar um coordenador privado/read-only e somente em memória para unir `summary -> session -> comparison -> surface` em um único frame de revisão, com lease/epoch efêmero ligado a asset + revisão + session token. O frame deve:

1. nascer apenas para sessão `current`;
2. invalidar imediatamente quando a revisão se tornar `superseded` ou `stale`;
3. nunca transportar conteúdo bruto, mídia ou payload publicável;
4. continuar fora do loader público;
5. permanecer sem rede, persistência, provider, publisher, dispatch ou requeue.

Continuam proibidos nesta fase: vídeo real, IA paga, Storage, publicação real, aumento de canary, Instagram/Messenger/Ads e qualquer gasto pago sem autorização explícita.
