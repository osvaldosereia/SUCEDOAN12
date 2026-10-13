# Dona Antônia — Performance mobile — Rodada 1 (2026-10-13)

## Diagnóstico verificado
- Página pública duplicada em `index.html` e `vitrine/index.html`: o hotfix anterior alterara apenas a cópia em `vitrine/`.
- Supabase canônico `ssbesxgaijknwsjbsbcz`, função `storefront-v2`: logs com respostas HTTP 500 em `home` e `home_priority` e cancelamento PostgreSQL `57014 / statement timeout`.
- Amostra de logs da última janela consultada: 37 chamadas bem-sucedidas e 2 falhas HTTP 500 nas ações `home*`. Trata-se de eventos HTTP, não medição de experiência real de usuários.
- Banco: 5 templates de cestas ativos, todos vinculados a moldes `transition_mode=mold_only`, mais 4 moldes inativos do tipo só alimentos. O endpoint ainda consultava a view pesada de lotes mesmo sem necessidade para essas cestas.
- As fontes de `storefront-v2` no GitHub e na produção divergiam no ranking das ofertas por vencimento: a revisão parte da **fonte implantada v64**, preservando o comportamento de ofertas ativo.

## Código da rodada
1. Sincroniza as duas páginas públicas, inclusive o hotfix de consultas independentes e cache local.
2. Compacta hero, atalhos e espaços verticais somente até 759px de largura. Adiciona texto acessível ao esqueleto de carregamento.
3. Coloca marcadores locais de desempenho (`da-home-shell`, `da-home-first-cestas`, `da-home-full-catalog`) sem transmitir dados pessoais.
4. `storefront-v2`: detecta quando **todos** os templates ativos são `mold_only`; nesse caso evita ler `basket_commercial_catalog_v1`, preservando automaticamente o caminho de lotes antigos se algum template voltar a ser legado.
5. Constrói o catálogo de moldes e a detecção de legado em paralelo; amplia a cache quente de 30 para 120 segundos.
6. Em falha transitória de reconstrução mantém a última resposta boa do mesmo processo por no máximo 15 minutos além da validade, com `catalog_stale:true`. Preço e estoque são confirmados nos endpoints de cesta e pedido, que permanecem intocados.
7. Preserva no servidor as regras implantadas de ofertas automáticas por validade.

## Testes e publicação
- Verificar sintaxe do script inline, identidade entre as páginas, presença do caminho legado e contrato de performance via `scripts/test-home-performance-contract.mjs` e `scripts/test-storefront-mobile-r1.mjs`.
- Deploy de `storefront-v2` somente com `verify_jwt=false` como a versão pública atual, preservando sua autenticação própria; não modificar nenhuma outra Edge Function.
- Conferir versão/código publicados e logs de `home` / `home_priority` após implantação.
- Validar visualmente num Android 390×844, rede móvel simulada e navegador interno do WhatsApp (teste real ainda necessário quando ferramentas de navegador estiverem disponíveis).

## Rollback
- Frontend: reverter o PR/commit.
- Backend: restaurar a fonte de `storefront-v2` v64, gravada pela versão anterior ao deploy; não fazer alterações de estrutura no banco nesta rodada.

## Rodadas seguintes
- R2: snapshot materializado/persistente do catálogo, com invalidação e atualização fora do caminho crítico da visita.
- R3: renderização incremental (evitar refazer DOM e fotos), carregamento seletivo de dados.
- R4: otimização de imagens, medidas reais de Core Web Vitals no mobile.
- R5: testes completos de carrinho, lotes, estoque, preço e checkout.
- R6: monitoramento de falhas, teste 4G/WhatsApp, publicação gradual e regressão.
