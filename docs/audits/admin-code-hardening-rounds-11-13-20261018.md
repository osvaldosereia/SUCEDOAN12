# Saneamento — Rodadas 11–13/15: modularização e regressão

## Rodada 11 — Separação de responsabilidades

Extraída a geração do HTML dos botões operacionais de pedidos de vitrine/admin/index.html para vitrine/admin/orders/action-buttons.js. A função pura recebe as dependências de formatação, análise de pendências e próximo passo; a interface fornece apenas o gate fiscal atual. O carregamento foi colocado antes do script principal, preservando os IDs, data-next, textos e transições existentes.

O módulo é exportado como objeto congelado DonaAntoniaAdminOrderActionButtons. O contrato de ordem de carregamento foi atualizado. Criado teste comportamental para estados created, confirmed, processing, ready, out_for_delivery, delivered e cancelled, além do bloqueio fiscal e pendências cadastrais.

## Rodada 12 — Duplicações e obsolescência

A revisão desta área não forneceu evidência suficiente para excluir outros caminhos ou funções. Nenhum código foi removido apenas por aparência de desuso. A extração elimina uma responsabilidade do arquivo monolítico, mas não prova inexistência de duplicações no restante do Admin.

## Rodada 13 — Erros e testes

Revisados os padrões de tratamento de erro do Admin e o contrato dos módulos. A lógica de mensagens de erro já utiliza DonaAntoniaAdminErrors, e os novos testes cobrem a seleção de ações operacionais sem acesso à rede. Não foram alteradas regras de negócio ou tratamento global de erros sem evidência de regressão concreta.

## Evidências

- vitrine/admin/orders/action-buttons.js (novo módulo)
- vitrine/admin/index.html (delegação e carregamento)
- scripts/test-admin-module-load-contract.mjs (ordem e exportação)
- scripts/test-admin-order-action-buttons.mjs (casos comportamentais)
- .github/workflows/admin-print-queue-panel.yml (execução do teste e gatilhos)

## Limitações

Testes locais/CI ainda devem ser verificados no HEAD; extração sem alteração pretendida de comportamento não equivale à homologação visual. Não houve deploy ou merge. A organização completa do monólito é uma iniciativa gradual, não concluída por esta extração.
