# Marketing Admin V1 — Fundação

Atualizado em 18/09/2026.

Status: **FUNDAÇÃO IMPLANTADA EM MODO SEGURO / SEM PUBLICAÇÃO EXTERNA**.

## Entregue
- Marketing dentro do Admin oficial em `admin/marketing.html`;
- acesso por PIN/Supabase Auth reaproveitando o boundary seguro;
- `admin-marketing-insights-v1` com `verify_jwt=true` e leitura de campanhas, conteúdos, templates, jobs, custos e métricas;
- menu principal do Admin aponta para Marketing;
- abas: Painel, Campanhas, Conteúdos, Agenda, Publicações, Modelos, Resultados e Configurações.

## Política de custo
- imagem `low`;
- 1 variação por padrão;
- reaproveitamento de assets primeiro;
- determinístico primeiro;
- vídeo V1 = microanimação de 10 segundos;
- vídeo generativo desligado.

## Gates
Continuam fechados: enabled=false, execution_mode=off, kill_switch=true, publishing_enabled=false, ai_image_enabled=false, ai_video_enabled=false, limites diários=0 e aprovação humana obrigatória.

## Próximo bloco
Draft seguro de campanha → shortlist determinística de produtos → Marketing Brain econômico → primeira campanha DRAFT.
