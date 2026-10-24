# Plano diretor de evolução — Dona Antônia V2
**Data de referência:** outubro de 2026  
**Situação:** planejamento + protótipo isolado, sem uso de produção  
**Repositório:** osvaldosereia/SUCEDOAN12; pasta projetos/dona-antonia-v2; branch agent/dona-antonia-nova-plataforma

## 1. Objetivo e critério de sucesso
Construir **loja de cestas personalizáveis + admin operacional completo**, simples para operadores e com qualidade de engenharia que suporte evolução contínua sem retrabalho generalizado.

* Ninguém precisa operar Bling, Meta ou Supabase diretamente para receber e separar pedidos.
* Alterar o card ou o menu não afeta regras de pedido, preço ou emissão fiscal.
* A abertura de uma cesta é rápida e não bloqueia a tela inteira por produtos opcionais.
* Estoque, preço, configurações e pedidos ficam consistentes mesmo com conexão instável.
* Nenhuma mudança da V2 alcança o site em produção antes da homologação formal.
* 100 PageSpeed é uma **meta**, não uma garantia: é preciso medir Lighthouse Mobile e Core Web Vitals em hospedagem de homologação; LCP <= 2,5 s, INP <= 200 ms, CLS <= 0,1 como metas de experiência.

## 2. Referências de mercado verificadas (2026)
**Shopify Admin 2026 — principal:** interface densa e neutra, barra lateral compacta, foco, remoção de containers redundantes, ações contextualizadas. Em 15/09/2026 mudou a navegação, cores e tipografia; Polaris 2.0 RC está disponível, mas nosso projeto NÃO deve depender de UI embutida no Shopify. Usar os princípios e componentes próprios com tokens.

**Shopify Products:** listagem com busca, filtros, seleção múltipla, editor em lote, SKU, código de barras, estoque, preço, mídia e categoria. Temos a decisão comercial de **um SKU por sabor/aroma**, mesmo que Shopify ofereça variantes. **Tipos Arroz/Feijão/etc. são grupos de substituição próprios das cestas**, não variantes nem categorias do Bling.

**Shopify Orders:** vista por status e filtros combináveis; pagamentos, processamento e entrega são dimensões distintas. Tela do pedido serve como centro da operação e edição; sem espalhar ações em várias abas.

**Nuvemshop Nimbus:** referência complementar para Data Table/Data List e formulários consistentes; **Loja Integrada** para fluxo simples de operadores brasileiros.

Fontes oficiais:
- https://www.shopify.com/blog/admin-new-look
- https://changelog.shopify.com/posts/see-the-shopify-admin-s-new-look
- https://shopify.dev/changelog/posts/polaris-2-0-release-candidate
- https://shopify.dev/docs/api/app-home/latest/patterns/compositions/index-table
- https://help.shopify.com/pt-BR/manual/products
- https://help.shopify.com/pt-BR/manual/fulfillment/managing-orders
- https://help.shopify.com/pt-BR/manual/fulfillment/managing-orders/order-status
- https://nimbus.nuvemshop.com.br/documentation/patterns/data-table

