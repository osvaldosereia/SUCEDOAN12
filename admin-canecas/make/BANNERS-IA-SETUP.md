# Banners IA — Admin Canecas + Make + OpenAI

## Fluxo atual

O gerador trabalha com **2 artes independentes por criação**: Desktop e Celular. As artes finais são salvas no próprio Admin Canecas e o envio para a Loja Integrada é **manual**.

Fluxo: **Admin Canecas → Make/OpenAI → Desktop + Celular → biblioteca de banners do Admin → download manual → upload na Loja Integrada**.

Não existe tentativa de publicação automática de banner na Loja Integrada.

## Medidas usadas pelo Admin

- Full Banner: Desktop **1270×444 px**; Celular **722×888 px**.
- Banner Tarja: Desktop **1270×70 px**; Celular **361×70 px**.
- Banner Vitrine: Desktop **850×200 px**; Celular **722×170 px**.
- Mini Banner: Desktop **720×400 px**; Celular **720×400 px**, porém com composição independente.

Cada arquivo final é exportado em JPEG e o Admin tenta mantê-lo em até **500 KB**.

## Admin V4

Arquivo principal: `../banner-manager-v4.js`.

A área Banners IA agora possui:

- seleção visual de várias canecas, com foto e busca;
- até 6 canecas em uma mesma composição;
- instruções/campos reutilizáveis salvos em `canecas/banner_comandos`;
- geração separada Desktop + Celular;
- composição final com hierarquia tipográfica, gradiente de contraste, CTA e preço opcional;
- biblioteca de banners salvos;
- miniatura de cada banner;
- abrir banner salvo;
- baixar Desktop novamente;
- baixar Celular novamente;
- botão **Usar dados novamente**, que recarrega formato, campanha, oferta, preço, headline, CTA, link, estilo, variação, datas, observações, canecas e instruções usadas;
- apagar banner e suas duas imagens.

Os metadados ficam em `canecas/banners_ia` e as duas artes finais em `canecas/banners_ia_assets`, para que o histórico não precise carregar todas as imagens pesadas de uma vez.

## Automação V3 — Design profissional

Blueprint recomendado: `CANECA-FACIL-BANNERS-IA-V3-DESIGN-PROFISSIONAL.blueprint.json`.

A V3 melhora a direção criativa e troca a geração de imagem para qualidade **High**. O OpenAI é instruído a atuar como Diretor Criativo Sênior especializado em e-commerce, CRO, canecas e presentes personalizados.

O módulo de copy devolve: `eyebrow`, `headline`, `subtitle`, `cta`, `alt`, `visual_prompt_desktop`, `visual_prompt_mobile`, `text_color`, `accent_color`, `overlay`, `layout_style` e `product_treatment`.

Os fundos gerados não devem conter texto nem produtos. O Admin aplica as fotos reais das canecas selecionadas e finaliza a arte, evitando letras erradas e produtos inventados pela IA.

A automação também recebe:

- `products_summary` com as canecas selecionadas;
- `custom_instructions` com os campos reutilizáveis marcados;
- `banner.ai_desktop_size` e `banner.ai_mobile_size` para usar orientação de geração mais adequada ao formato final.

## Instalação no Make

1. Importe `CANECA-FACIL-BANNERS-IA-V3-DESIGN-PROFISSIONAL.blueprint.json`.
2. No primeiro módulo, selecione/crie o Custom Webhook de banners.
3. Nos três módulos OpenAI, selecione a conexão OpenAI.
4. Mantenha **Sequential processing desativado**, pois o cenário usa Webhook Response.
5. Os dois módulos GPT Image devem ficar em **High**.
6. Salve e ative o webhook instantâneo.
7. Copie a URL e salve em `/admin-canecas/` → Banners IA.

## Contrato de resposta

```json
{
  "ok": true,
  "request_id": "BN-...",
  "creative_json": {
    "eyebrow": "...",
    "headline": "...",
    "subtitle": "...",
    "cta": "...",
    "alt": "...",
    "visual_prompt_desktop": "...",
    "visual_prompt_mobile": "...",
    "text_color": "#111111",
    "accent_color": "#18b8b8",
    "overlay": 0.40,
    "layout_style": "premium-editorial"
  },
  "images": {
    "desktop": {"mime": "image/jpeg", "b64": "..."},
    "mobile": {"mime": "image/jpeg", "b64": "..."}
  }
}
```

## Loja Integrada

A publicação é manual. No painel da Loja Integrada, envie o arquivo **Desktop** no campo de imagem principal do banner e o arquivo **Celular** no campo de imagem específica para celular. Link, período e demais configurações são definidos no painel conforme a campanha.

## Segurança

A chave da OpenAI permanece somente na conexão do Make. Não coloque API Key no JavaScript, Firebase ou GitHub público.
