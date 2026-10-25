# Auditoria completa da Dona Antônia V2 — R00

**Data:** 2026-10-25  
**Repositório:** osvaldosereia/SUCEDOAN12  
**Escopo:** projetos/dona-antonia-v2  
**Branch de auditoria:** agent/dona-antonia-r00-audit-20261025  
**Base verificada:** agent/dona-antonia-nova-plataforma, SHA 1a846beba768192c366937c1462bcfd6baeccee9  
**Estado da rodada:** concluída como auditoria e baseline; sem alteração de produto, banco ou publicação.

## Resumo executivo

O código versionado da V2 ainda é uma prévia estática: a loja usa catálogo demonstrativo/JSON, o admin guarda alterações em estado React, e a confirmação do pedido está desabilitada. Os contratos e regras puras têm cobertura unitária, mas não há adaptador Supabase no app, autenticação conectada, backend HTTP, webhook ou integração real Meta/Bling no subprojeto auditado.

A base Supabase dedicada “Dona Antônia V2” existe e está ativa. A leitura apenas de metadados e contagens encontrou 20 migrações aplicadas até R14, 33 tabelas em da_next e 805 produtos. Isso contradiz o repositório e seus documentos, que descrevem somente quatro SQL planejados e dizem que o banco V2 ainda não existe. O estado do banco não está representado como migrações versionadas no diretório V2.

Há estruturas de banco para inbox e mensagens Utility, mas o WhatsApp não está operacional: não há Edge Functions, não existem conversas nem mensagens, as duas configurações estão desabilitadas e os oito templates permanecem pendentes e inativos. Portanto, não considerar a V2 conectada ao Supabase ou à Meta e não aplicar SQL adicional até reconciliar a fonte do banco.

**Recomendação:** seguir com R01, que é independente da base. Antes de qualquer alteração de esquema, executar a reconciliação de R02. R11/R12 exigem implementação de webhook/worker, validação de permissões e aprovação de templates; R16 continua sendo um gate de piloto com autorização expressa.

## Escopo e método

Foram lidos o dossiê de continuidade, o plano diretor, persistência isolada, as demais referências, o código, testes, SQL, scripts, configurações e workflows dentro de projetos/dona-antonia-v2 na branch indicada. Foi também confirmado o PR #1363, que publicou prévias demonstrativas apenas em /site1 e /admin1, e o CI do SHA-base.

No Supabase, foi consultado somente o projeto dedicado “Dona Antônia V2”. As leituras foram metadados de tabelas, histórico de migrações, funções/Edge Functions, políticas e grants, e contagens agregadas. Nenhuma linha de cliente, pedido ou conversa foi lida. Nenhuma consulta foi emitida aos projetos legados e nenhuma escrita, migração, criação de branch Supabase ou configuração foi feita.

A lista de ferramentas disponível não expôs uma operação de inventário de secrets. Valores de chaves Meta, Supabase ou Bling não foram solicitados nem exibidos. A ausência desses valores nesta auditoria não comprova que Vault/secret stores estejam vazios.

## Inventário e arquitetura real

