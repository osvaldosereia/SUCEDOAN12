Warning: truncated output (original token count: 10260)
Total output lines: 325

# DONA ANTÔNIA V2 — DOSSIÊ DE CONTINUIDADE E PLANO POR RODADAS (WORK)

**Versão do dossiê:** 2026-10-23  
**Finalidade:** transferir todas as decisões operacionais, regras de UX, estado da engenharia, riscos, pendências e plano de entrega para um novo Projeto/conversa do ChatGPT em modo Work.  
**Status atualizado (24/10/2026): R00–R12 concluídas em staging isolado.** PRs da V2 permanecem draft e sem merge/publicação. Projeto Supabase V2 isolado `hjudhofluihkxykwekir`, 18 migrations aplicadas, 802 produtos, 802 perfis privados, 0 pedidos, 0 mensagens utilitárias e 0 itens de outbox Utility; todos os produtos/perfis seguem inativos/estoque zero e as duas contas Utility permanecem desabilitadas. R12 está na branch `agent/dona-antonia-r12-meta-utility`, PR #1381 draft, head remoto `e55582f531c57169a2e708a668fe09d5a5c0e869`, derivada do head R11 `6f2e00826b1b31ba12d34f65edbd53d93ba8148c`; as migrations R12 foram aplicadas somente no V2 isolado. Testes locais da R12: 111/111 unitários, 18 migrations/30 tabelas no PostgreSQL isolado, arquitetura (122 arquivos), lint, formato, TypeScript, build e diff aprovados; CI #40101770367 passou todos os gates e confirmou o smoke browser no ambiente CI. Custo estimado aprovado: US$ 10/mês no compute padrão.
**R10 encerramento técnico:** lock/claim por operador, versão, retry idempotente, conferência de faltas, ajuste de total, outbox/eventos/auditoria e transições PRONTO/ENTREGUE estão implementados. O aceite visual de pedido real segue reservado à homologação com seed vendável, pois o staging continua com 0 pedidos.

**Repositório:** https://github.com/osvaldosereia/SUCEDOAN12  
**Branch de desenvolvimento principal da V2:** agent/dona-antonia-nova-plataforma  
**Pasta:** projetos/dona-antonia-v2/  
**Prévia privada Admin V2 (owner-only):** https://dona-antonia-v2-admin-preview.juniorsereia.chatgpt.site/admin/ (conta Auth: `juniorsereia@gmail.com`; usar a senha criada no convite do Supabase V2).
**Versões legadas de demonstração:** https://donaantonia.com.br/site1/ e https://donaantonia.com.br/admin1/
**Produção atual — NÃO ALTERAR:** https://donaantonia.com.br/ e administração legada Vitrine/Admin  
**Última CI observada antes da R02:** R01 SHA `7a02a0da66dbcec6cfd7772da75f748ecb5bd29c`; execuções 40059800868 e 40059798099 aprovadas. CI R02 #40061111459 aprovado no SHA 08ece30274c4b36e1c325fcf0e3d3fbabb41c49a: auditoria de dependências, lint, formato, arquitetura, replay PostgreSQL, TypeScript, 39 testes, build e navegador passaram.

## 0. REGRA MÁXIMA: PROTEGER A OPERAÇÃO ATUAL

