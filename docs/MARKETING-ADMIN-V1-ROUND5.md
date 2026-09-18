# Marketing Admin V1 — Rodada 5

Atualizado em 18/09/2026.

Status: **HOMOLOGAÇÃO VISUAL V1 CONCLUÍDA / REEL REAL 10S CONCLUÍDO / ZERO PUBLICAÇÃO / ZERO IA DE ESTRATÉGIA**.

## Resultado final

Campanha piloto: `Ofertas de Limpeza`.

Peças DRAFT homologadas:
1. Instagram/Facebook feed quadrado — 1080x1080;
2. Instagram Story / WhatsApp Status — 1080x1920;
3. Pinterest Pin — 1000x1500;
4. Instagram Carousel — 4 slides 1080x1350;
5. Reel leve — poster 1080x1920 + MP4 H.264 de 10 segundos.

Todos os assets continuam `draft`.

## Qualidade visual

Durante a homologação foi detectado que o hero original, Veja X-14, usava uma imagem legacy `info-lado-a-lado` e estava com `image_ai_status=rejected`.

O Marketing Brain foi endurecido com `marketing_visual_quality_v1`:
- prioriza imagem `completed` e validada;
- favorece foto profissional, produto completo, sombra natural e boa fidelidade/composição;
- penaliza imagem `rejected`, revisão manual e arquivos tipo lado-a-lado, comparativo, montagem, banner, etiqueta e tabela;
- usa subconjunto visualmente pronto quando existem alternativas suficientes.

Hero final da campanha piloto: **Água Sanitária Cloro Ativo Ypê 5 L**.
O produto Condor permaneceu como segunda opção visual.
O Veja X-14 não foi removido da estratégia comercial; apenas foi excluído da composição automática enquanto a mídia estiver rejeitada.

## Motor visual

O layout foi extraído para:
`supabase/functions/admin-marketing-media-v1/marketing-art-v1.mjs`

Esse mesmo motor é usado pela Edge Function e pela homologação do GitHub.

Correções feitas após inspeção real:
- packshot normalizado para PNG antes de embutir no SVG;
- selo OFERTA separado do título;
- hierarquia de headline, imagem, produto, preço e CTA;
- CTA curto: `Peça pelo WhatsApp`;
- rodapé `Dona Antônia` + `donaantonia.com.br`;
- layout responsivo para 1:1, 4:5, 2:3 e 9:16;
- rodapé do quadrado sem colisão com CTA.

## Reel V1

Formato:
- 1080x1920;
- 30 fps;
- exatamente 10.000 ms;
- H.264 MP4;
- sem áudio nesta V1;
- sem vídeo generativo;
- custo de IA = 0.

Efeitos reais implementados nesta V1:
- slow_zoom;
- float;
- fade_in;
- fade_out.

O contrato foi corrigido para não declarar efeitos ainda não implementados.

O MP4 é invalidado por SHA do poster:
- poster igual => reaproveita;
- poster mudou => volta para queued e gera MP4 novo.

Migration:
`20260918171048_marketing_light_video_poster_hash_invalidation_v2.sql`.

## Homologações reais

Primeiro run detectou ausência de FFmpeg no runner atual do GitHub.
O workflow foi corrigido para instalar FFmpeg explicitamente.

Runs posteriores:
- geração de cinco formatos: sucesso;
- MP4 real: sucesso;
- exportação de prancha visual: sucesso;
- correção final do post quadrado: sucesso.

O workflow continua one-shot/manual. Não existe cron.

## Auditoria final

- assets DRAFT: 5;
- media objects: 9;
- vídeos MP4: 1;
- render jobs: 1;
- render jobs concluídos: 1;
- custo registrado de render: R$ 0;
- publication jobs: 0;
- chamadas de IA estratégica: 0;
- eventos com efeito externo: 0;
- publishing_enabled: false;
- kill_switch: true;
- ai_image_enabled: false;
- ai_video_enabled: false;
- template: `marketing_visual_v1`;
- template homologado: true.

Permissões das RPCs de vídeo:
- anon: sem EXECUTE;
- authenticated: sem EXECUTE;
- service_role: EXECUTE permitido.

## Próxima rodada recomendada

Rodada 6 deve preparar a automação de produção:
- fila de render determinístico em lote;
- aprovação/reprovação visual no Admin;
- regenerar/editar peça;
- depois conectar publicação oficial por canal, ainda sob aprovação humana;
- WhatsApp Status permanece preparado para confirmação manual conforme capacidade oficial disponível.
