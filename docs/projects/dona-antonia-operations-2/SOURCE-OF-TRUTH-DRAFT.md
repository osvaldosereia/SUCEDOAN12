# Dona Antônia Operations 2.0 — Source of Truth (DRAFT)

> Rascunho analítico. Será revisado antes do Projeto Final.
> Última atualização: 2026-09-25.

| Entidade/Processo | Fonte de verdade proposta | Observação |
|---|---|---|
| Identidade fiscal do produto | Bling | SKU/GTIN/NCM/unidade/fiscal, após saneamento |
| Conteúdo comercial da vitrine | Dona Antônia | foto, descrição comercial, categorias próprias, destaque |
| Preço de produto simples | Bling, refletido no site | definir sincronização final |
| Cesta e componentes editáveis | Dona Antônia | regra própria que o Bling não cobre integralmente |
| Preço comercial da cesta | Dona Antônia | separado da soma fiscal dos componentes |
| Estoque físico | Bling | alvo; hoje ainda existe controle local duplicado |
| Reserva temporária de checkout | a definir | avaliar usar reserva nativa Bling cedo no fluxo |
| Lotes/validade | Bling como alvo | regras de oferta podem ser Dona Antônia |
| Cliente | Bling + identidade Dona Antônia | CPF como chave empresarial; telefone como canal |
| Conversa WhatsApp | PapoAI | canal, não ERP |
| Rascunho de pedido WhatsApp | Dona Antônia | temporário, sem efeitos externos |
| Pedido confirmado | Bling como registro ERP + espelho operacional Dona Antônia | qualquer origem converge aqui |
| Origem/canal do pedido | Dona Antônia | site, WhatsApp manual, PapoAI, recompra, etc. |
| Fornecedor | Bling | XML/compra alimenta cadastro |
| Compra/Pedido de compra | Bling | alvo |
| XML CNPJ | Bling primeiro + regras especiais Dona Antônia | financeiro elegível |
| XML CPF | Dona Antônia como staging | nunca financeiro empresarial |
| Conversão caixa->unidade | regra determinística Dona Antônia + cadastro fornecedor/produto | fator explícito e auditável |
| Contas a pagar | Bling | CPF bloqueado |
| Contas a receber | Bling | pagamento na entrega exige desenho por modalidade |
| NF-e saída | Bling | evitar orquestrador fiscal paralelo |
| Separação/conferência | Bling se UX suficiente; Admin fino se necessário | decisão ainda aberta |
| Expedição | Bling + Admin fino | documentos no Bling; operação local no Admin |
| Entrega/rota | Dona Antônia | necessidade local específica |
| Gestão do proprietário | ChatGPT + Bling | preferir MCP/conector oficial quando disponível |
