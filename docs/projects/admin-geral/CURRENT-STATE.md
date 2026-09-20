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

## R3 — estado acumulado
- preflight mais recente: branch 29 commits à frente e 0 atrás de `main`; merge-base = HEAD de main;
- `admin/admin-shell-v2.js` + `admin/admin-shell-v2.css` integram o Admin principal ao Module Registry;
- menu principal manual substituído por navegação agrupada, preservando hash routes, pages, external links, gates e mounts;
- `Clientes` permanece visível; Customer OS controla a experiência protegida, não a entrada básica;
- novo `admin/admin-subpage-shell-v2.js` consome o mesmo Navigation Contract sem fetch/escrita/runtime side effect;
- novo `admin/admin-subpage-shell-v2.css` adapta o shell a subpáginas: sidebar desktop, drawer mobile, touch targets, safe-area e reduced-motion;
- `admin/gondolas.html` e `admin/creative-studio.html` migrados como primeiras superfícies de baixo risco, mantendo seus CSS/JS funcionais locais;
- ambas usam menu central, backdrop, `aria-expanded`, Escape e Design System opt-in;
- `tests/admin-subpage-shell-v2-contract.test.mjs` cobre contrato read-only, responsividade e preservação dos estilos funcionais;
- nenhuma flag/runtime externo alterado.

## R3 — próximo lote
1. revisar os módulos mount gated e definir navegação segura quando estiverem habilitados fora do index;
2. migrar progressivamente `nomes-produtos.html`, `imagens-ia.html`, `pedidos.html` e demais subpáginas que já usam `styles.css`, sem reescrever sua lógica funcional;
3. manter `inteligencia.html`/`aprendizados.html` para migração controlada por usarem a família visual antiga;
4. validar ausência de dupla vinculação de menu/listeners em cada página migrada;
5. ampliar contrato tablet/mobile e estado ativo de subpáginas;
6. marcar R3 DONE somente quando as superfícies principais compartilharem navegação sem regressão; então promover R4.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar pedido/cliente/publicação real como teste.
