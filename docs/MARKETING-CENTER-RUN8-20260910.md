# Marketing Center — Run 8 — mídia privada + carrossel versionado

Data: 2026-09-10.

## Escopo

Somente Marketing. Sem Make. Sem alteração do WhatsApp Flow. Sem ativar Instagram/Messenger/Ads. Sem publicação externa. Sem gasto de IA.

## Auditoria inicial

- `docs/RETOMADA-DONA-ANTONIA.md` relido;
- `docs/MARKETING-CENTER-RUN7-20260910.md` relido;
- PR #254 continua aberta e isolada na branch `feat/marketing-center-v1-20260910`;
- CI `Marketing Center V1` do head anterior estava verde;
- Supabase `ssbesxgaijknwsjbsbcz` saudável em `sa-east-1`;
- gates do Marketing reconfirmados OFF antes das alterações;
- advisors pré-DDL mantinham apenas o padrão preexistente de tabelas server-only com RLS sem policies e o aviso de leaked-password protection; nenhuma configuração de Auth foi alterada.

## V7 — armazenamento privado de mídia

Migration aplicada:

- `marketing_private_media_v7`.

Criado bucket privado:

```text
id=marketing-private
public=false
file_size_limit=104857600
mime=image/webp,image/png,image/jpeg,video/mp4
```

Não foi criada policy de leitura para `anon` ou `authenticated`.

Novas RPCs server-only:

- `marketing_media_signable_v1(uuid)`;
- `register_marketing_private_media_v2(...)`.

O registro privado exige caminho escopado por asset/versão:

```text
<asset_uuid>/v<versao>/...
```

A resolução para assinatura aceita somente mídia Supabase do bucket `marketing-private`, com asset não arquivado e path validado.

Privilégios confirmados:

```text
anon_sign=false
auth_sign=false
service_sign=true
anon_register=false
auth_register=false
service_register=true
```

## Edge Function de preview seguro

Criada e implantada:

- `admin-marketing-media-v1` versão 1;
- `verify_jwt=true`.

Fluxo:

1. valida JWT real com `auth.getUser`;
2. exige Admin ativo `owner | operator`;
3. recebe apenas `media_id`;
4. resolve bucket/path pela RPC server-only;
5. gera `createSignedUrl` com TTL entre 30 e 900 segundos;
6. registra evento interno `admin_preview_signed` com `external_side_effect=false`;
7. não contém publish, provider social, token de canal ou dispatcher.

URLs públicas (`getPublicUrl`) são proibidas pelo contrato de teste.

## V8 — carrossel versionado

Migration aplicada:

- `marketing_carousel_slides_v8`.

Nova tabela server-only:

- `marketing_carousel_slides`.

Regras:

- somente asset `media_kind=carousel`;
- mínimo 2 e máximo 10 slides;
- ordem `slide_no` 1..10;
- slides vinculados a `asset_version`;
- salvar altera somente a versão corrente;
- versões anteriores permanecem preservadas;
- cada slide tem modo `no_ai | ai | hybrid | manual` próprio;
- `source_refs`, `edit_spec` e `render_spec` próprios;
- editar slides invalida review/aprovação/agendamento antigo e retorna o asset a `draft`;
- nenhuma chamada externa é executada.

RPCs:

- `marketing_carousel_read_v1(uuid)`;
- `save_marketing_carousel_slides_v1(uuid,jsonb,uuid)`;
- `marketing_carousel_current_v1(uuid)`.

As três são `service_role` only.

Teste transacional real com `ROLLBACK` validou carrossel de dois slides, incluindo ordem, modos diferentes e `external_side_effect=false`. Nenhum asset/slide de autoteste permaneceu no banco.

## CI

Foram adicionados contratos estáticos:

- `scripts/test-marketing-private-media-v1.mjs`;
- `scripts/test-marketing-carousel-v1.mjs`.

O workflow `Marketing Center V1` passou a incluir V7/V8, a nova Edge Function e os dois contratos.

## Gates confirmados após a rodada

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

1. confirmar CI da Run 8;
2. conectar o Admin ao `admin-marketing-media-v1` para abrir preview real por URL assinada e curta;
3. conectar o worker determinístico ao upload no `marketing-private` + `register_marketing_private_media_v2`, sem ativar o worker em produção;
4. adicionar editor visual/reordenação/duplicação dos slides do carrossel;
5. criar validadores de payload oficiais Meta/Pinterest/Google em `dry_run`, sem credenciais reais e sem dispatcher;
6. iniciar read model de métricas/atribuição.

IA paga e publicação real continuam bloqueadas até autorização explícita.
