# Marketing Light Video V1

Estado em 18/09/2026.

## Objetivo

Gerar Reel vertical de 10 segundos sem IA de vídeo.

## Contrato

- entrada: poster WebP já aprovado/gerado no Marketing Admin;
- saída: MP4 H.264 1080x1920, 30 fps, 10s;
- movimentos: zoom progressivo + deriva horizontal/vertical suave + fade;
- áudio: desligado na V1;
- IA generativa: não;
- custo de API de IA: zero;
- execução do GitHub Action: manual durante homologação;
- nenhum schedule/cron foi criado.

## Fluxo

1. Admin gera poster determinístico com `admin-marketing-media-v1`;
2. `queue_marketing_light_video_preview_v1` cria job econômico;
3. workflow manual executa `scripts/marketing-light-video-render-worker.mjs`;
4. worker faz claim transacional;
5. baixa poster privado;
6. FFmpeg gera MP4;
7. envia a `marketing-private/<asset>/v<version>/preview-10s.mp4`;
8. conclui job e registra mídia;
9. asset continua DRAFT, porém `output_spec.mp4_ready=true`.

## Segurança

- RPCs de queue/claim/complete/fail: service_role only;
- Action usa secrets já empregados por workflows existentes;
- um job por execução;
- no cron;
- nenhum publish externo;
- falha não aprova nem publica conteúdo.
