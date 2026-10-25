# Auditoria completa V2 — baseline R00

**Data:** 2026-10-25  
**Repositório:** osvaldosereia/SUCEDOAN12  
**Escopo:** somente projetos/dona-antonia-v2 e os dois workflows diretamente ligados à V2  
**Branch base verificada:** agent/dona-antonia-nova-plataforma  
**SHA inicial auditado:** 1a846beba768192c366937c1462bcfd6baeccee9  
**Tamanho do escopo na árvore desse SHA:** 90 arquivos V2  
**Estado:** R00 concluída como auditoria e baseline; a plataforma continua demonstrativa e sem integrações reais.

## Conclusão executiva

A V2 é um protótipo de loja e admin com regras de domínio isoladas, testes unitários e SQL planejado. A tela de pedidos é uma simulação em memória. Não há autenticação, persistência, checkout operacional, reserva de estoque, serviço WhatsApp, IA Ana, envio Meta, WhatsApp Flow, campanhas de marketing nem integração OAuth ou fiscal com Bling.

Não encontrei integração ativa com os projetos Supabase existentes, nem código de escrita, envio de mensagem ou emissão fiscal. Os quatro SQLs são arquivos de projeto; não há projeto Supabase V2 nem evidência de aplicação. Nenhuma ação foi feita em main, produção, /site1, /admin1, sistemas legados, Meta ou Bling.

A base compila e os testes de domínio passam. A CI da base auditada passou também nos nove cenários de navegador. Antes de conectar um banco, a R02 precisa reconciliar as diferenças do modelo SQL; antes de importar dados, R04 precisa corrigir e testar a projeção pública e o parser do CSV.

## Escopo e método

- Li a árvore inteira de 90 arquivos em projetos/dona-antonia-v2 no SHA indicado, incluindo páginas, componentes, regras, serviços puros, testes, SQL, scripts, CSS e documentação.
- Li a configuração dos workflows dona-antonia-v2-ci.yml e dona-antonia-v2-preview-publish.yml, além das alterações e do resultado da PR #1363.
- Comparei o código com CONTINUIDADE_WORK_RODADAS_V2.md, PLANO_DIRETOR_EVOLUCAO_2026.md, PERSISTENCIA_ISOLADA_V2.md e as referências de produto, UX, importação, testes e arquitetura.
- Fiz buscas estáticas por endpoints, credenciais, uso de Supabase, Meta, WhatsApp, Bling, persistência local e referências a Ana, Flow e marketing. A única chamada HTTP encontrada no código é a leitura de catalog.generated.json estático em src/data/catalog.ts.
- Não consultei Vitrine/Admin, bancos legados ou credenciais. Não rodei SQL em nenhum banco, não publiquei, não enviei mensagens e não li valores de segredos.
- Não encontrei package-lock.json nem CSV de 802 itens na árvore V2. O CSV original não foi importado nem alterado.

## Mapa da implementação real

| Área | O que existe nesta branch | O que não existe |
|---|---|---|
| Vitrine pública | Fluxo visual de cesta, composição, extras e checkout desabilitado; seleção e cálculo em memória; imagens placeholder 1:1 | Catálogo persistente, catálogo dinâmico completo, confirmação de pedido ou envio de dados |
| Admin | Navegação e telas demonstrativas de produtos, tipos, cestas, extras e pedidos; alterações ficam em estado React | Login, RBAC, persistência, auditoria real, ações operacionais autenticadas |
| Domínio | Regras puras para elegibilidade, quantidade, extras, checkout, estados de pedido e conferência | Regras completas de entrega, cutoff, feriados, pedido mínimo, pagamentos e cancelamentos |
| Aplicação | Contratos de catálogo e pedidos com revisão/versão, comando e idempotência; adaptadores Memory para testes | Adaptadores de banco; transações e garantias reais |
| Precificação | Funções puras server-side somam o ajuste privado sem expor seu detalhamento | Endpoint protegido ou transação real de cotação, reserva e criação de pedido |
| SQL | Quatro arquivos de planejamento para catálogo, pedidos, outbox, extras e dados Bling | Diretório/mecanismo de migração executável, aplicação em staging, validação em Postgres, projeto Supabase V2 |
| Importador Bling | Valida o cabeçalho de 59 colunas, SKUs, categoria, unidade e alguns formatos; separa JSON público e privado | OAuth, sincronização, dry-run, fixture CSV de teste, relatório de conflitos ou carga de banco |
| WhatsApp / Meta | Rótulos de módulos futuros na navegação/documentação | Inbox humana, IA Ana, Cloud API, webhook, templates, Utility, Flow e envio |
| Marketing | Entrada “Em breve” no admin e menção geral no plano | Consentimento, listas, segmentação, campanhas, supressão ou automações |
| Fiscal Bling | Modelo TypeScript e validações isoladas | OAuth, pedido/venda, NF-e, homologação e reconciliação |

