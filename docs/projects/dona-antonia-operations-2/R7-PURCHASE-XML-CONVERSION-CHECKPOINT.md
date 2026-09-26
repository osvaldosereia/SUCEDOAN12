# Operations 2.0 — R7 · XML / compras / conversão caixa→unidade

Data: 2026-09-26
Status: programação segura concluída nesta rodada.

## Escopo
R7 fecha o contrato de entrada XML sem criar ERP paralelo. Bling permanece fonte futura de fornecedor, compras/entrada e lotes quando homologado. Dona Antônia mantém somente regras especiais: XML CPF, conversão embalagem→unidade, revisão e auditoria.

## Evidência de estado
- Módulo purchase-xml-v1 já existe e está implantado.
- Banco canônico no início da R7: 0 XMLs processados e 0 regras de embalagem persistidas.
- Portanto os novos gates foram instalados antes da primeira entrada real, sem migração corretiva de dados históricos.

## Implementado no Supabase canônico
Migration ops2_r7_purchase_xml_conversion_readiness_v1:
- view security_invoker ops2_purchase_xml_conversion_readiness_v1;
- mede itens sem produto, conversões pendentes/inválidas e quantidade convertida;
- expõe conversion_ready;
- valida finance_guard_ok, incluindo CPF sem financeiro empresarial;
- sem acesso anon/authenticated.

Migration ops2_r7_purchase_xml_receipt_gate_v1:
- função interna ops2_purchase_xml_receipt_gate_v1(document_id);
- retorna ready=true somente com produto resolvido, conversão resolvida, quantidades válidas, documento processed/ready e guarda financeira válida;
- função fechada para public/anon/authenticated.

## Regras preservadas
1. CPF nunca cria obrigação financeira empresarial automaticamente.
2. Caixa/fardo/pacote não é inferido apenas pelo nome.
3. Fator confirmado é produto + fornecedor + item fornecedor + unidade de compra.
4. XML qCom/qTrib pode ser evidência, não autorização cega.
5. Entrada física continua exigindo confirmação humana.
6. Produto novo não deve entrar ativo automaticamente na vitrine.
7. Lote/validade fica alinhado à decisão R6: Bling será fonte quando homologado; não criar validade paralela concorrente.
8. Sem Make e sem runtime legado.

## Ações humanas acumuladas — executar somente depois da R12
- Confirmar busca automática de NF-e/SEFAZ e certificado A1 no Bling.
- Confirmar Check-in de Recebimentos e DUN.
- Homologar 10–20 XMLs reais CNPJ/CPF.
- Validar pelo menos três conversões físicas diferentes (ex. 6/12/24 unidades).
- Validar com contador tratamento fiscal/contábil de mercadoria adquirida em CPF.

## Gate R7
PASS para contrato/readiness e proteção de conversão.
PENDENTE de homologação física apenas nos itens humanos acima.
