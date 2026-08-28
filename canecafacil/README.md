# CanecaFácil — site público

Vitrine pública especializada em canecas da Dona Antônia.

## Princípios

- Não possui cadastro próprio de produtos: lê as canecas do mesmo `/produtos` usado pelo Produção/Admin Canecas.
- Produto com `canecafacil_ativo: false` não aparece. Na ausência do campo, canecas ativas continuam visíveis para compatibilidade.
- Personalização gera somente a arte horizontal. Não há geração de mockups por IA neste frontend.
- O cliente informa nome, celular e e-mail antes da geração.
- Criações ficam em `/canecas/personalizadas/{id}` e o navegador guarda somente os IDs pertencentes àquele aparelho para montar `Minhas Canecas` sem enumerar criações de terceiros.
- Cada criação suporta até três solicitações de ajuste e guarda versões (`v1`, `v2`, `v3`, `v4`).
- A encomenda é salva em `/canecas/pedidos/{pedidoId}` antes de abrir o WhatsApp.
- A venda fiscal, pagamento, NF-e e expedição continuam sob responsabilidade da Dona Antônia.

## Integrações

### Personalização

Usa o mesmo webhook Make já utilizado pelo ecossistema de canecas e envia `action: personalize_mug_model`. O resultado pode ser síncrono ou recuperado em `/canecas/geracoes/{request_id}`.

### Ajustes

O site procura em `/canecas/config_publica` ou `/canecas/integracoes/publica` um `ajuste_webhook`/`mug_adjustment_webhook`. Se não existir, tenta o webhook geral com `action: adjust_mug_art`. A solicitação é sempre registrada em `/canecas/ajustes/{request_id}` para não ser perdida.

### Melhor Envio

A cotação fica pronta para um webhook intermediário seguro (preferencialmente Make ou Firebase Function). O site procura, nesta ordem:

- `melhor_envio_webhook`
- `shipping_webhook`
- `frete_webhook`

em `/canecas/config_publica` ou `/canecas/integracoes/publica`.

Payload enviado pelo site:

```json
{
  "origin": "canecafacil",
  "cep_destino": "78000000",
  "quantity": 1,
  "product": {
    "id": "firebase-key",
    "codigo": "SKU",
    "nome": "Caneca",
    "preco": 39.9,
    "peso_kg": 0.45,
    "altura_cm": 14,
    "largura_cm": 14,
    "comprimento_cm": 14
  }
}
```

A resposta pode ser um array ou `{ "quotes": [...] }`. O normalizador reconhece `custom_price`/`price` e `custom_delivery_time`/`delivery_time`.

### WhatsApp

Número padrão: o mesmo da Dona Antônia já utilizado no site. Pode ser sobrescrito pelo campo público `whatsapp` na configuração Firebase.

## Arquivos

- `index.html`: shell público e SEO básico.
- `styles.css`: visual branco/preto/laranja, mobile-first.
- `app.js`: catálogo, produto, personalização, versões, Minhas Canecas, frete, pedido e WhatsApp.

## Segurança

Tokens do Bling, Melhor Envio e credenciais administrativas nunca devem ser colocados nestes arquivos. O navegador chama apenas webhooks/Functions intermediários que expõem o mínimo necessário.