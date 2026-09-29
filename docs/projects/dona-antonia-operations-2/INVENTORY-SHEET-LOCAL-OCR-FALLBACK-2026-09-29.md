# Balanço A4 — OCR local + fallback de IA

Data: 2026-09-29

## Objetivo

Reduzir dependência de IA generativa na leitura das folhas A4 de balanço, mantendo segurança para atualização de estoque e gôndola.

Arquitetura adotada:

- identificação do produto: determinística por lote + página + posição;
- leitura de ESTOQUE e GÔNDOLA: OCR numérico local no navegador;
- IA generativa: fallback somente para campos numéricos que o OCR local não conseguiu ler com confiança suficiente;
- atualização de estoque: mantém o fluxo canônico existente, inclusive autoridade Bling, fila e verificação;
- atualização de gôndola: mantém o fluxo local já implementado.

## Identificação determinística

A foto não é mais usada para descobrir o produto por imagem, nome, REF ou EAN.

O operador seleciona:
1. lote impresso;
2. página fotografada.

A posição física do card (slot 1..25, esquerda -> direita, cima -> baixo) é cruzada com `inventory_sheet_items`, que já contém o produto persistido no momento da impressão.

Assim, mesmo que foto, nome ou EAN não estejam perfeitamente legíveis, o produto não é inferido pela IA.

## OCR local

Frontend: `vitrine/admin/index.html`

Bibliotecas fixadas:
- OpenCV.js 4.14.0;
- Tesseract.js 7.0.0.

Fluxo:
1. abre a foto no navegador;
2. detecta o maior contorno de quatro pontos correspondente à folha;
3. corrige a perspectiva para um A4 normalizado de 1260 x 1782;
4. usa a geometria conhecida da impressão 5 x 5;
5. recorta somente os quadros manuscritos ESTOQUE e GÔNDOLA;
6. binariza cada recorte;
7. Tesseract lê somente dígitos (whitelist 0-9);
8. campos válidos com confiança >= 0,88 seguem sem IA.

A foto A4 inteira permanece no aparelho no caminho normal.

## Fallback de IA

Somente campos que ficarem inválidos ou abaixo de 0,88 são enviados ao backend como pequenos recortes individuais.

Backend: `supabase/functions/admin-products-live-v1/index.ts`

A IA recebe apenas:
- slot_number;
- field = quantity ou gondola;
- imagem do pequeno quadro manuscrito.

Ela não recebe a folha inteira para identificar produto e não deve inferir EAN, REF, nome, lote ou página.

Para liberação automática do valor do fallback, exige-se:
- campo válido;
- não ambíguo;
- confiança >= 0,92.

Caso contrário, o item permanece para conferência humana.

## Auditoria da origem

O scan registra:
- `source = deterministic_batch_page_slot`;
- motor local;
- resultados locais;
- campos enviados ao fallback;
- resultado do fallback;
- erro do fallback, quando houver.

O item usa `ai_mark_kind` por compatibilidade com o schema existente:
- `local_ocr`;
- `local_ocr+ai_fallback`;
- `local_ocr_review`.

Não foi criada migração nova apenas para renomear colunas históricas.

## Interface

A tela de balanço por foto agora mostra:
- seletor de lote;
- seletor de página;
- status do OCR local;
- indicação quando IA foi usada somente no campo duvidoso;
- revisão manual antes da aplicação quando necessário.

Nova rota de leitura:
- `GET inventory_sheet_batches`.

## Produção

GitHub:
- backend determinístico/fallback: `a66a5ca613d23d70b11fe47ba3d38b6f647d1ce4`;
- correção do rótulo do motor: `9f82203e812525c159b01bd039f4a2ffa7e6e6f3`;
- frontend OCR local: `2c90c7770bdbd92141445c62921724c5d5a6da16`.

Supabase:
- `admin-products-live-v1` versão 72;
- status ACTIVE;
- logs confirmaram execução HTTP 200 após o deploy.

GitHub Pages:
- deploy do commit `2c90c7770bdbd92141445c62921724c5d5a6da16`;
- workflow concluído com sucesso.

## Validações executadas

- JavaScript inline do Admin compilado sem erro de sintaxe;
- backend sem o antigo prompt de leitura generativa da folha inteira;
- rota de lotes presente;
- lotes reais consultados com `cards_per_page = 25`;
- Edge Function v72 ativa e atendendo requisições.

## Validação física pendente

Ainda falta apenas validar a qualidade de leitura com uma foto real de uma folha preenchida à mão.

Esse teste deve medir:
- detecção das quatro bordas;
- alinhamento dos recortes;
- taxa de leitura local correta;
- quantidade de campos que realmente precisam do fallback de IA;
- necessidade de ajustar limiar, tamanho do recorte ou pré-processamento.

Não considerar acurácia manuscrita comprovada até esse teste real.
