# Dona Antônia Operations 2.0 — SOURCE OF TRUTH FINAL

> Versão consolidada do modelo de autoridade dos dados.

| Domínio | Fonte oficial | Espelho/uso local |
|---|---|---|
| Produto ERP | Bling | site/admin |
| NCM/CEST/tributação | Bling | cache quando necessário |
| GTIN/SKU | Bling | site/admin |
| Preço regular | Bling | site |
| Cesta | Dona Antônia | — |
| Preço comercial cesta | Dona Antônia | snapshot no pedido |
| Estoque físico | Bling | Supabase espelha |
| Estoque vendável | saldo virtual Bling / Geral | Supabase espelha |
| Reserva | Bling por situação | status local |
| Depósito Geral | Bling | — |
| Quarentena | Bling | Control Tower |
| Lote/validade | Bling | read model local |
| Oferta por validade | Dona Antônia | baseada nos lotes Bling |
| Cliente ERP/fiscal | Bling | Supabase identidade operacional |
| Telefone/conversa | PapoAI | Supabase vínculo |
| Endereço do pedido | snapshot Dona Antônia | também enviado ao Bling |
| Pedido comercial | Dona Antônia canônico + Bling ERP | ambos vinculados |
| Compra | Bling | Control Tower |
| XML CNPJ | Bling/SEFAZ | ingest/observação |
| XML CPF | staging Dona Antônia | não financeiro automático |
| Fornecedor | Bling | metadados especiais locais |
| Caixa->unidade | Dona Antônia + DUN Bling | — |
| NF-e | Bling | referências locais |
| DANFE | Bling | impressão local |
| Contas a pagar | Bling | dashboard |
| Contas a receber | Bling | dashboard |
| Pagamento efetivo entrega | captura Dona Antônia -> Bling | ledger |
| Devolução | Bling | status local |
| Perdas | Bling/fiscal | ocorrência local |
| Rota | Dona Antônia | — |
| Entrega | Dona Antônia | fechamento no Bling |
| Eventos | Dona Antônia ledger | — |
| Regras/decisões | GitHub | — |
| IA | OpenAI | nunca fonte de verdade |
