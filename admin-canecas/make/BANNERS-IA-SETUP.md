# Banners IA — Admin Canecas + Make + OpenAI

## Regra correta do Novo Tema Padrão da Loja Integrada

A Loja Integrada permite **imagem de desktop e imagem específica para celular em todos os tipos de banner**. No nosso gerador isso não é opcional: cada criação deve gerar **2 arquivos independentes**, um para Desktop e outro para Celular.

A imagem mobile não deve ser apenas um recorte automático da arte desktop. A automação V2 pede uma composição própria para cada dispositivo e o navegador finaliza cada uma separadamente.

### Medidas usadas pelo Admin

- **Full Banner**
  - Desktop: **1270×444 px**
  - Celular: **722×888 px** (2x da proporção 361×444 recomendada pela Loja Integrada para melhor nitidez)
- **Banner Tarja**
  - Desktop: **1270×70 px**
  - Celular: **361×70 px**
- **Banner Vitrine**
  - Desktop: **850×200 px**
  - Celular: **722×170 px** no nosso gerador, mantendo a proporção aproximada dentro do limite mobile da plataforma
- **Mini Banner**
  - Desktop: **720×400 px**
  - Celular: **720×400 px**, porém com uma geração independente/recomposta para mobile

A documentação do Novo Tema Padrão informa que Vitrine e Mini podem reutilizar a mesma imagem do desktop, mas o painel aceita imagem específica para celular. Para manter qualidade e controle visual, o CanecaFácil gera sempre as duas versões.

Cada arquivo final deve ser **JPG ou PNG** e ter no máximo **500 KB**. O Admin exporta JPEG e tenta reduzir progressivamente a qualidade para ficar abaixo desse limite.

## O que foi corrigido

1. O Admin antigo usava medidas desatualizadas (`1920×300` para Full e `360×200` para Mini).
2. O Admin antigo trabalhava com apenas um fundo e redimensionava/cortava para mobile.
3. O blueprint antigo devolvia `{{3.data[].b64_json}}`, mas a saída atual do módulo GPT Image do Make fornece arquivo/binário (`resImgData` / `fileData`), não esse campo.
4. O Admin antigo esperava uma URL de imagem, enquanto o cenário anexado tentava devolver Base64.
5. A V2 padroniza o contrato: o Make devolve `creative_json` + `images.desktop.b64` + `images.mobile.b64`.

## Arquivos atuais

- Admin: `../banner-manager-v3.js`
- Blueprint correto: `CANECA-FACIL-BANNERS-IA-V2.blueprint.json`

## Instalação do cenário Make V2

1. No Make, crie um cenário vazio.
2. Use **Import Blueprint** e importe `CANECA-FACIL-BANNERS-IA-V2.blueprint.json`.
3. Abra o módulo **Admin Canecas - Receber pedido de par de banners** e crie/seleciona um Custom Webhook exclusivo para banners.
4. Nos três módulos OpenAI, selecione a sua conexão OpenAI.
5. Módulo de texto: mantenha um modelo compatível com Chat Completions + JSON Object.
6. Módulo de imagem Desktop: GPT Image, `1536x1024`, JPEG.
7. Módulo de imagem Mobile: GPT Image, `1024x1024`, JPEG. O prompt faz a recomposição para a proporção final solicitada pelo Admin.
8. No Webhook Response, mantenha os dois buffers convertidos com a função `base64()` do Make.
9. Salve o cenário e deixe-o ativo como webhook instantâneo.
10. Copie a URL do Custom Webhook.
11. Abra `/admin-canecas/` → **Banners IA**, cole a URL e clique em **Salvar webhook**.
12. Gere um teste. A resposta só será aceita se vierem as duas imagens.

## Contrato esperado pelo Admin V3

```json
{
  "ok": true,
  "request_id": "BN-...",
  "creative_json": {
    "headline": "...",
    "subtitle": "...",
    "cta": "...",
    "alt": "...",
    "visual_prompt_desktop": "...",
    "visual_prompt_mobile": "...",
    "text_color": "#111111",
    "accent_color": "#18b8b8",
    "overlay": 0.48
  },
  "images": {
    "desktop": {
      "mime": "image/jpeg",
      "b64": "..."
    },
    "mobile": {
      "mime": "image/jpeg",
      "b64": "..."
    }
  }
}
```

## Publicação na Loja Integrada

O Admin gera os dois arquivos prontos para upload e salva os metadados/histórico em `canecas/banners_ia` no Firebase. A publicação nativa continua pelo painel da Loja Integrada enquanto não houver endpoint público de banners documentado na API pública.

No painel da Loja Integrada, cadastre o banner e envie:

- **Imagem do banner** → arquivo Desktop
- **Imagem do banner para celular** → arquivo Celular
- Link, período/agendamento e demais campos conforme a campanha

## Segurança

A chave da OpenAI fica somente na conexão do Make. Não coloque API Key no JavaScript, Firebase ou GitHub público.
