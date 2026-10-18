# Rodada 18/20 — DANFE e documentos fiscais

Escopo: auditoria do Admin e proxy fiscal do Bling; nenhum PDF real foi solicitado.

## Fluxo encontrado

- openDanfeForOrder abre janela temporária, chama order_fiscal_document_pdf, decodifica base64, cria Blob application/pdf e URL temporária, com revogação após dois minutos.
- Em erro fecha a janela e apresenta falha ao operador.
- O backend delega a operação ao Hub fiscal_document_pdf.
- orderFiscalStatusV4 calcula danfe_available quando a nota está autorizada e há chave, job access_key ou identificador de nota.

## Achado relevante

openCurrentDanfe usa a condição fiscal.authorized!==true && gate.authorized!==true && !fiscal.bling_invoice_id && !fiscal.invoice_id. Assim, a existência de invoice_id isoladamente pode permitir solicitar o PDF sem autorização explicitamente confirmada. Uma alteração segura da interface para exigir fiscal.authorized ou gate.authorized foi tentada, mas a ferramenta bloqueou a escrita. **Não foi corrigido.**

O endpoint order_fiscal_document_pdf faz apenas a validação de identificador antes de encaminhar ao Hub. É necessário conferir a autorização fiscal e permissões na camada Hub, evitando depender apenas da interface.

## Riscos residuais

1. Não foi verificada a validação de autorização fiscal do Hub fiscal_document_pdf.
2. O Admin não confere assinatura PDF ou tamanho máximo da resposta base64; eventual arquivo inválido será tratado pelo navegador.
3. A revogação da URL temporária em dois minutos pode afetar impressão tardia em determinados navegadores.
4. A pré-abertura de janela reduz bloqueio de pop-up, mas não elimina dependência do navegador.
5. Testar documento inexistente, NF-e rejeitada, timeout, PDF inválido e falha de impressão em ambiente isolado.

## Entrega

scripts/test-admin-danfe-document-contract.mjs criado e integrado ao workflow. Nenhum documento real foi gerado ou alterado.
