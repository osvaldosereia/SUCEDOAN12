# Marketing Center — Run 3 — 10/09/2026

## Auditoria de retomada

- `docs/RETOMADA-DONA-ANTONIA.md` relido antes de qualquer alteração.
- PR #254 continua aberta e isolada em `feat/marketing-center-v1-20260910`.
- `main` avançou em frentes de WhatsApp Flow; esta rodada não alterou arquivos dessas frentes.
- O CI específico `Marketing Center V1` estava verde no checkpoint anterior.
- Supabase `ssbesxgaijknwsjbsbcz` está `ACTIVE_HEALTHY`.
- Não existe Edge Function de Marketing implantada em produção.
- Runtime de Marketing conferido novamente:

```text
enabled=false
kill_switch=true
canary_percent=0
generation_enabled=false
deterministic_render_enabled=false
ai_image_enabled=false
ai_video_enabled=false
publishing_enabled=false
```

Nenhum gate foi alterado.

## Entregue nesta rodada

### Vídeo econômico real sem IA

Adicionado `scripts/marketing-render-economical-video-v1.mjs`.

O renderer:

- usa FFmpeg + ffprobe;
- produz MP4/H.264 `yuv420p` com `faststart`;
- aceita sequência de imagens locais como cenas;
- suporta duração individual por cena;
- limita vídeo a 60 segundos e no máximo 20 cenas;
- limita canvas entre 320 e 1920 px por eixo;
- limita FPS entre 12 e 60;
- normaliza cada imagem com Sharp antes do encode;
- bloqueia URL remota, NUL e path traversal;
- não contém chamada de IA, Make, Meta, Pinterest, Google ou qualquer outro provider externo;
- retorna explicitamente `external_side_effect=false` e `ai_used=false`.

Este renderer é a base do modo `economical_video` da fila já criada na Run 2. Ele permite Stories/Status/Reels simples feitos com fotos reais, cortes e duração controlada sem custo de IA generativa.

### Teste real de vídeo

Adicionado `scripts/test-marketing-video-v1.mjs`.

O teste:

1. gera duas imagens sintéticas locais;
2. cria um MP4 vertical 720x1280;
3. valida codec H.264, dimensões, duração e arquivo real;
4. confirma `ai_used=false` e `external_side_effect=false`;
5. confirma bloqueio de origem HTTP remota;
6. confirma bloqueio de duração total acima do limite.

### CI

O workflow `.github/workflows/marketing-center-v1.yml` foi ampliado para:

- acompanhar a migration da fila V2 nos path filters;
- acompanhar o novo renderer/teste de vídeo;
- verificar presença de `ffmpeg` e `ffprobe` no runner;
- executar o teste MP4 além dos testes de segurança e imagem WebP.

No momento deste checkpoint, o CI do novo head ainda estava em execução. A próxima rodada deve verificar o resultado antes de avançar.

## Segurança / rollout preservados

- nenhuma publicação externa;
- nenhuma ativação de Instagram/Facebook/WhatsApp/Pinterest/Google;
- WhatsApp Status continua dependente de confirmação humana no desenho oficial;
- nenhum gasto pago ou chamada de IA;
- nenhum aumento de canary;
- nenhum deploy de Marketing em produção;
- nenhuma dependência de Make.

## Advisors

Security Advisor continua mostrando o padrão histórico `RLS Enabled No Policy` para tabelas server-only e o aviso global `Leaked Password Protection Disabled`. As tabelas de Marketing aparecem nesse padrão porque acesso direto de `anon/authenticated` foi revogado e as RPCs operacionais são service-role only. Não alterar Auth automaticamente.

## Próxima rodada

1. Confirmar o resultado do CI do renderer MP4 no head desta rodada e corrigir qualquer regressão antes de prosseguir.
2. Implementar o worker seguro da fila de renderização para `deterministic_image` e `economical_video`, com modo dry-run padrão, lease ownership, limite de tentativas e conclusão idempotente; IA deve continuar recusada.
3. Evoluir o Admin para preview real e edição visual rápida: posição/escala/recorte, texto/preço/CTA, duplicar versão e reordenar carrossel.
4. Adicionar calendário visual, aprovação e estados de agendamento sem publicação.
5. Somente depois criar adapters oficiais por canal em `dry_run/homologation`, mantendo `publishing_enabled=false`.
6. IA de imagem/vídeo permanece opcional e OFF até orçamento e provider serem explicitamente autorizados.

## Regra de retomada

Ler `docs/RETOMADA-DONA-ANTONIA.md`, este checkpoint e os Runs 1–2; auditar `main`, PR #254 e Supabase; trabalhar somente no Marketing e preservar todos os gates externos OFF.
