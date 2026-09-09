# Dona Antônia — WhatsApp Flow Cestas — Run 6

Data: 09/09/2026

## Objetivo

Continuar o Flow comercial de cestas sem depender da reconciliação ainda pendente dos componentes legados, avançando a experiência de adicionais, busca dinâmica e transporte dormente.

## Principal correção de experiência

O contrato anterior levava o cliente de `PRODUTO` diretamente para `UPSELL`, permitindo somente um adicional antes da oferta complementar.

Isso foi corrigido. O desenho V2 passa a suportar o ciclo:

```text
SECOES
  -> TERMOS -> PRODUTOS -> PRODUTO
  -> adicionar produto
  -> SECOES novamente
  -> repetir quantas vezes for necessário
  -> cliente escolhe "Terminei de adicionar"
  -> UPSELL opcional
  -> REVISAO
```

Assim, o cliente pode adicionar vários produtos e navegar entre buscas sem carregar o catálogo completo.

## Busca direta

A tela de adicionais agora oferece três decisões:

- `Escolher por seção`;
- `Buscar produto`;
- `Terminei de adicionar`.

A busca direta usa o mesmo read-model seguro `get_whatsapp_flow_product_results_v1`, limitado a 12 resultados nessa experiência e com teto global de 20. Produtos, preços e disponibilidade continuam vindo do backend real.

Teste transacional com rollback usando a busca `sabonete` retornou 10 produtos reais disponíveis e nenhuma escrita comercial persistente.

## Múltiplos adicionais

Foi criada a RPC compatível:

`handle_whatsapp_flow_commercial_exchange_v2`

Ela intercepta somente os novos caminhos e delega todas as demais transições ao handler V1 já existente.

Quando escrita comercial estiver homologada, o adicional utiliza o motor idempotente já existente.

Enquanto os gates estão desligados, as escolhas ficam apenas no contexto efêmero da sessão em `flow_pending_addons`, com limite de 30 registros para impedir crescimento ilimitado da sessão.

Teste com rollback confirmou:

```text
PRODUTO + adicionar quantidade 2
-> SECOES
-> opções de continuar por seção, busca direta ou terminar adicionais
```

## Flow JSON V2

Novo artefato:

`whatsapp/flows/flow-cestas-comercial-v2.json`

Mudanças principais:

- `PRODUTO -> SECOES`;
- `SECOES -> TERMOS | PRODUTOS | UPSELL`;
- CTA do produto: `Adicionar e continuar comprando`;
- upsell só aparece após `Terminei de adicionar`;
- busca direta disponível sem obrigar navegação por categorias.

## Data Exchange

A Edge Function `whatsapp-flow-data-exchange-v1` foi atualizada para encaminhar `flow-cestas-comercial-v1` ao handler V2.

A função foi publicada no Supabase como versão 2, mantendo `verify_jwt=false` por ser endpoint da Meta protegido pelo protocolo criptográfico e pelos gates server-side.

Nenhum gate foi ativado.

## Guard de total em prévia

Durante os testes foi detectado que uma conversa já possuía carrinho real anterior e o read-model de adicionais poderia exibir aquele total durante a prévia dormente do Flow.

Foi criado e aplicado:

`20260909074200_whatsapp_flow_extras_preview_total_guard_v1.sql`

Agora:

- escrita comercial homologada -> pode exibir total real do carrinho;
- escrita comercial OFF -> exibe somente `Prévia em montagem`.

Teste pós-migration confirmou o comportamento.

## Testes persistidos

Novo teste estático:

`scripts/test-whatsapp-flow-cestas-commercial-v2.mjs`

Ele protege invariantes de:

- loop para múltiplos adicionais;
- busca direta;
- limite de itens pendentes em prévia;
- delegação compatível ao handler anterior;
- preservação dos gates OFF;
- rota V2 na Edge Function;
- guard visual da prévia.

## Estado de segurança pós-rodada

Confirmado no Supabase:

```text
whatsapp_release_mode=live
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

O Flow continua sem exposição a clientes.

## Bloqueios reais ainda existentes

O readiness de homologação real continua corretamente bloqueado por:

1. transporte Flow ainda sem chaves configuradas/validadas na Meta;
2. `provider_id` real do Flow ainda ausente;
3. componentes das 9 cestas ainda não reconciliados com produtos atuais seguros.

## Imagens

A Edge Function já hidrata JPEG/PNG compatíveis em base64 com limite de tamanho, mas grande parte das fotos atuais do catálogo está em WebP. Conversão segura server-side de WebP para JPEG/PNG ainda precisa ser concluída antes de considerar a experiência visual pronta.

Nenhuma imagem original será alterada.

## Próximo bloco recomendado

1. resolver pipeline/cache de imagem WebP -> JPEG/PNG para o Flow;
2. validar o JSON V2 no tooling da Meta quando o transporte estiver pronto;
3. preparar criação/publicação do Flow real e `provider_id`, mantendo rollout 0%;
4. continuar bloqueando escrita de cesta até a composição oficial ser reconciliada;
5. homologar o percurso completo somente em número autorizado.

## Ação manual do proprietário

Nenhuma ação manual necessária nesta rodada.
