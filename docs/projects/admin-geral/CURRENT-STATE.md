# CURRENT STATE — Admin Geral

Atualizado: 2026-09-20
Branch: `admin-geral-r1-r16-autonomous-20260919`
Fase: R6 — Estoque, Gôndolas, Validade e Balanço.
Execução autônoma: autorizada.
Efeitos externos novos: proibidos sem gate/evidência específica.

## Estado das rodadas
- R1: DONE
- R2: DONE
- R3: DONE
- R4: DONE
- R5: DONE
- R6: IN_PROGRESS
- R7–R16: PENDING

## R1 — concluída
- inventário técnico e mapa de migração em `TECHNICAL-INVENTORY.md`;
- `admin/module-registry.js` e `admin/navigation-contract.js` criados;
- contratos de navegação/gates cobertos por teste; rotas e gates preservados.

## R2 — concluída
- Design System V2 aditivo, responsivo e documentado;
- tokens, componentes, estados, touch/safe-area e acessibilidade cobertos por contrato.

## R3 — concluída
- Shell V2 principal/subpáginas e context nav compartilhados;
- superfícies modernas migradas progressivamente sem remover lógica/CSS funcional;
- workspaces especializados preservam navegação interna e recebem retorno consistente ao Admin;
- nenhum gate externo/runtime foi alterado.

## R4 — concluída
- `admin-dashboard-v2.js/css` entrega Central de Trabalho sem endpoint ou escrita adicional;
- “Precisa da sua atenção” usa somente métricas reais já carregadas: sem estoque, sem foto e pedidos recentes;
- “Acesso rápido” leva a Pedidos, Produtos, Cestas, Clientes e Vitrine;
- período/comparação não foram inventados: permanecem fora até existir contrato backend real.

## R5 — concluída
- Produtos/Categorias/Vitrine receberam camadas aditivas responsivas e proteção operacional;
- filtros e persistências continuam exclusivamente nos contratos backend existentes;
- nenhuma escrita real foi executada durante validação e nenhum efeito externo foi ativado.

## R6 — andamento
- preflight deste lote: HEAD inicial `490bcb40`; branch 91 commits à frente e 0 atrás de `main`; merge-base = HEAD de main `c635df8`, sem divergência paralela relevante;
- inventário confirmou três superfícies reais complementares: Produtos no Admin, `admin/gondolas.html` e `contagem/` (Balanço rápido);
- Balanço rápido mantém `inventory-fast-balance-v3`, fila local, `scan_batch`, leitura direta e modo quantidade; nenhuma chamada foi executada nesta validação;
- Gôndolas mantém `admin-gondolas-v1`, `scan_ean`, mover/remover produto e foco contínuo no leitor;
- criado `admin-inventory-v2.js/css`, hub DOM-only na rota Produtos com atalhos explícitos para Balanço, Gôndolas e ficha de Produtos; abrir o hub não grava nem consulta nada adicional;
- o hub explica que estoque só é alterado dentro do fluxo escolhido e reutiliza integralmente os contratos existentes;
- `tests/admin-r6-inventory-v2-contract.test.mjs` cobre wiring, ausência de fetch/storage próprio, responsividade/touch e preservação dos contratos de Balanço/Gôndolas;
- `admin/index.html` recebeu somente os assets R6 aditivos; rotas e editores existentes foram preservados;
- nenhuma escrita real, canary, publicação, outbound ou integração externa foi acionada.

## R6 — próximo lote
1. melhorar segurança operacional de Gôndolas para ações destrutivas/reorganizadoras sem mudar API (confirmação e estados busy);
2. revisar Balanço rápido para prevenção de duplo acionamento, clareza de fila/sincronização e ergonomia mobile sem alterar `scan_batch`;
3. revisar como validade é exposta na ficha/listagem e acrescentar apenas filtros/estados suportados pelos contratos reais;
4. validar contratos estáticos/testes disponíveis e fechar R6 quando as quatro superfícies estiverem coerentes.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar pedido/cliente/publicação real como teste.
