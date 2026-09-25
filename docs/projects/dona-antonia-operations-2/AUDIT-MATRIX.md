# Dona Antônia Operations 2.0 — Auditoria / Matriz de Destino

Última atualização: 2026-09-25
Status: Fase 1 em andamento. Nenhuma remoção de produção autorizada por esta matriz.

| Domínio | Estado atual observado | Destino proposto | Ação |
|---|---|---|---|
| Site público | Código canônico no SUCEDOAN12; storefront consolidando em `storefront-v2` | ADMIN/SITE | Manter |
| Vitrine/Admin | `vitrine/admin/index.html` monolítico (~292 KB), chama Supabase canônico e ainda contém referência ao projeto legado | ADMIN | Modularizar e eliminar dependência real do legado após prova |
| Autenticação admin | `admin-pin-auth-v1` | ADMIN | Manter/consolidar |
| Produtos | `products` no Supabase + vínculo Bling + várias rotinas históricas | BLING + ADMIN mínimo | Bling como ERP; Admin mantém atributos exclusivos da vitrine/operação |
| Estoque | Supabase possui estoque/reservas e integração Bling | BLING + ponte mínima | Definir Bling como saldo operacional oficial; manter reservas do checkout se necessárias |
| Cestas | `basket_templates` / itens e regras próprias | ADMIN | Manter fora do ERP como regra comercial Dona Antônia |
| Validade/ofertas | Regras próprias no Admin/Supabase | ADMIN | Manter; sincronizar efeitos necessários |
| Gôndola/prateleira | `vitrine_gondolas` + atributos operacionais | ADMIN + BLING quando útil | Manter para picking e sincronizar localização quando aplicável |
| Clientes | `customers`, telefones, endereços + reconciliação Bling | BLING + ADMIN mínimo | CPF como identidade empresarial definida; consolidar sincronização |
| Pedidos do site | `orders/order_items`; Admin possui ações de Bling/fiscal/estoque | BLING como ERP + ADMIN operacional | Simplificar envio idempotente site -> Bling |
| Separação | Ainda não é uma estação operacional dedicada | ADMIN operacional | Criar fila Montar, atribuição e folha por gôndola/prateleira |
| Impressão ao entrar pedido | Não há fluxo final dedicado identificado | INTEGRAÇÃO MÍNIMA | Agente/ponte local; impressão automática da ordem de separação |
| Conferência | Há ações de pedido/estoque; avaliar Checkout/Picking/Packing Bling | BLING + ADMIN simples | Usar código de barras e impedir conclusão divergente |
| Fiscal de saída | Estrutura fiscal extensa + ações canário/controle + Bling | BLING | Migrar para fluxo nativo sempre que possível; código próprio só como gate/ponte |
| DANFE/etiqueta | Admin possui ação `order_fiscal_document_pdf` | BLING | Preferir documentos/impressão nativos |
| Expedição | Parte do fluxo está espalhada no Admin/fiscal | ADMIN simples + BLING | Tela Expedir; Bling executa ERP/documentos |
| Entrega/rotas | Necessidade própria Dona Antônia | ADMIN | Folha/app do entregador e roteirização; não duplicar ERP |
| Compras | Projeto XML recém-criado; Bling suporta domínio de compras | BLING | Pedido de compra e fornecedor no Bling |
| XML CNPJ | `purchase-xml-v1` + tabelas de staging/configuração; daily_enabled=true | BLING primeiro | Usar recepção nativa Bling quando suficiente; ponte só para regras especiais |
| XML CPF | Regra não padrão do ERP | ADMIN/INTEGRAÇÃO | Importar produto/fornecedor/custo/estoque conforme regra, nunca financeiro empresarial |
| Caixa -> unidade | `purchase-xml-v1` já contém lógica inicial de unidade/embalagem | ADMIN determinístico | Preservar e fortalecer fator explícito, revisão quando ambíguo |
| Fornecedor/embalagem | `product_supplier_packaging` criada, ainda sem histórico operacional consolidado | BLING + staging ADMIN | Bling como fornecedor oficial; staging para conversão/validação |
| Contas a pagar | XML CNPJ atualmente configurado com `auto_create_payables=true` | BLING | Bling como fonte oficial; CPF bloqueado |
| Contas a receber | Admin contém `bling_finance_overview/action` | BLING | Usar financeiro nativo e ChatGPT para gestão |
| Gestão financeira | Ações próprias no Admin | CHATGPT + BLING | ChatGPT consulta/analisa; Bling registra |
| ChatGPT gestor | Ainda não é camada operacional formal | CHATGPT | Criar rotinas e alertas após conexão/permissões homologadas |
| Bling Hub v2 | Tabelas/jobs/auditoria ainda existem; runtime documentado como desativado | CANDIDATO A REMOVER | Não apagar até substituição e prova de ausência de dependência |
| Fiscal AI autônomo | Worker documentado como desativado | CANDIDATO A REMOVER/ON-DEMAND | Manter apenas se houver necessidade fiscal não atendida pelo Bling |
| Legado qxst... | Arquitetura o classifica como legado temporário; Admin ainda contém referência textual/preconnect | REMOVER APÓS GATE | Confirmar zero chamadas reais e retirar referência |
| Funções antigas | Inventário registra grande quantidade de Edge Functions históricas | REMOVER APÓS GATE | Logs + dependências SQL + busca GitHub + smoke test antes de cada remoção |

