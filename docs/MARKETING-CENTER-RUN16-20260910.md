# Marketing Center — Run 16 — 2026-09-10

## Escopo desta rodada
Somente o módulo Marketing da Dona Antônia. Nenhuma alteração em Make, WhatsApp Flow comercial, Instagram/Messenger/Ads ou outros módulos.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN15-20260910.md` relidos antes das mudanças.
- PR isolada: `#254`, branch `feat/marketing-center-v1-20260910`.
- CI da Run 15 confirmado verde no workflow **Marketing Center V1**, run 104.
- Supabase de produção revalidado antes do DDL: `enabled=false`, `execution_mode=off`, `canary_percent=0`, `kill_switch=true`, geração/render determinístico/IA/publicação OFF, todos os seis canais OFF e limites diários de IA/publicação em zero.
- `attribution_recording_enabled=false` permanece no metadata do runtime.

## Implementado — render_spec canônico V11
Migration aplicada: `marketing_carousel_render_spec_v11`.
Arquivo versionado: `supabase/migrations/20260910194000_marketing_carousel_render_spec_v11.sql`.

### 1. Render spec server-side
Nova RPC interna `marketing_build_carousel_slide_render_spec_v1`:
- gera `schema=marketing.carousel.render.v1`;
- canvas determinístico 1080×1350;
- snapshot de headline/preço/CTA e crop;
- crop normalizado: `contain|cover`, X/Y 0–100 e escala 0,5–3;
- fonte privada representada apenas por `{kind: private_media, media_id}`;
- nenhum URL público/assinado ou caminho remoto entra no spec;
- `ai_used=false` e `external_side_effect=false` explícitos.

### 2. Cliente deixou de ser autoridade do render_spec
`save_marketing_carousel_slides_v1` foi endurecida:
- ignora deliberadamente `render_spec` recebido do navegador;
- recompõe todo render spec no servidor;
- aceita no máximo uma fonte privada por slide;
- valida UUID e exige que a mídia seja imagem;
- exige `media.asset_id = carousel_asset_id` e `media.version = asset.version`;
- mídia de outro conteúdo/versão falha fechado com `carousel_media_scope_mismatch`;
- continua invalidando aprovação/agendamento e retornando o conteúdo para draft após edição.

### 3. Batch determinístico idempotente
Nova RPC interna `request_marketing_carousel_renders_v1`:
- só prossegue com runtime global habilitado, kill switch desligado, geração habilitada e renderer determinístico habilitado;
- portanto está inoperante no estado atual de produção;
- exige 2–10 slides atuais e render specs canônicos;
- slide `generation_mode=ai` não entra implicitamente no caminho econômico: falha com `ai_slide_requires_explicit_ai_pipeline`;
- cria jobs `deterministic_image` com custo previsto padrão zero;
- chave idempotente inclui asset, versão e número do slide;
- replay não cria novo job/evento;
- payload enfileirado é o snapshot canônico, evitando drift entre edição e renderização;
- nenhum publicador ou API social é chamado.

## Homologação transacional no Supabase
Teste descartável com `BEGIN ... ROLLBACK` validou:
1. criação de carrossel + mídia privada da mesma versão;
2. envio proposital de `render_spec` cliente contendo `https://evil.example/...`;
3. confirmação de que o URL malicioso foi descartado;
4. geração server-side de `marketing.carousel.render.v1`;
5. clamp real de crop X=150 → 100, Y=-20 → 0, escala=9 → 3;
6. bloqueio de mídia pertencente a outro asset;
7. tentativa falha não destrói os slides válidos existentes;
8. pedido de batch com gates atuais retorna `marketing_generation_disabled`;
9. zero jobs criados enquanto os gates estão OFF.

Após o ROLLBACK: `0` assets `AUTOTEST%` permaneceram no banco.

## RBAC / privilégios
Revalidado após migration:
- `marketing_build_carousel_slide_render_spec_v1`: anon=false, authenticated=false, service_role=true;
- `save_marketing_carousel_slides_v1`: anon=false, authenticated=false, service_role=true;
- `request_marketing_carousel_renders_v1`: anon=false, authenticated=false, service_role=true.

Eventos Marketing com `external_side_effect=true`: `0`.

## Homologação do worker
`test-marketing-worker-v1.mjs` ganhou um teste end-to-end sem rede externa:
- spec canônico com `media_id` privado;
- lookup/download Supabase simulados no limite do resolver;
- validação SHA-256;
- materialização em arquivo temporário;
- crop real em dois X diferentes;
- render WebP real por Sharp;
- hashes de saída diferentes confirmam que o crop afeta pixels;
- diretórios temporários precisam desaparecer após cada job;
- redirects continuam bloqueados;
- `external_side_effect=false` continua obrigatório.

`test-marketing-carousel-v1.mjs` agora também protege por contrato a V11, incluindo autoridade server-side, escopo asset/version, clamps, gates, idempotência e ausência de AI implícita.

## CI
O workflow foi atualizado para observar a migration V11. No momento deste checkpoint, commits criados via conector ainda não tinham workflow run associado ao novo HEAD; portanto a validação GitHub Actions desta Run 16 deve ser confirmada primeiro na próxima rodada. O último HEAD anterior (Run 15) tinha **Marketing Center V1 run 104 = success**.

## Situação da PR
A PR #254 permanece aberta e isolada, porém GitHub passou a reportar `mergeable=false` contra a `main`, que avançou em paralelo em outras frentes. Nenhum merge/rebase forçado foi feito para evitar conflito com módulos fora de Marketing.

## Gates preservados
- Marketing: OFF
- execution_mode: off
- canary: 0%
- kill switch: ON
- generation: OFF
- deterministic renderer: OFF
- AI image: OFF
- AI video: OFF
- global publishing: OFF
- WhatsApp Status: OFF
- Instagram Story: OFF
- Facebook Story: OFF
- Instagram Carousel: OFF
- Pinterest: OFF
- Google Business Profile: OFF
- attribution recording: OFF
- limites de gasto/publicação: 0

## Próximo bloco seguro
1. confirmar o CI da Run 16 e corrigir apenas falhas do Marketing, se houver;
2. expor no Admin o `render_spec` canônico/preflight por slide sem permitir edição direta do JSON;
3. conectar a ação de render de carrossel à RPC batch mantendo o gate global OFF;
4. associar `output_media_id` ao slide somente após conclusão do job com lease válido e asset/version/slide verificados;
5. evoluir métricas de render por slide e atribuição determinística no Admin;
6. manter todos os publicadores sociais somente em dry-run até autorização explícita.

O Marketing ainda não está integralmente concluído/homologado; a automação não deve ser desativada nesta rodada.
