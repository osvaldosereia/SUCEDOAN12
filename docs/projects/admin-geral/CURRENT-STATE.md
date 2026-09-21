# CURRENT STATE — Admin Geral

Atualizado: 2026-09-21
Branch: `admin-geral-r1-r16-autonomous-20260919`
Fase: R15 — Automações, Copiloto, Integrações e Saúde.
Execução autônoma: autorizada.
Efeitos externos novos: proibidos sem gate/evidência específica.

## Estado das rodadas
- R1–R14: DONE
- R15: IN_PROGRESS
- R16: PENDING

## R1–R13 — concluídas
- Fundação/inventário, Design System V2, Shell/responsividade, Central de Trabalho, Produtos/Categorias/Vitrine, Estoque/Gôndolas/Validade/Balanço, Cestas, Qualidade do Catálogo, Pedidos, Customer 360, Operações/Aprendizados, Estúdio Criativo/VIDEO e integração segura do Marketing concluídos com migração aditiva e contratos reais preservados.
- Central Comercial permanece dormente por `commercialTruthUiEnabled=false`.
- Nenhum gate externo/runtime foi aberto pela migração.

## R14 — conclusão segura
- Logística real inventariada: `admin-logistics-v1` exige JWT, permite dashboard/preview e somente rascunhos internos; publicação, provider externo e runtime continuam indisponíveis/fechados.
- `logisticsUiEnabled=false` foi preservado; Driver App, GPS, notificações, provider, canary e criação automática de jobs continuam OFF.
- Central Financeira existente foi inventariada como read model; `financialAdminUiEnabled=false` foi preservado e o wiring do módulo foi corrigido no Admin sem ativá-lo.
- Financial Ledger continua append-only, server-only e com todos os gates de gravação/conciliação/projeção fiscal OFF; IA não decide recebimento e não existe provider externo liberado.
- Bling permanece atrás de `bling_order_sync_enabled=false` e demais gates próprios; nenhuma sincronização real foi executada.
- criada camada aditiva `admin-r14-operations-v2.js/css` para touch >=44 px, safe-area, responsividade, estados acessíveis e busy guard; sem fetch/storage/persistência próprios.
- criado `tests/admin-r14-operations-v2-contract.test.mjs` para proteger gates OFF, wiring condicionado, ausência de transporte/persistência paralela e requisitos mobile.
- emissão fiscal/SEFAZ, conciliação externa, sincronização Bling, rota real e mutações financeiras reais permanecem bloqueios humanos/externos e não impedem a conclusão programável da integração segura do Admin Geral.

## R15 — próximo lote
1. inventariar Automation Builder, Copiloto, integrações e superfícies de saúde antes de editar;
2. preservar `automationBuilderUiEnabled=false`, `humanCopilotEnabled=false` e demais gates dormentes;
3. integrar apenas UX/observabilidade segura sem executar automações, outbound, IA paga ou providers reais;
4. reforçar mobile/desktop, busy guards, estados e contratos;
5. registrar bloqueios humanos; quando critérios seguros forem satisfeitos, promover R16.

## Mudança paralela em main
- `main` continua divergente apenas por SEO/dados públicos de cestas (`site/produtos_admin_meta.json` e `sitemap.xml`); não incorporar automaticamente enquanto não for necessário ao escopo corrente.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing, outbound ou canary;
- não disparar geração paga/IA apenas para testar UI;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar ou alterar pedido/cliente/publicação real como teste;
- não testar PIN administrativo nem resolver identidade real sem evidência/ação humana exigida;
- não emitir documento fiscal, sincronizar Bling real, publicar rota ou alterar financeiro real apenas para homologar interface.
