# Balanço A4 — recuperação manual de leituras não resolvidas

Data: 2026-09-29

## Objetivo

Garantir que nenhum produto fique perdido quando OCR local + fallback de IA não conseguirem ler ESTOQUE e/ou GÔNDOLA com segurança.

## Comportamento

Foi criada uma fila central persistente no Vitrine/Admin chamada:

**Pendências para contagem manual**

Ela reúne itens de `inventory_sheet_item_results` com:
- `review_state = review`;
- `review_state = error`.

A fila é global: qualquer operador autorizado, em qualquer celular, vê as mesmas pendências.

## Informações exibidas

Para cada pendência:
- nome do produto;
- EAN, quando existir;
- lote;
- página;
- REF;
- operador que enviou a foto;
- motivo da pendência;
- valor de estoque eventualmente lido;
- valor de gôndola eventualmente lido.

Motivos derivados:
- estoque não lido com segurança;
- gôndola não lida com segurança;
- ambos não lidos;
- falha de aplicação/integração.

## Resolução manual

Cada linha possui:
- campo ESTOQUE;
- campo GÔNDOLA;
- botão **Resolver manualmente**.

O operador deve conferir fisicamente o produto e confirmar os dois valores.

A resolução usa o mesmo endpoint canônico `inventory_sheet_apply` com `manual_confirmed = true`, preservando:
- auditoria;
- regra de gôndola;
- registro de contagem;
- fluxo de autoridade do estoque;
- integração/validação com Bling.

O item deixa de aparecer na fila assim que deixa os estados `review/error`.

## Atualização da fila

A lista é recarregada:
- ao entrar na tela de Balanço;
- depois de processar fotos;
- depois de aplicar uma folha;
- depois de aplicar folhas em lote;
- depois de resolver uma pendência manual.

## Backend

Nova ação:
- `GET inventory_sheet_pending_manual`

Retorna:
- `count`;
- `quantity_missing`;
- `gondola_missing`;
- `apply_errors`;
- `items`.

Edge Function:
- `admin-products-live-v1` v75;
- status ACTIVE.

## Commits

- backend: `06169aaa69f0d71e3c57381bdb47bb283e89b883`;
- frontend: `a186f3cbf8392978d5d5ce801003cbbd15b54cb3`.

## Validação

Consulta de produção após deploy:
- pendências manuais atuais: 0;
- estoque não lido: 0;
- gôndola não lida: 0;
- erros de aplicação: 0.

O fluxo será validado em condição real quando uma foto gerar leitura irresolvida.
