# Padrão visual e de seções — Admin Dona Antônia V2

## Decisão após comparação de três administradores (23/10/2026)
**Nuvemshop/Nimbus como referência principal de usabilidade e estrutura; Shopify/Polaris para busca/listas; Loja Integrada para ações operacionais diretas.**
Usar princípios de UX, não reproduzir identidade visual, código ou elementos proprietários.

Fontes:
- Nuvemshop Nimbus App Shell: https://nuvemshop.dev/documentation/patterns/app-shell
- Nuvemshop Nimbus Menu: https://nuvemshop.dev/documentation/patterns/menu
- Nuvemshop Nimbus Data Table: https://nuvemshop.dev/documentation/patterns/data-table
- Nuvemshop painel Vendas: https://atendimento.nuvemshop.com.br/pt_BR/minhas-vendas/como-administrar-meus-pedidos-na-pagina-de-vendas
- Shopify Index Table: https://shopify.dev/docs/api/app-home/latest/patterns/compositions/index-table
- Shopify Admin Search: https://help.shopify.com/pt-BR/manual/shopify-admin/admin-search
- Shopify renovação setembro/2026: https://changelog.shopify.com/posts/see-the-shopify-admin-s-new-look
- Loja Integrada painel: https://lojaintegrada.com.br/hub/novo-painel-da-loja-integrada/

## Comparação objetiva
| Critério | Loja Integrada | Nuvemshop | Shopify |
|---|---|---|---|
| Simplicidade para operadores iniciantes | Boa | Muito boa | Boa |
| Navegação agrupada e responsiva | Boa | Muito boa | Excelente |
| Tabelas grandes, filtros e busca | Boa | Muito boa | Excelente |
| Design system formal documentado | Limitado | Nimbus (amplo) | Polaris (amplo) |
| Referência escolhida | Ações rápidas | **Principal** | Produtividade complementar |

Avaliação qualitativa, não teste comparativo com funcionários reais. Interfaces comerciais evoluem no tempo.

## Seções do painel
- **OPERAÇÃO**: Início (implementado); Pedidos (planejado: 4 estados + separação/entrega).
- **CATÁLOGO E VITRINE**: Produtos (implementado), Tipos de produto (implementado), Composição das cestas (implementado), Produtos extras (implementado).
- **GESTÃO**: Clientes, Marketing, Relatórios (planejados).
- **SISTEMA**: Integrações, Configurações (planejados).

**As sete categorias comerciais do Bling são dados dos produtos, NÃO páginas ou itens do menu principal.**

## Padrões obrigatórios
- Navegação desktop persistente e opcionalmente compacta; mobile abre drawer a partir de botão explícito.
- Cabeçalho sempre traz localização da página, título, propósito, ações específicas e status da prévia.
- Listagens: pesquisa direta, filtros rápidos, filtro específico, resultados, edição in-line, carregamento por partes. Em produção, filtros e paginação passarão ao backend.
- Ações frequentes em 1–2 interações sempre que viável; não exigir navegar a outra página apenas para atualizar estoque/ativação.
- Busca global usa Ctrl/Cmd+K, encontra seções e produtos, e abre seção correspondente.
- Módulos futuros não apresentam telas falsas: botão desabilitado identificado 'Em breve'.
- Seção tem deep link `?secao=...` com suporte a voltar/avançar do navegador; sem exigir reescrita de URLs no servidor.
- Design limpo: um destaque visual por ação principal, estado selecionado evidente, tipografia legível, superfícies neutras, espaçamento consistente.
- No mobile, sem overflow do documento; tabelas possuem área própria de rolagem. Prioridade futura: listas adaptativas para edição sem tabela larga.
- Componentes compartilhados de Shell, ícones, filtros e cartões; módulos independentes e lazy-loaded para não crescer como um único bundle.
- Sem dados pessoais, estoque fictício ou ações reais sem backend autenticado.
- Teste Playwright para mobile e desktop após qualquer mudança no Shell, menus, cadastros ou fluxos.
- Meta PageSpeed não é evidência de desempenho. Medir Lighthouse depois de hospedagem de homologação.

## Arquitetura resultante
- `src/admin/navigation.ts`: registro de todas as seções, grupo, título, descrição, disponibilidade e ícone.
- `src/admin/shell/{AdminShell,AdminIcon}.tsx`: layout, drawer, sidebar, pesquisa global e ações básicas.
- `src/admin/routing/useAdminSectionRoute.ts`: estado sincronizado com histórico/deep-link.
- `src/admin/features/home/HomeDashboard.tsx`: início operacional e acesso às seções.
- `src/admin/features/products/ProductsPanel.tsx`: catálogo com busca, filtros, tabela e edição.
- `src/admin/features/{product-types,baskets,extras}`: funcionalidades específicas, preservadas.
- `src/styles/admin-{shell,responsive,products}.css`: estilos sem carregar no site público.

Para adicionar módulo novo, cadastrar seção no registro e sua rota, criar componente com escopo próprio e testes. Somente marcar disponível quando efetivamente implementado e testado.

## Segurança e limites atuais
As telas utilizam dados em memória e não há sessão de operador, banco ou pedidos reais. Não publicar o admin antes da autenticação, RBAC, validação backend e persistência de mudanças. Não conectar Supabase ou Bling em produção nesta fase.
