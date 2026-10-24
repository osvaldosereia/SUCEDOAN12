# Auditoria técnica integral — Dona Antônia V2

**Rodada:** R00 — auditoria e baseline  
**Data:** 23 de outubro de 2026 (horário de Cuiabá)  
**Repositório:** osvaldosereia/SUCEDOAN12  
**Pasta auditada:** projetos/dona-antonia-v2/  
**Branch-base auditada:** agent/dona-antonia-nova-plataforma  
**SHA de referência:** 1a846beba768192c366937c1462bcfd6baeccee9  
**Resultado:** documentação e baseline concluídos; nenhum código de aplicação, SQL ou workflow alterado nesta rodada.

## 1. Limites e método

A auditoria examinou recursivamente os 90 arquivos da V2 na SHA de referência (aproximadamente 4.663 linhas), incluindo documentação, entradas da loja/admin, módulos de domínio, aplicação, servidor planejado, dados demonstrativos, interface, estilos, scripts, quatro arquivos SQL, testes, configuração de build e workflows. Também foram conferidos o PR #1363, a referência do branch e a execução CI mais recente. A pasta operacional fora da V2, a branch main e os projetos Supabase existentes não foram modificados nem consultados.

A revisão combinou leitura de código e documentos, inspeção das configurações do GitHub, execução local das verificações disponíveis na cópia esparsa e verificação do resultado do CI remoto na mesma SHA. Não havia PostgreSQL/psql nem Docker disponível para aplicar as migrações localmente. Nenhuma migração foi executada em qualquer banco.

## 2. Conclusão executiva

A V2 é um protótipo estático bem segmentado em domínio e componentes, com testes reais de regras puras e fluxos demonstrativos de interface. **Ainda não é uma plataforma operacional de e-commerce.** Não existe backend executável, persistência, autenticação, autorização, checkout confirmável, reserva de estoque ou conexão com Supabase, WhatsApp, Meta ou Bling.

Não há risco operacional identificado para a loja/admin atuais causado pelo código da V2: as interfaces e SQL examinados estão isolados na pasta própria e o CI da branch não publica. Não encontrei problema P0 para a operação atual. Há bloqueadores P1 que impedem importar dados reais ou iniciar uma homologação conectada sem preparação, detalhados abaixo.

O relatório alinha a documentação antiga às decisões posteriores aprovadas: o Bling fica principalmente na função fiscal; a fonte operacional de estoque ainda precisa ser decidida antes da integração; e a cesta pode incluir ajuste interno calculado no servidor, sem revelar seu detalhamento ao cliente.

## 3. Inventário e arquitetura real

