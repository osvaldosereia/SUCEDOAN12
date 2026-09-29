# Balanço A4 — QR automático, múltiplos celulares e upload em lote

Data: 2026-09-29

## Objetivo

Permitir que várias pessoas façam o balanço simultaneamente em celulares diferentes, fotografem folhas diferentes e enviem várias imagens de uma só vez, em qualquer ordem, sem selecionar manualmente lote ou página.

## Identificação automática da folha

Cada página impressa passa a conter um QR Code com payload versionado:

`DA_BAL1|<batch_code>|<page_number>`

Exemplo:

`DA_BAL1|BAL-260929-30FB99|3`

O código é gerado no momento da impressão. O cabeçalho continua exibindo lote e página em texto para conferência humana.

No upload:
1. a foto é corrigida por perspectiva no navegador;
2. o sistema tenta ler o QR pelo BarcodeDetector nativo do aparelho;
3. se o aparelho não suportar BarcodeDetector, usa jsQR 1.4.0;
4. o backend valida lote, página e quantidade real de cards;
5. somente depois começa a leitura de ESTOQUE e GÔNDOLA.

Não existe mais seleção manual de lote/página no fluxo normal.

## Várias fotos de uma vez

A tela de balanço agora oferece:
- Tirar foto agora;
- Selecionar várias fotos.

O seletor da galeria aceita múltiplas imagens. As fotos podem:
- estar em qualquer ordem;
- pertencer a lotes diferentes;
- pertencer a páginas diferentes;
- ter sido feitas anteriormente pela câmera do aparelho.

O navegador processa as fotos sequencialmente para evitar uso excessivo de memória em celulares.

A fila mostra por foto:
- aguardando;
- lendo;
- pronta;
- conferir;
- já enviada;
- aplicando;
- Bling processando;
- aplicada;
- erro.

As folhas prontas podem ser aplicadas em lote.

## Vários celulares / vários operadores

Cada aparelho trabalha de forma independente.

Cada upload registra:
- usuário autenticado;
- operador informado no aparelho;
- client_upload_id;
- lote e página lidos do QR;
- origem da leitura;
- resultados do OCR local;
- eventual fallback de IA.

Isso permite rastrear quem enviou cada leitura mesmo com várias pessoas trabalhando ao mesmo tempo.

## Proteção contra duplicidade

Foi criado índice único:

`inventory_sheet_page_scans_one_per_page_uidx (batch_id, page_number)`

Consequência:
- uma página física tem somente uma leitura oficial;
- se duas pessoas enviarem a mesma folha, apenas a primeira é registrada;
- o segundo aparelho recebe status "Já enviada";
- não há segunda atualização de estoque/gôndola daquela página.

Migration:
`20260929114500_inventory_sheet_multiuser_page_lock_v1.sql`

## OCR

Mantida a arquitetura anterior:
- produto = lote + página + posição;
- números = OCR local;
- IA = somente fallback de campo duvidoso;
- atualização = fluxo canônico de estoque/Bling.

## Bibliotecas no navegador

- OpenCV.js 4.14.0 — perspectiva;
- Tesseract.js 7.0.0 — números manuscritos;
- jsQR 1.4.0 — leitura do QR quando BarcodeDetector não estiver disponível;
- qrcode-generator 1.4.4 — geração do QR na impressão.

## Backend

Nova rota:
- `POST inventory_sheet_manifest`

Ela recebe o `sheet_token`, valida a folha e informa:
- lote;
- página;
- total de páginas;
- quantidade de cards na página;
- se a folha já foi enviada.

`inventory_sheet_analyze` agora recebe `sheet_token` e não confia em lote/página digitados pelo operador.

Supabase:
- `admin-products-live-v1` v74;
- status ACTIVE.

## Commits principais

- `1a84abb3c598d8be765fb5fcea68806696a6453a` — lock de página no banco;
- `8a33230f2014e34ddc22dbb393470bcc1ac50c71` — backend QR + duplicidade;
- `481210e34ee77a54805153c6a298387dc436bf03` — QR na impressão e leitura automática;
- `0d63f86bc44f5209dece925f9a14ef350f9c3228` — upload múltiplo/fila multi-celular;
- `ed3b08f565ea83ee0c273274bdea77947036384c` — sincronização da fila com revisão;
- `a8d3db040eb3b0f22f8b61425ace3ac4a0295dee` — operador no upload;
- `ceaa0e6c318c7217e57c3b52f3a8265735816c53` — auditoria backend do operador.

## Compatibilidade das folhas

As folhas impressas antes desta mudança não possuem QR Code e não podem usar a identificação automática nova.

Para o novo fluxo multiusuário, imprimir novamente as folhas pelo Admin. As novas impressões já saem com QR individual por página.

## Validação ainda necessária

A programação, banco e deploy foram validados estruturalmente.

O teste final deve ser físico:
1. imprimir algumas páginas novas com QR;
2. preencher por pessoas diferentes;
3. fotografar com dois ou mais celulares;
4. selecionar várias fotos fora de ordem;
5. verificar identificação automática;
6. confirmar leitura de ESTOQUE/GÔNDOLA;
7. enviar uma página duplicada de outro celular para confirmar o bloqueio.

A precisão real do manuscrito e a legibilidade do QR em condições reais só podem ser confirmadas com essas fotos.