O admin registra pedidos, catálogo e ajustes em estados React locais. O botão de confirmação do checkout está desabilitado. A prévia informa que nada é enviado ou armazenado. Os contratos de aplicação e os Memory stores são úteis para teste, mas não demonstram integração ou persistência.

A vitrine lê somente o arquivo estático catalog.generated.json, quando presente. Os tamanhos, tipos e grupos de extras seguem arrays DEMO_*; receber uma lista de produtos real não torna, por si só, a configuração da loja dinâmica. Na branch auditada, o arquivo público gerado não está versionado e não há endpoint.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| npm run architecture:check | Passou: 62 arquivos de código/CSS verificados; limites atuais de arquivos e CSS respeitados |
| npm run check | Passou: TypeScript estrito |
| npm test | Passou: 9 arquivos e 35 testes unitários |
| npm run build | Passou: 59 módulos transformados; duas entradas estáticas, loja e admin |
| npm run e2e local | Não executou assertions: os 9 casos pararam no lançamento porque o executável Chromium do Playwright não está instalado neste ambiente |
| CI do SHA auditado | Passou em 2026-10-24: workflow 40057635884, SHA 1a846beba768192c366937c1462bcfd6baeccee9; instalação, arquitetura, TypeScript, unitários, build e 9 cenários Chromium concluídos |
| npm audit on-line registrado na PR #1364 (24/10) | O relatório da PR registrou 4 alertas na árvore dev/importação (2 moderados e 2 críticos); `npm audit --omit=dev` registrou 0 naquele momento. É resultado histórico, sem lockfile. |
| npm audit --offline --package-lock=false (25/10) | Reportou 0 na árvore resolvida localmente; a execução usou cache e não consultou a base atual de advisories. Não invalida a auditoria on-line anterior nem comprova ausência de vulnerabilidades. |
| Revisão de advisories (25/10) | A instalação sem lock desta cópia resolveu `vitest`/`@vitest/mocker` 3.2.7, `tinypool` 1.1.1 e `csv-parse` 5.6.0; essas versões se enquadram em advisories publicados, listados abaixo. |
| Inventário de licenças | A PR anterior registrou 5 submanifestos sem campo de licença. Nesta árvore offline, 109 manifests tinham campo declarado (MIT 95, ISC 6, Apache-2.0 6, BSD-3-Clause 1, CC-BY-4.0 1). A divergência precisa ser resolvida sobre a árvore fixada; a presença do campo não constitui validação jurídica. |
| Teste de migração / Supabase / Lighthouse | Não executado: não há banco V2, migrações executáveis nem URL de homologação. | 