1. NÃO alterar NADA da loja pública em produção, admin legado/Vitrine, pedidos reais, atendimento em uso, cron, Edge Functions, integrações ou bancos Supabase existentes sem autorização explícita, específica e posterior.
2. NÃO modificar a branch main, a raiz do site, nem publicar a V2 em /admin1 ou /site1 durante desenvolvimento comum. As URLs de teste já existem, porém a branch de desenvolvimento pode estar mais avançada do que a versão publicada. O usuário pode autorizar publicação ISOLADA apenas dessas duas pastas em etapa própria, com inspeção de diffs, CI e rollback.
3. Projetos Supabase ligados à operação atual: Vitrine/Admin qxstkwshuvplmmftrctj e Bling Hub/canônico ssbesxgaijknwsjbsbcz. São referências PROIBIDAS para migração ou escrita da V2. Projetar banco **completamente isolado**, sem alterar, criar gatilhos ou consumir recursos nos dois existentes.
4. Não utilizar Railway, Make.com legado, PapoAI, workers contínuos desnecessários nem introduzir serviços pagos sem avaliar custo e obter consentimento para despesas.
5. No GitHub: executar mudanças em branch agent/*; commits atômicos; verificar SHA antes de gravar, PRs e CI; evitar múltiplos agentes editando os mesmos arquivos simultaneamente. Se outro agente atuou, sincronizar e reconciliar antes de continuar.
6. Não apresentar protótipos, contratos TS, migrações não aplicadas ou testes unitários como integração real; separar implementado, testado, conectado, publicado e homologado.
7. Não pedir aprovação repetida para alterações já autorizadas na V2 isolada; pedir autorização somente para ações arriscadas: produção, banco legado, mudança de DNS/domínio, custos, credenciais e envio real de mensagens/NF-e.

## 1. OBJETIVO

Construir uma nova plataforma Dona Antônia com **site público e admin modular profissional**, para vender cestas básicas personalizáveis e produtos extras, gerenciar pedidos, separação/entrega, atendimento humano WhatsApp e notificações transacionais Meta, emitindo NF-e no Bling somente após a separação.

Prioridades operacionais:

- Simplicidade extrema para operadores e clientes com pouco domínio digital e celulares básicos.
- Visual e fluxos com padrões comerciais de e-commerce conhecido; performance medida, não proclamada.
- Crescimento para dezenas de seções sem arquivos gigantes, remendos, duplicação de lógica ou dependências entre telas.
- Evolução incremental, cada rodada com começo e fim claros, testes e evidências, sem paralisar a operação existente.
- Baixo custo recorrente, sem jobs que gastem processamento/rede desnecessariamente.

## 2. REGRAS COMERCIAIS E DE NEGÓCIO

- Atuação: **somente Cuiabá e Várzea Grande (MT)**.
- Pedido mínimo: **R$ 75** — validar no servidor, com mensagens claras no cliente.
- Após **12h em Cuiabá**, pedido passa para entrega no dia seguinte conforme dia útil; **domingos e feriados nacionais sem entrega/operação**. Definir regra detalhada de feriados, cutoff, janelas e dias úteis no backend antes de ativar vendas; não improvisar promessa na interface.
- Pagamento **na entrega**: PIX, dinheiro, crédito, alimentação/refeição. Sem fiado, boleto, prazo de 30 dias ou entrada.
- Jamais vender SKU inativo, estoque <= 0, preço <= 0 ou vencido. Campos de validade podem ser opcionais, mas quando existentes a restrição é obrigatória.
- Estoque é transacional no pedido real; o leitor EAN foi usado TEMPORARIAMENTE para conferência física no legado, mas não define uma arquitetura permanente da V2. Antes da conexão decidir e documentar fonte canônica e regras de conciliação com Bling e estoque físico.
- O Bling deve cuidar sobretudo do FISCAL; a gestão da compra e do processo de separação/expedição deve funcionar no nosso admin.
- Códigos dos produtos: um SKU por sabor, aroma, apresentação. Marca/sabor NÃO exigem SKU-pai ou variantes do Bling.
- Sete categorias comerciais FECHADAS da base Bling inicial: MERCEARIA BÁSICA, LIMPEZA, LAVANDERIA, HIGIÊNE (grafia mantida na planilha existente), BELEZA, UTILIDADES, PET. Tipos de cesta (ARROZ, FEIJÃO etc.) são dimensão DIFERENTE das categorias.
- Clientes conseguem escolher marca de cada tipo, reduzir quantidades até ZERO, trocar marcas sem perder quantidade e acrescentar extras opcionais.
- Cinco tamanhos iniciais EDITÁVEIS: econômica, mini, pequena, média, grande. Cada tamanho associa tipos, quantidades e ordenação.
- Cada tamanho pode possuir **VALOR INTERNO OCULTO** configurável no admin. O servidor incorpora isso ao preço público agregado da cesta, mas **nunca expõe o componente como linha ou atributo público**. O tratamento fiscal do valor precisa de validação contábil antes de emissão NF-e.
- Fotos de produtos e cestas são QUADRADAS, proporção **1:1**, com fundo neutro, sem distorção (object-fit:contain), sem imagens inventadas atribuídas a SKUs reais.

## 3. UX DO SITE PÚBLICO — REFERÊNCIAS E DECISÕES

Referência de fluxo: iFood Mercado. Referência de visual: Shopify/temas grocery. Complemento de pesquisa: Baymard e práticas Google Core Web Vitals. Não copiar marca/código/ativos proprietários.

- Mobile-first, 2 colunas de cestas no celular, 5 no desktop. Foto quadrada, tamanho, número de itens, preço inicial com "A partir de" menor que o valor, selecionar cesta.
- Depois abrir a composição progressivamente: cada TIPO DE PRODUTO é uma linha de carrossel horizontal contendo cards compactos de SKUs (foto quadrada, nome curto, valor, estado selecionado). Carrossel rola por toque e setas; não bloquear rolagem vertical. Renderizar opção principal rapidamente; carregar fotos e opções distantes sob demanda.
- A **quantidade é por tipo**, com seletor +/− **abaixo** do carrossel, preservada na troca de marca. Zero remove linha do checkout.
- Barra fixa inferior em mobile com total atualizado e botão Próximo; próxima etapa extras.
- Extras comuns a todas as cestas: mesmos cards e carrosséis por tipo; quantidade inicial zero. Botão Finalizar pedido.
- Checkout etapa 3: resumo editável, nome/telefone/endereço/pagamento na entrega. Sem cadastro ou senha obrigatórios; dados faltantes não devem impedir indevidamente pedido — definir mínimo seguro do lado servidor, permitir complementação manual via WhatsApp quando possível.
- **MUITO IMPORTANTE NO CHECKOUT:** itens que compõem a CESTA têm NOME e QUANTIDADE EDITÁVEL, **SEM preço individual**; mostrar somente valor TOTAL da cesta. EXTRAS mostram preço UNITÁRIO e subtotal individual. Todo item tem +/-; chegar a zero remove da revisão e recalcula.
- Confirmar compra exige backend real; jamais fingir envio de pedido ou exibir sucesso sem persistir.
- Otimização: preload da imagem LCP, lazy em imagens fora da área visível, dimensionamento 1:1, AVIF/WebP, bundle por etapa, chamadas cacheadas e sem consultar servidor a cada clique de +/−.
- PageSpeed mobile 100 é ASPIRAÇÃO, não garantia. Acompanhar LCP <= 2,5 s, INP <= 200 ms, CLS <= 0,1, métricas p75 reais e Lighthouse de homologação.

## 4. UX DO ADMIN — REFERÊNCIA SHOPIFY 2026

Pesquisar continuamente Shopify (produtos, pedidos, status, filtros), Nuvemshop/Nimbus (formulários e navegação) e Loja Integrada (simplicidade). Padronização comercial própria:

- Barra lateral escura compacta, superfície principal branca/cinza neutro, Inter/system-ui, campos consistentes, ações por contexto, status discretos.
- Seções atuais/planejadas:
  **Operação:** Início; Pedidos [prévia demonstrativa]; Atendimento WhatsApp [futuro].
  **Catálogo:** Produtos; Estoque [futuro]; Tipos de produto; Cestas básicas; Produtos extras.
  **Gestão:** Clientes; Relatórios; Marketing [futuros].
  **Sistema:** Integrações; Configurações [futuras].
- Busca global Ctrl/Cmd+K, URL por seção, sidebar recolhível e drawer mobile, listas com filtros/paginação e ações de estoque/ativação diretas sem abrir outra página.
- Evitar esconder operações comuns atrás de telas extras. Operador deve localizar rapidamente um pedido pelo número ou telefone e abrir conversa WhatsApp a partir do pedido; na conversa, abrir o pedido relacionado.
- Não exibir 59 campos Bling na tabela principal. Ficha de produto com áreas: Geral/imagens; Preço/estoque; Fiscal/fornecedor; auditoria, conforme permissões.
- Componentes do design system: AppShell, PageHeader, DataTable, FilterBar, Input, CurrencyInput, Button, StatusBadge, Empty/Error/LoadingState, Modal/Confirm, Drawer, Toast, SquareImage, CartQtyStepper.
- Não exibir botões falsos. Módulos futuros claramente marcados "Em breve", sem comportamentos simulados.
- Controles de toque generosos no celular; tamanhos pequenos apenas no desktop com mouse/teclado. WCAG AA.

## 5. PEDIDOS E SEPARAÇÃO — REGRAS

Exatamente **4 abas operacionais**:

1. NOVO
2. EM SEPARAÇÃO
3. PRONTO
4. ENTREGUE

As 4 abas são a experiência do operador, não o único estado interno. CANCELAMENTO, PROBLEMA DE NF-e, FALHA DE WHATSAPP, PAGAMENTO e ENTREGA têm flags/estados separados; não criar abas extras.

- Pedido recebe número ÚNICO e IMUTÁVEL; documentar gerador/ordenação e política da numeração semanal usada no sistema anterior antes da implantação.
- Cartão do pedido: número, primeiro nome/cliente, telefone clicável, total, pagamento, endereço/entrega, estado, responsável; 5 por vez inicialmente, "Ver mais", evitar travamento.
- Em separação: interface similar à cesta, marcar SEPARADO ou FALTOU por linha. Falta abate quantidade/valor corretamente e revisa total no backend.
- Múltiplos separadores: proteger contra dupla edição com versão/controle de posse e expiração; mostrar "em separação por X".
- Concluir separação SEM depender de sucesso fiscal/Meta. Informar número na embalagem, marcar separado, seguir para PRONTO.
- Não permitir dois pedidos iguais em dois cliques de checkout; usar chave de idempotência, transação de reserva/estoque, índices e deduplicação.
- Pedidos precisam snapshots imutáveis do produto/preço/fiscal relevante na compra; referências a SKUs atuais não podem alterar pedidos antigos.

## 6. WHATSAPP / META / BLING — ORDEM E GARANTIAS

WhatsApp:

- Atendimento HUMANO dentro do admin, com dois números oficiais conhecidos como finais **0975** e **1018**. O serviço anterior permanece funcionando durante construção/testes e só deve ser substituído com consentimento de corte.
- Reaproveitar contratos, webhooks e fluxo útil do Vitrine/Admin após auditoria de código e dados. Não reaproveitar PapoAI.
- Inbox: caixa compartilhada; pesquisar cliente/telefone; vincular pedido; receber/enviar mensagens e áudio; estado de conversa separado de status do pedido; permissões de operadores, mídia protegida e auditoria.
- Template oficial de confirmação do pedido, atualmente no legado: pedidorecebidosite0975 e pedidorecebidosite1018 (pt_BR); variáveis número pedido, total, entrega e pagamento. Validar templates vigentes na Meta na etapa de conexão.
- Notificações transacionais futuras dos estados do pedido através de mensagens Utility compatíveis e aprovadas pela Meta, respeitando políticas vigentes, janela de 24h e requisitos de consentimento. Não transformar marketing em utilitário. Evitar duplicatas.
- Arquitetura: eventos de domínio -> transactional outbox -> fila/worker **sob demanda ou econômico** -> Meta API -> webhooks de status -> logs + retries limitados. Nenhum envio real em mock/staging sem destinatário de teste autorizado.

Bling:

- **Uso fiscal** após separação (não tratar Bling como novo admin operacional).
- OAuth2/token somente no backend; vincular IDs do Bling aos SKUs; sincronizar NCM/CEST/origem/unidade/fornecedor; emissão de NF-e após ajuste de faltas; eventual envio do pedido de venda ao Bling se obrigatório na API.
- Falha de NF-e não bloqueia PRONTO, mas fica clara como NOTA PENDENTE/BLOQUEADA, com erro e reenvio idempotente.
- CFOP/CST/CSOSN/tributação dependem de operação, regime e UF; validar com fiscal antes de emitir, não deduzir automaticamente só do CSV.
- Controle de rate-limit, 429, backoff, refresh token, timeouts, logs e reconciliação sem duplicar documento.

## 7. CADASTRO BLING E FONTE DE DADOS

Base anterior: arquivo de 802 produtos independentes (59 colunas oficiais Bling); conferir se o arquivo está disponível no novo Projeto/Library ou no repo antes de importar. O importador CSV é script em scripts/import-bling.mjs; dados atuais do banco existente **não são idênticos ao CSV antigo**.
Conforme auditoria registrada em docs/AUDITORIA_CAMPOS_BLING_802.md:

- 802 SKUs, descrições, UN, preços, custos, NCM, origem, fornecedor, categoria na planilha.
- 776 GTIN de unidade preenchidos, 668 CEST, 652 marca; apenas 28 com GTIN da embalagem/conversão por caixa.
- Inicialmente inativos e com saldo em branco na planilha; NÃO ativar em massa sem estoque real e validação.
- ID Bling e dados fiscais de saída não estavam resolvidos pelo CSV.
- Modelo de domínio público tem campos comerciais; perfil fiscal/custo é privado no backend, com arquivo de importação original em JSON sob acesso restrito. Nunca enviar custo, fornecedor, ajuste privado ou histórico de importação ao site.
- Uma fonte explícita para estoque e preços de venda deve ser definida antes da sincronização real; Bling fiscal e admin operacional não podem disputar alterações sem regras de precedência.
- Categoria oficial x tipo de cesta x extra são três dimensões diferentes; não confundir.

## 8. ESTADO REAL DO CÓDIGO (CHECADO NESTA TRANSFERÊNCIA)

Base: React 19, TypeScript 5, Vite 7, Vitest, Playwright e GitHub Actions em projetos/dona-antonia-v2. Entradas independentes loja/admin, módulos por funcionalidade e backend futuro desacoplado.
Confirmado por leitura da branch:

- src/Storefront.tsx ainda referencia produtos demonstrativos; fluxo de três etapas está programado e teste de navegador já existiu.
- src/main-admin.tsx ainda referencia demonstração e inclui módulo de 4 abas de pedidos em mock.
- src/core/ contém regras de cestas, extras, checkout e pedidos; src/application/catalog.ts e order-commands.ts têm contratos de repositório, revisão/versão e comandos; src/server/pricing/quote.ts calcula valor interno sem devolvê-lo na resposta.
- src/admin/navigation.ts centraliza os módulos; produtos/tipos/cestas/extras/pedidos possuem componentes e estilo próprios.
- A cadeia canônica tem sete migrações e 24 tabelas; validada em PGlite e aplicada somente no novo projeto Supabase V2 `hjudhofluihkxykwekir`. Os antigos `db/001–004` eram drafts substituídos.
- src/data/catalog.ts faz fallback para demonstração em desenvolvimento/prévia; não há catálogo nem checkout real em staging.
- src/server/bling/model.ts define perfil fiscal privado, não integração OAuth.
- scripts/check-architecture.mjs impõe alguns limites; CI executa TS, testes, build e E2E.
- Rota /site1 e /admin1 já receberam publicação **de demonstração** via PR #1363; atualizações da branch após esse PR não são automaticamente equivalentes à versão online.
- Última execução aprovada que consta no histórico: workflow 40056490923. Confirmar commit SHA e workflow mais recente no início da nova conversa.
  **NÃO CONCLUÍDO:** autenticação não foi submetida com senha durante QA; o usuário deve solicitar o link de recuperação e criar sua própria senha. CRUD persistente/adapter de dados, checkout/pedidos, inbox Meta, envio automático/NF-e, Lighthouse de staging e plano de migração operacional continuam pendentes. O Supabase Auth client e as policies estão conectados apenas ao projeto V2 isolado; nada operacional.

## 9. ACHADOS DA R00 QUE BLOQUEIAM AS RODADAS SEGUINTES

1. Resolvido documentalmente nesta R00: docs/ARQUITETURA.md agora registra o preço agregado da cesta com ajuste interno calculado apenas no servidor.
2. Resolvido parcialmente: documentação agora atribui gestão operacional ao app V2 e marca estoque físico/reconciliação e precedência do preço como decisões pendentes antes da conexão. O CSV histórico não é saldo atual.
3. CSV/planilha antigo não é estado atual do Supabase nem do Bling. Não importar/ativar 802 sem validação.
4. V2 pode ter protótipos de backend em JS/TS mas nenhum endpoint persistente. **Código presente não implica funcionalidade final.**
5. R03 valida seis migrações em PGlite e as aplicou ao projeto V2 isolado. Login UI/Auth, RPC de papel e policies remotas foram conectados/verificados; convite foi aceito, e-mail confirmado e atribuição ADMIN está ativa. Auth registrou acesso e a RPC devolveu ADMIN para o subject da conta; falta login através da UI e ensaio de backup/restore.
6. Verificar se bundle inclui importação acidental de módulo de servidor e se projeções públicas nunca expõem valor interno, custo ou fiscal.
7. Estado de fotos: placeholders quadrados não significam imagens reais prontas. Definir pipeline de fotos otimizado e adequado.
8. Confirmado: 35 testes unitários e 9 E2E demonstrativos passam no CI da SHA auditada, mas faltam testes de banco, segurança/RBAC, concorrência real, acessibilidade e falha de rede.
9. Revisar se build estático via GitHub Pages comporta backend pretendido; frontend pode continuar estático, mas checkout/webhooks/fiscal exigem camada transacional protegida.
10. Mapear regras atuais do atendimento Vitrine/Admin **somente em leitura**, com foco nas APIs dos números oficiais.
11. Confirmado: /admin1 é demonstração sem autenticação. Não conectar segredos ou dados reais até existir RBAC/autorização no servidor.

## 10. ENGENHARIA PADRÃO PARA TODAS AS RODADAS

- Preferir **monólito modular** em vez de microserviços: UI por…260 tokens truncated…f, testes, prints quando úteis e o que continua pendente. Não prometer PageSpeed 100 sem medir.
- Não continuar R(n+1) com falha crítica não resolvida da R(n). Se scope exceder rodada, dividir em novas rodadas menores com entregável e teste mensurável.

## 11. ESTRATÉGIA WORK: RODADAS PEQUENAS, FECHADAS E EXECUTÁVEIS

**Cada rodada deve caber em UMA execução concentrada do modo Work**, com um conjunto pequeno de mudanças relacionadas, sem depender de aprovação intermediária para ajustes em branch isolada. Se aparecer bloqueio externo, concluir tudo que não depende dele, documentar risco e manter o próximo passo inequívoco. Não cronometrar nem prometer trabalho em segundo plano.

### R00 — Auditoria integral + baseline congelado (CONCLUÍDA EM 23/10/2026)

- Ler arquivos e estrutura reais de toda a V2, plano diretor, SQL, testes, workflows, PR #1363 e HEAD atualizado; inspecionar apenas em modo leitura a configuração de publicação e eventuais fontes legadas indispensáveis.
- Executar checagens: typecheck, testes unitários, build, Playwright, inspeção de dependências/licenças, endpoints, DOM mobile e CSS, exposição indevida de dados, lint presente/ausente.
- Gerar inventário por módulo/arquivo, mapa da arquitetura de verdade, matriz Implementado x Simulado x Ausente, riscos P0/P1/P2, inconsistências de SQL e docs, prioridades de refatoração e relação com roadmap.
- Entrega: docs/AUDITORIA_COMPLETA_V2.md e atualização controlada do plano. NÃO implantar backend e NÃO mexer em produção.
- Aceite: escopo inteiro mapeado sem conjecturas; problemas reproduzidos com referência a arquivos/testes; gate futuro definido.

### R01 — Design system e disciplina de qualidade (CONCLUÍDA EM 24/10/2026)

- Consolidar tokens de fonte, cores, campos, botões, tabela, carrinho, modal, feedback e status; eliminar conflitos CSS por módulo, sem redesenhar aleatoriamente.
- Implementar ESLint + Prettier e regras de acessibilidade apropriadas, sem introduzir dependências pesadas e sem alterar o legado.
- Testar admin e vitrine mobile 320/390/1280px, navegação, carrosséis, layout; fotografar regressões.
- Aceite atingido: nenhum overflow nas larguras 320/390/1280 em storefront e admin; Axe sem violações WCAG 2.1 AA; TS/lint/build e CI aprovados. 17 testes E2E e 39 testes unitários passaram. Dependências com alertas foram atualizadas, lockfile criado, e preview exige dispatch manual com `authorize_preview=true`. Detalhes e limites em `docs/STATUS_RODADAS_V2.md`.

### R02 — Banco V2 limpo: modelagem, migrações e contratos

- Revisar e reconciliar db/001–004 e projetar esquema transacional de pedidos/itens/snapshots/idempotência/reserva/atendimento/outbox/auditoria/fiscal; tabelas e políticas RLS específicas.
- Validar migrações numa base DESCARTÁVEL isolada / CI local, jamais nos dois Supabases legados.
- Entregar diagrama de entidades, contratos TS e testes de migração/constraints.
- Resultado R02 (24/10/2026): quatro migrações, 21 tabelas, ERD, contratos TS e teste de constraints/idempotência/rollback concluídos; detalhe em `docs/STATUS_RODADAS_V2.md`. PGlite não é Supabase e nada remoto foi aplicado.
- R03: RBAC/RLS, Auth client, tela de login e filtro de áreas por papel implementados; migrações aplicadas no projeto V2; convite ADMIN aceito, e-mail confirmado, acesso Auth registrado e papel ativo. O login pela UI ainda não foi validado. Playwright local não iniciou por ausência de Chromium; CI #40063994871 passou lint, segurança de dependências, arquitetura, DB, TS, unitários, build e 17 E2E.
- Supabase Advisors (24/10/2026): WARN intencional para RPC SECURITY DEFINER `public.get_my_staff_role()` (retorna somente papel do chamador autenticado); 4 policies com chamada `auth.*` sem initplan, 11 FKs sem índice de cobertura e 38 sobreposições permissivas entre `admin_all` e policies de função devem ser revisadas antes de popular dados. 27 índices não usados são esperados no banco vazio; não remover sem métricas representativas. INFO de Auth com limite de 10 conexões.

### R03 — Autenticação admin e permissões

- Backend V2 isolado com autenticação, contas de teste, RBAC por função (admin/produtos/separação/atendimento) e trilha de auditoria; RLS como proteção adicional.
- Bloquear toda escrita pública e separar leitura de vitrine; CSRF/CORS/validação de sessão conforme hospedagem.
- Aceite: anônimo não lê custo/valor interno/nem grava; operador sem permissão não edita cadastro ou fiscal; testes negativos comprovam.

### R04 — Importação controlada e reconciliação do catálogo Bling (CONCLUÍDA)

- O usuário autorizou a cópia gerada/histórica disponível como seed; ela não é atestada como export oficial.
- CSV validado: 802 SKUs únicos, 776 EANs preenchidos, custos com quatro decimais, 59 campos de origem. Custo exato tem campo `numeric(12,4)`.
- Carga idempotente somente em `hjudhofluihkxykwekir`: 802 produtos + 802 perfis. Original, custo, fornecedor e fiscal permanecem privados.
- Tudo inativo/estoque 0; estoque de origem em branco preservado no campo original privado. 0 vendáveis.
- Login form disponível e verificado na prévia owner-only indicada no topo. Nenhuma alteração na produção legada.

### R05 — Cadastro de produtos/estoque real no admin

- Lista com filtro/busca/paginação server-side, foto 1:1, SKU/EAN/preço/estoque/ativo, edição rápida e ações em lote seguras.
- Ficha Geral, Preços/Estoque, Fiscal/Fornecedor, Fotos, Histórico, com permissões por campo; tipos e categorias não se misturam.
- Aceite: CRUD persiste após recarregar; 800+ SKUs não travam; concorrência rejeita revisão obsoleta; produto zerado não aparece na loja.

**Execução concluída (24/10/2026):** implementados adapter/RPC para busca e paginação server-side, cadastro/edição, estoque com motivo e ledger, revisão otimista, histórico, e ficha fiscal/fornecedor ADMIN-only com custo exato sem exposição na projeção do catálogo. Migrations `20261024060000_r05_admin_products.sql` e `20261024061000_r05_private_product_profile.sql` aplicadas somente na V2 isolada; remoto confirmou 802 produtos + 802 perfis sem alteração de linhas, 9 migrations e ACL sem execução anônima. Typecheck, lint, format, architecture (89 arquivos), 80 unitários, teste PostgreSQL isolado (9 migrations/24 tabelas) e build passaram. CI #40069099198 passou incluindo browser E2E 17/17. Upload de imagem e ações em lote permanecem fora desta implementação; vitrine dinâmica pertence à R07.

### R06 — Tipos, cestas e extras persistentes

- CRUD tamanho/tipos/vínculos/ordem/quantidades/extras; carregar fotos quadradas; valor interno por tamanho privado; testar de ponta a ponta.
- Aceite: mudanças admin aparecem na prévia pública, preço agregado correto sem expor composição privada; alteração de marca preserva quantidade; edições simultâneas seguras.

**Execução concluída (24/10/2026):** branch isolada `agent/dona-antonia-r06-baskets-types-extras`, head `3cae6bf75051bf222a9f811e343f2195736b1065`, derivada do head R05 `397635d0085bac6042b4b408df185d6992755c51`. Foram criados domínio e adapter Supabase para persistência, UI administrativa para criar/renomear/ordenar/desativar tamanhos e tipos, gerenciar vínculos e quantidades, extras, foto HTTPS e ajuste de preço privado; a segunda migration adiciona projeção pública segura e revisão CAS.

**Banco isolado:** migrations aplicadas somente em `hjudhofluihkxykwekir`; remoto confirmou 11 migrações, 26 tabelas, 802 produtos, 802 perfis privados, cinco tamanhos e cinco ajustes privados preservados. `get_storefront_catalog()` foi chamado via REST com chave publishable como `anon` e retornou apenas a projeção pública (vazia porque o seed permanece inativo); o RPC administrativo recusou `anon` com 401/42501. Sem gravação de linhas de produto, perfil ou preço na verificação.

**Verificações locais:** TypeScript, lint, Prettier, arquitetura (97 arquivos), 87 testes unitários, suíte PostgreSQL isolada (11 migrações/26 tabelas, RLS/RBAC/CAS/projeção pública/privacidade/rollback) e build aprovados. Playwright local não pôde iniciar sem Chromium.

**PR/CI:** PR #1370 draft, branch `agent/dona-antonia-r06-baskets-types-extras`, implementação `2c42f6ec6b791d2e346995a8e5711d0223c86159`, checkpoint documental `d45e6a903b1240c3f225982fceedf12a400d0a6a`, base R05 `397635d0085bac6042b4b408df185d6992755c51`. CI #40090765643 passou todos os gates e 17/17 E2E (`17 passed (15.8s)`).

**Aceite:** projeção pública e integração da vitrine implementadas; total agregado inclui o ajuste privado apenas no servidor e o mapper rejeita campos privados; CAS rejeita revisões obsoletas; alteração de marca continua preservando a quantidade no domínio. O seed remoto permanece inativo/estoque zero, portanto não houve ativação comercial nem homologação de venda.

### R07 — Catálogo público dinâmico e performance de abertura

- Trocar fallback fake em staging por API pública segura e projeção server-side; cache e invalidação corretos; lazy de fotos/marcas/extras.
- Aceite: primeiro quadro rápido, fallback de erro honesto, estado loading não congela, não expõe custos, fotos reais otimizadas 1:1.

**Execução da implementação (24/10/2026):** branch isolada `agent/dona-antonia-r07-public-catalog-performance`, derivada do head documental R06 `870088d73b64b90f7fa449b280ba65e27abb7186`; PR #1371 draft, head final `677bb081831b483566a2c8aed624c7e252e811a0`. O cliente agora usa cache em memória com janela fresca/stale, deduplicação de requests e invalidação explícita; não injeta dados demo quando as variáveis publishable da V2 existem; apresenta loading, catálogo vazio, erro honesto, retry e aviso de dados stale. Componentes de status/resumo/cabeçalho foram separados para manter a arquitetura modular. O RPC público server-side de R06 continua como única fonte remota, sem custo ou campo privado no navegador; fotos mantêm dimensões 1:1 e lazy loading.

**Testes locais:** `npm test` (90/90), `npm run check`, lint, `npm run format:check`, `npm run architecture:check` (103 arquivos), `npm run build` e `npm run test:db` (11 migrações/26 tabelas, RLS/RBAC, privacidade e rollback) passaram. Playwright local foi tentado, mas não iniciou porque o executável Chromium está ausente.

**CI e aceite:** a primeira execução (#40091664923) encontrou somente o gate `prefer-const` no cache; o commit corretivo foi verificado na execução final #40091732365, que passou auditoria, lint/formato, arquitetura, migrações PostgreSQL descartáveis, TypeScript, 90 testes unitários, build e 17/17 E2E (`17 passed (18.5s)`). O checkpoint documental final `1ef0b2f4faf63382254ce90c57c5a82f9b413697` passou no CI #40092012827, também com 17/17 E2E (`17 passed (16.5s)`). O seed remoto permanece inativo/estoque zero; a rodada melhora o caminho público e seus estados de erro, mas não ativa produtos nem homologa venda. Não houve nova migration nem alteração no Supabase V2.

### R08 — Cotação, validação e checkout real em staging

- Endereço Cuiabá/VG, pedido mínimo R$75, cutoff 12h, domingos/feriados, opções de pagamento na entrega; validação de CPF/documentos apenas se realmente necessária fiscalmente.
- Cotação confiável no backend com valor interno por cesta, exclusão de zerados, preço individual só extras; anti-duplo clique, idempotência e confirmação acessível.
- Aceite: erro de rede não perde carrinho; duplicação de clique gera um pedido; total não pode ser forjado; não vender estoque insuficiente.

**Execução concluída (24/10/2026):** o checkout V2 agora possui RPC pública de cotação e criação idempotente. O servidor lê catálogo, composição, validade, estoque e ajuste interno; o browser nunca informa total nem recebe custo interno. Endereço aceita somente Cuiabá/Várzea Grande (MT), pedido mínimo é R$75, corte local é 12h, domingos e feriados cadastrados são recusados, pagamentos são somente na entrega e CPF permanece opcional. A criação grava snapshots, reserva estoque por 30 minutos e retorna recibo mínimo (`orderId`, número, total, `NOVO`, `replayed`).

**Frontend:** formulário modular e responsivo, seletor de quantidade em todos os itens, rascunho em `sessionStorage`, retry sem limpar carrinho/dados, estado de confirmação acessível e bloqueio de submissão concorrente. O modo demo continua explicitamente bloqueado; nenhuma compra é simulada.

**Banco isolado:** `20261024083000_r08_public_checkout.sql` aplicada somente em `hjudhofluihkxykwekir`. Verificação remota: 12 migrations, 802 produtos, 802 perfis privados, 0 pedidos, `anon` executa apenas as duas RPCs públicas e não lê a tabela de feriados; nenhuma linha de catálogo foi alterada.

**Verificações:** `npm run test:db`, `npm test` (97/97), `npm run check`, lint, `npm run format:check`, `npm run architecture:check` (108 arquivos), `npm run build` e `git diff --check` passaram. Playwright local não iniciou por ausência do Chromium; CI #40094688858 passou todos os gates e o smoke browser mobile/desktop no ambiente com Chromium.

**Limites:** feriados móveis precisam ser cadastrados na tabela privada antes da homologação comercial; o seed permanece inativo/estoque zero, portanto ainda não existe pedido real. Produção legada, main, sites/admin legados, atendimento, Bling/Meta operacionais e DNS permanecem intocados.

### R09 — Pedidos persistentes: quatro abas

- Lista paginada Novo/Em separação/Pronto/Entregue, busca e detalhes, número único/imutável, etiquetas básicas, status e clientes.
- Aceite: pedido confirmado em staging aparece em NOVO sem refresh manual indevido; status correto e pesquisa rápida; nenhuma quinta aba criada.

**Execução em 24/10/2026:** a branch `agent/dona-antonia-r09-orders-four-tabs` adicionou a projeção operacional autenticada `admin_list_orders` (status obrigatório, busca por número/nome/telefone, limite/offset) e `admin_get_order` (cliente, endereço, pagamento, fiscal, snapshots e itens). O painel persistente consulta o servidor ao trocar aba ou pesquisa, exibe somente NOVO/EM_SEPARACAO/PRONTO/ENTREGUE e carrega o detalhe sob demanda. O servidor retorna o total confirmado; preço unitário e ajuste privado de componentes de cesta ficam fora da projeção. Migration aplicada apenas em `hjudhofluihkxykwekir`; remoto confirma ACL anon=false/authenticated=true, 13 migrations, 802 produtos, 802 perfis e 0 pedidos.

**Verificações locais:** `npm run test:db` (13 migrations/27 tabelas, RLS/RBAC, busca, detalhe e privacidade), `npm test` (100/100), `npm run check`, lint, `format:check`, `npm run architecture:check` (112 arquivos) e `npm run build` passaram. Playwright local não iniciou por ausência do Chromium; CI #40096134747 passou todos os gates e 17/17 E2E mobile/desktop com Chromium. Não houve pedido real no staging, portanto o aceite visual de pedido recém-confirmado permanece pendente da homologação com seed vendável.

**PR/isolamento:** PR #1375 draft, sem merge. O Advisor pós-migration registra o aviso esperado de `SECURITY DEFINER` nas duas RPCs autenticadas da R09, além dos avisos anteriores de policies/FKs; não há acesso anônimo às funções. `main`, sites/admin legados, Supabases legados, atendimento, Bling/Meta, DNS, workflows de produção, deploy e publicação permaneceram intocados.

### R10 — Separação robusta e concorrência

- Claims por operador, quantidades conferidas, faltou/separado, abatimento do total, impressão, pronta para entrega e entregue.
- Retentativas, edit-lock/version, fila de erros e auditoria.
- Aceite: 2–3 operadores sem perda de atualização; falha fiscal não impede PRONTO; itens indisponíveis ajustados sem total negativo.

**Execução concluída (24/10/2026):** branch `agent/dona-antonia-r10-separation-concurrency`, PR draft será aberto contra R09 sem merge/publicação. A migration `20261024130000_r10_order_commands.sql` atualiza as leituras com `version` e cria `admin_apply_order_command` com `FOR UPDATE`, claim no START, operador responsável nas marcações, checagem de versão, fingerprint e retry idempotente. MARK aceita SEPARADO/FALTOU e recalcula o total proporcionalmente sem expor o preço interno da cesta; FINISH exige itens conferidos e ao menos uma unidade separada, mas não depende do estado fiscal; DELIVER fecha o fluxo. Cada comando grava `order_commands`, `order_events`, `integration_outbox` e `audit_log` na mesma transação. O painel persistente acrescenta ações responsivas de conferência, pronto, entregue e impressão, mantendo exatamente quatro abas.

**Evidências:** Supabase V2 remoto registrou 14 migrations; ACL da RPC de comando é `anon=false` e `authenticated=true`; 802 produtos, 802 perfis privados e 0 pedidos permanecem inalterados. `npm test` 101/101, `npm run test:db` 14/27, `npm run check`, lint, `format:check`, `architecture:check` 112 arquivos, build e `git diff --check` passaram. Playwright local continua bloqueado pela ausência de Chromium, mas o CI #40097766424 confirmou `17 passed (16.9s)` no navegador mobile/desktop. Advisors repetem avisos esperados de SECURITY DEFINER/policies/FKs/Auth, documentados para hardening posterior. Não houve custo novo, merge, deploy, publicação ou acionamento fiscal/Meta/Bling.

**Próxima:** R11 — inbox WhatsApp humano desacoplado, sem migrar o legado.

### R11 — Atendimento humano WhatsApp no admin V2 (SEM MIGRAR AINDA O LEGADO)

- Auditar serviços, tabelas e contratos do Vitrine/Admin em leitura; criar novo módulo Inbox desacoplado.
- Relacionar cliente/telefone, pedido e conversa, suportar áudio e duas contas oficiais 0975/1018; validação com contas de teste.
- Aceite: mensagens testadas sem duplicação, privacidade/permissões, nenhum desligamento da operação atual.

**Execução concluída (24/10/2026):** a branch `agent/dona-antonia-r11-whatsapp-inbox` adiciona o módulo Inbox persistente do admin V2, com filtros por conta oficial (`0975`/`1018`), status e telefone/contato, detalhe de conversa, vínculo opcional a pedido e renderização segura de metadados de áudio. A migration `20261024140000_r11_whatsapp_inbox.sql` cria as projeções `admin_list_conversations`/`admin_get_conversation` e a fila `admin_queue_conversation_message`, protegidas por `conversations.read`/`conversations.manage`, chave idempotente e lock da conversa. A fila grava mensagem `SAIDA` `NA_FILA` e outbox, mas não chama Meta/WhatsApp nem envia mensagem real.

**Evidências:** `npm test` (106/106), `npm run test:db` (15 migrations/27 tabelas, RLS/RBAC, privacidade, áudio por metadados e replay idempotente), `npm run check`, lint, `format:check`, `architecture:check` (118 arquivos), build e `git diff --check` passaram. Playwright local continua sem Chromium; o CI #40098948246 passou todos os gates e confirmou `17 passed (19.3s)` com Chromium. Supabase V2 remoto registrou a migration como `20261024133621_r11_whatsapp_inbox`, com 802 produtos, 802 perfis privados e 0 pedidos preservados; ACL anon=false/authenticated=true. Advisors mantêm os avisos esperados de `SECURITY DEFINER`, sem novo bloqueio.

**Limites:** não houve migração de conversas legadas, conexão Meta, envio externo, custo novo, merge, deploy ou publicação. A validação de contas reais e transporte permanece para R12, mediante autorização e números de teste.

### R12 — Mensagens utilitárias automáticas via Meta

- Preparar templates oficiais por conta, outbox a partir de eventos (recebido, separando, pronto, entregue), deduplicação, entrega/leitura/erro, retry limitado.
- Aceite: envio somente para número autorizado de teste, sem mensagem duplicada, log e orçamento/limite controlados; políticas Meta verificadas.

**Execução concluída (24/10/2026):** a branch `agent/dona-antonia-r12-meta-utility` e o PR draft #1381 adicionam a preparação persistente de Utility por conta (`0975`/`1018`), com oito registros de template `pt_BR` sem aprovação/ativação por padrão. Triggers de pedidos/eventos convertem `OrderCreated`/`OrderReceived`, `OrderStarted`, `OrderReady` e `OrderDelivered` em mensagens `NA_FILA` na outbox transacional; a chave inclui pedido, evento, revisão do template, recipiente e conta. O RPC autenticado lista a fila e o resultado de entrega/leitura/erro atualiza a máquina de estados com teto de três tentativas. O orçamento diário é verificado antes do enqueue e as policies das tabelas novas foram separadas por operação para evitar sobreposição permissiva introduzida pela R12.

**Banco isolado:** migrations `20261024150000_r12_meta_utility.sql`, `20261024150500_r12_meta_utility_policy_hardening.sql` e `20261024151000_r12_meta_utility_budget.sql` aplicadas exclusivamente em `hjudhofluihkxykwekir`. O remoto confirmou 18 migrations, 3 tabelas Utility, 8 templates pendentes/inativos, 0 mensagens, 0 outbox Utility, 0 contas habilitadas, `anon=false` para listagem e `authenticated=true` para os RPCs autenticados. 802 produtos e 802 perfis privados permanecem inalterados.

**Verificações:** `npm test` (111/111), `npm run test:db` (18 migrations/30 tabelas, RLS/RBAC, trigger, deduplicação, retry e orçamento), `npm run check`, lint, `npm run format:check`, `npm run architecture:check` (122 arquivos), `npm run build` e `git diff --check` passaram. Playwright local foi tentado e bloqueado pela ausência do Chromium; CI #40101770367 passou auditoria, migrações, TypeScript, 111 testes, build e navegador mobile/desktop. Advisors pós-migration não registram novas sobreposições permissivas da R12; permanecem apenas achados históricos do schema/Auth, documentados para hardening posterior.

**Limites:** não há worker, credencial Meta, chamada HTTP, callback externo ou envio real; nenhuma conta foi habilitada e nenhum número de teste foi acionado. Templates oficiais e políticas Meta só poderão ser validados numa etapa autorizada com número de teste, sem alterar o atendimento legado. Não houve custo novo, merge, deploy ou publicação.

**Próxima:** R13 — emissão fiscal via Bling pós-separação, ainda somente na V2 isolada e sem conexão operacional.

### R13 — Emissão fiscal via Bling

- OAuth renovável, dados tributários validados pelo contador, vinculação SKU/ID e criação NF-e após separação; reconciliar resultados e erros.
- Aceite: erro fiscal visível sem travar separação, retries sem documento duplicado, NCM/CFOP/CST testados em ambiente seguro.

### R14 — Clientes, conferência de entrega e gestão necessária

- Históricos/endereço, reabertura/alteração controlada, etiquetas de entrega, consultas e relatórios mínimos, sem motor de rotas/motoristas ou EAN de baixa prioridade.
- Aceite: cliente reconhecido sem obrigar cadastro excessivo, dados protegidos e operação de entrega simples.

### R15 — Segurança, performance, custos e homologação

- Lighthouse mobile (distintas redes/rodadas) e Web Vitals, carga 802+ produtos, 2–3 operadores, observabilidade, failover, backup/restore, auditoria RLS, LGPD, design acessível, Playwright completo.
- Aceite: metas de experiência verificadas e divergências documentadas; zero falhas bloqueantes em checkout, estoque e pedidos; custo estimado e aceite de operação.

### R16 — Piloto controlado e entrada em operação SOMENTE COM AUTORIZAÇÃO

- Conectar gradualmente /site1 e /admin1 a staging real, executar pedidos autorizados/testes com dados segregados, plano de rollback.
- Realizar piloto de produção sem substituir raiz, somente se seguro e aprovado; corte de domínio/inbox/fiscal em janelas planejadas.
- Aceite: checklist operacional assinado, rollback ensaiado, métricas/alertas, autorização EXPLÍCITA para trocar site principal. Nunca publicar automaticamente na raiz.

## 12. PADRÃO DE EXECUÇÃO DE CADA RODADA EM WORK

1. Ler este documento e docs vigentes; verificar branch/commit, último PR/CI e dependências da rodada.
2. Criar microplano executável com arquivos e critérios de aceite, sem dispersar para outra rodada.
3. Operar somente V2 e serviços isolados; inspecionar produção somente read-only se indispensável.
4. Implementar código/SQL de forma modular e consistente, criar testes na mesma mudança.
5. Executar typecheck + lint/arquitetura + testes unitários + integração relevante + build + Playwright (quando UX) e corrigir falhas, sem pular gates.
6. Commit atômico e PR na branch certa, sem merge/publicação no legado. Guardar versões/SHA.
7. Atualizar este dossiê e docs/STATUS_RODADAS_V2.md com executado, evidências, riscos, pendências e próxima rodada.
8. Relatar ao usuário em português: o que mudou, o que foi testado, links, se há deploy, riscos, decisões aguardando autorização e próxima ação.
9. **Não marcar Concluído só porque foi programado ou o build passou**: para integrações reais exigir staging + E2E + observabilidade.

## 13. FONTE DA VERDADE DOCUMENTAL

Hierarquia para decisões: (1) instruções explícitas mais recentes do usuário; (2) este dossiê revisado; (3) plano diretor; (4) requisitos detalhados e código/testes atuais; (5) documentos antigos apenas como histórico.

Arquivos relevantes para ler no Work:

- docs/PLANO_DIRETOR_EVOLUCAO_2026.md
- docs/PERSISTENCIA_ISOLADA_V2.md
- docs/ARQUITETURA.md (PARCIALMENTE SUPERADO)
- docs/REFERENCIA_ADMIN_UX.md (há revisão visual Shopify posterior)
- docs/REFERENCIA_SITE_PUBLICO_UX.md
- docs/AUDITORIA_CAMPOS_BLING_802.md
- supabase/migrations/ (cadeia canônica); `db/README.md` descreve a remoção dos drafts
- src/Storefront.tsx, src/main-admin.tsx, src/core/, src/application/, src/server/, src/admin/
- .github/workflows/dona-antonia-v2-ci.yml
- PR de teste #1363; CI 40056490923 como referência histórica

## 14. COMO INICIAR A NOVA CONVERSA WORK

1. Criar/abrir um **Projeto** no ChatGPT chamado "Dona Antônia V2".
2. Anexar este dossiê aos arquivos do projeto se desejar; o arquivo está no GitHub acima.
3. Abrir **uma conversa no modo Work** dentro do projeto, com acesso às integrações GitHub e Supabase. Usar somente o projeto isolado V2 `hjudhofluihkxykwekir`; projetos operacionais continuam fora do escopo.
4. Colar o comando fornecido em docs/COMANDO_NOVA_CONVERSA_WORK.md.
5. Verificar PRs #1367 e #1368 e workflows. Projeto Supabase V2 isolado já criado e migrado; custo estimado aprovado em US$ 10/mês. O usuário já concluiu o login e definiu sua senha; nunca solicitar nem registrar a senha. Não retomar anexos antigos que mandam iniciar R00. SEM alteração de produção.

## 15. REGISTRO DA RODADA R00 — 23/10/2026

Auditoria técnica registrada em docs/AUDITORIA_COMPLETA_V2.md. Baseline da branch agent/dona-antonia-nova-plataforma na SHA 1a846beba768192c366937c1462bcfd6baeccee9; CI 40057635884 aprovado na mesma SHA. Foram inspecionados 90 arquivos da V2, incluindo app, docs, SQL, scripts, testes e workflow. Checks locais architecture, TypeScript, 35 unitários e build passaram. Playwright local não iniciou sem Chromium; a suíte de 9 casos passou no CI. npm audit completo: 2 vulnerabilidades críticas e 2 moderadas em ferramentas dev/importação; as dependências runtime não tiveram vulnerabilidades reportadas. SQL permanece não executado e não verificado por replay.

R00 foi documental; R01 consolidou qualidade visual/CI; R02 implementou schema e contratos validados em PostgreSQL WASM descartável. Nenhum Supabase foi consultado ou alterado e nada foi publicado. A revisão de gates de publicação permanece obrigatória antes de qualquer merge na main.

## Registro de execução — R01 (24/10/2026)

- Branch: `agent/dona-antonia-r01-qualidade`; PR #1365 aberto contra `agent/dona-antonia-r00-auditoria`, sem merge.
- Código validado: SHA `eac44b022636de298664966b6b1bfe646e9bf163`; CI #40059667625 aprovado.
- Resultado: 0 vulnerabilidades em npm audit, 39 testes unitários e 17 E2E aprovados; Axe sem violações reportadas.
- Produção, main, previews publicadas, bancos Supabase e integrações não foram modificados ou acionados.
- Próxima após R01: R02, concluída no registro abaixo.

## Registro de execução — R02 (24/10/2026)

- Branch: `agent/dona-antonia-r02-schema`, criada a partir do head R01 `7a02a0da66dbcec6cfd7772da75f748ecb5bd29c`; PR dirigido a `agent/dona-antonia-r01-qualidade`, sem merge.
- Escopo: quatro migrações em `supabase/migrations/`; 21 tabelas em schema privado, RLS fechado; contratos e tipos TS; ERD/ADR; teste repetível em PostgreSQL WASM descartável. Os drafts SQL de `db/001–004` foram retirados.
- Verificações locais: lint, format, arquitetura, teste DB (4 migrações/21 tabelas), TS, 39 testes, build e audit sem vulnerabilidades passaram.
- Resultado: nenhuma conexão a Supabase existente, migration remota, Auth/checkout/worker real, publicação ou mudança em produção. PGlite não substitui homologação Supabase.
- PR #1366 aberto, sem merge. SHA final da branch: `0ea8f43188ea55db56c176d1c34368a2b4303c10`; CI final #40061318922 aprovado nesse head, navegador e demais gates passaram. CI #40061111459 correspondeu ao SHA de implementação anterior.
- Próxima: concluir conexão Auth somente após provisionar ambiente isolado, avaliar custo e confirmar que nenhum projeto legado será usado.

## Registro de execução — R03 (24/10/2026)

- Branch isolada: `agent/dona-antonia-r03-auth`, base R02 `0ea8f43188ea55db56c176d1c34368a2b4303c10`; PR #1367 aberto contra R02, sem merge.
- Código: seis migrações; papéis ADMIN/PRODUCTS/SEPARATION/SUPPORT; grants mínimos; policies `USING`/`WITH CHECK`; preço privado em tabelas separadas; `public.get_my_staff_role()` só retorna o papel ativo do chamador; cliente Auth, tela de login e navegação filtrada por papel.
- Projeto novo `hjudhofluihkxykwekir`, região São Paulo, status saudável. Compute padrão confirmado: estimativa de US$ 10/mês, cobrada por hora. Seis migrações aplicadas ao projeto novo.
- Verificação remota: 24 tabelas/24 RLS, 64 policies; `anon` sem `USAGE` no schema privado nem execução da RPC; `authenticated` pode consultar o próprio papel. Convite aceito e e-mail confirmado; uma atribuição ADMIN ativa registrada; `last_sign_in_at` preenchido. RPC testada com subject da conta e resposta `ADMIN`; nenhuma sessão ativa no instante da verificação.
- Gates: 50 testes unitários; PGlite seis migrações/24 tabelas com RBAC/RLS positivo e negativo, role lookup, revogação, privacidade e rollback; lint, format, arquitetura, TS, build, audit (0 vulnerabilidades) passaram. Playwright local não iniciou: Chromium ausente; CI #40063869241 passou os 17 E2E.
- Limite: o login foi concluído pelo usuário na prévia privada após corrigir o Site URL Auth de `http://localhost:3000`; `last_sign_in_at` registrou 2026-10-24 05:49:40 UTC e o papel ADMIN está ativo. A senha foi definida pelo usuário via recuperação e não foi acessada pelo agente.
- Operação: legado, `main`, bancos existentes, atendimento e integrações intocados; nenhuma publicação.
- Próximo: R04 seed foi carregado de modo inativo; o usuário concluiu a recuperação e o login. R05 — CRUD persistente de produtos/estoque. Recuperação e Auth URL apontam para a prévia privada.

## Registro de execução — R04 (24/10/2026)

- Branch local isolada: `agent/dona-antonia-r04-bling-import`; base R03 `4ecb9a0f7897611bde18470d57ba4c30febce80b`.
- Importador atualizado para dry-run padrão; agora valida o cabeçalho Bling de 59 colunas, SKU único, GTIN/check digit unitário e de embalagem, categoria, unidade, preço/custo, NCM/CEST, itens por caixa e conflitos de EAN; distingue saldo vazio/desconhecido de zero; separa JSON público e privado; grava apenas mediante `--write-to`, nunca sob `public/`, e protege o JSON privado com permissão 0600.
- Fonte disponível na Library tem sinalização `model_generated: true` e README prévio diz que foi gerada nesta conversa. Hash `80d5733eeee4135c04c461b79c44e2afb42c1916c49eafca76f20e9fcbe1d4e1`. Estrutura: 59 colunas, 802 linhas, 802 SKUs únicos, 776 GTIN válidos, 0 GTIN repetidos, 802 registros inativos e estoque desconhecido; 802 custos com 4 casas decimais vs schema de centavos; 0 vendáveis. A estrutura passou dry-run, mas não serve de base oficial para staging.
- Testes locais do pacote: `npm test` com 64 testes; importação completa em `--dry-run` sem escrita no banco ou em arquivos. Relatório indica 802 revisões de precisão do custo; nenhuma gravação remota foi feita. CI #40065336877 passou em todos os gates, incluindo navegador mobile/desktop.
- Estado da rodada: **concluída em staging V2** por autorização expressa do usuário para usar a cópia gerada; sem ativação de massa.
- Segurança/isolamento: `main`, produção, Supabases legados, atendimento e integrações operacionais intocados; sem deploy/publicação.
- Carga final: 802 produtos e 802 perfis, 802 custos exatos e 802 originais de 59 campos, 776 GTINs; todos inativos e estoque zero. Dados validados por query de contagem. Migração adicional: `20261024052349_catalog_cost_precision_four_decimals.sql`.
- A rota privada `/admin/` oferece login e recuperação; `/admin/?recovery=1` permite definir e confirmar nova senha (mínimo 8 caracteres). O Site URL e a allowlist do Auth V2 apontam para a prévia privada. O usuário confirmou que concluiu o login; `last_sign_in_at` no Auth é 2026-10-24 05:49:40 UTC, com papel ADMIN. O agente não acessou a senha.
- Próxima: R05 CRUD e estoque persistentes. Origem CSV não comprovada e saldo físico continuam decisões abertas; não ativar catálogo ou sincronizar Bling sem confirmação.

## Registro de execução — R05 (24/10/2026)

- Branch isolada: `agent/dona-antonia-r05-products-stock`, criada sobre o SHA R04 `4e3ccfba7b06dc02a5ae3287d502351cb24aa4bf`; PR/commit aguardam publicação da branch e CI.
- Código: repositório Supabase de produtos; RPC paginada/filtros; salvar produto com revisão otimista; atualização de estoque exige motivo, request UUID, ledger e auditoria; histórico de estoque; UI responsiva em módulos pequenos; ficha fiscal/fornecedor com custo textual de quatro casas, diálogo restrito ao perfil ADMIN e RPCs com checagem server-side `private.read/manage`.
- Banco local: 9 migrations, 24 tabelas e verificações RBAC/RLS, privacidade e rollback passaram em PGlite.
- Projeto remoto alvo confirmado `hjudhofluihkxykwekir` (Dona Antônia V2, ACTIVE_HEALTHY). Foram aplicadas apenas as duas migrations R05. Verificação remota: as RPCs privadas têm `search_path=pg_catalog`; `anon_can_execute=false`, `authenticated_can_execute=true` com checagens internas de usuário e permissão. Contagens preservadas: 802 produtos e 802 perfis privados.
- Testes locais finais: `npm run check`, `npm run lint`, `npm run format:check`, `npm run architecture:check` (89 arquivos), `npm test` (80/80), `npm run test:db` (9 migrations/24 tabelas) e `npm run build` passaram. Playwright local requer Chromium ausente; executar gate no CI.
- Supabase Advisors: alerta de função SECURITY DEFINER acessível ao role authenticated (esperado pelo wrapper API, mas exige auditoria de guardas), 4 políticas com initplan, 11 FKs sem índice de cobertura, 38 múltiplas policies, 25 índices sem uso e Auth limitado a 10 conexões. Nenhum hardening transversal foi incluído na rodada.
- Estado: concluída. PR #1369 permanece draft e sem merge. Sem publicação, alteração em produto, atendimento ou sistema legado.
- Próxima rodada: R06 — CRUD persistente de tamanhos, tipos, vínculo/ordenação de produtos e extras.
