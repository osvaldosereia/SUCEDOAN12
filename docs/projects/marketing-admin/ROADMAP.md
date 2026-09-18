# ROADMAP — Marketing Admin Dona Antônia

## Como ler

Existem duas nomenclaturas históricas:
- **Plano mestre de 24 etapas** abaixo;
- **Rodadas técnicas** documentadas nos arquivos ROUND5–ROUND8.

As rodadas técnicas não correspondem necessariamente 1:1 às 24 etapas; são checkpoints de implementação.

## Plano mestre — 24 etapas

### 1. Auditoria e consolidação
Mapear Admin, Supabase, tabelas, Edge Functions, UI e manter publishers OFF.
**Status: concluída.**

### 2. Área Marketing no Admin
Dashboard, Campanhas, Conteúdo, Calendário, Publicações, Templates, Configurações.
**Status: base implementada; refinamento contínuo.**

### 3. Entidade Campaign
Objetivo, tema, produtos, público, canais, datas, CTA e estratégia.
**Status: implementada.**

### 4. Controle rígido de custos
Budgets, logs, cache, dedupe, no-AI on page open, uma geração por padrão.
**Status: base implementada; política ativa.**

### 5. Marketing Brain econômico
SQL/código filtra candidatos; IA recebe shortlist; pode decidir NO_ACTION.
**Status: implementado V1.**

### 6. Memória criativa / anti-repetição
Guardar produto, tema, hook, copy, formato e visual.
**Status: parcialmente implementada; ampliar depois de métricas reais.**

### 7. Templates visuais
Feed, oferta, produto, tip, lista, kit, story, Pinterest, carrossel.
**Status: Visual V1 homologado; biblioteca ainda pode crescer.**

### 8. Gerador econômico de imagem
Reusar packshot/foto; IA low somente quando necessário.
**Status: base implementada.**

### 9. Post / Story / Status
Peças 1:1 e 9:16, editáveis.
**Status: implementado/homologado.**

### 10. Carrossel
3–5 slides inicialmente, render determinístico.
**Status: implementado/homologado com 4 slides piloto.**

### 11. Reel leve 10s
Sem vídeo generativo; imagem + movimento determinístico.
**Status: implementado/homologado.**

### 12. Biblioteca de microanimações
slow_zoom, float, fade_in, fade_out; efeitos por camada no futuro.
**Status: V1 implementada.**

### 13. Centro de aprovação
Editar, aprovar, reprovar, regenerar, versionar.
**Status: implementado Rodada 6.**

### 14. Instagram oficial
Feed, Story, Reel, Carousel.
**Status: adapters implementados; credencial/homologação real pendente.**

### 15. Facebook oficial
Post e Reel direto; Story manual/cross-share.
**Status: adapters implementados; credencial/homologação real pendente.**

### 16. Pinterest
Pin com imagem, título, descrição e link.
**Status: adapter implementado; conexão/board pendentes.**

### 17. WhatsApp Status
Preparar mídia e compartilhar no celular.
**Status: implementado manual em dois passos.**

### 18. Calendário editorial inteligente
Agenda, filtros, reprogramação, limite de frequência.
**Status: V1 preview determinístico implementado na Rodada 9; sugere distribuição operacional, mede conflitos e carga, mas `auto_schedule=false`.**

### 19. Métricas de canal
Alcance, views, engajamento, saves/shares, retenção quando disponível.
**Status: infraestrutura parcial; coleta real pendente após publicação.**

### 20. Atribuição comercial
UTM/link -> Comprar/chat -> carrinho -> pedido -> venda.
**Status: fundação V1 implementada na Rodada 9: gerador determinístico de URL UTM/asset/channel + read-model append-only já existente. `attribution_recording_enabled=false`; captura real continua pendente.**

### 21. Learning Engine
Estatística determinística; IA recebe apenas resumos.
**Status: V1 read-only implementado na Rodada 9 com limiares mínimos de evidência, sem IA, sem ranking e sem otimização automática. Atualmente retorna `insufficient_data` até existirem publicações/touchpoints reais.**

### 22. Automação diária
Analisar oportunidades -> campanha -> assets -> fila de aprovação.
**Status: dry-run/preview V1 implementado na Rodada 9. Analisa shortlist + agenda + aprendizado, mas não cria campanha, não prepara jobs, não agenda e não publica. Nenhum cron foi ativado.**

### 23. Autonomia progressiva
OFF -> OBSERVE -> SUGGEST -> DRAFT -> APPROVAL_REQUIRED -> CANARY -> LIVE.
**Status: infraestrutura de gates implementada; runtime permanece OFF.**

### 24. Otimização/limpeza
Código legado, RLS, logs, filas presas, custos, estabilidade.
**Status: contínua; hardening de Rounds 7–8 concluído.**

## Checkpoints técnicos concluídos

### Rodada 5
- visual V1;
- Reel real 10s;
- qualidade de mídia no Marketing Brain;
- zero publicação.

### Rodada 6
- render em lote;
- edição/versionamento;
- revisão/aprovação/reprovação;
- preparação de jobs.

### Rodada 7
- adapters oficiais;
- provider-ready JPEG/MP4;
- preflight fail-closed;
- share manual;
- zero publicação.

### Rodada 8
- Connection Manager;
- OAuth Meta/Pinterest;
- Vault;
- cleanup;
- descoberta de contas;
- hardening;
- descoberta de IDs reais no Make em andamento.

## Próximo marco

**Marco: primeiro canary oficial.**

Pré-requisitos:
- callback público;
- Meta App ID;
- Graph version validada;
- OAuth Meta concluído ou proxy Make formalmente decidido;
- Page ID `1928140920768577`;
- Instagram ID `17841451162237654`;
- Pinterest autenticado + board ID;
- uma peça approved;
- publishing_enabled somente durante o canary;
- execution_mode=canary;
- max_daily_publications=1;
- somente um gate de canal=true.

Após publicar:
- confirmar external_ref;
- conferir mídia/post real;
- registrar métricas;
- fechar gate novamente;
- documentar resultado antes de avançar.
