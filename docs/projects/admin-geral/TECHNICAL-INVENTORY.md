# TECHNICAL INVENTORY — Admin Geral

Snapshot: 2026-09-20. Documento de R1; atualizar quando a arquitetura mudar.

## 1. Superfícies principais observadas

### SPA principal `admin/index.html`
Rotas hash atuais preservadas: `dashboard`, `storefront`, `baskets`, `products`, `categories`, `orders`, `customers`.
Montagens condicionais existentes: Central Comercial, Logística e Automation Builder.
Dependências relevantes: `app.js`, `api.js`, `runtime-config.js`, `config.js`, módulos de pedidos, produtos, gôndola, imagem e cestas.

### Subpáginas administrativas existentes
- `gondolas.html` — localização física/estoque;
- `nomes-produtos.html` — normalização de nomes;
- `imagens-ia.html` — automação/revisão de imagens;
- `creative-studio.html` — criação visual;
- `marketing.html` — Marketing Admin;
- `relacionamento.html` — Central de Relacionamento, gated/canary;
- `atendimento.html` — estratégia/editor de atendimento;
- `inteligencia.html` — inteligência/respostas, ainda em camada visual antiga;
- `aprendizados.html` — aprendizados da IA, ainda em camada visual antiga;
- `pedidos.html` — superfície adicional de pedidos;
- `../contagem/` — Balanço rápido, mobile-first separado;
- `../video/` — ferramenta VIDEO separada.

## 2. Camadas visuais encontradas

Há múltiplas famílias CSS. A migração deve convergir sem remoção antecipada:
- base atual: `styles.css`;
- base antiga: `style.css` + `mobile-priority.css`;
- shell existente: `admin-shell.css`;
- módulos: `agent-learning.css`, `creative-studio.css`, `customer-360-v2.css`, `financial-admin.css`, `gondolas-v1.css`, `image-automation.css`, `marketing.css`, `ops-v3.css`, `pedidos-v2.css`, `product-image-editor-v1.css`, `product-name-management.css`, `products-inline-controls-v4.css`, `relacionamento.css`, `relationship-homologation-hardening.css`, `service-chat-center.css`, `service-intelligence.css`, `service-strategy.css`, `simple.css`, `stopmotion-paper-test.css`.

Regra de migração: Design System 2.0 entra como camada nova e compatível; CSS legado só pode ser removido após busca de referências + teste da superfície correspondente.

## 3. Configuração e gates

Existem duas fontes frontend atuais que devem ser adaptadas, não fundidas de forma destrutiva em R1:
- `admin/config.js`: flags e nomes de Edge Functions operacionais/experimentais;
- `admin/runtime-config.js`: core, Customer OS, Marketing e canaries.

O `navigation-contract.js` transforma ambas em um estado de gates somente para apresentação. Ele não ativa runtime, não altera banco e não abre efeito externo.

## 4. Fronteiras oficiais de responsabilidade

### Operação
Início prioriza pendências; Pedidos executa ciclo do pedido; Clientes lista pessoas; Cestas compõe produtos; Vitrine define merchandising; Comprar é superfície do cliente.

### Catálogo & Estoque
Produtos é registro mestre administrativo. Categorias classifica. Gôndolas localiza fisicamente. Nomes normaliza apresentação sem substituir referência oficial. Imagens cuida da mídia do produto. Balanço executa conferência física.

### Atendimento & Relacionamento
Atendimento controla jornada/comportamento. Inteligência controla conhecimento/respostas. Aprendizados propõe mudanças com evidência e aprovação. Relacionamento organiza filas/segmentos de trabalho. Customer 360 entende uma pessoa e permanece protegido por seus gates.

### Marketing & Criativos
Estúdio/Vídeo produzem ativos e prompts. Marketing planeja, aprova, distribui e mede. Publicação externa continua governada pelos gates próprios do Marketing Admin.

### Operação & Gestão
Central Comercial controla regras comerciais; Logística cuida expedição/rota; Financeiro faz conferência operacional; Automações orquestra regras governadas. Nenhum destes ganha ativação por aparecer no registry.

### Sistema
Integrações, Saúde, Configurações e Ferramentas Técnicas são destinos planejados para R15/R16; permanecem ocultos até implementação real.

## 5. Contratos criados em R1

- `admin/module-registry.js`: fonte canônica de grupos, módulos, rotas, status, prioridade mobile, gates e indicador de efeito externo.
- `admin/navigation-contract.js`: resolve visibilidade e href sem mutar configuração.
- `tests/admin-general-navigation-contract.test.mjs`: garante unicidade, ocultação de planejados/gated, isolamento de canary, preservação de rotas e marcação de módulos sensíveis.

## 6. Riscos de migração controlados

1. menus duplicados em HTMLs distintos podem divergir;
2. duas famílias base de CSS podem produzir regressões ao compartilhar componentes;
3. páginas antigas não possuem a mesma estrutura de shell;
4. alguns módulos existem mas estão deliberadamente gated;
5. rotas hash e páginas completas coexistem;
6. scripts de módulos podem depender de IDs DOM legados;
7. Marketing/Customer OS possuem homologações próprias e não podem ser ativados pela reforma visual.

Mitigação: registry + contrato de navegação primeiro; shell compatível depois; migração página a página; testes de contrato antes da remoção de qualquer legado.

## 7. Critério de conclusão da R1

R1 pode ser promovida quando: inventário e fronteiras estiverem documentados; registry e contrato de navegação estiverem testáveis; gates não forem alterados; estratégia de migração CSS/shell estiver explícita; dependências críticas estiverem mapeadas; próximo trabalho puder começar pelo Design System sem redescobrir a arquitetura.