| Área | Arquivos / responsabilidades | Estado real |
|---|---|---|
| Entradas | index.html, admin/index.html, src/main-site.tsx, src/main-admin.tsx, vite.config.ts | Duas entradas React/Vite em build estático. |
| Loja | src/Storefront.tsx, features de cesta/checkout/vitrine, src/data | Fluxo visual em três etapas com catálogo demonstrativo/fallback controlado; sem gravação de pedido. |
| Admin | src/admin/**, src/main-admin.tsx, estilos admin | Seções de produtos, tipos, cestas, extras e pedidos usando estado em memória. Não há sessão/login; pedidos são fictícios. |
| Domínio | src/core/** | Regras puras para moeda, cesta, extras, checkout e transição/conferência de pedidos. |
| Aplicação | src/application/** | Portas/contratos de catálogo e comandos de pedido, revisão/versionamento e stores em memória para testes. Sem adaptador persistente. |
| “Servidor” | src/server/pricing/**, src/server/bling/model.ts | Cálculos e modelos TypeScript puros. Não há processo HTTP, Edge Function, worker ou cliente Bling. Importar código em src/server não cria um servidor. |
| Banco planejado | db/001–004 | DDL não aplicado. Não existe projeto Supabase V2 configurado. |
| Importação | scripts/import-bling.mjs | Conversor/validador local de CSV; não chama API Bling nem banco. O CSV-base de 802 itens não está versionado nesta pasta. |
| Testes | 9 arquivos de teste unitário; 2 specs Playwright | Unitários testam domínio/contratos em memória. E2E cobre apenas demonstração da loja/admin. |
| Qualidade | package.json, tsconfig, scripts/check-architecture.mjs, workflows | TypeScript estrito e checagem de arquitetura; não há ESLint, Prettier, lockfile ou scanner de licenças. |

O fluxo de dependências observado segue parcialmente o desenho pretendido: UI → domínio, dados de demonstração e contratos. A separação ainda não está completa: os componentes centrais da loja/admin continuam agregando estado e composição dos módulos; os adaptadores futuros de catálogo/pedidos ainda não existem. O build transforma 59 módulos JS. Um chunk assíncrono de dados demonstrativos extra mediu 227,22 kB (71,18 kB gzip) no build local; não há medição Lighthouse nem fotos reais otimizadas para atestar experiência com catálogo real.

A checagem scripts/check-architecture.mjs examinou 62 arquivos TS/CSS e passou. Ela aplica limites de tamanho e padrões simples de importação, mas não substitui ESLint, auditoria completa do grafo de bundles, teste de SQL/RLS ou revisão de segurança automatizada.

## 4. Matriz: implementado, simulado e ausente

| Capacidade | Implementado e testado | Demonstrativo / parcial | Ausente |
|---|---|---|---|
| Vitrine | Seleção e cálculo de cesta/extras, quantidades, valores em centavos, validações do domínio | Dados de demonstração, imagens substitutas e formulário visual | Catálogo vindo de serviço, cadastro/checkout confirmado, pedido gravado |
| Administração | Componentes por seção, pesquisa/filtros em memória, quatro estados operacionais visíveis | Produtos/cestas/tipos/extras e pedidos fictícios alteráveis durante a sessão | Login/RBAC, CRUD persistente, paginação server-side, auditoria operacional |
| Pedidos | Estados NOVO, EM_SEPARACAO, PRONTO e ENTREGUE; versão e comando idempotente em interfaces de aplicação e stores de teste | Lista e atualização somente em React/estado local | Persistência, número real, autorização de operador, locks/reserva transacional |
| Preço privado | Funções puras de cotação validam centavos/estoque e omitem o ajuste privado na resposta; testes unitários cobrem o contrato | Admin inicializa ajustes em memória; não é fonte confiável do checkout | Endpoint autenticado e integração da cotação à confirmação de pedido |
| Importação Bling | Validador e transformação local do CSV | Dependência de arquivo de origem externo não incluso | OAuth, API, reconciliação, importação real e validação fiscal com responsável competente |
| Banco | Quatro DDLs planejados, RLS habilitada nas tabelas declaradas | Comentários dizem “privado” e “não executar” | Teste de migração limpa, políticas autorizadas, transações, RLS/RBAC, backup/rollback |
| Integrações | Tipos/modelos isolados para preparar perfil fiscal | Nenhuma chamada ativa identificada | Supabase, Meta/WhatsApp e Bling conectados |
| Hospedagem | CI de qualidade isolado da branch V2; build tem entradas / e /admin | PR #1363 fundou prévias demonstrativas em /site1 e /admin1 | Backend transacional; publicação da branch atual não é automática por CI |

**Interpretação de segurança:** testes de memória e funções de preço provam regras locais específicas; não provam preço ou estoque confiável em produção. RLS habilitada sem política impede acesso autorizado até a política ser implementada, mas não fornece, sozinha, autenticação/RBAC da aplicação ou transação de checkout.

## 5. Baseline reproduzida

| Verificação | Resultado na auditoria |
|---|---|
| npm run architecture:check | Passou: 62 arquivos TS/CSS verificados. |
| npm run check | Passou: TypeScript estrito sem erros. |
| npm test | Passou: 9 arquivos, 35 testes unitários. |
| npm run build | Passou: 2 entradas estáticas, assets e chunks gerados. |
| Playwright local | Não iniciou: Chromium não estava instalado. O download local do navegador foi inválido no ambiente. |
| Playwright no GitHub Actions | Passou na SHA exata 1a846beba768192c366937c1462bcfd6baeccee9, run 40057635884; workflow completou arquitetura, TypeScript, unitários, build e Chromium/E2E. São 9 casos E2E listados em 2 arquivos. |
| npm audit completo | 4 vulnerabilidades em dependências da árvore de desenvolvimento/importação: 2 moderadas e 2 críticas. O relatório identificou Vitest e dependências transitivas, Tinypool e csv-parse. |
| npm audit --omit=dev | 0 vulnerabilidades conhecidas nas dependências de runtime no momento da consulta. |
| SQL / migrações | Inspeção estática somente. Sem PostgreSQL/psql/Docker para replay; não afirmar que aplicam corretamente em sequência. |
| Licenças / lock | A lista tem versões com intervalos semânticos, não há package-lock.json no branch e não há etapa CI de allowlist/SBOM/licenças. Na árvore instalada, 5 manifests de subpacote não declaravam licença; validar os pacotes pais na etapa de governança. |

O workflow de CI usa npm install --ignore-scripts, mas não contém etapa npm audit; por isso passou mesmo com as vulnerabilidades atuais da árvore de ferramentas. A instalação local resolveu as faixas declaradas para versões disponíveis no momento, sem gravar lockfile no branch.

## 6. Achados e riscos priorizados

### P0 — incidente atual de produção

Nenhum achado P0 foi identificado na V2. Nenhuma alteração foi feita em main, na raiz do site, no admin legado ou nos Supabases existentes.

### P1 — bloquear integração/conexão até resolução

1. **Não vender nem importar dados reais ainda.** Não existem endpoints, Auth/RBAC, persistência ou transações. A interface do checkout não cria pedido e o admin não salva após encerrar a sessão.
2. **Reconciliar o schema antes de R02 aplicar qualquer SQL.** db/001 concentra custo e campos NCM/CEST no catálogo products e db/004 repete parte deles em bling_product_profiles. A política de acesso futura a products não poderá expor colunas privadas por engano. O cabeçalho de pedido não registra claramente o tamanho/composição e o ajuste interno da cesta; order_lines não tem campos explícitos para tipo/tamanho da cesta ou snapshots fiscais. Faltam modelos explícitos de movimento/reserva de estoque, unicidade de linha, idempotência de evento/outbox e relação entre total/subtotal/entrega; verificar e modelar também pagamento, entrega, cancelamento e reconciliação. Estes são gaps de projeto, não falha de SQL executado.
3. **Resolver a fonte canônica de estoque e precedência de preço operacional.** A regra posterior coloca estoque operacional no app e Bling sobretudo no fiscal, mas a origem inicial e reconciliação com estoque físico permanecem pendentes. O CSV histórico de 802 itens não contém saldo real e não é estado atual do Supabase/Bling.
4. **Atualizar dependências de desenvolvimento vulneráveis e tornar instalações reprodutíveis.** npm audit encontrou 2 críticas e 2 moderadas na árvore dev/importação; corrigir versões semver com atualização principal compatível, lockfile revisado e CI que execute auditoria antes de R02/R03. A imagem construída não demonstrou exposição dessas dependências na vitrine, mas CI e importador usam os pacotes.
5. **Gate de publicação precisa refletir a autorização.** O workflow dona-antonia-v2-preview-publish.yml dispara em push na branch main quando arquivos V2 mudam e tem permissão contents: write para atualizar /site1 e /admin1. O escopo observado não copia para a raiz, porém merge em main publica automaticamente as prévias sem um gate próprio de autorização. Nenhuma publicação foi iniciada nesta R00. Confirmar proteção/aprovação manual antes de qualquer merge/publicação; nunca usar esse workflow para uma etapa não aprovada.
6. **Sem teste de replay de migração.** A sequência db/001–004, constraints, relação entre esquema privado e Data API, grants/policies, reversibilidade e idempotência não foi verificada contra PostgreSQL limpo. R02 deve validar numa base descartável/local antes de pedir qualquer ambiente remoto.
7. **E2E local não reprodutível nesta máquina.** CI exato passou; ambiente local não tinha navegador e CDN retornou pacote inválido. Manter a evidência do CI e corrigir a disponibilização/instalação de Chromium na estratégia de desenvolvimento.

### P2 — qualidade e homologação

- Sem ESLint, formatador, auditoria de acessibilidade automatizada, teste de contraste/teclado sistemático, falha de rede e regressão visual estruturada.
- Unitários não cobrem contratos HTTP, banco, concorrência real, migrations, permissão negada ou idempotência sob transação.
- Casos Playwright validam somente dados e comportamentos fictícios; não são E2E de pedido real.
- Fotos 1:1 são placeholders e nenhuma evidência mede LCP/INP/CLS ou peso com o catálogo real. Medir antes de prometer performance.
- O carregamento inicial de demonstração inclui chunk de dados extras de 227,22 kB; medir e dividir dados antes de um catálogo de 800+ SKUs.
- A documentação “Como executar” refere-se ao importador e CSV externo, mas a origem não está na V2; tornar explícita a origem validada e a política de credenciais/arquivo antes de importar.
- A validação do JSON aceita preço zero e disponibilidade zero/inativa na fronteira de leitura; o domínio filtra seleção vendável em outra camada. Reforçar projeção e invariantes no backend público, sem depender de filtros de interface.

## 7. Contradições documentais resolvidas nesta R00

- docs/ARQUITETURA.md afirmava que não havia ajuste oculto; alinhado à regra posterior: o cliente vê preço agregado da cesta; o servidor pode somar ajuste interno e não revela o detalhamento.
- A mesma arquitetura indicava Bling como canônico do estoque; agora registra o estoque operacional como responsabilidade do app V2 e marca origem/reconciliação como decisão ainda pendente antes de conexão.
- O dossiê e o plano são coerentes quanto a nenhuma execução SQL, nenhuma conexão Supabase e nenhuma ativação do CSV de 802 produtos nesta rodada.
- O estado R00 foi registrado em docs/STATUS_RODADAS_V2.md e no dossiê. Roadmap preservado; R01 é a próxima rodada.

## 8. Plano de saída para as próximas rodadas

### R01 — Design system e disciplina de qualidade

1. Resolver auditoria crítica das dependências: atualizar Vitest/Tinypool e csv-parse em versões seguras, comprovar compatibilidade com Node 22, registrar lockfile e executar npm audit completo.
2. Adicionar lint/format e gate repetível de licença/dependências, sem introduzir integração ou dependência operacional.
3. Validar interface mobile em 320, 390 e 1280 px, foco/teclado/WCAG, carrosséis, overflow e CSS por módulo.
4. Verificar como o workflow de preview só roda na etapa especificamente autorizada, sem modificar domínio raiz ou fluxo legado.
5. Fechar R01 com arquitetura, typecheck, unitários, build e Playwright de navegador instalável.

### R02 — Banco V2 limpo

Antes de criar/configurar um Supabase de homologação, finalizar ERD e contratos; separar perfil fiscal/custo; projetar snapshots de cesta e itens, movimento/reserva concorrente, idempotência/outbox, totais invariantes, estados auxiliares, índices e policies/grants. Testar sequência e rollback numa base descartável. Qualquer criação de projeto remoto e possível custo deve aguardar conferência de plano/custo.

### Bloqueios duradouros antes do piloto

Auth/RBAC e RLS; autoridade do estoque e preço; catálogo real validado; persistência; cotação/checkout transacional; pedidos persistentes; atendimento/Meta; Bling fiscal e validação contábil; testes de falhas, concorrência, backup/restore, custo e rollback; autorização própria para publicação/piloto. Nenhum destes itens é declarado concluído nesta auditoria.

## 9. Evidências e decisões

- Branch-base auditada: agent/dona-antonia-nova-plataforma, SHA 1a846beba768192c366937c1462bcfd6baeccee9.
- CI: https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/40057635884 — sucesso na SHA auditada.
- PR de origem da prévia: https://github.com/osvaldosereia/SUCEDOAN12/pull/1363 — merge anterior para main; escopo descreve somente /site1 e /admin1 demonstrativos.
- R00 não criou banco, não chamou serviços reais, não acionou workflow de publicação e não alterou código-fonte.
- Próxima rodada recomendada: R01, começando pelas dependências críticas e reprodutibilidade.

