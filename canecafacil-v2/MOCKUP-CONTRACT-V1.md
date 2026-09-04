# CanecaFácil · contrato de mockup V1

Este contrato separa a **arte que será impressa** da **composição comercial usada na loja**.

## Saídas obrigatórias da automação

Para cada caneca finalizada, a automação deve entregar apenas dois arquivos mestres e uma cor:

1. `arte_horizontal`
   - arte real de impressão;
   - horizontal;
   - sem elementos exclusivos do mockup;
   - nunca deve depender da cor de fundo da loja;
   - arquivo de produção: não aparece como imagem adicional na vitrine pública.

2. `mockup_png`
   - PNG com fundo 100% transparente;
   - composição comercial principal;
   - **uma única caneca por arquivo e por visor**;
   - formato vertical para ser reutilizado sem alteração no mobile e no desktop;
   - sombra da própria caneca permitida dentro do alpha;
   - pequenos elementos ilustrados podem interagir com a caneca, desde que façam parte apenas da apresentação comercial;
   - sem cenário fotográfico, mesa, cozinha, parede ou retângulo de fundo;
   - nenhum segundo mockup ou segunda caneca dentro da composição.

3. `fundo`
   - hexadecimal `#RRGGBB`;
   - usado pelo site para pintar o viewport inteiro;
   - o site calcula automaticamente se textos diretos sobre esse fundo devem ser pretos ou brancos.

## Canvas mestre recomendado

O mesmo arquivo deve funcionar no celular e no desktop.

Recomendação V1:

- canvas: `1200 × 1600 px` (3:4 vertical);
- alpha real;
- uma caneca central, grande e inteira;
- objeto dentro de uma área segura de aproximadamente 86% do canvas;
- alça e sombra nunca cortadas;
- nenhuma sombra encostando na borda do canvas;
- composição equilibrada para funcionar tanto em viewport 9:16 quanto em tela horizontal.

A loja usa `object-fit: contain`; portanto não existe uma versão desktop e outra mobile do mockup.

## Direção visual

- uma caneca branca de porcelana com aparência fotográfica limpa;
- perspectiva padrão consistente entre todos os produtos;
- luz macia;
- sombra curta e suave;
- sem reflexos exagerados;
- sem fundo embutido;
- sem molduras;
- sem texto comercial fora da arte da caneca;
- interação de desenho com o produto deve ser discreta e autoral;
- a caneca é sempre o único produto protagonista do visor.

## Derivadas para web

O PNG é o mestre. Uma etapa de GitHub Actions poderá gerar, sem IA adicional:

- WebP com transparência para navegadores;
- AVIF com transparência quando vantajoso;
- miniatura técnica para compartilhamento/SEO quando necessário.

Essas derivadas não mudam a composição e não criam imagens extras na experiência da loja.

## Contrato de dados V1

```json
{
  "nome": "Descanso entre séries",
  "categoria": "Academia",
  "subcategoria": "Humor",
  "arte_horizontal": "https://.../arte-horizontal.png",
  "mockup_png": "https://.../mockup-transparente.png",
  "fundo": "#95DDD0",
  "personalizavel": true,
  "ativo": true
}
```

## Regra de contraste

A cor do texto não deve ser cadastrada manualmente por produto. O storefront calcula luminância e escolhe automaticamente entre:

- `#111111` para fundos claros;
- `#FFFFFF` para fundos escuros.

Isso vale para título, preço, descrição e controles que ficam diretamente sobre a cor do produto. As barras flutuantes permanecem brancas com ícones pretos para preservar a identidade da interface.
