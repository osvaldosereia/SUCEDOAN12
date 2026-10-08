# Smart Delivery R18 — checkpoint 2026-10-08

## Verificado
- Banco canônico: migrations de otimização, custódia, sequência diferida e coordenadas presentes.
- Bucket de fotos privado, limite de 5 MiB. RPCs de otimização restritas ao serviço.
- Runtime: zero rotas, paradas, motoristas, veículos e regiões; 290 endereços.
- Branch reconciliada com main sem sobrescrever a vitrine pós-pedido.
- PWA: manifest, ícone, service worker network-only e registro na tela do admin.
- Migrations ausentes no Git restauradas: 20261008012500, 20261008012549 e 20261008022337.
- Testes de PWA e paridade adicionados ao workflow. Adaptador executado em V8: dois casos positivos e seis rejeições.

## Não liberar ainda
- Divergência entre credenciais esperadas pelo worker e gateway Google ainda não corrigida; alterações diretas foram recusadas.
- Worker Google não implantado; credenciais Google não verificadas.
- Nenhum teste real com motorista, veículo e rota; não criar pedidos artificiais em produção.
- Templates logísticos de ETA/rota não constam como aprovados no catálogo consultado.
- Nenhuma execução CI observada para o HEAD atual; PR #943 permanece draft.
- Nenhuma alteração aplicada à main ou deploy de produção nesta rodada.

Próxima etapa: resolver credencial do worker, CI, teste PWA em dispositivo e homologação controlada ponta a ponta.
