# Marketing Center — Run 12 — 2026-09-10

## Escopo desta rodada

Somente módulo Marketing da Dona Antônia, sem Make e sem alteração de rollout externo.

## Auditoria antes de alterar

- `docs/RETOMADA-DONA-ANTONIA.md` relido em `main`.
- checkpoint anterior relido: `docs/MARKETING-CENTER-RUN11-20260910.md`.
- PR isolada mantida: `#254`, branch `feat/marketing-center-v1-20260910`.
- CI específico da Run 11 confirmado verde: `Marketing Center V1`, run 70.
- outras PRs abertas auditadas; Flow e atendimento continuam em frentes separadas.
- PR #254 passou a aparecer `mergeable=false` após avanço concorrente de `main`. Nenhum rebase/merge foi executado nesta rodada para não tocar frentes alheias ao Marketing.
- Supabase `ssbesxgaijknwsjbsbcz` confirmado `ACTIVE_HEALTHY`.
- runtime Marketing reconfirmado antes das mudanças: `enabled=false`, `execution_mode=off`, `canary_percent=0`, `kill_switch=true`, geração/render/IA/publicação OFF e `require_approval=true`.

## Implementado

### 1. Painel de métricas 7 / 30 / 90 dias

Novo módulo de Admin:

- `admin-v3/marketing-insights-v1.js`

Recursos:

- seletor rápido 7, 30 e 90 dias;
- conteúdos criados;
- conteúdos aprovados;
- publication jobs;
- agendados;
- `review_required`;
- custo real em centavos convertido apenas para apresentação;
- atribuição explicitamente `foundation_only`.

O painel não infere venda, pedido, conversa ou receita atribuída.

### 2. Edge de leitura isolada

Nova Edge Function:

- `admin-marketing-insights-v1`
- Supabase deploy atual: v2
- `verify_jwt=true`
- RBAC: somente `owner|operator` ativos do Admin.

Ações permitidas:

- `overview`: leitura de assets, mídias e runtime;
- `metrics`: somente janelas 7/30/90 e RPC server-only `marketing_metrics_read_model_v1`.

Não há ação de escrita, ativação, publicação, token de provider, geração IA ou chamada a rede social nessa Edge.

### 3. Simulador dry-run no Admin

Nova aba `Métricas e dry-run`:

- seleciona conteúdo e canal;
- seleciona mídia privada registrada;
- solicita URL assinada temporária de 5 minutos ao serviço de mídia já existente;
- envia somente o payload de homologação para `admin-marketing-dry-run-v1`;
- exibe o contrato preparado;
- recusa a resposta se `dry_run !== true` ou `external_side_effect !== false`.

Canais visíveis:

- WhatsApp Status — continua `manual_confirm`;
- Instagram Stories;
- Facebook Stories;
- Instagram Carrossel;
- Pinterest;
- Google Perfil da Empresa.

Nenhuma publicação é feita pelo painel.

### 4. Enquadramento por slide

`admin-v3/marketing-carousel-media-v1.js` ganhou controles por slide:

- fit: somente `contain|cover`;
- posição X: 0–100%;
- posição Y: 0–100%;
- escala: 0,5–3x.

Os valores são normalizados/clampados no cliente e persistidos dentro de `edit_spec.crop`, portanto seguem o versionamento já existente do carrossel. Não foi necessária nova migration.

### 5. CI / contrato de segurança

Novo teste:

- `scripts/test-marketing-insights-admin-v1.mjs`

Cobre:

- janelas 7/30/90;
- RBAC do endpoint;
- ausência de endpoints/tokens de providers no serviço de insights;
- `verify_jwt=true`;
- fail-closed do simulador dry-run;
- controles e limites de crop;
- persistência do enquadramento em `edit_spec`.

Workflow `Marketing Center V1` atualizado para validar sintaxe e novo contrato.

## Validação real no Supabase

RPC consultada diretamente para 7, 30 e 90 dias:

- assets: 0;
- assets aprovados: 0;
- publication jobs: 0;
- agendados: 0;
- custos estimado/real: 0;
- eventos internos: 2;
- eventos com `external_side_effect=true`: 0;
- atribuição: `foundation_only`.

A Edge `admin-marketing-insights-v1` foi implantada com JWT obrigatório e não altera banco.

O Security Advisor foi consultado. Ele mantém avisos globais pré-existentes do projeto (principalmente tabelas privadas com RLS e nenhuma policy, usadas via `service_role`, e proteção de senha vazada desabilitada). Nenhuma nova tabela/RLS foi criada nesta rodada.

## Gates preservados

Continuam obrigatoriamente:

- Marketing `enabled=false`;
- `execution_mode=off`;
- canary `0%`;
- kill switch `true`;
- geração OFF;
- renderer determinístico OFF;
- IA imagem OFF;
- IA vídeo OFF;
- publishing global OFF;
- WhatsApp Status OFF;
- Instagram Story OFF;
- Facebook Story OFF;
- Instagram Carousel OFF;
- Pinterest OFF;
- Google Business Profile OFF;
- nenhuma ativação de Instagram/Messenger/Ads;
- nenhum gasto pago autorizado;
- nenhum Make.

## Pendência de integração Git

A PR #254 está isolada, porém GitHub passou a reportar conflito com o `main` concorrente (`mergeable=false`). Não resolver automaticamente nesta rodada foi intencional: resolver poderia incorporar ou sobrescrever trabalho de Flow/Admin de outras frentes. Antes da futura integração, fazer reconciliação cirúrgica somente dos arquivos compartilhados, principalmente loaders/config do Admin.

## Próximo bloco seguro

1. confirmar o novo CI `Marketing Center V1` da Run 12;
2. testar a nova aba com um asset/mídia real de homologação sem ativar geração/publicação;
3. levar `edit_spec.crop` ao renderer determinístico para que o preview/output final respeite X/Y/escala/fit;
4. adicionar seleção explícita de `source image` por slide sem URL pública persistente;
5. evoluir métricas com distribuição por canal/modo/status e custo estimado x real;
6. desenhar contrato determinístico de atribuição `conteúdo -> clique/conversa -> pedido`, ainda sem inferência;
7. somente depois revalidar documentação oficial Meta e construir adapters em modo de homologação/dry-run; não criar dispatcher real sem autorização explícita.

## Critério de conclusão

Projeto Marketing ainda **não está integralmente concluído/homologado programaticamente**. A automação recorrente não deve ser desativada nesta rodada.
