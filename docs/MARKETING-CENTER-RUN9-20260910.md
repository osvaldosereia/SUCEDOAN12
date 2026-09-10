# Marketing Center — Run 9 — persistência privada do worker

Data: 2026-09-10.

## Escopo

Somente Marketing. Sem Make. Sem alteração do WhatsApp Flow. Sem ativar Instagram/Messenger/Ads. Sem publicação externa. Sem gasto de IA.

## Auditoria inicial

- `docs/RETOMADA-DONA-ANTONIA.md` relido;
- `docs/MARKETING-CENTER-RUN8-20260910.md` relido;
- PR #254 aberta, mergeable e isolada na branch `feat/marketing-center-v1-20260910`;
- CI `Marketing Center V1` da Run 8 confirmado verde;
- Supabase `ssbesxgaijknwsjbsbcz` confirmado `ACTIVE_HEALTHY` em `sa-east-1`;
- Edge Functions de Marketing preservadas com JWT obrigatório;
- gates do Marketing reconfirmados OFF antes e depois da rodada.

## Persistência privada real do worker

Novo adapter:

- `scripts/marketing-private-media-adapter-v1.mjs`.

O adapter conecta a saída determinística do worker ao bucket privado `marketing-private` e à RPC server-only `register_marketing_private_media_v2`.

Regras:

- aceita somente `https://*.supabase.co`;
- exige service-role explicitamente no processo servidor;
- bucket é fixo em `marketing-private`;
- MIME permitido somente `image/webp | image/png | image/jpeg | video/mp4`;
- tamanho máximo de 100 MB;
- object path determinístico e escopado em `<asset_uuid>/v<versao>/<job>.<ext>`;
- SHA-256 calculado antes do registro;
- upload usa `x-upsert=false`, portanto não sobrescreve saída existente silenciosamente;
- se o registro no banco falhar depois do upload, tenta remover o objeto recém-enviado para evitar órfão;
- o resultado marca `storage_side_effect=true`, mas mantém `external_side_effect=false` porque não há publicação em rede social/provedor externo de marketing.

## Worker conectado

`marketing-render-worker-v1.mjs` agora aceita persistência opcional.

Fluxo:

1. valida o tipo de job;
2. continua recusando `ai_image` e `ai_video`;
3. renderiza WebP ou MP4 localmente;
4. quando persistência foi explicitamente injetada, exige `asset_id` + `asset_version`;
5. envia o arquivo ao bucket privado e registra a mídia;
6. sem opção de persistência, comportamento anterior permanece sem side effect de storage;
7. CLI só persiste se chamada explicitamente com `--persist` e variáveis `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

Nada agenda ou publica conteúdo.

## Testes

Criado:

- `scripts/test-marketing-private-media-adapter-v1.mjs`.

Ampliado:

- `scripts/test-marketing-worker-v1.mjs`.

Cobertura:

- path escopado por asset/versão;
- upload privado e chamada da RPC de registro;
- SHA-256;
- recusa de HTTP não seguro;
- recusa de MIME não permitido;
- persistência injetada no worker;
- bloqueio quando faltam asset/version;
- IA continua bloqueada;
- jobs já finalizados continuam bloqueados.

Workflow `Marketing Center V1` atualizado para validar o novo adapter e seus contratos.

## Verificação de APIs oficiais para próximos dry-runs

A rodada também revalidou somente documentação oficial para orientar o próximo bloco, sem criar dispatcher:

- Pinterest API v5 possui Sandbox oficial e inclui `POST Create Pin`; documentação do Sandbox atualizada em 08/09/2026;
- Google Business Profile mantém `accounts.locations.localPosts.create`, com OAuth `business.manage`, e LocalPost aceita `media[].sourceUrl`;
- esses fatos serão usados apenas para validadores e payload previews em dry-run antes de qualquer credencial ou chamada real.

## Segurança / advisors

O advisor de segurança não apresentou achado novo específico desta rodada. Permanece o padrão preexistente `RLS Enabled No Policy` em tabelas server-only e o aviso preexistente de leaked-password protection. Nenhuma configuração de Auth foi alterada.

## Gates confirmados

```text
enabled=false
execution_mode=off
canary_percent=0
kill_switch=true
generation_enabled=false
deterministic_render_enabled=false
ai_image_enabled=false
ai_video_enabled=false
publishing_enabled=false
whatsapp_status_publish_enabled=false
instagram_story_publish_enabled=false
facebook_story_publish_enabled=false
instagram_carousel_publish_enabled=false
pinterest_publish_enabled=false
google_business_publish_enabled=false
```

## Próximo bloco seguro

1. confirmar CI da Run 9;
2. integrar o Admin ao signer privado para abrir preview real de `marketing_media_objects` por URL curta;
3. adicionar editor visual de slides do carrossel com reordenar, duplicar e editar por slide;
4. criar validadores/payload previews de Pinterest e Google em `dry_run` puro;
5. revalidar documentação oficial Meta e criar somente payload previews/validadores, sem token e sem dispatcher;
6. iniciar read model de métricas e atribuição.

IA paga, worker de produção e publicação real continuam bloqueados até autorização explícita.
