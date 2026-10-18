# Rodada 04/20 — Contratos de carregamento do Admin

Branch: refactor/admin-print-queue-panel-20261018. PR #1121.

## Auditoria

O arquivo vitrine/admin/index.html contém o controlador principal, estado compartilhado, funções de acesso a APIs, renderizadores e fluxos operacionais. Os 15 módulos bridge anteriores ao controlador principal exportam objetos globais DonaAntoniaAdmin*. O arquivo basket-lot-image.js também é carregado antes do controlador, mas não faz parte dessa lista de bridges. Os scripts basket-guided-builder.js e basket-admin-section.js são carregados após o controlador principal.

A extração adicional de funções que chamam diretamente api, state, DOM ou callbacks exige revisão do ciclo de vida e dos efeitos colaterais. Não mover essas funções apenas para reduzir a contagem de linhas.

## Correções executadas

O teste scripts/test-admin-module-load-contract.mjs foi ampliado para:
- conferir a presença de todos os 15 módulos bridge;
- conferir a ordem exata das dependências antes do script principal;
- conferir a presença do script de imagens de cestas;
- verificar que os dois scripts de cestas continuam após o controlador;
- executar os módulos bridge em uma VM e verificar seus objetos globais congelados.

## Risco residual

O controlador principal permanece monolítico; não houve extração funcional do HTML nesta rodada. Esse risco não deve ser confundido com uma refatoração concluída. A validação de CI da versão final é necessária. Nenhuma regra comercial, API, operação fiscal ou dado de produção foi alterado.
