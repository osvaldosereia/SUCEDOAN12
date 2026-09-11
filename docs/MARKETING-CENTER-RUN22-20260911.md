# Marketing Center — Run 22 — 2026-09-11

## Escopo desta rodada
Somente o módulo Marketing da Dona Antônia. Nenhuma alteração em Make, Agent Core, Flow, Bling, Ads ou outras frentes. Nenhuma publicação externa, chamada a provider, geração paga ou aumento de rollout foi realizado.

## Auditoria antes das alterações
- retomada geral relida em `docs/RETOMADA-DONA-ANTONIA.md`;
- checkpoint mais recente relido: `docs/MARKETING-CENTER-RUN21-20260910.md`;
- PR isolada #254 auditada contra `main`; continua aberta e com conflito (`mergeable=false`), portanto não houve rebase/merge forçado;
- Supabase auditado antes das mudanças: Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA OFF, publicação global e seis canais OFF, atribuição OFF e limites de custo/volume em zero;
- antes da rodada: 0 assets, 0 render jobs e 0 eventos Marketing com efeito externo.

## Implementado

### 1. Observabilidade do renderer por tipo — V14
Migration nova: `supabase/migrations/20260911014500_marketing_render_kind_metrics_v14.sql`.

`marketing_render_metrics_read_model_v1` continua estritamente somente leitura e agora adiciona `jobs.by_kind_detail`, com, por `render_kind`:
- total;
- renderizados;
- falhas;
- revisão necessária;
- jobs com retry;
- total de tentativas;
- taxa de sucesso determinística.

Foram preservados:
- `SECURITY INVOKER`;
- `search_path=public,pg_temp`;
- execução revogada de `public`, `anon` e `authenticated`;
- EXECUTE somente para `service_role`;
- janela máxima de 366 dias;
- `external_side_effect=false`;
- zero HTTP/provider/IA/publicação.

A migration V14 foi aplicada ao Supabase.

### 2. Nova aba read-only no Admin
Novo módulo: `admin-v3/marketing-render-observability-v1.js`.

O Admin agora possui a aba **Renderer**, carregada por `admin/config.js`, com leitura manual em 7/30/90 dias e botão Atualizar.

Indicadores compactos:
- Na fila;
- Processando;
- Renderizados;
- Falhas;
- P95 fila;
- P95 render;
- taxa de sucesso;
- jobs com retry.

Há ainda diagnóstico por `render_kind`, com total, OK, falhas, retries e taxa de sucesso.

A tela usa exclusivamente `admin-marketing-insights-v1` com `action=metrics`, exige simultaneamente `external_side_effect=false` no envelope e no bloco do renderer e falha fechada caso o contrato somente leitura seja violado. Não há polling contínuo: a leitura ocorre ao abrir a aba, trocar 7/30/90 ou pressionar Atualizar.

Ela não possui ação de render, publicação, IA ou provider externo.

### 3. Contrato de CI ampliado
`scripts/test-marketing-insights-admin-v1.mjs` agora cobre:
- parse do novo módulo JavaScript via `new Function`;
- presença das métricas compactas e janelas 7/30/90;
- fail-closed de `external_side_effect`;
- ausência de endpoints/credenciais de Meta, Pinterest, Google e OpenAI;
- ausência de ações `request_render`/`publish_job`;
- ausência de polling contínuo de métricas;
- V14 server-only / SECURITY INVOKER;
- métricas de falha/retry/sucesso por `render_kind`;
- carregamento explícito do painel pelo Admin.

## Homologação no Supabase
Após aplicar V14, a chamada real de `marketing_render_metrics_read_model_v1` retornou:
- `ok=true`;
- `external_side_effect=false`;
- 0 jobs;
- 0 falhas/retries;
- latências zeradas por ausência de workload;
- `by_kind_detail={}`.

Privilégios verificados:
- `anon_execute=false`;
- `authenticated_execute=false`;
- `service_role_execute=true`.

`render_kind` e `attempt_count` são `NOT NULL`, portanto o agregador por tipo não fica exposto a chave JSON nula.

## CI / validação
O contrato foi atualizado no workflow já existente `Marketing Center V1`, que executa `scripts/test-marketing-insights-admin-v1.mjs`.

No momento deste checkpoint, o novo HEAD ainda não possui execução identificável do workflow dedicado; o status agregado do commit continua pendente. Outros workflows gerais do repositório são disparados pela branch e podem falhar por frentes não-Marketing; isso não será usado para relaxar contratos nem para alterar módulos externos.

Uma tentativa de clone local para executar Node falhou por indisponibilidade de resolução DNS no runtime local (`github.com` não resolvido), portanto não foi registrada como falha do código. O teste agora inclui parse explícito do novo módulo para o próximo CI dedicado.

## Estado final de segurança
Nenhum gate foi alterado nesta rodada. Permanecem:
- Marketing OFF;
- execution mode OFF;
- canary 0%;
- kill switch ON;
- geração OFF;
- renderer determinístico OFF;
- IA imagem/vídeo OFF;
- publishing global OFF;
- WhatsApp Status OFF;
- Instagram Stories OFF;
- Facebook Stories OFF;
- Instagram Carrossel OFF;
- Pinterest OFF;
- Google Perfil da Empresa OFF;
- attribution recording OFF;
- budgets/limites em zero.

Não houve Make, publicação real, Instagram/Messenger/Ads, gasto pago ou chamada aos providers.

## Próxima rodada segura
1. confirmar o CI dedicado `Marketing Center V1` do HEAD novo e corrigir somente problemas do escopo Marketing;
2. adicionar observabilidade read-only de jobs potencialmente presos/leases vencidos, com thresholds determinísticos e sem ação automática;
3. depois criar drill-down operacional somente leitura para falhas recentes, sem expor payload sensível e sem botão de retry automático enquanto rollout estiver OFF;
4. manter publishers exclusivamente OFF/dry-run.

## Conclusão
O Marketing ainda não está integralmente concluído/homologado. A execução recorrente deve continuar.