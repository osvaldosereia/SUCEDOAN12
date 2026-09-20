# CURRENT STATE — Admin Geral

Atualizado: 2026-09-20
Branch: `admin-geral-r1-r16-autonomous-20260919`
Fase: R4 — Início e Central de Trabalho.
Execução autônoma: autorizada.
Efeitos externos novos: proibidos sem gate/evidência específica.

## Estado das rodadas
- R1: DONE
- R2: DONE
- R3: DONE
- R4: IN_PROGRESS
- R5–R16: PENDING

## R1 — concluída
- inventário técnico e mapa de migração em `TECHNICAL-INVENTORY.md`;
- `admin/module-registry.js` e `admin/navigation-contract.js` criados;
- contratos de navegação/gates cobertos por teste;
- rotas e gates preservados.

## R2 — concluída
- `admin/admin-design-system-v2.css` entregue como Design System aditivo/opt-in;
- tokens, componentes, estados, responsividade, touch, safe-area, acessibilidade e documentação em `DESIGN-SYSTEM-V2.md`;
- contrato em `tests/admin-design-system-v2-contract.test.mjs`.

## R3 — concluída
- preflight desta retomada: branch 55 commits à frente e 0 atrás de `main`; merge-base = HEAD de main;
- Shell V2 principal e subpage shell consomem Module Registry/Navigation Contract;
- Admin principal, Gôndolas, Estúdio Criativo, Pedidos e Marketing usam shell compartilhado preservando lógica local;
- Nomes dos Produtos e Imagens IA usam bootstrap allowlisted/fail-safe;
- `admin-context-nav-v2.js/css` tornou-se camada autônoma, idempotente e não invasiva para workspaces com navegação interna própria;
- Relacionamento e Atendimento agora recebem navegação administrativa contextual sem substituir tabs/sidebars internas;
- Inteligência e Aprendizados mantêm `style.css`/`mobile-priority.css` funcional e recebem apenas bootstrap contextual fail-safe via `config.js`;
- context nav infere o módulo pela página, injeta seu CSS uma única vez e não cria links para rotas sem `href`;
- contrato `tests/admin-r3-context-nav-contract.test.mjs` cobre as quatro superfícies especializadas e preserva o modo seguro do teste de Atendimento;
- nenhum gate externo/runtime foi alterado.

## R4 — iniciado
- `admin/admin-dashboard-v2.js/css` adiciona camada operacional ao Início sem novo endpoint e sem escrita;
- seção “Precisa da sua atenção” deriva prioridades dos dados já renderizados: sem estoque, sem foto e pedidos recentes;
- cartões são ações reais e levam aos módulos correspondentes;
- layout responde em desktop/tablet/mobile, com foco de teclado e estado vazio;
- integração feita de forma aditiva em `admin/index.html`;
- contrato `tests/admin-r4-dashboard-v2-contract.test.mjs` garante ausência de fetch/storage na camada e presença da responsividade.

## R4 — próximo lote
1. enriquecer a Central de Trabalho usando somente métricas/pendências já disponíveis no payload do dashboard ou endpoints read-only existentes;
2. separar visualmente “Agora”, operação e acompanhamento sem transformar o Início em painel excessivamente denso;
3. criar atalhos acionáveis para estoque, catálogo e pedidos, preservando o fluxo mobile-first;
4. avaliar período/comparação somente se houver contrato backend real; não fabricar séries históricas no frontend;
5. concluir R4 quando o Início responder claramente “o que precisa da minha atenção agora?” com loading/vazio/erro e navegação útil.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar pedido/cliente/publicação real como teste.
