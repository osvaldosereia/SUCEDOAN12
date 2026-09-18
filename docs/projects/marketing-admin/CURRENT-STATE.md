# CURRENT STATE — Marketing Admin Dona Antônia

Snapshot de continuidade: **18/09/2026**.

## Fase atual

`connection_homologation`

Rodadas técnicas 5–8 concluídas em implementação/homologação interna. Falta homologar credenciais reais e executar o primeiro canary externo de uma única publicação.

## Runtime

- enabled=false;
- execution_mode=off;
- kill_switch=true;
- publishing_enabled=false;
- max_daily_publications=0;
- instagram_feed_publish_enabled=false;
- instagram_story_publish_enabled=false;
- instagram_reel_publish_enabled=false;
- instagram_carousel_publish_enabled=false;
- facebook_post_publish_enabled=false;
- facebook_story_publish_enabled=false;
- facebook_reel_publish_enabled=false;
- pinterest_publish_enabled=false;
- whatsapp_status_publish_enabled=false.

## Visual / mídia

Campanha piloto: `Ofertas de Limpeza`.

Formatos homologados:
- feed quadrado 1080x1080;
- Story/Status 1080x1920;
- Pinterest 1000x1500;
- carrossel 4 slides 1080x1350;
- Reel leve 1080x1920, 10s.

Provider-ready:
- JPEG `role=output`, `image/jpeg`, `provider_ready=true`;
- Reel MP4 H.264;
- AAC estéreo 48 kHz;
- 30 fps;
- 10.000 s;
- faststart;
- custo de IA do render=0.

Movimentos reais V1:
- slow_zoom;
- float;
- fade_in;
- fade_out.

## Qualidade visual

Marketing Brain usa qualidade da mídia na escolha do hero:
- favorece image_ai_status=completed;
- favorece foto profissional, produto completo, sombra natural e alta fidelidade;
- penaliza rejected/manual review/lado-a-lado/comparativo/montagem/banner/tabela.

Hero piloto aprovado: Água Sanitária Cloro Ativo Ypê 5 L.

## Produção e aprovação

Implementado:
- render em lote;
- prévia;
- edição;
- revisão histórica;
- incremento de versão;
- invalidação de mídia antiga;
- enviar para revisão;
- aprovar;
- reprovar;
- preparar jobs internos por canal.

Aprovação continua humana.

## Publicação

Adapters oficiais preparados:
- Instagram Feed;
- Instagram Story;
- Instagram Reel;
- Instagram Carrossel;
- Facebook Post;
- Facebook Reel;
- Pinterest Pin.

Manual:
- WhatsApp Status;
- Facebook Story.

WhatsApp Status:
`Preparar Status -> Compartilhar agora -> share nativo -> WhatsApp -> Meu status -> Enviar`.

## Segurança

Preflight exige simultaneamente:
- asset approved;
- job em estado publicável;
- publishing_enabled=true;
- kill_switch=false;
- execution_mode canary/live;
- limite diário > 0;
- limite ainda disponível;
- gate do canal;
- channel account verified;
- credential_ref;
- ID externo;
- Graph API version explícita para Meta;
- board_id para Pinterest;
- mídia provider-ready da versão atual.

Falha ambígua após chamada ao provedor => `review_required`, sem retry automático.

## Connection Manager / OAuth

Implementado:
- Meta OAuth;
- Pinterest OAuth;
- state armazenado por hash;
- TTL de sessão;
- callback same-origin;
- tokens apenas no Vault;
- cleanup automático de secrets temporários;
- Pinterest refresh token;
- desconexão segura;
- seleção de Página/IG/board.

Hardening:
- removido default presumido de Graph API version;
- Graph version passa a ser explícita;
- Pinterest scopes: boards:read, boards:write, pins:read, pins:write;
- cleanup service-role only.

## Estado real das conexões no Supabase

Até este snapshot:
- canais ainda `disconnected`;
- nenhum token de publicação definitivo cadastrado pelo Connection Manager;
- OAuth temp secrets=0;
- publication jobs=0;
- published jobs=0;
- eventos external_side_effect=0.

Meta:
- App Secret já existe no Vault;
- App ID ainda não localizado no Supabase/GitHub;
- Graph version pendente de validação explícita.

Pinterest:
- App ID/App Secret não cadastrados no Connection Manager;
- board ID pendente.

## Evidência recuperada do Make

Make org `6493671`, team `975208`.

Conexões nativas:
- Facebook: `7490477` e `7650626`, ambas funcionais para listar contas;
- Pinterest: `7490792`, existente, porém listagem de boards falha e indica reautorização necessária.

IDs confirmados via Make:
- Facebook Page Super Cestas: `1928140920768577`;
- Instagram Business Super Cestas (@dona_antonia_cuiaba): `17841451162237654`.

O Make também possui cenários antigos de publicação Instagram/carrossel, atualmente inativos:
- `6032233`;
- `6051595`;
- `6253699`;
- `6508939`;
- `6940562`.

Não reativar esses cenários automaticamente; servem como referência histórica.

## Próximo bloqueio real

Não é mais código de publicação. É **homologação de credencial/conta**.

Próximos passos:
1. confirmar callback público;
2. preencher Meta App ID + Graph API version validada;
3. executar OAuth Meta ou decidir proxy temporário Make;
4. usar Page ID/IG ID já confirmados;
5. reautorizar Pinterest no Make ou fazer OAuth próprio;
6. obter board ID;
7. verificar contas;
8. canary 1 peça / 1 canal / limite 1;
9. fechar canary depois do teste.


## Atualização Round 8 — validação de credenciais Meta

Em 18/09/2026 foi adicionada uma barreira extra à homologação Meta:

- o Admin não aceita mais salvar apenas um App ID textual;
- `connection_save_config` exige validação server-side do par App ID + App Secret usando `grant_type=client_credentials`;
- quando o segredo já existe, ele é lido somente no backend pelo Vault;
- segredo novo só é persistido após a validação do par;
- a resposta de validação não devolve access token ao navegador;
- Edge Function `admin-marketing-workflow-v1`: v16, ACTIVE, JWT=true;
- `meta_oauth_app_id` permanece vazio até uma validação real bem-sucedida.

Estado de segurança após o deploy:
- enabled=false;
- execution_mode=off;
- kill_switch=true;
- publishing_enabled=false;
- max_daily_publications=0;
- publication_jobs=0;
- published_jobs=0;
- external_side_effect_events=0.