## Achados importantes da rodada

1. A arquitetura do repositório já determina que o escopo canônico é somente site público + Vitrine/Admin e que polling sem justificativa deve desaparecer.
2. O Admin atual ainda é monolítico e mistura operação Dona Antônia, Bling, fiscal e financeiro. Isso confirma a necessidade de separar interface operacional de ERP.
3. O Admin chama explicitamente `admin-products-live-v1`, `admin-service-intelligence-v1` e `admin-pin-auth-v1`.
4. Foram identificadas ações como `bling_status`, `bling_finance_overview`, `bling_finance_action`, reconciliações, criação de dependências de pedido, fiscal e consumo de estoque. Muitas são candidatas a serem substituídas por Bling nativo/ChatGPT.
5. O projeto de XML já existe no canônico: `purchase-xml-v1` e tabelas `purchase_xml_*`, `product_supplier_packaging`, `product_purchase_history`, `purchase_stock_receipts`.
6. A configuração atual de XML está com consulta diária habilitada, janela de 3 dias, horário 06h Cuiabá, criação de produtos inativos, sincronização produto-fornecedor e criação automática de contas a pagar habilitadas.
7. O parser XML já diferencia destinatário CPF/CNPJ e contém lógica inicial para unidade comercial/tributável e embalagens. A regra financeira CPF deve permanecer um gate obrigatório e testável.
8. O Admin ainda contém referência a `qxstkwshuvplmmftrctj.supabase.co`; é obrigatório provar se é apenas preconnect/resíduo ou chamada funcional antes de remover.

## Gates antes de qualquer exclusão
- nenhuma referência ativa no site/Admin;
- nenhum log recente relevante;
- nenhuma dependência SQL/RPC;
- substituto homologado;
- smoke test do site;
- smoke test do Admin;
- teste pedido -> Bling;
- teste estoque;
- teste fiscal;
- rollback definido.

## Próxima rodada da auditoria
1. mapear ações do Admin para funções/RPC/tabelas;
2. mapear exatamente o fluxo pedido -> Bling -> fiscal;
3. mapear `purchase-xml-v1` completo e seus gates CPF/CNPJ/financeiro;
4. levantar funções Supabase realmente chamadas nos logs;
5. confrontar cada bloco com capacidades nativas atuais do Bling;
6. fechar a matriz de fonte de verdade por entidade.


## Avaliação Bling Loja Virtual — 2026-09-25

Pesquisa aprofundada em documentação oficial atualizada do Bling e, separadamente, da Tray.

### Conclusão provisória
Não substituir o site público atual pela Bling Loja Virtual antes de uma prova de conceito. Dois requisitos centrais da Dona Antônia não estão comprovados como recursos nativos da Bling Loja Virtual: (1) pagamento exclusivamente na entrega/offline, incluindo dinheiro/cartão/benefício na entrega; (2) cliente editar dinamicamente os componentes de uma cesta/kit, removendo/aumentando/trocando itens com recálculo do valor.

### O que a Bling Loja Virtual resolve bem
- catálogo, categorias, domínio próprio, carrinho/checkout, pedidos, estoque e integração com o ERP;
- frete fixo/motoboy por faixas de CEP;
- kits/composições no cadastro do Bling e baixa/controle dos componentes conforme configuração;
- preço comercial do kit independente da soma dos componentes: a atualização automática do preço por soma vem desativada por padrão e deve permanecer desativada para as cestas Dona Antônia;
- código-fonte/editor visual são anunciados nos planos atuais, mas isso não comprova liberdade para alterar regras de backend/checkout/meios de pagamento.

### Bloqueadores atuais
1. A documentação da Bling Loja Virtual lista apenas cartão, PIX, boleto e transferência online, processados por gateway homologado. Não foi encontrado método nativo documentado de pagamento na entrega/offline.
2. Variações com composição são exibidas na loja como variações comuns; a composição é controle interno do Bling. Não foi encontrado configurador nativo para o comprador editar componentes do kit.
3. Não foi encontrado recurso nativo documentado da Bling Loja Virtual para devolver automaticamente ao mesmo WhatsApp do cliente a lista completa do pedido. A Tray standalone possui ferramentas de WhatsApp, mas isso não deve ser confundido com disponibilidade garantida na Loja Virtual nativa do Bling.

### Regra do projeto
- Site atual permanece em produção.
- Não migrar catálogo/domínio até passar uma POC dos requisitos críticos.
- Se a loja nativa falhar nos gates de pagamento na entrega ou cesta editável, comparar Tray standalone integrada ao Bling antes de decidir manter/desenvolver mais código próprio.

### Gates da POC
A. pagamento 100% na entrega/offline;
B. cesta editável por componente com recálculo;
C. pedido final preserva a composição correta e baixa estoque dos componentes;
D. confirmação/lista do pedido retorna ao WhatsApp;
E. preço comercial da cesta permanece independente da soma dos componentes;
F. pedido chega ao Bling sem duplicidade e compatível com fiscal/expedição.
