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
- preflight do fechamento: branch 84 commits à frente e 0 atrás de `main`; merge-base = HEAD de main (`c635df8`), sem divergência paralela a reconciliar;
- `admin-products-v2.js/css` mantém views rápidas Todos/Ativos/Sem estoque/Ofertas/Destaques/Inativos usando exclusivamente filtros backend existentes;
- lista de Produtos recebe semântica mobile aditiva em cards, toolbar responsiva, inputs seguros e ações >=44px;
- ficha de produto mantém os editores especializados e handlers originais, com hierarquia e ação sticky/safe-area sem mudar `save_product`;
- `admin-catalog-v2.js/css` adiciona proteção de impacto para renomear Categorias, explicação de visibilidade/início/ordem e layout mobile sem criar rede/storage próprio;
- Vitrine ganhou resumo read-only de categorias visíveis/no início/produtos/cestas em destaque e explicação explícita de que alterações só entram em vigor ao salvar;
- a camada Vitrine usa exclusivamente controles já existentes de `storefront`/`save_storefront`; não inventa drag/drop, preview persistente ou nova capacidade backend;
- contrato `tests/admin-r5-catalog-v2-contract.test.mjs` cobre wiring, ausência de fetch/storage próprio, handlers reais e responsividade/touch;
- contratos reais revisados em `supabase/functions/admin-core-v1/index.ts`: `save_storefront` salva conjuntos completos de destaques e `rename_category` delega à RPC existente;
- nenhuma escrita real foi executada durante validação e nenhum efeito externo foi ativado.

## R6 — ponto de retomada
1. inventariar as superfícies reais de Estoque, Gôndolas, Validade e Balanço antes de editar;
2. preservar leitura EAN/câmera, edição unitária e contratos de estoque já existentes;
3. melhorar operação mobile/desktop, estados de conferência, filtros e segurança contra alterações acidentais somente sobre capacidades reais;
4. não executar canary/escrita real para validar; usar contratos estáticos/testes disponíveis.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar pedido/cliente/publicação real como teste.
