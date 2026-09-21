# CURRENT STATE — Admin Geral

Atualizado: 2026-09-21
Branch: `admin-geral-r1-r16-autonomous-20260919`
Fase: R14 — Logística, Financeiro, Bling e Fiscal.
Execução autônoma: autorizada.
Efeitos externos novos: proibidos sem gate/evidência específica.

## Estado das rodadas
- R1: DONE
- R2: DONE
- R3: DONE
- R4: DONE
- R5: DONE
- R6: DONE
- R7: DONE
- R8: DONE
- R9: DONE
- R10: DONE
- R11: DONE
- R12: DONE
- R13: DONE
- R14: IN_PROGRESS
- R15–R16: PENDING

## R1–R13 — concluídas
- Fundação/inventário, Design System V2, Shell/responsividade, Central de Trabalho, Produtos/Categorias/Vitrine, Estoque/Gôndolas/Validade/Balanço, Cestas, Qualidade do Catálogo, Pedidos, Customer 360, Operações/Aprendizados, Estúdio Criativo/VIDEO e integração segura do Marketing concluídos com migração aditiva e contratos reais preservados.
- Central Comercial permanece dormente por `commercialTruthUiEnabled=false`.
- Nenhum gate externo/runtime foi aberto pela migração.

## R13 — conclusão segura
- documentação canônica do Marketing Admin / Organic Social foi lida antes da edição;
- runtime canônico continua fail-closed: `enabled=false`, `execution_mode=off`, `kill_switch=true`, `publishing_enabled=false`, `max_daily_publications=0` e gates por canal desligados;
- homologação real de credenciais/contas e primeiro canary permanecem bloqueios humanos/externos do projeto Marketing Admin, não foram fabricados nem executados;
- `admin/marketing.html` recebeu camada aditiva `admin-r13-marketing-v2.js/css`, UI-only, sem fetch/storage/persistência próprios;
- camada adiciona aviso explícito de proteção, tabs acessíveis, feedback `aria-live`, touch >=44 px, safe-area, responsividade estreita e busy guard contra duplo acionamento em ações sensíveis;
- `marketing.js`, `marketing-api.js`, autenticação e autoridades funcionais existentes permanecem intactos;
- contrato `tests/admin-r13-marketing-v2-contract.test.mjs` protege wiring, ausência de persistência paralela, linguagem fail-closed e requisitos mobile;
- nenhuma publicação, Meta, Pinterest, WhatsApp outbound, canary, geração paga ou dado real foi acionado.

## R14 — próximo lote
1. inventariar superfícies reais de Logística, Financeiro, Bling e Fiscal antes de editar;
2. preservar contratos de pedido/entrega e qualquer integração Bling real atrás dos gates existentes;
3. melhorar integração visual/usabilidade no Admin Geral sem criar estado financeiro/fiscal fictício;
4. reforçar mobile/desktop, estados, guardas e contratos sem emissão/sincronização real;
5. registrar bloqueios humanos e continuar todo trabalho independente seguro; quando critérios forem satisfeitos, promover R15.

## Mudança paralela em main
- `main` continua divergente apenas por SEO/dados públicos de cestas (`site/produtos_admin_meta.json` e `sitemap.xml`); não incorporar automaticamente enquanto não for necessário ao escopo corrente.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não disparar geração paga/IA apenas para testar UI;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar ou alterar pedido/cliente/publicação real como teste;
- não testar PIN administrativo nem resolver identidade real sem evidência/ação humana exigida;
- não emitir documento fiscal, sincronizar Bling real ou alterar financeiro real apenas para homologar interface.
