# PROJECT MASTER — Marketing Admin Dona Antônia

## 1. Objetivo

Construir dentro do Admin da Dona Antônia um sistema de marketing orgânico capaz de:

- identificar oportunidades comerciais;
- decidir tema, produto, formato, CTA e canal;
- gerar peças com baixo custo;
- reaproveitar ativos existentes;
- criar Reel leve de 10 segundos;
- revisar e aprovar;
- programar/publicar em canais oficiais;
- preparar WhatsApp Status para confirmação manual;
- medir resultado;
- aprender com performance;
- evoluir de aprovação manual para autonomia progressiva.

## 2. Princípio de custo

Determinístico primeiro, IA depois.

Usar SQL/código para:
- elegibilidade de produto;
- estoque/preço/oferta;
- filtros;
- deduplicação;
- repetição;
- métricas;
- atribuição;
- render;
- vídeo leve.

IA somente quando agrega:
- estratégia;
- ângulo;
- hook;
- copy;
- interpretação;
- ambiente visual quando necessário.

Imagem por IA:
- qualidade low por padrão nesta fase;
- uma tentativa por padrão;
- sem variações automáticas;
- reutilizar packshot/foto existente sempre que possível.

Vídeo:
- não usar vídeo generativo caro na V1;
- 10 segundos fixos;
- partir de uma arte vertical;
- FFmpeg/motor determinístico.

## 3. Arquitetura

```text
MARKETING BRAIN
  |
  v
CAMPAIGN
  |
  +--> ASSETS
  |      +--> Feed
  |      +--> Story/Status
  |      +--> Pinterest
  |      +--> Carousel
  |      +--> Reel 10s
  |
  v
RENDER / MEDIA
  |
  v
APPROVAL / VERSIONING
  |
  v
PUBLICATION JOBS
  |
  +--> Meta official adapters
  +--> Pinterest official adapter
  +--> Native share manual (WhatsApp/Facebook Story)
  |
  v
METRICS / ATTRIBUTION / LEARNING
```

## 4. Campanha como raiz

Uma campanha contém:
- objetivo;
- tema;
- produtos;
- audiência;
- canais;
- datas;
- CTA;
- estratégia;
- assets derivados;
- histórico;
- custos;
- resultados.

Uma geração visual deve ser reaproveitada entre formatos quando possível.

## 5. Marketing Brain

Responsável por:
- oportunidade;
- objetivo;
- produtos candidatos;
- qualidade visual;
- insight;
- proposta;
- ângulo;
- hook;
- formato;
- CTA;
- decisão de não agir.

O Brain não deve receber histórico bruto gigante; recebe candidatos e agregados.

## 6. Render

Preview:
- WebP leve.

Provider output:
- JPEG para imagens;
- MP4 H.264/AAC 48k para Reel.

Visual V1:
- fundo clean;
- produto real;
- preço/CTA;
- selo de oferta;
- marca Dona Antônia;
- alta legibilidade;
- sem cara de arte improvisada.

## 7. Aprovação/versionamento

Toda edição:
- preserva revisão;
- incrementa versão;
- invalida mídia anterior;
- exige render atual para aprovação.

Toda publicação direta exige peça aprovada.

## 8. Publicação

Direta por API oficial:
- Instagram Feed/Story/Reel/Carousel;
- Facebook Post/Reel;
- Pinterest Pin.

Manual:
- WhatsApp Status;
- Facebook Story enquanto não houver capacidade oficial direta homologada.

## 9. Connection Manager

Segredos:
- Supabase Vault;
- nunca frontend/commit/chat/log.

Meta:
- App ID;
- App Secret;
- Graph version explícita;
- OAuth;
- Pages;
- Instagram profissional;
- verificação.

Pinterest:
- App ID/Secret;
- OAuth;
- boards;
- refresh token.

Make:
- fonte secundária de evidência e possível proxy temporário;
- não é fonte canônica do Marketing Brain;
- conexões existentes podem ajudar a confirmar IDs e evitar novo levantamento.

## 10. Autonomia

Níveis:
- OFF;
- OBSERVE;
- SUGGEST;
- DRAFT;
- APPROVAL_REQUIRED;
- CANARY;
- AUTONOMOUS/LIVE.

Estado atual: OFF para publicação externa. Próximo alvo: CANARY unitário após conexão real.

## 11. Métricas futuras

- alcance;
- impressões/views;
- retenção quando disponível;
- engajamento;
- saves/shares;
- cliques;
- conversas;
- carrinhos;
- pedidos;
- receita/margem atribuída;
- custo por peça;
- custo por campanha;
- custo por resultado.

## 12. Integração com Customer & Marketing OS

São projetos separados na documentação.

O Marketing Admin pode consumir:
- oportunidades;
- públicos;
- perfis;
- consentimento;
- Product Graph;
- insights.

Mas não deve redefinir:
- identidade;
- consentimento;
- WhatsApp Customer OS;
- gates canônicos do Customer OS.
