# Marketing Center — Run 12 — 2026-09-10

## Escopo desta rodada

Somente módulo Marketing da Dona Antônia, sem Make e sem alteração de rollout externo.

## Auditoria antes de alterar

- `docs/RETOMADA-DONA-ANTONIA.md` relido em `main`.
- checkpoint anterior relido: `docs/MARKETING-CENTER-RUN11-20260910.md`.
- PR isolada mantida: `#254`, branch `feat/marketing-center-v1-20260910`.
- CI específico da Run 11 confirmado verde: `Marketing Center V1`, run 70.
- outras PRs abertas auditadas; Flow e atendimento continuam em frentes separadas.
- durante a auditoria a PR chegou a aparecer temporariamente não-mergeable enquanto `main` avançava; na verificação após os commits da rodada o GitHub voltou a reportar `mergeable=true`. Nenhum rebase/merge de outra frente foi executado.
- Supabase `ssbesxgaijknwsjbsbcz` confirmado `ACTIVE_HEALTHY`.
- runtime Marketing reconfirmado antes das mudanças: `enabled=false`, `execution_mode=off`, `canary_percent=0`, `kill_switch=true`, geração/render/IA/publicação OFF e `require_approval=true`.

## Implementado

### 1. Painel de métricas 7 / 30 / 90 dias

Novo módulo de Admin `admin-v3/marketing-insights-v1.js` com seletor rápido 7, 30 e 90 dias, conteúdos criados/aprovados, publication jobs, agendados, `review_required`, custo real e atribuição explicitamente `foundation_only`. O painel não infere venda, pedido, conversa ou receita atribuída.

### 2. Edge de leitura isolada

Nova Edge Function `admin-marketing-insights-v1`, deploy Supabase v2, `verify_jwt=true`, RBAC somente `owner|operator` ativos. Ações permitidas: `overview` (leitura de assets, mídias e runtime) e `metrics` (somente janelas 7/30/90 usando a RPC server-only `marketing_metrics_read_model_v1`). Não há ação de escrita, ativação, publicação, token de provider, geração IA ou chamada a rede social nessa Edge.

### 3. Simulador dry-run no Admin

Nova aba `Métricas e dry-run`: seleciona conteúdo/canal/mídias privadas, solicita URL assinada temporária de 5 minutos ao serviço de mídia já existente, envia somente o payload de homologação para `admin-marketing-dry-run-v1` e exibe o contrato preparado. O cliente recusa a resposta se `dry_run !== true` ou `external_side_effect !== false`.

Canais visíveis: WhatsApp Status (`manual_confirm`), Instagram Stories, Facebook Stories, Instagram Carrossel, Pinterest e Google Perfil da Empresa. Nenhuma publicação é feita pelo painel.

### 4. Enquadramento por slide

`admin-v3/marketing-carousel-media-v1.js` ganhou controles versionados em `edit_spec.crop`: fit somente `contain|cover`, posição X/Y de 0–100% e escala de 0,5–3x. Os valores são normalizados/clampados antes de salvar. Não foi necessária nova migration.

### 5. CI / contrato de segurança

Novo teste `scripts/test-marketing-insights-admin-v1.mjs` cobre janelas 7/30/90, RBAC, ausência de endpoints/tokens de providers no serviço de insights, `verify_jwt=true`, fail-closed do dry-run, controles/limites de crop e persistência em `edit_spec`. Workflow `Marketing Center V1` atualizado para sintaxe e novo contrato.

## Validação real no Supabase

RPC consultada diretamente para 7, 30 e 90 dias: assets 0, aprovados 0, publication jobs 0, agendados 0, custos estimado/real 0, eventos internos 2 e eventos com `external_side_effect=true` 0. Atribuição segue `foundation_only`.

A Edge `admin-marketing-insights-v1` foi implantada com JWT obrigatório e não altera banco. O Security Advisor foi consultado; ele mantém avisos globais pré-existentes (principalmente tabelas privadas com RLS sem policy e proteção de senha vazada desabilitada). Nenhuma nova tabela/RLS foi criada nesta rodada.

## Gates preservados

Continuam obrigatoriamente: Marketing `enabled=false`, `execution_mode=off`, canary `0%`, kill switch `true`, geração OFF, renderer determinístico OFF, IA imagem OFF, IA vídeo OFF, publishing global OFF e todos os seis canais OFF. Nenhuma ativação de Instagram/Messenger/Ads, nenhum gasto pago e nenhum Make.

## Estado Git/CI no fechamento

A PR #254 permanece aberta e isolada e voltou a ser reportada como `mergeable=true`. O novo CI `Marketing Center V1` da Run 12 foi disparado; deve ser confirmado antes do próximo bloco caso ainda esteja em execução.

## Próximo bloco seguro

1. confirmar o CI da Run 12;
2. testar a nova aba com um asset/mídia real de homologação sem ativar geração/publicação;
3. levar `edit_spec.crop` ao renderer determinístico para o output respeitar X/Y/escala/fit;
4. adicionar seleção explícita de `source image` por slide sem URL pública persistente;
5. evoluir métricas com distribuição por canal/modo/status e custo estimado x real;
6. desenhar contrato determinístico `conteúdo -> clique/conversa -> pedido`, sem inferência;
7. somente depois revalidar Meta oficial e construir adapters de homologação/dry-run; não criar dispatcher real sem autorização explícita.

## Critério de conclusão

Projeto Marketing ainda **não está integralmente concluído/homologado programaticamente**. A automação recorrente não deve ser desativada nesta rodada.
