# DA6 — Rodada 1 encerrada: impressão térmica e gôndolas (09/10/2026)

## Status e evidências
- **Rodada 1 de programação: CONCLUÍDA na branch**, com CI DA6 `37935463162`: três jobs `success`.
- `deterministic-tests`: **35 aprovados, 0 falhas**.
- `edge-types`: Deno/WASM e imports `success`.
- `postgres-review`: PostgreSQL 17 em banco efêmero, migração/ACL e rollback `success`.
- PR draft [#987](https://github.com/osvaldosereia/SUCEDOAN12/pull/987). Sem merge, migração de revisão em produção ou deploy DA6.
- Testes automatizados não significam que uma impressora física 203dpi ou câmera de celular tenha sido homologada. Prova física será um gate da rodada de homologação operacional, antes de publicar.

## Correções implementadas

1. **Catálogo / Cards / gôndolas:** `vitrine/admin/index.html` passa o número da gôndola dentro do card operacional, evitando chamadas `product_detail` por produto. `product-shelf-admin-ui.js` deduplica a consulta `gondolas` em uma Promise compartilhada, permite cadastrar/vincular gôndolas 1–9999 em desktop e celular, reverte visualmente em caso de erro, atualiza card após salvar. `gondola_create` é chamado antes do `product_quick_save` quando necessário; não modifica estoque.
2. **Impressão:** `product-shelf-labels.js` só usa GTIN no barcode Code128 quando formado exclusivamente por números e válido pelo dígito verificador; caso contrário usa identificador interno. A impressão só prossegue depois de gerar os códigos, verificar o número de QR/barcodes e decodificar os QR. Recursos externos indisponíveis geram erro na janela, **sem etiqueta parcial impressa**. O Admin identifica a prévia sem informar falsamente que já imprimiu, bloqueia seleção vazia/mais de 300.
3. **Geometria/OCR OMR:** o teste real em Chrome detectou erro de falsa segunda marcação causado pelas bordas dos círculos impressos. O leitor no navegador **e** o worker do servidor usam amostra central de raio 0,55mm e detecção adaptativa de segundo sinal comparado com o ruído de fundo dos dez círculos do grupo. A rejeição de múltiplas marcações reais continua habilitada.
4. **Testes com navegador real:** `tests/da6-thermal-browser-layout.test.cjs` renderiza etiqueta 100×150mm, gera QR e Code128 reais, verifica as 4 referências e 6 campos, imprime PDF via Chrome, marca as seis quantidades e as recupera a partir dos **pixels rasterizados em 203 dpi**, inclusive valida que a etiqueta vazia não gera contagens. `tests/da6-shelf-admin-browser.test.cjs` verifica a montagem dos cards, gôndola previamente salva, ausência de N+1 queries e cadastro/ligação de gôndola. `tests/inventory-label-omr-geometry.test.cjs` recebeu casos de contorno vazio e segunda bolinha parcialmente preenchida.
5. **Workflow:** `.github/workflows/da6-inventory-labels-ci.yml` instala dependências de teste efêmeras e Chrome do runner, sem adição de bibliotecas ao runtime do Admin público.

## Bloqueios ainda existentes (fora da Rodada 1 de programação)
- Impressora física e fotografias reais: ainda não testadas. Precisa imprimir algumas etiquetas verdadeiras e fotografar em condições reais antes de liberar operações.
- Sistema DA6 ainda não publicado em produção. Edge Function do Admin está na versão antiga e a migração de revisão manual continua em branch.
- Pipeline geral `Admin and Baskets Guard CI` falha por expectativa `channel_origin` fora do DA6; não tocar em pedidos sem auditar causa e regressão. Para merge é necessário eliminar ou justificar essa falha com evidências objetivas.
- Geração gráfica na página de impressão usa JsBarcode e qrcode-generator por CDN: verificação de erro e bloqueio de impressão parcial introduzidos. No uso físico, testar desempenho de conexão e CDN.
- Código imprime quantidade correta, mas **NÃO deve aplicar balanço histórico automaticamente** ao estoque nem sincronizar Bling.

## Próxima rodada obrigatória — Rodada 2
- Verificar novo HEAD da branch e CI antes de mudar qualquer código.
- Realizar testes fotográficos com rotação 90/180/270 graus, projeção, sombras, reflexos e desfoque; classificar ambiguidades sem inventar quantidade.
- Calibrar geometria/deteção de perspectiva, QR e thresholds em artefatos fotográficos **e** manter regressão de impressão 203dpi verde.
- Registrar testes e resultados com evidências no GitHub. Não iniciar Rodada 3 antes de CI da Rodada 2 verde.
