# CURRENT STATE — Admin Geral

Atualizado: 2026-09-20
Branch: `admin-geral-r1-r16-autonomous-20260919`
Fase: R7 — Cestas e Central Comercial.
Execução autônoma: autorizada.
Efeitos externos novos: proibidos sem gate/evidência específica.

## Estado das rodadas
- R1: DONE
- R2: DONE
- R3: DONE
- R4: DONE
- R5: DONE
- R6: DONE
- R7: IN_PROGRESS
- R8–R16: PENDING

## R1–R5 — concluídas
- Fundação/inventário, Design System V2, Shell/responsividade, Central de Trabalho e Produtos/Categorias/Vitrine concluídos com migração aditiva e contratos reais preservados.
- Nenhum gate externo/runtime foi aberto pela migração.

## R6 — concluída
- preflight do lote final partiu do HEAD `bc660524`; compare com `main` confirmou merge-base `c635df8`, branch à frente e 0 atrás, sem mudança paralela relevante em main;
- `admin-inventory-v2.js/css` mantém hub DOM-only em Produtos e agora expõe quatro fluxos reais: Balanço rápido, Gôndolas, Validades e ficha do produto;
- Balanço continua usando `inventory-fast-balance-v3`, `scan_batch` e fila local; `contagem/r6-balance-safety.js` adiciona somente proteção de duplo acionamento manual, estado busy, acessibilidade e clareza offline, sem fetch/storage próprio;
- Gôndolas continua usando `admin-gondolas-v1`/`scan_ean`; `admin/gondolas-r6-safety.js` adiciona confirmação para remover produto/desativar gôndola, busy guard e proteção curta contra acionamento duplicado, sem mudar API;
- Validades existente foi tornada explicitamente acessível pelo hub como capacidade legada atual; não foi convertida em nova automação nem promovida a novo runtime;
- ficha/listagem de Produtos permanecem como fluxo principal de estoque/validade no Admin, sem filtro ou endpoint inventado;
- `tests/admin-r6-inventory-v2-contract.test.mjs` cobre wiring, contratos existentes, ausência de rede/storage nas camadas aditivas e guardas operacionais;
- validação permaneceu estática/contratual; nenhuma leitura EAN, escrita de estoque, canary, publicação ou outbound foi executada.

## R7 — ponto de retomada
1. inventariar as superfícies reais de Cestas e Central Comercial antes de editar;
2. preservar composição/edição atual das cestas e qualquer contrato de pedido/orçamento já existente;
3. melhorar fluxo mobile/desktop, clareza de totais/ações e proteção contra alterações acidentais somente com capacidades reais;
4. Central Comercial deve permanecer gated se ainda estiver protegida; código pronto não autoriza ativação.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar pedido/cliente/publicação real como teste.
