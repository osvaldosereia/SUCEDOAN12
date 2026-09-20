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
- preflight desta retomada: branch 67 commits à frente e 0 atrás de `main`; merge-base = HEAD de main;
- `admin-dashboard-v2.js/css` entrega Central de Trabalho sem endpoint ou escrita adicional;
- “Precisa da sua atenção” usa somente métricas reais já carregadas: sem estoque, sem foto e pedidos recentes;
- “Acesso rápido” leva a Pedidos, Produtos, Cestas, Clientes e Vitrine sem duplicar lógica de navegação;
- prioridade, vazio, desktop/tablet/mobile, teclado e touch >=44px cobertos;
- período/comparação não foram inventados: permanecem fora até existir contrato backend real;
- contrato R4 ampliado para garantir ausência de fetch/storage e rotas existentes.

## R5 — iniciado
- `admin-products-v2.js/css` adiciona visualizações rápidas de Produtos usando exclusivamente o filtro backend já existente;
- views iniciais: Todos, Ativos, Sem estoque, Ofertas, Destaques e Inativos;
- os chips apenas atualizam o `select[name=status]` existente e submetem o formulário existente, sem novo fetch direto, storage ou escrita;
- integração aditiva em `admin/index.html` e contrato em `tests/admin-r5-products-v2-contract.test.mjs`;
- nenhuma view “Sem foto” foi simulada porque o contrato atual de listagem ainda não oferece esse status.

## R5 — próximo lote
1. mapear com precisão os campos já retornados por Produtos/Categorias/Vitrine e ampliar views apenas quando suportadas pelo backend;
2. melhorar experiência mobile da lista de produtos sem remover edição rápida existente;
3. evoluir ficha do produto de forma aditiva, preservando editores de gôndola/imagem já conectados;
4. revisar Categorias para impacto/segurança antes de renomear e Vitrine para preview/ordenação sem publicar efeitos externos;
5. manter qualquer edição em massa atrás de contrato explícito e validação, sem fabricar capacidade backend.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar pedido/cliente/publicação real como teste.
