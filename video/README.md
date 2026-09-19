# VIDEO — Dona Antônia

Módulo isolado do `SUCEDOAN12` para preparar referências e prompts de vídeo para Google Flow / Gemini Omni Flash 1.1.

## URL oficial
- https://www.donaantonia.com.br/video

## Duração
O vídeo é sempre **fixo em 10 segundos**, independentemente da quantidade de produtos:
- 0–2 s: abertura temática;
- 2–8,5 s: desenvolvimento e apresentação dos produtos;
- 8,5–10 s: encerramento natural e estável com os próprios produtos;
- sem CTA.

## Quantidade variável de produtos
O usuário define qualquer quantidade de **1 a 16 produtos**.

A interface:
- mantém múltiplas buscas sem perder a seleção;
- limita a seleção ao total escolhido;
- mostra contador `selecionados / quantidade desejada`;
- só libera a montagem quando a quantidade selecionada for exatamente a definida.

## Referências
O sistema cria automaticamente até 4 produtos por imagem:
- 1–4 produtos → 1 imagem;
- 5–8 produtos → 2 imagens;
- 9–12 produtos → 3 imagens;
- 13–16 produtos → 4 imagens.

A última referência se reorganiza automaticamente quando tiver 1, 2 ou 3 produtos.

## Prompt IA
A automação recebe:
- `product_count`;
- `image_count`;
- tema;
- orientações opcionais;
- metadados dos produtos selecionados.

O prompt é adaptado à quantidade real de produtos e imagens, mas a duração permanece sempre em 10 segundos. Com poucos produtos, a IA desenvolve mais cada produto; com muitos, aumenta a cadência e usa composições em grupos, sem inventar produtos adicionais.

## Regras fixas
- não usar CTA;
- não usar logo no vídeo;
- preservar integralmente rótulos, embalagens e formatos;
- remover somente fundos cinza/branco/colorido das fotos de produto;
- somente trilha instrumental, sem voz/locução/narração;
- ter início, meio e fim;
- terminar com composição final estável;
- nunca encerrar com corte seco, movimento interrompido ou transição pela metade.

## Backend
Reutiliza a Edge Function existente `creative-storyboard-projects`:
- `video_search_products`: busca pública limitada a 16 produtos com imagem;
- `video_generate_prompt`: geração de prompt IA adaptado dinamicamente a 1–16 produtos e 1–4 referências.


## Linha do tempo modular
A aba **Linha do tempo** cria de 1 a 20 etapas. Cada etapa gera **somente o prompt** para o Google Flow e pode ser usada isoladamente.

Módulos disponíveis:
- Abertura / prompt: orientação, frase opcional, produtos opcionais;
- Vídeo / prompt: conteúdo principal, produtos opcionais;
- Transição contagem regressiva: 5 → 1;
- Transição passagem do tempo: ex. 30 minutos;
- Encerramento / CTA: logo Dona Antônia, WhatsApp 98449-1018, www.donaantonia.com.br e Entrega grátis em Cuiabá e VG.

Cada módulo escolhe independentemente 4, 6, 8 ou 10 segundos. A automação recebe contexto do módulo anterior e do seguinte para manter continuidade.