## 3. Identidade visual e design system V2
**Sem copiar os ativos proprietários nem criar dependência do Shopify.**
- Paleta: fundos quase brancos (#F7F7F8), superfícies brancas, bordas cinza discretas, sidebar carvão; bordô institucional apenas logotipo/foco/contexto restrito; cores semânticas exclusivas para estados.
- Fontes: Inter com pilha system-ui como fallback; **sem depender de fontes externas** para renderizar o primeiro quadro; texto principal 13–14 px no desktop, 14–16 px em formulários mobile; hierarquia tipográfica curta.
- Grid 4/8 px; controles altura 36–40 px (toque >= 44 px nas ações móveis); radius 6–10 px; sombras quase invisíveis.
- Componentes designados: PageHeader, AppShell, Field, SearchInput, FilterBar, DataTable, StatusBadge, Button, EmptyState, ConfirmDialog, SidePanel, Toast, Skeleton, ImageSquare.
- Densidade apropriada ao modo de operação: lista de produtos/pedidos compacta no desktop; cartões/resumo responsivos e ações grandes no mobile.
- Um botão primário por vista. Botões só existem se executam a ação. Fluxos inacabados marcados "Em breve", não ativos.
- Teclado e acessibilidade: rotulagem, estado de foco, contraste WCAG AA, Escape, atalho de busca, carregamento/erro sem perder dados.
- Imagens catálogo/cestas 1:1 com dimensões reservadas, avif/webp e lazy-loading seletivo. Priorizar imagem LCP e não carregar 10 fotos quando só 2 estão visíveis.
- Acompanhar e registrar mudanças no design system. Não reintroduzir 20 versões distintas de campo ou botão.

## 4. Navegação-alvo com lançamento gradual
**Operação:** Início, Pedidos, Atendimento (WhatsApp).  
**Catálogo:** Produtos, Estoque, Tipos de produto, Cestas básicas, Produtos extras.  
**Gestão:** Clientes, Relatórios, Marketing.  
**Sistema:** Integrações, Configurações.

* Produto é o SKU real (1 por apresentação/sabor/aroma).
* Categoria é a taxonomia fechada do Bling: MERCEARIA BÁSICA, LIMPEZA, LAVANDERIA, HIGIÊNE, BELEZA, UTILIDADES, PET.
* Tipo (ARROZ, FEIJÃO, ÓLEO...) é um grupo de alternativas elegíveis a cestas, diferente de categoria.
* Composição associa tamanho de cesta -> tipo -> quantidade padrão; cliente escolhe SKU entre os vinculados, inclusive 0.
* Extras associam tipo -> SKUs com início 0 e são comuns às cinco cestas.

## 5. Roadmap sequencial, com entregáveis e gates

### Fase 0 — Fundamentação visual e engenharia [EM ANDAMENTO — R01/R02 concluídas; fundação R03 local, Auth remoto pendente]
**Objetivo:** parecer sistema comercial consistente em TODAS as telas, não só na página inicial.
**Entregáveis:** tokens de cor/tipo/espaçamento, AdminShell profissional, menus, listagens, formulários, layouts desktop/mobile, padrões de carga/erro/empty-state, biblioteca leve de UI interna, contrato de dados para módulos; documentação, ESLint/Prettier e lint de acessibilidade.
**Gate:** TS, build, teste unitário, Playwright mobile + desktop, screenshots e comparação visual. Não tocar em produção.

### Fase 1 — Catálogo e composição administráveis [PRÓXIMA]
**Entregáveis:** cadastro/edição completos no admin com validação; SKU/EAN, imagem 1:1, categoria fechada, preço, custo (privado), estoque, validade opcional; filtros salvos, edição em linha, paginação server-side/ação em lote; cadastro dos cinco tamanhos com valor interno privado; tipos e extras sem repetir lógica.
**Integração:** staging isolado Supabase + importação revisada do CSV 802 SKUs. Bling poderá ser a fonte de identificadores fiscais, mas disponibilidade do site é controlada pelo estoque operacional no banco do app; evitar "duas fontes de verdade" concorrentes.
**Gate:** importar e consultar 802 SKUs com 0 duplicados; sem mostrar produto inativo, zerado, vencido ou preço zero; testes de RLS/auth e 1000 linhas sem congelar UI. NÃO importar diretamente no banco legado.

### Fase 2 — Pedidos básicos + checkout real [PRIORIDADE CRÍTICA]
**Quatro vistas EXATAS para operadores:**
- NOVO: recebido, aguardando início da separação.
- EM SEPARAÇÃO: operador identificado; itens conferidos.
- PRONTO: separado e pronto para entregar.
- ENTREGUE: entrega concluída.
Cancelamento/erro fiscal devem ser **flags ou ações acessórias**, não quinta aba principal. A estrutura interna terá códigos imutáveis e rótulos visíveis localizáveis.
**Pedido:** número único e imutável, cliente/telefone, endereço de entrega, forma de pagamento, itens com snapshots, total recalculado no servidor; mínimo e janela de entrega segundo configuração atual; pagamento na entrega (PIX/dinheiro/cartões aceitos); checkout tolerante a dados de cliente incompletos sem perder a venda.
**Separação:** lista igual à compra, botões Separado/Faltou, baixa de quantidade/valor, operador responsável, conclusão mesmo se NF falhar; imprimir etiqueta mínima com número único.
**Escala:** múltiplos operadores com claim/lease seguro, estoque reservado transacionalmente, concorrência/optimistic locking, paginar 5–20 conforme configuração, carga incremental.
**Gate:** teste de ponta a ponta de pedido real *em staging* do checkout à entrega; dupla confirmação não duplica; falta de estoque não vende e operador concorrente não sobrescreve outro; testes de idempotência/reservas.

### Fase 3 — Atendimento WhatsApp dentro do novo admin [PRIORIDADE ALTA]
**Reutilizar o que funciona no Vitrine/Admin, sem copiar legado cegamente.**
Conferir contratos/webhooks/provedores Meta dos números oficiais, preservar o atendimento atual até migração controlada.
Inbox com duas contas, mensagens e áudio, pesquisa telefone, filtros Aberta/Pendente/Concluída (são **status de conversa**, não de pedido), vínculo bidirecional conversa <-> cliente/pedido; atendimento humano e notas internas; roteamento e permissão por atendente.
**Gate:** uma mensagem recebida/saída em ambiente apropriado sem duplicação, com correlação por contato; nenhum desligamento do atendimento atual antes do novo passar em teste e receber autorização.

### Fase 4 — Avisos Meta de andamento do pedido [APÓS FASES 2 E 3]
Eventos confiáveis: OrderCreated, PickingStarted, OrderReady, OrderDelivered (uso seletivo). Templates **UTILITY** aprovados para mensagens transacionais; templates não podem ser enviados fora das políticas de janela de 24 h/consentimento. Não tratar marketing como aviso utilitário. Botões curtos, primeiro nome e número do pedido.
Serviço: outbox durável -> fila/worker limitado -> Meta Cloud API -> callback de entrega/falha; chave idempotente \`order_id + event_type + template_version + recipient\`; não enviar ao salvar a página duas vezes.
Usar números 0975 e 1018 vinculados ao canal correto; logs de tentativas/erros, retentativa com teto, custos de templates monitorados.
**Gate:** nenhum envio duplicado, retry com falha simulada, status de entrega visível na ficha, opt-in quando exigido.
Fontes: https://whatsappbusiness.com/products/business-platform-features/ e https://whatsappbusiness.com/policy/

### Fase 5 — Bling como integração FISCAL [APÓS SEPARAÇÃO]
**Escopo:** associar SKU e dados fiscais ao pedido já separado; reconciliar NCM/CEST e CFOP/CST fiscal de saída antes da emissão; criar pedido/venda e NF-e no Bling após faltar/ajustar itens; transmitir/consultar situação NF-e conforme API, manter resultado e links no pedido.
Regra fundamental: NF-e falhar **não impede marcar PRONTO**; apenas fica como "Nota pendente/bloqueada", com erro claro e reprocessamento seguro, sem emissão duplicada.
Integração segura OAuth2 no backend, refresh de token, limite atual da API Bling (3 requisições/segundo, 120.000/dia) e filas/backoff/429; webhooks \`order\`, \`product\`, \`stock\`, \`invoice\` conforme escopo.
**Gate:** saída fiscal de homologação com dados corretos, emissão repetida não duplica, erro NCM/CFOP visível, auditoria e conciliação; responsável fiscal valida regras e configuração Bling.
Fontes: https://developer.bling.com.br/bling-api; https://developer.bling.com.br/limites; https://developer.bling.com.br/webhooks; https://ajuda.bling.com.br/hc/pt-br/articles/360036450634-Como-gerar-nota-NF-e-a-partir-do-pedido-de-venda

### Fase 6 — Controles comerciais e produtividade
Clientes e endereços recorrentes, histórico/recompra por WhatsApp, importação XML/fornecedores quando necessário, controle de validade, devoluções/cancelamentos, relatórios e indicadores básicos, conciliação financeira, auditoria de alterações.
Implementar somente após pedidos e fiscal confiáveis. Evitar módulos de rota/motorista/leitor EAN sem prioridade operacional.

### Fase 7 — Homologação integral e migração autorizada
Staging de domínio separado e barato, sem workers permanentes desnecessários; teste de carga com cenário real de 802 produtos, fotos otimizadas, observabilidade dos erros, revisão de segurança e acessibilidade, testes mobile com internet fraca, backups, rollback e checklist de ativação.
**Somente com autorização explícita substituir o site atual.**

## 6. Arquitetura para dezenas de módulos
**Monólito modular + serviços externos por adaptador**, evitando microserviços prematuros.

\`\`\`
app-shell/design-system
  features/catalog       -> products, stock, category
  features/baskets       -> sizes, types, options, extras, private adjustment
  features/orders        -> aggregate, order lines, transitions, packing
  features/customer      -> customer + addresses
  features/inbox         -> threads, messages, attachments
  features/notifications -> template + outbox + status
  features/fiscal        -> invoices + status
  features/reports       -> read-only projections
core/domain              -> regras puras: TypeScript sem React/SQL/HTTP
application              -> commands, queries, permissions, transactions
infrastructure           -> Supabase, Meta, Bling, auth, audit, media
shared/ui                 -> design system com tokens sem regras de negócio
\`\`\`

**Contratos por domínio:** \`OrderRepository\`, \`CatalogRepository\`, \`MessagingProvider\`, \`FiscalProvider\`. Adaptadores isolam APIs e tornam mocks de teste honestos.
**Backend é autoridade:** estoque, preço, valores privados, mínimo, entrega e transições de pedido nunca definidos pelo navegador.
**Eventos auditáveis:** \`OrderCreated\` etc. vão para outbox na mesma transação; consumidores independentes e idempotentes.
**Responsabilidades separadas:** \`order_status\`, \`payment_status\`, \`delivery_status\`, \`fiscal_status\`, \`message_status\` — UI operacional pode ter só quatro abas de pedidos.
**Sem acesso direto do frontend a credenciais** Bling/Meta ou a tabelas sem RLS e RBAC.
**Migração incremental:** uma branch por mudança independente; PR atomicamente testado; código morto removido, *feature flags* reais, migrações versionadas e reversíveis, documentação por decisão (ADR), métricas de tempo e erros.
**Custos:** preferir jobs acionados por eventos ao invés de polling intensivo e workers sempre ligados. Verificar limites da hospedagem e Supabase antes de ativar novas rotinas.

## 7. Priorização simples
| Ordem | Módulo | Resultado para o usuário |
|---|---|---|
| 0 | Design system profissional | Visual comercial e consistente |
| 1 | Produtos / tipos / cestas / extras reais | Admin configurável e catálogo coerente |
| 2 | Pedidos com quatro estados | Receber, separar, finalizar e entregar |
| 3 | Atendimento WhatsApp | Conversas e pedidos na mesma tela |
| 4 | Meta Utility | Alertas automáticos sem duplicação |
| 5 | Bling Fiscal | NF-e após separação, falhas tratadas |
| 6 | Clientes / relatórios / marketing | Crescer com dados confiáveis |
| 7 | Desempenho + go-live | Publicar só depois de homologar |

## 8. Critérios de engenharia que bloqueiam PR
1. Sem mudanças na main ou no site atual; staging isolado.
2. Testes unitários do domínio + TypeScript estrito + build + Playwright relevante (desktop/mobile).
3. Testes de integração com falhas simuladas de Supabase/Meta/Bling; segurança/RLS quando conectar banco.
4. Lighthouse em staging quando houver URL real; números não inventados.
5. Componentes reutilizáveis antes de novas telas; sem estilos inline arbitrários e sem copiar regras para três locais.
6. Logs rastreáveis de pedidos/fiscais/WhatsApp, com campos sensíveis minimizados.
7. Revisão de acessibilidade, cenário de internet fraca e não regressão em pedidos existentes.
8. Responsável por cada decisão registra ADR no repositório; sem módulos órfãos nem dependências esquecidas.

## 9. Limites atuais e decisões explícitas
- Esta fase documenta e aperfeiçoa a **interface demonstrativa**; não conecta Supabase/Meta/Bling sem implementação controlada.
- Não existem pedidos reais na V2; módulos futuros ficam bloqueados no menu.
- Fotos quadradas do catálogo e de cestas seguem 1:1; valor interno da cesta é privado e integrado no backend futuro, não como item separado ao cliente.
- 40% sobre custo na importação inicial de produtos é *markup* de preço, não margem bruta de 40%; custos nunca aparecem no site.
- A homologação de emissão fiscal depende de tributação correta e credenciamento/certificado no Bling.


## Baseline executada — R00 (23/10/2026)
A auditoria integral da pasta V2 foi concluída no baseline da SHA 1a846beba768192c366937c1462bcfd6baeccee9. A documentação de acompanhamento está em docs/AUDITORIA_COMPLETA_V2.md e docs/STATUS_RODADAS_V2.md. TypeScript, arquitetura, 35 testes unitários e build passaram; Playwright de 9 casos passou no CI da mesma SHA. A análise de dependências encontrou quatro vulnerabilidades na árvore dev/importação (duas críticas e duas moderadas), sem alertas nas dependências runtime. As migrações seguem não testadas em PostgreSQL e não foram aplicadas. Não há backend/auth/checkout persistente.
**Sequência mantida:** R01 corrige dependências, lockfile, lint/format e consistência visual; R02 reconcilia e testa o schema exclusivamente numa base descartável antes de qualquer homologação remota. Nenhum banco ou serviço de produção foi acessado. A auditoria não autoriza publicação; o workflow em main publica automaticamente apenas /site1 e /admin1 e deverá estar sujeito ao gate específico antes de qualquer merge.


## Atualização de execução — R02 (24/10/2026)
A R02 concluiu a fundação de persistência no escopo local: quatro migrações Supabase CLI, schema privado `da_next` com 21 tabelas e RLS deny-by-default, contratos TS, ERD e ADR. Replay, constraints representativas, idempotência e rollback passaram em PGlite descartável via `npm run test:db`, também integrado ao CI da V2. Não houve criação/configuração de projeto, acesso ou aplicação remota. CI #40061111459 passou no SHA de implementação `08ece30274c4b36e1c325fcf0e3d3fbabb41c49a`, incluindo E2E de navegador. PGlite não verifica Auth, policies reais ou Data API do Supabase.

PR R02 #1366 está aberto, sem merge. A sequência agora é R03 — autenticação, modelo de ator, RBAC e policies RLS, com testes negativos. A R02 não implementa adapter, endpoint, checkout nem consumidor da outbox. Detalhes e limites: `docs/PERSISTENCIA_ISOLADA_V2.md`, `docs/DIAGRAMA_ERD_V2.md`, `docs/ADR-002-PERSISTENCIA.md` e `docs/STATUS_RODADAS_V2.md`.


## Atualização de execução — R03 (24/10/2026)
Foi implementada a fundação local de RBAC/RLS: ADMIN, PRODUCTS, SEPARATION e SUPPORT; helper de permissão baseado em `auth.uid()` e atribuição no banco; grants mínimos, policies com `USING`/`WITH CHECK`; valores internos em tabelas separadas; contratos TS e matriz documentada. Cinco migrações/24 tabelas passaram nos testes PostgreSQL descartáveis, incluindo permissões negativas, revogação e isolamento privado.

A UI de login e o adapter Supabase Auth não foram conectados porque ainda não há projeto V2 isolado. A autenticação exige URL/chave pública e configuração no projeto novo; `service_role` não será enviada ao browser. Criar recurso remoto pode gerar custo/consumir limites e fica pendente de autorização específica. Não houve consulta nem alteração dos projetos legados. Resultado e limites: `docs/STATUS_RODADAS_V2.md`, `docs/MATRIZ_ACESSO_V2.md` e `docs/ADR-003-AUTENTICACAO-RBAC.md`.
