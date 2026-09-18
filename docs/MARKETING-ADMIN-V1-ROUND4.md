# Marketing Admin V1 — Rodada 4

Atualizado em 18/09/2026.

Status: **PREVIEW DETERMINÍSTICO IMPLEMENTADO + REEL 10S PREPARADO EM FFmpeg, SEM IA E SEM PUBLICAÇÃO**.

## Render de imagem

O render foi incorporado em `admin-marketing-media-v1` porque o projeto atingiu o limite de Edge Functions do plano. Não houve upgrade de plano.

Ação autenticada `render_preview`:
- exige JWT + admin owner/operator;
- aceita somente assets `no_ai`;
- usa `@imagemagick/magick-wasm`, conforme padrão compatível com Supabase Edge;
- baixa somente HTTPS de hosts permitidos;
- limita fonte a 5 MB;
- gera WebP em `marketing-private`;
- registra mídia por `register_marketing_private_media_v2`;
- não abre gates globais;
- não cria publicação.

Saídas:
- post/story/pin: WebP;
- carrossel: até 5 WebPs;
- Reel: poster/base 1080x1920 + manifesto de movimento.

## Admin

Em Conteúdos:
- Gerar prévia;
- Ver prévia;
- galeria de carrossel;
- poster de Reel;
- colocar MP4 10s na fila;
- status queued/processing/rendered;
- player de vídeo quando MP4 estiver pronto.

## MP4 de 10 segundos

Fila específica, service-role only:
- `queue_marketing_light_video_preview_v1`;
- `claim_marketing_light_video_preview_job_v1`;
- `complete_marketing_light_video_preview_v1`;
- `fail_marketing_light_video_preview_v1`.

Worker:
- Node 22 + FFmpeg;
- GitHub Actions manual;
- um job por execução;
- 1080x1920;
- 30 fps;
- exatamente 10s;
- H.264;
- sem áudio na V1;
- zoom + deriva suave + fade;
- custo de IA = zero.

Nenhum cron foi habilitado. O workflow permanece manual durante homologação.

## Limitação intencional

O MP4 não é considerado pronto apenas com o poster. O Admin mostra claramente `MP4: não gerado` até o worker FFmpeg concluir um arquivo real.

## Próximo passo

Homologar visualmente as cinco peças no Admin e executar um Reel real de 10 segundos; depois ajustar templates/movimentos com base no resultado antes de automatizar render/publicação.
