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
- preflight mais recente: branch 43 commits à frente e 0 atrás de `main`; merge-base = HEAD de main;
- `admin/admin-shell-v2.js` + `admin/admin-shell-v2.css` integram o Admin principal ao Module Registry;
- menu principal manual substituído por navegação agrupada, preservando hash routes, pages, external links, gates e mounts;
- `Clientes` permanece visível; Customer OS controla a experiência protegida, não a entrada básica;
- `admin/admin-subpage-shell-v2.js` consome o mesmo Navigation Contract sem fetch/escrita/runtime side effect;
- `admin/admin-subpage-shell-v2.css` adapta o shell a subpáginas: sidebar desktop, drawer mobile, touch targets, safe-area e reduced-motion;
- `admin/gondolas.html`, `admin/creative-studio.html` e `admin/pedidos.html` usam diretamente o shell compartilhado preservando CSS/JS funcional local;
- `admin/nomes-produtos.html` e `admin/imagens-ia.html` agora entram no Shell V2 por bootstrap allowlisted em `comprar-ui.js`, evitando reescrita de suas páginas funcionais extensas;
- o bootstrap injeta apenas as duas folhas V2 e importa o shell compartilhado nessas páginas; falha no import preserva a página legada e não bloqueia sua função principal;
- Nomes preserva `product-name-management.css` e Imagens preserva `image-automation.css`; nenhuma chamada funcional de normalização/geração foi alterada;
- Pedidos preserva API, filtros, impressão e PDF;
- mounts gated continuam seguros: o Navigation Contract pode expô-los somente quando a flag correspondente estiver ativa, e o shell de subpágina não cria href para `route.type=mount`;
- contrato `tests/admin-subpage-shell-v2-contract.test.mjs` cobre migração direta e bootstrap allowlisted;
- nenhuma flag/runtime externo alterado.

## R3 — próximo lote
1. revisar e migrar as demais subpáginas modernas compatíveis, priorizando Marketing/Relacionamento/Atendimento sem tocar seus gates funcionais;
2. manter `inteligencia.html`/`aprendizados.html` para migração controlada por usarem a família visual antiga;
3. validar ausência de dupla vinculação de menu/listeners em cada página migrada e expandir o bootstrap somente por allowlist explícita;
4. ampliar cobertura tablet/mobile e estado ativo de subpáginas;
5. marcar R3 DONE somente quando as superfícies principais compartilharem navegação sem regressão; então promover R4.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar pedido/cliente/publicação real como teste.
