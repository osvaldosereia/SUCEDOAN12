# Admin Canecas V2

Admin operacional da Dona Antônia / CanecaFácil para catálogo, Loja Integrada, pedidos, criações, impressão e Banners IA.

## Arquitetura atual

O Admin foi consolidado para evitar concorrência entre scripts e leituras redundantes.

### `app-v2.js`
Core único de navegação e operação. É o único responsável pelas rotas, dashboard, pedidos, criações, impressão e configurações gerais.

O carregamento é por rota:
- Início: canecas, pedidos de canecas, criações e fila de impressão;
- Pedidos: dados necessários de pedidos; a busca nos últimos pedidos gerais da Dona Antônia só ocorre ao abrir essa tela e fica em cache;
- Criações: canecas + criações;
- Canecas: delegada integralmente ao `catalog-manager-v5.js`;
- Banners IA: delegada integralmente ao `banner-manager-v2.js`;
- Impressão: fila de impressão;
- Configurações: somente dados próprios da área.

### `mug-store-v2.js`
Fonte única de dados de canecas para o Admin.

- não faz `GET /produtos.json` completo;
- consulta Firebase por `categoria`, no intervalo textual que começa em `Caneca`;
- uma consulta indexada atende catálogo, dashboard e Banners IA;
- cache compartilhado de 2 minutos;
- requisições simultâneas reutilizam a mesma Promise;
- gravações de produtos invalidam o cache imediatamente.

### `catalog-manager-v5.js`
Único dono da aba **Canecas**. Consolida:
- busca e filtros sem reconstruir a tabela a cada tecla;
- status Dona Antônia e Loja Integrada separados;
- cadastro comercial e fiscal;
- estoque, preço e frete;
- arte horizontal e até três mockups;
- SEO;
- conteúdo CanecaFácil;
- perguntas padrão e perguntas específicas do produto;
- cupons e perguntas globais em Configurações;
- sincronização de produto com Loja Integrada via Make;
- consulta de marca/categorias da Loja Integrada;
- exportação `.xlsx` oficial com 49 colunas.

Imagens de tabela usam `loading="lazy"` e `decoding="async"`.

### `banner-manager-v2.js`
Gerador de Banners IA. Reutiliza a mesma store de canecas e não relê `/produtos`.

Mantém os formatos Full Banner, Mini Banner, Tarja e Vitrine, integração com Make/OpenAI, prévia em canvas, downloads e histórico no Firebase.

## Loja Integrada

O Admin envia ao webhook Make as ações:
- `loja_integrada_create_product`;
- `loja_integrada_update_product`;
- `loja_integrada_catalog_refs`.

O payload contém produto, preço, estoque, SEO, alias, mockups, categoria, marca e estado de personalização. O token da Loja Integrada continua fora do navegador.

A exportação `.xlsx` de 49 colunas permanece como alternativa/contingência.

`Classificação de mercado` e `Especificações recomendadas` continuam identificadas no Admin como revisão manual quando não suportadas pela API pública utilizada.

**Caneca Fácil é marca comercial.** O fabricante físico só é salvo quando o fabricante real é conhecido.

## Pedidos e produção

- pedidos de canecas ficam em `canecas/pedidos`;
- criações ficam em `canecas/personalizadas`;
- fila de impressão fica em `canecas/print_jobs`;
- confirmar pagamento cria jobs somente quando há arte de impressão localizada;
- pedidos gerais da Dona Antônia são consultados somente dentro da área Pedidos, para compatibilidade com pedidos antigos que contenham canecas;
- o Criador de Canecas continua usando o `mug-studio` oficial do Produção;
- o Caneca Print continua sendo a interface de impressão.

## Código legado removido

Foram removidos do Admin V2 por estarem substituídos ou conflitarem entre si:
- `app.js`;
- `catalog-manager-v3.js`;
- `catalog-manager-v4.js`;
- `catalog-manager-bridge-v1.js`;
- `loja-integrada-export-v1.js`;
- `canecafacil-config-v2.js`;
- `li-admin-runtime-v1.js`;
- `mug-products-scope-v1.js`;
- `banner-manager-v1.js`.

A folha `banner-manager-v1.css` permanece apenas como CSS do gerador de banners; ela não contém lógica JavaScript.

## Regras de estabilidade

O Admin V2 não deve:
- usar `MutationObserver` global para reescrever telas;
- sobrescrever `window.fetch`;
- possuir dois renderizadores para a mesma aba;
- carregar `/produtos` inteiro;
- reintroduzir arquivos V1/V3/V4 removidos.

## Teste automático

`scripts/test-admin-canecas-v2.mjs` valida:
- módulos ativos do `index.html`;
- ausência de arquivos legados;
- ausência de `MutationObserver` e monkey-patch de `window.fetch`;
- ausência de leitura ampla de produtos;
- consulta indexada por categoria;
- cache compartilhado;
- rotas principais;
- ações da Loja Integrada;
- Banners IA usando a store compartilhada;
- exatamente 49 colunas no exportador Loja Integrada.

Workflow: `.github/workflows/test-admin-canecas-v2.yml`.

## Segurança

Tokens, Client Secrets e chaves privadas devem permanecer no Make, Firebase Functions ou outro ambiente de servidor. Nunca devem ser gravados no frontend ou no GitHub público.
