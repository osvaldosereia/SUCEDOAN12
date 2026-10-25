# Dona Antônia | Flow 1018: seleção e quantidade por produto

## Situação
Protótipo de **Flow JSON v7.3**, ainda **NÃO enviado, aprovado nem publicado pela Meta**. Não utiliza preços simulados para enganar clientes, não altera ANA, estoque ou pedidos. O canário atual de mensagens interativas continua preservado.

## Comportamento
1. **TAMANHO** — escolhe Mini, Econômica, Pequena, Média ou Grande.
2. **COMBINACAO** — escolhe uma das três alternativas. Esta versão estática usa nomes genéricos, sem preço; o preço correto é calculado pelo motor do Supabase.
3. **PRODUTOS** — apresenta oito produtos **ilustrativos**, com um `Dropdown` de quantidade diretamente abaixo de cada produto. `0` significa retirar; `1` a `10` são quantidades escolhíveis. A seleção inicial é pré-preenchida para evitar 8 toques obrigatórios. Ao concluir, os valores são dados para validação; esta versão **não cria pedido**.

## Limites da Meta
- Os Flow components não possuem contador nativo com botões `−/+`; utiliza-se `Dropdown` ou `TextInput` do tipo `number`.
- O Flow não é uma página HTML e não pode ter o visual exato dos mockups de imagem. Layout e controles são nativos.
- `Dropdown` tem limite curto de `label`, por isso usamos `TextSubheading` com o produto e `Quantidade` no seletor.
- Uma lista fixa de 8 produtos é só protótipo, não representa as 15 composições reais.
- Para publicar a versão operacional é obrigatório desenvolver **data exchange / endpoint criptografado** que busque cestas, marcas, preços, disponibilidade e estado de escolhas do Supabase; validar todos os itens no servidor antes de confirmar.
- A Meta permite criar o draft via WhatsApp Manager ou Graph API, validar JSON e publicar em seguida. O publicador Meta não está disponível nas conexões desta conversa; não se deve declarar submissão/aprovação sem ID e resposta oficial.

## Estratégia de produção
- Reutilizar `home_size_cards`, `basket`, `basket_mold_options` e `basket_mold_quote` como única fonte de dados.
- Carregar marcas e posições da cesta selecionada via endpoint de Flow com estado do cliente.
- Dividir produtos de cestas maiores em telas por grupos quando necessário, para legibilidade e limites de componentes.
- Usar resumo final que mostra preços completos e solicita confirmação expressa.
- Inicialmente disparar apenas canal 1018 para 8360 durante homologação, sem integração comercial e sem lançamento de pedido.
