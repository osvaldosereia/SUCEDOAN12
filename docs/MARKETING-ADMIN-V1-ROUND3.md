# Marketing Admin V1 — Rodada 3

Atualizado em 18/09/2026.

Status: **PLANO DE PEÇAS DRAFT IMPLANTADO / ZERO RENDER / ZERO PUBLICAÇÃO / ZERO IA ESTRATÉGICA**.

## Entregue

- Marketing Brain `admin-marketing-brain-v1` v4;
- Insights `admin-marketing-insights-v1` v11;
- edição de campanha DRAFT no Admin:
  - nome;
  - objetivo;
  - hook;
  - CTA;
- geração idempotente de até 5 peças por campanha:
  1. `feed_square` — Instagram Feed + Facebook imagem;
  2. `story_status` — Instagram Story + WhatsApp Status + Facebook Story se disponível;
  3. `pinterest_pin` — Pinterest 2:3;
  4. `instagram_carousel` — carrossel 4:5;
  5. `reel_light_10s` — Reel/Facebook Reel leve de 10 segundos;
- assets usam `generation_mode=no_ai`;
- Reel usa `marketing.light_motion.v1`, 1080x1920, 30 fps, 10s, sem vídeo generativo;
- movimentos previstos: slow_zoom, float, shine, price_pop e cta_reveal;
- reaproveitamento de um asset entre canais para reduzir custo;
- índice único por `campaign_id + content_role` para evitar duplicação concorrente;
- cinco templates oficiais promovidos a `approved`;
- campanha piloto "Ofertas de Limpeza" possui exatamente cinco assets DRAFT.

## Segurança

O planner:
- não cria render job;
- não cria publication job;
- não chama OpenAI;
- não liga geração;
- não liga publicação;
- não altera kill switch.

## Próximo bloco

Construir o render determinístico V1:
- materializar imagens dos produtos em mídia privada controlada;
- gerar composição raster final para post/story/pin/carrossel;
- gerar MP4 de 10 segundos por microanimações;
- manter IA de imagem `low` apenas como fallback posterior.
