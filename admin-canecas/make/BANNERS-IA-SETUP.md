# Banners IA — Admin Canecas + Make + OpenAI

## O que foi implementado

A nova área **Banners IA** no `/admin-canecas/` gera os quatro formatos usados no perfil atual da Loja Integrada:

- Full Banner: 1920×300 px; versão mobile configurada em 722×888 px.
- Mini Banner: 360×200 px.
- Banner Tarja: 1920×70 px; versão mobile 361×70 px.
- Banner Vitrine: 850×200 px.

O OpenAI gera a direção visual, copy e um fundo sem texto. O navegador monta a arte final com textos, preço, CTA e, quando possível, a imagem real da caneca. Isso evita erros de letras e números dentro da imagem gerada por IA.

Os JPEGs finais passam por compressão progressiva para tentar ficar abaixo de 500 KB, limite indicado pela Loja Integrada para o Novo Tema Padrão.

## Instalação do cenário Make

1. No Make, crie um cenário vazio.
2. Use **Import Blueprint** e importe `CANECA-FACIL-BANNERS-IA.blueprint.json`.
3. Abra o módulo **Admin Canecas - Receber pedido de banner** e crie um novo Custom Webhook chamado `Caneca Facil - Banners IA`.
4. Abra os dois módulos OpenAI e selecione/crie sua conexão OpenAI.
5. No módulo de texto mantenha `gpt-4o-mini` (modelo usado no exemplo oficial atual de blueprint do Make) ou escolha outro modelo compatível com Chat Completions/JSON Object.
6. No módulo de imagem mantenha `GPT Image 2`, tamanho `1536x1024`, formato JPEG e retorno Base64. Se sua conta não tiver GPT Image 2, use GPT Image 1.5.
7. Salve o cenário e deixe-o ativo (webhook instantâneo; não precisa agendamento).
8. Copie a URL do Custom Webhook.
9. Abra `/admin-canecas/` → **Banners IA**, cole a URL em “Conexão com Make + OpenAI” e clique em **Salvar webhook**.
10. Gere um banner de teste.

## Resposta esperada pelo Admin

O módulo Webhook Response devolve:

```json
{
  "ok": true,
  "request_id": "BN-...",
  "creative_json": {
    "headline": "...",
    "subtitle": "...",
    "cta": "...",
    "alt": "...",
    "visual_prompt": "...",
    "text_color": "#ffffff",
    "accent_color": "#18b8b8",
    "overlay": 0.48,
    "align": "left",
    "product_side": "right"
  },
  "image": {
    "mime": "image/jpeg",
    "b64": "..."
  }
}
```

## Publicação na Loja Integrada

A publicação do banner nativo continua manual/agendada no painel da Loja Integrada porque a API pública não disponibiliza endpoint de banners. O Admin salva os metadados em `canecas/banners_ia` no Firebase e oferece download dos arquivos finais e de um JSON com ALT, link e datas.

## Segurança

A chave da OpenAI fica na conexão do Make. Não coloque API Key no JavaScript, Firebase ou GitHub público.
