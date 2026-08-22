# CANECAS Studio IA V4 — OpenAI nativo no Make

Esta versão substitui a estratégia V3 via API HTTP da OpenAI.

## Fluxo
Webhook Admin Produção → Parse JSON → Configuração → OpenAI Edit image (nativo) → GitHub → Webhook response.

## Módulo OpenAI
Identificador interno: `openai-gpt-3:editImage`.

Configuração prevista:
- modelo: `gpt-image-1.5`;
- `input_fidelity`: `high`;
- arte: 1536×1024, posteriormente recortada pelo Admin para 2300×1000;
- mockups: 1024×1024;
- fundo opaco;
- saída WEBP.

## Integração com o Admin
O Admin mantém o fluxo existente e um bridge acrescenta `image_base64` ao payload antes de chamar o webhook do Make. Isso elimina a necessidade de um módulo de download no Make.

- `generate_mug_art`: a imagem Base64 é a referência preparada pelo Admin;
- `generate_mug_mockup`: a imagem Base64 é a arte-mestre 2300×1000;
- o mesmo módulo OpenAI nativo atende as três chamadas.

## Após importar
1. Crie ou selecione o webhook no módulo 1.
2. Selecione sua conexão OpenAI no módulo 4.
3. Substitua o placeholder do token GitHub no módulo 3 por um token novo.
4. Ative o cenário e cole a URL do webhook no Estúdio de Canecas do Admin Produção.

Nunca reutilize credenciais expostas em blueprints antigos.
