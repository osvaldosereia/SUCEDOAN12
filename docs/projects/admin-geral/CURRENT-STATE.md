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
- `admin/admin-design-system-v2.css` entregue como Design System aditivo/opt-in;
- tokens, componentes, estados, responsividade, touch, safe-area, acessibilidade e documentação em `DESIGN-SYSTEM-V2.md`;
- contrato em `tests/admin-design-system-v2-contract.test.mjs`.

## R3 — realizado nesta retomada
- comparação com `main`: branch 21 commits à frente e 0 atrás antes das edições; merge-base igual ao HEAD de main;
- `admin/admin-shell-v2.js` criado consumindo `adminNavigationModel`/Module Registry;
- `admin/admin-shell-v2.css` criado para desktop, tablet e drawer mobile;
- `admin/index.html` integrado ao Design System + Shell V2 sem migrar a lógica funcional das telas;
- menu manual principal removido e substituído por navegação agrupada gerada pelo registry;
- hash routes, links de página e links externos preservados;
- estado ativo, `aria-current`, `aria-expanded`, Escape e backdrop implementados;
- `Clientes` corrigido no registry para continuar sempre visível como no legado; o gate Customer OS controla a experiência protegida, não a existência do módulo;
- mounts funcionais existentes preservados no DOM;
- `tests/admin-shell-v2-contract.test.mjs` criado para segurança, gates e responsividade;
- nenhuma flag/runtime externo alterado.

## R3 — próximo lote
1. revisar compatibilidade dos módulos mount gated com inicialização dinâmica antes de qualquer expansão;
2. criar estratégia de Shell V2 reutilizável nas subpáginas sem duplicar menu;
3. migrar primeiro um pequeno conjunto de subpáginas de baixo risco e validar coexistência com CSS local;
4. padronizar topbar/estado ativo entre páginas e manter links/canaries;
5. concluir contrato tablet/mobile e evitar dupla vinculação dos listeners legados;
6. somente marcar R3 DONE após cobertura das superfícies principais sem regressão de navegação.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar pedido/cliente/publicação real como teste.
