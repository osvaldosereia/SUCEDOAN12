# CURRENT STATE — Admin Geral

Atualizado: 2026-09-20
Branch: `admin-geral-r1-r16-autonomous-20260919`
Fase: R3 — Shell, menu e responsividade global.
Execução autônoma: autorizada.
Efeitos externos novos: proibidos sem gate/evidência específica.

## Estado das rodadas
- R1: DONE
- R2: DONE
- R3: IN_PROGRESS
- R4–R16: PENDING

## R1 — concluída
- inventário técnico e mapa de migração em `TECHNICAL-INVENTORY.md`;
- `admin/module-registry.js` e `admin/navigation-contract.js` criados;
- contratos de navegação/gates cobertos por teste;
- rotas e gates preservados.

## R2 — concluída
`admin/admin-design-system-v2.css` permanece uma camada opt-in, ainda sem aplicação global. Entregue:
- tokens de cor, tipografia, espaçamento, raio, conteúdo, z-index e touch target;
- layout, cards, botões, formulários, ajuda/erro/dirty state, badges e alertas;
- toolbar, busca, filtros/chips e tabs com estados ARIA;
- tabela desktop + contrato de lista mobile;
- estados vazio/loading, skeleton e feedback/toasts;
- dialogs, drawer, bottom-sheet e sticky actions;
- fullscreen de editor no telefone, safe-area, inputs 16px e ações 48px;
- utilitários desktop/mobile e breakpoints de referência;
- foco visível e `prefers-reduced-motion`;
- documentação de coexistência/migração em `DESIGN-SYSTEM-V2.md`;
- contrato de teste ampliado em `tests/admin-design-system-v2-contract.test.mjs`.

A folha não contém regras globais de `body`/`button` e não substitui CSS legado prematuramente.

## R3 — próximo lote
1. criar Shell V2 como consumidor controlado do Design System;
2. gerar navegação a partir do Module Registry/Navigation Contract;
3. preservar hash routes e links atuais;
4. desktop: sidebar agrupada/recolhível; tablet: compacta; mobile: drawer;
5. topbar e estado ativo consistentes;
6. integrar primeiro no `admin/index.html` sem migrar conteúdo funcional das telas;
7. criar contrato/testes de shell antes de expandir às subpáginas.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar pedido/cliente/publicação real como teste.
