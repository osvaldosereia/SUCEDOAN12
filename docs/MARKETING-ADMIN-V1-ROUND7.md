# Marketing Admin V1 — Rodada 7

Atualizado em 18/09/2026.

Status: **CONECTORES OFICIAIS IMPLEMENTADOS / MÍDIA PROVIDER-READY IMPLEMENTADA / PUBLICAÇÃO EXTERNA CONTINUA BLOQUEADA**.

## Objetivo

Conectar o fluxo de produção/aprovação da Rodada 6 aos destinos oficiais sem abrir publicação antes da homologação das credenciais.

## Destinos

### API oficial preparada

- Instagram Feed;
- Instagram Story;
- Instagram Reel;
- Instagram Carrossel;
- Facebook Post com foto;
- Facebook Reel;
- Pinterest Pin com imagem + link.

### Confirmação manual

- WhatsApp Status;
- Facebook Story.

O Status do WhatsApp usa compartilhamento nativo em dois passos:
1. Preparar Status;
2. Compartilhar agora;
3. no celular escolher WhatsApp > Meu status > Enviar.

Não foi implementado endpoint não documentado para Status.

## Segurança fail-closed

Para publicação direta, o preflight exige simultaneamente:
- asset aprovado;
- job em estado publicável;
- `publishing_enabled=true`;
- `kill_switch=false`;
- `execution_mode=canary|live`;
- limite diário maior que zero e ainda disponível;
- gate específico do canal ligado;
- conta do canal `verified`;
- `credential_ref` existente;
- identificador externo da conta;
- Graph API version explicitamente configurada para Meta;
- board_id para Pinterest;
- mídia provider-ready da versão atual.

A instalação da Rodada 7 NÃO abre nenhum desses gates.

## Credenciais

Tokens não entram no frontend, banco comum, commit ou logs.

`marketing_channel_secret_v1` lê exclusivamente Supabase Vault e só aceita referências com prefixo:

`dona_antonia_marketing_...`

A função é `SECURITY DEFINER`, porém EXECUTE foi revogado de `PUBLIC`, `anon` e `authenticated`; apenas `service_role` pode executá-la.

## Mídia provider-ready

O Admin continua usando WebP para prévia leve.

Ao gerar a peça, o renderer também produz JPEG separado:
- role: `output`;
- mime: `image/jpeg`;
- metadata: `provider_ready=true`.

Para Reel:
- MP4;
- 1080x1920;
- 30 fps;
- 10 segundos;
- H.264;
- AAC estéreo;
- 48 kHz;
- `provider_ready=true`.

Vídeos antigos sem esse contrato não passam no preflight.

## Falhas e duplicidade

Se o erro ocorrer antes de qualquer chamada capaz de publicar, o job pode ficar `failed`.

Se o provedor já foi chamado e o resultado for ambíguo, o job vai para `review_required`.

Não há retry automático de falha ambígua, evitando post duplicado.

## Admin

A aba de Publicações agora diferencia:
- credencial pendente;
- pronta para verificar;
- conexão verificada;
- gate desligado;
- revisão necessária;
- publicado;
- compartilhamento manual.

As conexões têm superfície própria no Admin.

O Template Assistant do WhatsApp da Rodada 6 foi preservado.

## Estado após implantação

Esperado e intencional:
- `enabled=false`;
- `execution_mode=off`;
- `kill_switch=true`;
- `publishing_enabled=false`;
- `max_daily_publications=0`;
- todos os gates de canal=false;
- contas Meta/Pinterest permanecem disconnected até token e IDs reais serem cadastrados e verificados;
- zero publicação externa executada pela implantação.

## Edge Functions reaproveitadas

Nenhuma Edge Function nova foi criada.

- `admin-marketing-workflow-v1`: preflight, verificação, compartilhamento e adapters;
- `admin-marketing-media-v1`: WebP + JPEG provider-ready;
- `admin-marketing-insights-v1`: estado dos gates/jobs no Admin.

Isso evita aumentar o plano ou ultrapassar o limite de Edge Functions.

## Próxima etapa

Conexão/homologação real das contas:
1. cadastrar token Meta/Pinterest no Vault;
2. cadastrar Page ID / Instagram Professional ID / Pinterest board ID;
3. informar Graph API version validada;
4. verificar cada conta pelo Admin;
5. fazer canary com uma peça aprovada;
6. somente depois abrir os gates necessários.
