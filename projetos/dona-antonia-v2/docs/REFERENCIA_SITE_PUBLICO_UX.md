# Padrão de usabilidade e visual do site público — Dona Antônia V2

## Decisão de referência (outubro de 2026)
**Principal referência de fluxo: iFood Mercado.** Cliente escolhe o produto, ajusta quantidades e revisa uma sacola acessível sem esforço.
**Principal referência visual: Shopify / temas de supermercado.** Fotos quadradas, hierarquia consistente de imagem > nome > preço > ação, cards sem excesso de elementos decorativos, mobile-first e estado selecionado óbvio.
**Validação: Baymard Institute.** Carrosséis com opções percebidas como roláveis, checkout simples, quantidades por +/− ou controle editável, acesso sem obrigar cadastro e evitar carrosséis exageradamente altos.
**Apoio:** Pão de Açúcar para catálogo e organização de produtos, sem tentar copiar uma interface antiga literalmente.

### Fontes originais consultadas
- iFood ajuda Mercado 2026: https://institucional.ifood.com.br/ajuda/delivery-de-mercado-no-ifood/
- iFood mercado e sacola: https://institucional.ifood.com.br/clientes/onde-pedir-delivery-mercado/
- Shopify produto mobile: https://www.shopify.com/blog/product-page
- Shopify diretrizes para temas: https://shopify.dev/docs/storefronts/themes/best-practices
- Shopify tema design: https://shopify.dev/docs/storefronts/themes/best-practices/design
- Shopify acessibilidade: https://shopify.dev/docs/storefronts/themes/best-practices/accessibility
- Baymard mobile 2026: https://baymard.com/research-articles/mobile-ux-ecommerce
- Baymard carrossel alto: https://baymard.com/research-articles/mobile-app-ux-trends
- Baymard checkout 2025: https://baymard.com/research-articles/current-state-of-checkout-ux
- Google LCP: https://developer.chrome.com/docs/performance/insights/lcp-discovery
- Core Web Vitals: https://developers.google.com/search/docs/appearance/core-web-vitals?hl=pt-BR

## Requisitos particulares e não negociáveis
1. Cinco tamanhos, card quadrado por tamanho, foto 1:1, nome, quantidade de itens e **A partir de R$** em destaque. Desktop 5 colunas; celular 2. Cliente pode alterar/remover tipos e quantidades.
2. Cada tipo (Arroz, Feijão, Óleo...) tem **um carrossel horizontal de SKUs independentes** (cada marca/sabor continua SKU único no Bling). Selecionar card troca a marca **sem alterar a quantidade**.
3. A quantidade é propriedade do tipo de produto, sempre na linha INFERIOR ao carrossel; não há cinco seletores concorrentes dentro de cada produto.
4. Etapa 1 termina com **total atualizado + Próximo**, ambos em barra fixa. Etapa 2 exibe extras comuns a todas as cestas, inicialmente com quantidade 0 e carrossel idêntico; termina com total acumulado + **Finalizar pedido**.
5. Etapa 3 apresenta checkout simplificado com resumo editável, identificação, telefone, entrega e pagamento na entrega. **Não exigir conta nem senha** para comprar.
6. Valor interno de cada tamanho de cesta é dado do backend/admin, **não** campo público. Só o preço total correto deve ser exibido ao cliente.
7. Produtos ativos, estoque > 0, preço > 0 e sem vencimento; servidor revalida preços e saldo em checkout. Nunca disponibilizar produtos de demonstração ao usuário real.
8. Entrega apenas Cuiabá/Várzea Grande; mínimo R$ 75 e regra de horários para compra real entram via backend (não inventar prazos na prévia). Pagamento somente na entrega conforme política comercial.
9. Não existe checkout operacional até banco/validações/pedidos completos. Nunca criar pedido ou mostrar confirmação falsa.

## Padrão visual público
- Fundo principal cinza quase branco; cartões brancos e bordas suaves.
- Marca bordô usada **apenas** em seleção, preço estratégico e ação principal, não como fundo grande de marketing em cada seção.
- Tipografia Inter/system-ui local, sem depender de fontes remotas. Títulos compactos, texto de produto legível em 2–3 linhas, preços fortes.
- Fotos de cestas/produtos sempre quadradas com object-fit:contain. Sem foto real, placeholder SVG neutro ocupa o mesmo espaço. Não inventar imagens de produtos.
- Cards de cestas em grid com uma única escolha ativa; seleção com borda, indicador textual e aria-pressed, não só cor.
- Cards de opções compactos para deixar margem de outra opção visível no celular; sem autoplay, com arraste nativo e setas acessíveis.
- Quantidade com botões aproximadamente 44px no mobile; remover explícito; resposta e preço imediatamente atualizados.
- Barra inferior com subtotal, ação principal clara, área segura do sistema iOS e altura adequada a navegação mobile.
- Campos de checkout com labels acima dos campos, tamanho ≥16px no mobile e texto curto. Estado de carregamento e erros devem ser explícitos.

## Desempenho/qualidade antes de publicar
- React + TypeScript, apresentação separada das regras; sem componentes de biblioteca visual pesada e sem trabalho de imagens desnecessário.
- Imagem principal/LCP: prioridade alta e sem lazy loading. Demais imagens: lazy/async, dimensões antecipadas, WebP/AVIF quando disponível.
- Catálogo dinâmico mais tarde: fetch cacheado por coleção/tipo, lazy por área visível, sem consulta remota a cada incremento.
- CSS público carrega só módulos da vitrine, sem CSS das telas admin.
- Para PageSpeed: alvo alto/100, **não promessa**; medir em staging em hardware/redes representativas.
- Core Web Vitals: LCP < 2,5s, INP < 200ms e CLS < 0,1 como metas.
- Testes obrigatórios: 320/390/1280px, carrossel rola, seleção preserva quantidade, preços somam, extras continuam opcionais, voltar restaura escolha, checkout não envia dados enquanto em demo.
- Não alterar site/admin Vitrine atual nem aplicar SQL real; CI na branch agent/dona-antonia-nova-plataforma.

## Entrega desta primeira rodada de redesign
Implementado no protótipo: cabeçalho operacional, aviso de prévia mais discreto, progresso de três etapas, grade comercial das cinco cestas, tipografia/cartões compactos, carrosséis com estados claros, quantidade separada, barra total fixa, fotos 1:1, SVGs de placeholders e folha CSS própria.
Não implementado nesta rodada: checkout e pedidos reais, fotos reais, importação Supabase e sincronização Bling; esses itens pertencem às próximas fases do plano diretor.

Próximas oportunidades para testar com pessoas reais: identificação da variação selecionada sem ler todos os cards, rapidez em achar tipo específico em cesta grande, controle de fotos ausentes e teste de celular básico com internet fraca.
