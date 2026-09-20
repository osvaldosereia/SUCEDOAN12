# CURRENT STATE — Admin Geral

Atualizado: 2026-09-20
Branch: `admin-geral-r1-r16-autonomous-20260919`
Fase: R2 — Design System Admin 2.0.
Execução autônoma: autorizada.
Efeitos externos novos: proibidos sem gate/evidência específica.

## Estado das rodadas
- R1: DONE
- R2: IN_PROGRESS
- R3–R16: PENDING

## R1 — concluída
- inventário técnico e mapa de migração documentados em `TECHNICAL-INVENTORY.md`;
- fronteiras oficiais entre Operação, Catálogo/Estoque, Atendimento/Relacionamento, Marketing/Criativos, Gestão e Sistema definidas;
- `admin/module-registry.js` V1 criado com grupos, rotas, estados, gates, prioridade mobile e marcação de efeitos externos;
- `admin/navigation-contract.js` criado para resolver visibilidade/hrefs sem mutar runtime;
- teste de contrato `tests/admin-general-navigation-contract.test.mjs` criado de forma portátil, sem dependência de package `type=module`;
- estratégia de coexistência/migração de CSS e shells legados documentada;
- nenhuma rota atual substituída e nenhum gate ativado.

## R2 — em andamento
Primeiro lote criado em `admin/admin-design-system-v2.css`:
- tokens de cor, tipografia, espaçamento, raio, conteúdo e touch target;
- botões, campos, badges, cards, grid, tabela, estados vazio/loading, skeleton e dialog;
- tabela desktop/lista mobile como contrato visual;
- dialog fullscreen em celular;
- inputs 16px e ações 48px em telas pequenas;
- safe-area no footer de dialog;
- suporte a `prefers-reduced-motion`;
- teste `tests/admin-design-system-v2-contract.test.mjs` criado.

A folha V2 ainda NÃO foi ligada globalmente; isso é intencional para evitar regressão antes da camada de compatibilidade.

## Próxima execução
Continuar R2 com componentes de toolbar/filtros, navegação/tabs, feedback/toasts, drawer/bottom-sheet, estados de formulário, utilitários responsivos e documentação de uso. Depois validar coexistência com `styles.css`, `style.css` e `mobile-priority.css` antes de promover R3.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar pedido/cliente/publicação real como teste.
