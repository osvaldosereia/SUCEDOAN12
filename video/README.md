# VIDEO — Dona Antônia

Módulo isolado do `SUCEDOAN12` para preparar referências e prompts de vídeo para Google Flow / Gemini Omni Flash 1.1.

## URL oficial
- https://www.donaantonia.com.br/video

## Fluxo atual
1. Digitar uma palavra-chave para buscar produtos por nome, marca, categoria, subcategoria, GTIN ou SKU.
2. A busca retorna até 16 produtos com imagem.
3. O campo **Tema** é preenchido pela palavra-chave e pode ser editado.
4. É possível fazer várias buscas sem perder os produtos já escolhidos.
5. Selecionar exatamente 16 produtos.
6. Clicar em **Montar 4 imagens + gerar prompt**.
7. O sistema cria 4 referências, cada uma com 4 produtos.
8. Os dados dos produtos + tema + orientações opcionais são enviados à automação IA no Supabase.
9. A IA gera um prompt final adaptado ao tema para um único vídeo de 10 segundos.

## Estrutura fixa do vídeo
- 0–1 s: abertura temática.
- 1–6 s: produtos.
- 6–10 s: CTA.

## Regras fixas
- não usar CTA;
- não usar logo no vídeo;
- preservar integralmente rótulos, embalagens e formatos;
- remover somente fundos cinza/branco/colorido das fotos de produto;
- somente trilha instrumental, sem voz/locução/narração;
- usar os 10 segundos inteiros para abertura temática + apresentação dos produtos.

## Backend
Reutiliza a Edge Function existente `creative-storyboard-projects`:
- `video_search_products`: busca pública limitada a 16 produtos com imagem;
- `video_generate_prompt`: geração de prompt por IA, com entrada limitada e regras fixas de segurança/custo.
