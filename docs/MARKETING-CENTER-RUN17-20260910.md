# Marketing Center — Run 17 — 2026-09-10

## Escopo
Somente Marketing da Dona Antônia. Sem Make, sem rollout social, sem Ads, sem gasto de IA e sem aumento de canary.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` relido.
- checkpoint anterior `docs/MARKETING-CENTER-RUN16-20260910.md` relido.
- PR #254 continua aberta e isolada em `feat/marketing-center-v1-20260910`.
- GitHub continua reportando conflito com `main`; nenhum rebase/merge forçado foi feito.
- Supabase revalidado antes das mudanças: Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA/publicação OFF, seis canais OFF, atribuição OFF e budgets em zero.

## Implementado

### 1. Edge administrativa dedicada ao carrossel
Criada e implantada `admin-marketing-carousel-v1`, versão 1, com `verify_jwt=true`.

A função:
- exige JWT válido;
- exige usuário ativo do Admin com papel `owner|operator`;
- aceita apenas assets `media_kind=carousel`;
- não possui endpoint de Meta, Pinterest, Google, OpenAI ou qualquer provider externo;
- não possui ação de publicação;
- retorna sempre `external_side_effect=false` nos caminhos seguros.

### 2. Preflight canônico, read-only
A ação `preflight` lê `marketing_carousel_current_v1` e transforma o `render_spec` server-side em uma visão não editável para o Admin:
- schema canônico;
- canvas;
- quantidade de camadas;
- fonte privada por `media_id`;
- crop `fit/x/y/scale`;
- modo de geração;
- flags `ai_used` e `external_side_effect`.

O preflight só marca o conjunto como canônico quando há 2–10 slides e todos têm `schema=marketing.carousel.render.v1` e `external_side_effect=false`.

### 3. Ação de render ligada ao batch existente
A ação `request_render` chama exclusivamente `request_marketing_carousel_renders_v1`.

Ela não contorna gates. Com o estado atual, o banco devolve `marketing_generation_disabled` antes de criar qualquer job. A chave de idempotência fornecida pelo Admin é estável por asset/versão; a RPC continua responsável pela idempotência por slide.

### 4. Admin
`admin-v3/marketing-carousel-media-v1.js` ganhou:
- botão `Verificar render`;
- painel legível do preflight, sem editor de JSON;
- botão `Enfileirar render` ligado à nova Edge;
- validação fail-closed de `external_side_effect=false` na resposta;
- invalidação visual do preflight quando qualquer campo/ordem do carrossel muda;
- preflight automático após salvar.

### 5. JWT explícito e CI
`supabase/config.toml` passou a declarar `[functions.admin-marketing-carousel-v1] verify_jwt = true`.

Criado `scripts/test-marketing-carousel-preflight-v1.mjs`, que protege:
- RBAC `owner|operator`;
- schema canônico;
- ausência de provider endpoints;
- ausência de fetch HTTP externo hardcoded;
- uso exclusivo das RPCs internas esperadas;
- verificação de `external_side_effect=false` no Admin;
- JWT obrigatório no config.

O workflow `Marketing Center V1` agora observa a nova Edge e executa esse contrato.

## Homologação Supabase
- `admin-marketing-carousel-v1`: ACTIVE, versão 1, `verify_jwt=true`.
- `request_marketing_carousel_renders_v1`: `anon=false`, `authenticated=false`, `service_role=true`.
- chamada direta de homologação com gates OFF retornou `{ok:false,error:'marketing_generation_disabled',external_side_effect:false}`.
- `marketing_render_jobs=0` após a tentativa.
- `marketing_events` com `external_side_effect=true`: 0.

## CI
No momento deste checkpoint, o novo HEAD ainda não tinha check-run associado. O workflow foi atualizado para cobrir explicitamente a Edge/preflight; a próxima rodada deve verificar primeiro o GitHub Actions e corrigir somente falhas de Marketing, se existirem.

## Gates preservados
- Marketing OFF
- execution_mode OFF
- canary 0%
- kill switch ON
- generation OFF
- deterministic renderer OFF
- AI image/video OFF
- global publishing OFF
- WhatsApp Status OFF
- Instagram Story OFF
- Facebook Story OFF
- Instagram Carousel OFF
- Pinterest OFF
- Google Business Profile OFF
- attribution recording OFF
- budgets/publication limits = 0

## Próximo bloco seguro
1. confirmar CI desta Run 17;
2. associar output final de cada render job ao slide correto somente com lease válido + asset/version/slide verificados;
3. registrar `output_media_id`/estado renderizado de forma idempotente e auditável;
4. expor progresso por slide no Admin;
5. depois avançar métricas de render e atribuição determinística;
6. manter todos os publicadores exclusivamente em dry-run até autorização explícita.

O Marketing ainda não está integralmente concluído/homologado; a automação não deve ser desativada nesta rodada.
