# Dona Antônia — aplicação modular paralela

Esta pasta contém a nova versão modular do catálogo. Ela foi criada para teste e **não substitui o `index.html` da raiz**.

## Como abrir

Quando a branch estiver publicada, acesse:

`https://www.donaantonia.com.br/app-next/`

O servidor precisa servir a branch de teste ou um ambiente de homologação apontado para ela. O arquivo inclui `noindex, nofollow` para não competir com o site atual.

## Arquitetura

- `src/config.js`: configuração pública, endpoints e chaves de armazenamento.
- `src/core.js`: store, eventos, router, armazenamento e utilitários.
- `src/catalog.js`: carregamento, cache, normalização e busca do catálogo.
- `src/commerce.js`: disponibilidade, descontos, cupons, carrinho, cestas e kits.
- `src/integrations.js`: payloads, Firebase, Make, Bling e WhatsApp.
- `src/personalization.js`: personalização local baseada em eventos.
- `src/ui.js`: componentes e páginas.
- `src/checkout.js`: checkout e envio do pedido.
- `src/main.js`: composição e inicialização.
- `styles/app.css`: estilos da prévia modular.

## Segurança da prévia

A versão usa prefixo `da_next_` no `localStorage`. Carrinho, favoritos, dados de checkout, fila de pedidos e personalização ficam separados do site atual.

A prévia mantém os endpoints e formatos usados pelo site para permitir teste real. Portanto, pedidos de homologação devem ser claramente identificados pela propriedade `metadados.previewModular: true` e `controle.preview_modular: true`.

## Testes

Sem dependências externas:

```bash
cd app-next
npm test
npm run check
```

Os testes verificam normalização, busca, preços, cupons, descontos, kits, checkout, payloads, estrutura do Firebase, mensagem do WhatsApp e sintaxe dos módulos.

## Ativação futura

A ativação só deve ocorrer depois de:

1. Testes completos em celular e desktop.
2. Comparação de totais com o site atual.
3. Pedido real controlado no WhatsApp, Firebase e Make/Bling.
4. Validação de cestas, kits, cupons, estoque e imagens.
5. Troca planejada do `index.html`, com rollback imediato disponível.