| Área | Arquivos e responsabilidade | Estado observado |
|---|---|---|
| Entradas e build | README.md, index.html, admin/index.html, src/main-site.tsx, src/main-admin.tsx, vite.config.ts, tsconfig.json | Duas entradas Vite estáticas, loja e admin |
| Núcleo | src/core/basket.ts, checkout.ts, extras.ts, model.ts, money.ts, orders.ts e respectivos testes | Regras puras de domínio e valores em centavos; executáveis sem serviço externo |
| Aplicação | src/application/catalog.ts, order-commands.ts, testes e testing/memory-*.ts | Contratos com revisão/idempotência e adaptadores em memória para teste; sem adaptador Supabase persistente |
| Dados | src/data/catalog.ts, demo.ts, demo-extra.ts, demo-orders.ts | JSON estático e demonstrações; fallback de desenvolvimento/prévia |
| Site | src/Storefront.tsx, src/features/*, src/ui/media/SquareImage.tsx, src/styles.css e src/styles/* | Fluxo visual de cestas, extras e checkout demonstrativo; envio de pedido desabilitado |
| Admin | src/admin/navigation.ts, routing, shell, features de home/products/product-types/baskets/extras/orders e src/admin.css | Seções modulares em React; operações não persistem e os pedidos são fictícios |
| Lógica de backend modelada | src/server/pricing/* e src/server/bling/model.ts | Cálculos e modelos puros; não existe processo servidor nem chamada à API Meta/Bling |
| SQL versionado | db/001_schema.sql a db/004_bling_product_profiles.sql | Quatro arquivos descritos como planejados; não representam a sequência aplicada no projeto Supabase ativo |
| Automação de catálogo | scripts/import-bling.mjs, scripts/check-architecture.mjs | Importador CSV local sem escrita no Bling/banco; verificador arquitetural de limites e separação |
| Testes | src/core, src/application, src/server; e2e/storefront.spec.ts e e2e/admin.spec.ts | 35 testes unitários; Playwright cobre fluxo visual básico desktop/mobile |
| Documentação | README.md e 11 documentos em docs/ (arquitetura, continuidade, plano, UX, publicação, persistência, status e auditoria Bling) | Vários trechos não refletem o projeto Supabase ativo |

A interface de loja carrega um catálogo JSON estático. A configuração de preview retorna produtos demo. Em checkout, o botão de confirmação fica desabilitado. O admin inicia com produtos, cestas, extras e pedidos demo no estado local; a própria interface indica que alterações não são salvas. A regra de preço privado existe no módulo de servidor e em testes de projeção, mas não é executada por um backend conectado.

O script de arquitetura verificou 62 módulos e restringe tamanho de componentes/CSS, dependências de servidor na vitrine e integrações diretas em componentes. A separação de camadas é uma boa base para evoluir, mas não demonstra autorização, persistência ou isolamento de dados em runtime.

## Matriz de implementação

| Capacidade | Código versionado | Supabase V2 ativo | Conclusão |
|---|---|---|---|
| Catálogo e regras de cesta/extras | Regras puras + demos | Tabelas e 805 produtos | Parcial; frontend não consulta a base |
| Administração de produtos/cestas | Estado React local | Estrutura de tabelas e revisões | Parcial; CRUD do app não persiste |
| Cotação e checkout | Cálculo de domínio; confirmação desabilitada | Função de cotação e migração R08; 0 pedidos | Não validado ponta a ponta |
| Pedidos e separação | Modelo e comandos com memória de teste | Pedidos, itens, eventos, comandos e reservas; 0 pedidos | Estrutura presente; app não conectado |
| Auth/RBAC | Sem login ou checagem no app | staff_role_assignments, has_permission, políticas RLS; 1 atribuição ADMIN ativa | Parcial; matriz negativa por perfil não testada |
| Inbox humano | Não há tela funcional conectada | conversations/messages existem; 0 registros | Não operacional |
| Utility Meta | Não há integração de envio | 8 templates, todos pendentes/inativos; 2 configurações, 0 habilitadas; 0 mensagens | Não operacional |
| WhatsApp Flows, interativos e marketing | Sem implementação | Não há modelo de Flow, opt-in ou campanha identificado no schema auditado | Ausente |
| NF-e/Bling | Modelo fiscal e importador CSV; sem OAuth | Estruturas fiscais; 0 documentos; sem Edge Function | Não operacional |
| Relatórios/entrega | Demos e navegação | Tabelas de clientes/endereços/entrega; 0 clientes | Não operacional |
| Deploy | Prévia /site1 e /admin1 em fluxo separado | Nenhuma conexão pública configurada no código | Não publicar nesta rodada |

## Estado observado no Supabase V2

- Projeto ativo e saudável na região sa-east-1; nenhuma nova despesa ou recurso foi criado nesta rodada.
- Histórico contém 20 migrações, de foundation_catalog até r14_customers_delivery_reports.
- Foram listadas 33 tabelas em da_next. Além do catálogo e pedidos, existem customers/customer_addresses, order_commands/order_events, inventory_reservations, integration_outbox, fiscal_documents e componentes de conversas/Utility.
- Contagens agregadas: products 805; orders 0; customers 0; conversations 0; conversation_messages 0; whatsapp_utility_messages 0; whatsapp_utility_templates 8; staff_role_assignments 1.
- As 33 tabelas consultadas têm RLS habilitado; FORCE ROW LEVEL SECURITY não está ligado. Políticas de leitura/escrita verificadas usam da_next.has_permission em operações administrativas. As funções SECURITY DEFINER consultadas fixam search_path em pg_catalog. Isso é evidência de configuração, não teste de autorização.
- O grant direto para authenticated que apareceu nas tabelas operacionais era principalmente SELECT. Para configurações/templates Utility, o grant consultado apareceu somente para service_role; o app não contém serviço de backend para atuar como esse papel.
- Há triggers/funções de banco que enfileiram eventos Utility. A lista de Edge Functions retornou zero; não foi encontrado consumidor de fila, endpoint de webhook ou adaptador de envio no app V2.
- As duas configurações Utility estão disabled; há um registro default, mas não habilitado. Cada um dos quatro tipos de evento consultados (OrderReceived, OrderSeparating, OrderReady, OrderDelivered) tem dois templates pendentes e inativos.
- A contagem de 805 produtos não foi reconciliada com o plano de importação de 802 SKUs. Nenhum conteúdo dos produtos foi lido.

**Implicação operacional:** as tabelas atuais são um scaffold avançado no banco dedicado, não um canal WhatsApp ativo. O histórico do banco e os arquivos de migração devem ser reconciliados antes de escrever nele ou conectar o app.

## Achados priorizados

### P0 — bloqueio imediato

**Nenhum P0 operacional foi observado na rodada.** Não há pedidos/conversas/mensagens registrados, as configurações de envio estão desligadas e nenhum deploy foi feito. P0 será usado para incidentes que exponham dados, enviem mensagens indevidas ou afetem a operação em produção.

### P1 — resolver antes de integração, migração ou piloto

1. **Drift crítico de esquema.** A branch contém quatro SQL planejados; o Supabase V2 ativo registra 20 migrações até R14 e 33 tabelas. A documentação diz que o banco não existe. R02 deve exportar/revisar o estado atual e reconstruir sua história de migrações no repositório; não reaplicar db/001–004 às cegas.
2. **App e banco não estão conectados.** O Vite não depende de supabase-js e o código não tem cliente/adaptador, API segura, autenticação ou persistência. O backend tem que ser introduzido por portas/adaptadores e operações transacionais; a UI atual não deve ser apresentada como funcionalidade concluída.
3. **WhatsApp não está conectado.** O banco possui dados de configuração e gatilhos, mas nenhuma Edge Function foi encontrada; nenhuma conversa ou mensagem existe; settings estão desabilitados e templates pendentes/inativos. R11/R12 precisam de webhook inbound, processador de envio/outbox idempotente, callbacks de status, tratamento de falhas e teste com número oficial de teste.
4. **A autorização não foi comprovada por perfil.** RLS está ligada, mas ainda faltam testes anônimos, operador de produtos, separação, atendimento e administrador, inclusive leitura de dados privados, policies de views e ações via RPC/service role. Escrever testes de permissão antes de expor as tabelas em API.
5. **Catálogo diverge do inventário planejado.** A base tem 805 produtos contra 802 no plano. R04 deve identificar as três diferenças por SKU e reconciliar antes de importação, ativação ou sincronização com Bling.
6. **Regras e documentação conflitam.** docs/ARQUITETURA.md diz que não há ajuste oculto, embora a regra aprovada exija ajuste interno; a mesma documentação define Bling como origem de estoque, enquanto o dossiê posterior deixa estoque físico e conciliação em aberto. Consolidar uma decisão comercial e fonte de verdade antes do checkout.

### P2 — melhoria de engenharia e planejamento

1. **Dependências não reproduzíveis.** O package.json usa intervalos de versão e o repositório não possui package-lock.json. A CI instala com npm install. Gerar lockfile revisado e usar instalação reproduzível em R01.
2. **Disciplina de qualidade incompleta.** Não há scripts de ESLint/Prettier nem orçamento de bundle/performance. As licenças declaradas dos 109 pacotes instalados foram identificadas: 95 MIT, 6 Apache-2.0, 6 ISC, 1 BSD-3-Clause e 1 CC-BY-4.0; nenhum pacote sem campo de licença foi encontrado. Esta leitura não substitui auditoria de avisos ou vulnerabilidades.
3. **E2E e acessibilidade ainda estreitos.** A suíte cobre 390 px e 1280 px, sem matriz de 320 px, integração DB/RLS, rede lenta, teclado completo, leitor de tela, fluxo de erro ou teste de carga. Não há Lighthouse/Web Vitals medidos.
4. **CI de branch de trabalho.** O workflow de qualidade dispara em push somente na branch agent/dona-antonia-nova-plataforma; branches agent/* novas dependem de workflow_dispatch. Não alterado em R00 por ser configuração de workflow existente.
5. **Escopo WhatsApp incompleto no roadmap.** R11/R12 cobrem inbox e Utility transacional, mas não definem claramente venda conversacional, consentimento/descadastro, segmentação, marketing, Flows e pós-venda comercial. Incluir fase de desenho depois de estabilizar inbox/Utility.

## Meta: requisitos verificados para R11/R12 e fase comercial

A documentação oficial atual da Meta estabelece que mensagens de serviço em texto livre dependem da janela de atendimento ao cliente; fora dela, é necessário usar template. Utility deve corresponder a uma ação/solicitação do usuário, não servir como atalho para marketing. Webhooks reportam mensagens recebidas e estados de entrega. Flows com endpoint trocam dados criptografados e exigem par de chaves e endpoint seguro. Esses requisitos devem estar codificados no desenho e nos testes, não só na interface.

Referências oficiais:

- [Service messages e janela de atendimento](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)
- [Templates e envio fora da janela](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)
- [Categorias de templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)
- [Webhooks de mensagens e status](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview)
- [Endpoint de WhatsApp Flows e criptografia](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint)
- [Mensagens interativas](https://developers.facebook.com/docs/whatsapp/guides/interactive-messages/)
- [RLS e segurança no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)

Antes de R12, confirmar classificação, aprovação, idioma e conta de cada template, janela de 24h, opt-in, deduplicação, status de entrega/leitura/falha, retentativas limitadas, orçamento e custo vigente por categoria/mercado. Nenhuma mensagem real foi enviada nesta rodada.

## Ajustes para as próximas rodadas

| Rodada | Ajuste e critério mínimo de aceite |
|---|---|
| R01 | Design system e lint/format conforme plano; adicionar lockfile determinístico. Manter build demo sem tocar em banco e verificar 320/390/1280 px. |
| R02 | Reconciliar os 20 registros de migração e o schema ativo com GitHub; comparar db/001–004, criar baseline versionado, diagrama e plano de rollback. Testar numa base descartável/local antes de qualquer migração cloud. Não criar recurso pago sem autorização. |
| R03 | Testes pgTAP de RLS/RBAC cobrindo anon, ADMIN, produtos, separação, atendimento e service role; confirmar grants, schema exposto e views com comportamento seguro. |
| R04 | Relatório de diferenças dos 805 registros contra os 802 esperados; dry-run, revisão humana e importação somente no ambiente V2 aprovado. |
| R05–R10 | Conectar por adaptadores seguros e preservar atomicidade, idempotência, transações de estoque e versionamento; critério é persistir/reler mudanças e reprovar concorrência/forja de preço em testes. |
| R11 | Inbox humano V2 com histórico idempotente, atribuição, estados de mensagem, anexos/áudio em metadados e políticas de acesso; webhook testado sem afetar Vitrine ou o WhatsApp em operação. |
| R12 | Consumidor de Utility separado do banco, allowlist de eventos e templates aprovados, outbox com retries limitados e reconciliação de callbacks; aceitar envio apenas em número oficial de teste e sem duplicidade. |
| R13–R16 | Fiscal, entrega, segurança, custos, homologação e piloto permanecem sujeitos aos critérios do plano diretor e autorização específica antes de qualquer operação real. |
| R17 — proposta | Planejar venda conversacional, mensagens interativas, WhatsApp Flows com endpoint cifrado, consentimento/descadastro, campanhas Marketing, segmentação e pós-venda. Separar Utility e Marketing, com orçamento e aceite Meta antes de ativar. |

### Critérios de aceite do R00

- Baseline do código identificado por SHA e separado da branch de auditoria.
- Inventário de módulos, testes, SQL e workflows registrado; demonstração separada de persistência real.
- Estado do Supabase V2 inspecionado em leitura, sem consultar dados pessoais nem escrever.
- Divergência entre branch e banco, estado de WhatsApp/Meta, risco de credenciais e prioridades documentados.
- Testes locais repetidos e CI do SHA-base confirmado.
- Próxima rodada, bloqueios de banco e limites de publicação definidos.

## Evidências de qualidade

- Arquitetura: npm run architecture:check — passou, 62 módulos verificados.
- TypeScript: npm run check — passou.
- Unitários: npm test — 9 arquivos e 35 testes passaram.
- Build: npm run build — passou; gerou entradas estáticas independentes para loja e admin.
- Playwright local: não iniciou por falta do Chromium neste ambiente; o download do navegador falhou no CDN. O GitHub Actions do SHA-base 1a846beba768192c366937c1462bcfd6baeccee9 concluiu com sucesso, incluindo Playwright desktop/mobile: [run 40057635884](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/40057635884).
- Dependências: 109 pacotes instalados com metadados de licença conhecidos; o repositório não fixa uma árvore de dependências via lockfile.

## Limites e não-ações

Não foram alterados componentes de app, migrations, secrets, Meta, Bling, projetos legados, banco, DNS, site raiz, Vitrine/Admin, /site1 ou /admin1. O PR #1363 e o workflow de prévia foram apenas consultados. Nenhuma conexão oficial de WhatsApp foi validada e nenhum credencial foi recuperada.

