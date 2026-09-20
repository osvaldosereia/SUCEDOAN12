# CURRENT STATE — Admin Geral

Atualizado: 2026-09-20
Branch: `admin-geral-r1-r16-autonomous-20260919`
Fase: R5 — Produtos, Categorias e Vitrine.
Execução autônoma: autorizada.
Efeitos externos novos: proibidos sem gate/evidência específica.

## Estado das rodadas
- R1: DONE
- R2: DONE
- R3: DONE
- R4: DONE
- R5: IN_PROGRESS
- R6–R16: PENDING

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

## R5 — andamento
- preflight desta retomada: branch 77 commits à frente e 0 atrás de `main`; merge-base = HEAD de main (`c635df8`), sem divergência paralela a reconciliar;
- `admin-products-v2.js/css` mantém views rápidas Todos/Ativos/Sem estoque/Ofertas/Destaques/Inativos usando exclusivamente o filtro backend existente;
- lista de Produtos agora recebe semântica mobile aditiva: cada célula ganha rótulo contextual e as linhas viram cards em telas pequenas, preservando os inputs e ações rápidas originais;
- toolbar reflowa em 2/1 colunas, inputs mantêm 16px no celular e ações possuem touch target >=44px;
- ficha de produto recebeu melhoria aditiva de leitura e ação sticky/safe-area, sem remover campos, editores de gôndola/imagem ou mudar o contrato de `save_product`;
- `tests/admin-r5-products-v2-contract.test.mjs` ampliado para garantir preservação de edição rápida, ausência de fetch/storage próprio e contratos mobile;
- assets R5 promovidos para `r5-2` no Admin principal;
- nenhuma view “Sem foto”, edição em massa ou capacidade backend foi simulada.

## R5 — próximo lote
1. revisar Categorias contra handlers reais de salvar/renomear e adicionar proteção/explicação de impacto sem mudar backend;
2. revisar Vitrine contra `storefront`/`save_storefront`, melhorando preview, hierarquia e ordenação de forma aditiva;
3. validar coexistência dos editores especializados de produto com a ficha V2;
4. concluir R5 somente quando Produtos/Categorias/Vitrine estiverem cobertos por contratos responsivos e sem regressão funcional.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar pedido/cliente/publicação real como teste.