A comparação com a base pública de advisories em 25/10 encontrou as seguintes faixas aplicáveis à árvore sem lock desta execução: `@vitest/mocker@3.2.7` é afetado por [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) e [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8); `tinypool@1.1.1` é afetado por [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) e [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr); `csv-parse@5.6.0` está abaixo da versão corrigida 7.0.2 em [GHSA-8cw4-87c7-c6xx](https://github.com/advisories/GHSA-8cw4-87c7-c6xx). No importador atual, a condição específica desta última advisory que requer `columns: true` e `group_columns_by_name: true` não foi observada: só `columns: true` é configurado. Isso reduz a aplicabilidade desse vetor específico, mas não substitui atualização e teste adversarial do parser.

Não há `package-lock.json`; a árvore instalada offline pode diferir da resolução usada no relatório on-line da PR. A CI executa `npm install --no-audit`, então não aplica auditoria recorrente. R01 deve fixar a árvore e repetir `npm audit` on-line com evidência versionada. Essas dependências são de desenvolvimento/importação; esta análise não demonstra exploração em produção. Não há ESLint, Prettier ou verificador automatizado de acessibilidade.

O E2E local teve erro ambiental de browser ausente, não falha de assertion. A execução remota aprovada é do SHA base, não deste PR documental. A workflow da V2 não declara pull_request e está limitada a push na branch agent/dona-antonia-nova-plataforma, portanto esta branch de auditoria não receberá CI automática de PR.

## Riscos e prioridades

### P0 — bloqueadores imediatos

Nenhum encontrado nesta baseline: não há caminho de checkout real, gravação de pedido, conexão de serviço ou envio externo no código V2 auditado.

### P1 — resolver antes da rodada correspondente

1. **Modelo de persistência incompleto para checkout e concorrência.** Em db/001_schema.sql, orders não armazena método de pagamento nem janela/data de entrega; os itens não preservam todos os snapshots fiscais/comerciais requeridos; não há constraints para coerência de total/quantidades atendidas. integration_outbox não tem chave única de deduplicação, lease de processamento ou estado detalhado de entrega. Os contratos esperam revision/expectedVersion, mas as tabelas do catálogo não trazem revision. Os arquivos não formam ainda uma implantação repetível.  
   **Destino:** R02 deve redesenhar/reconciliar schema, constraints, índices, outbox e migrações; provar aplicação sequencial em banco descartável isolado antes de criar staging.

2. **Importador pode publicar itens não vendáveis no JSON público.** scripts/import-bling.mjs grava cada linha em publicProducts sem filtrar ativo, estoque positivo e preço positivo. src/data/catalog.ts também retorna o conteúdo sem filtrar. A UI evita selecionar produto inativo/sem estoque, mas o JSON estático ainda exporia os registros diretamente.  
   **Destino:** R04 deve filtrar a projeção pública, manter todos os dados administrativos restritos e provar com fixture que produtos inativos/zerados não aparecem no artefato público.

3. **Parser e formato do CSV ainda precisam de fixture real.** money() interpreta vírgula como separador decimal e remove todos os pontos; assim, uma entrada com ponto decimal seria multiplicada por 100. O formato oficial usado aqui não foi conferido porque o arquivo fonte não está no repo. unitsPerCase ainda é escrito como texto, embora a futura coluna SQL seja integer. Não há testes do importador.  
   **Destino:** R04 deve usar uma amostra oficial anonimizada ou fixture fiel, validar moeda, estoque, validade, NCM/CEST, GTIN, unidade de caixa, duplicidade e gerar relatório dry-run antes de importar.

4. **A arquitetura pública ainda depende de configuração demonstrativa.** Storefront.tsx usa DEMO_TEMPLATES, DEMO_TYPES e DEMO_EXTRA_GROUPS mesmo quando carrega produtos do arquivo estático. Admin e site não consomem CatalogRepository.  
   **Destino:** R06/R07 devem mover tamanhos, tipos e extras para a projeção persistida do catálogo e testar que o site recebe apenas campos públicos.

5. **O plano ainda não separa todas as funções de WhatsApp solicitadas.** Ele distingue corretamente Inbox humana (R11) e avisos de pedido Utility (R12), mas não abre escopos próprios para IA Ana, venda/checkout via WhatsApp Flow e marketing. São cinco frentes distintas: (a) atendimento humano; (b) IA Ana, com limites e transferência ao humano; (c) Utility transacional por evento de pedido; (d) venda interativa via Flow; e (e) campanhas de marketing com consentimento, opt-out e categoria próprios. R11 continua exclusivamente humano e R12 exclusivamente Utility.  
   **Ajuste de escopo:** detalhar Ana, Flow e marketing em planejamentos independentes, sem lhes atribuir nesta R00 rodada ou ordem ainda não aprovada.

6. **Workflow de prévia tem efeito de publicação em main.** dona-antonia-v2-preview-publish.yml é acionado por push em main quando há arquivos V2 e tem permissão contents:write; copia somente os artefatos para /site1 e /admin1 e envia um commit para main. Não altera o site raiz, mas qualquer merge de V2 pode atualizar as URLs públicas de prévia sem etapa adicional.  
   **Destino:** revisar a autorização e o gate do workflow antes de qualquer merge; não executar nesta R00. Esta rodada não alterou /site1, /admin1 ou main.

7. **CI não protege branches/PRs da rodada atual.** dona-antonia-v2-ci.yml roda em push somente na branch agent/dona-antonia-nova-plataforma, sem evento pull_request para novas branches agent/*.  
   **Destino:** R01 deve propor e testar um gatilho seguro para PRs V2 antes que rodadas novas dependam de CI remoto. A alteração do workflow raiz fica fora do diff desta rodada por manter o escopo de arquivo somente em projetos/dona-antonia-v2.

8. **Dependências não são reproduzíveis.** Não existe package-lock.json e o workflow executa npm install, com faixas semver; também desliga auditoria com --no-audit. O scan offline desta execução encontrou zero vulnerabilidades, mas isso não substitui resolução fixada em CI.  
   **Destino:** R01 deve fixar e versionar lockfile, usar instalação determinística e adicionar lint/format/acessibilidade sem baixar bibliotecas pesadas sem necessidade.

### P2 — melhorias e validações antes de homologação

- Os E2E exercitam 390 px e 1280 px; o dossiê também pede 320 px. Há breakpoint CSS em 345 px, mas precisa de teste de regressão nessa largura.
- Não há varredura WCAG automatizada, medição Lighthouse/Core Web Vitals, teste de rede lenta ou carga de 800+ itens. Nenhuma métrica de desempenho de produção foi medida.
- O catálogo tem placeholders; não há fotos reais ou pipeline de otimização validado.
- O código de admin é somente prévia. noindex não é autenticação; não conectar dados reais, custos ou pedidos a /admin1 antes de RBAC e autorização de publicação.
- A tela demonstrativa contém exemplos com SKU, GTIN e preços. Confirmar origem e validade antes de qualquer publicação pública ou uso operacional para que exemplos não sejam confundidos com o catálogo atual.

## Correções documentais feitas nesta R00

- docs/ARQUITETURA.md agora marca a autoridade de estoque/preço como decisão pendente e incorpora o ajuste privado de cesta, em vez de declarar que não existe ajuste oculto.
- docs/REFERENCIA_ADMIN_UX.md agora descreve pedidos como prévia em memória, e não como módulo ausente ou operação real.
- docs/STATUS_RODADAS_V2.md registra R00, SHA, evidências, limitações e a próxima rodada.
- Este relatório separa o que está implementado, demonstrativo, planejado e ausente.

Não foram alterados código de aplicação, SQL, workflows, configurações Supabase, produção, ou arquivos fora de projetos/dona-antonia-v2.

## Próxima rodada recomendada: R01

Consolidar design tokens/componentes e disciplina de qualidade. Antes de fechar R01, definir CI para branches PR, fixar dependências, adicionar lint e formato, ampliar acessibilidade e testar 320/390/1280 px. Não conectar Supabase, Meta ou Bling nessa rodada.

R02 permanece o primeiro gate de banco: reconciliar as regras de negócio com o schema, produzir migrações reproduzíveis e testar apenas em ambiente descartável isolado. Criar staging conectado somente após estimativa de custo e autorização apropriada.
