# Rodada 06/20 — Cadastro, endereço e pagamento

Branch: refactor/admin-print-queue-panel-20261018. PR #1121.

## Caminhos auditados

1. Editor de cliente: openCustomerEditor → saveCustomer → customerApi('vitrine_customer_save').
2. Pedido manual: openManualSale → createManualSale → manual_order_create → createManualWhatsappOrder → RPC de criação.
3. Edição de pedido: paintOrderDetail → saveOrderV3 → order_update → updateOrderCanonical.
4. Confirmação: updateOrderCanonical valida nome, rua, número, cidade, UF e método de pagamento antes da transição para confirmado e demais estados operacionais; reserva via reserve_vitrine_order_stock_v1 na confirmação.

## Achados e risco

- O editor de cliente expõe telefone, CPF, e-mail, data de aniversário e endereço, mas saveCustomer encaminha os valores do formulário sem validação local específica; a validação do serviço de clientes é dependência externa ainda não comprovada.
- O editor de pedido permite salvar valores vazios de nome/endereço/forma de pagamento sem exigir todos os campos; o backend exige dados operacionais somente quando há transição de estado. Isso pode ser intencional para pedidos em rascunho, mas cria risco de dados incompletos antes da confirmação.
- O backend sanitiza e limita comprimento dos campos, porém UF usa tx(...,2).toUpperCase(), não uma validação de duas letras. Isso é uma inconsistência entre aparência do formulário e contrato persistido.
- No pedido manual, o cliente selecionado fornece id e snapshot. A troca manual de nome ou telefone depois de selecionar um cliente pode manter o id antigo; verificar se a RPC resolve associação por id, telefone ou snapshot antes de alterar.
- O método de pagamento é texto de até 80 caracteres no updateOrderCanonical; a lista de métodos aceitos deve ser verificada na RPC e no catálogo canônico antes de restringir valores.
- O telefone no manual é obrigatório por presença, sem validação de formato no controlador. Verificar normalização na RPC e no serviço de clientes.
- A lógica de bloqueio da confirmação exige nome, endereço e pagamento, mas não telefone, CPF/CNPJ nem CEP. Não introduzir novos bloqueios comerciais sem aprovação.

## Testes e mudanças

- Adicionado teste estático de contrato cobrindo os campos do editor de cliente, envio de endereço e pagamento, passagem de snapshot na criação, validação de transição e reserva de estoque.
- Incluído teste no workflow Admin print queue panel.
- Não foram alteradas regras de negócio, RPCs, cadastros reais, dados fiscais, autenticação ou produção.

## Pendências

- Testar validação efetiva do serviço vitrine_customer_save e RPCs de criação.
- Verificar semântica da associação cliente selecionado x dados digitados.
- Acompanhar CI do commit mais recente. Os testes de contrato estáticos não substituem testes funcionais de interface e banco.
