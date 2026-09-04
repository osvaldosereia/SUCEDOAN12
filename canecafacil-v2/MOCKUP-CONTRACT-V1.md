# CanecaFácil · contrato de mockup V1

Este contrato separa a **arte que será impressa** da **composição comercial usada na loja**.

## Saídas obrigatórias da automação

Para cada caneca finalizada, a automação deve entregar apenas dois arquivos mestres e uma cor:

1. `arte_horizontal`
   - arte real de impressão;
   - horizontal;
   - sem elementos exclusivos do mockup;
   - nunca deve depender da cor de fundo da loja.

2. `mockup_png`
   - PNG com fundo 100% transparente;
   - composição comercial principal;
   - preferencialmente duas vistas da mesma caneca para revelar os dois lados da estampa;
   - sombra da própria caneca permitida dentro do alpha;
   - pequenos elementos ilustrados podem interagir com a caneca, desde que façam parte apenas da apresentação comercial;
   - sem cenário fotográfico, mesa, cozinha, parede ou retângulo de fundo.

3. `fundo`
   - hexadecimal `#RRGGBB`;
   - usado pelo site para pintar o viewport inteiro;
   - o site calcula automaticamente se textos diretos sobre esse fundo devem ser pretos ou brancos.

## Canvas mestre recomendado

O PNG mestre não precisa ter proporção de Story. O Story é o **viewport do site**, não o arquivo do produto.

Recomendação V1:

- canvas: `1600 × 1800 px`;
- alpha real;
- objeto central dentro de uma área segura de aproximadamente 88% do canvas;
- nenhuma caneca cortada nas extremidades;
- nenhuma sombra encostando na borda do canvas;
- composição legível tanto em tela vertical quanto horizontal.

A loja usa `object-fit: contain`; portanto o mesmo arquivo funciona no mobile e no desktop.

## Direção visual

- caneca branca de porcelana com aparência fotográfica limpa;
- uma vista com alça para a esquerda e outra com alça para a direita quando a composição usar duas canecas;
- luz macia;
- sombra curta e suave;
- sem reflexos exagerados;
- sem fundo embutido;
- sem molduras;
- sem texto comercial fora da arte da caneca;
- interação de desenho com o produto deve ser discreta e autoral.

## Derivadas para web

O PNG é o mestre. Uma etapa de GitHub Actions poderá gerar, sem IA adicional:

- WebP com transparência para navegadores;
- AVIF com transparência quando vantajoso;
- miniatura para busca/Explorar/Open Graph.

O banco continua apontando para o mestre e pode guardar as derivadas em campos separados posteriormente.

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
