# CanecaFácil V2 — loja própria

Nova base isolada do Admin Canecas antigo e da Loja Integrada.

## Objetivo desta fase

- storefront próprio, ultraleve, sem framework;
- uma caneca ativa por visor/tela, com o fundo do site assumindo a cor do produto;
- mockup principal em PNG transparente, podendo conter duas canecas, sombra e elementos gráficos externos;
- contraste automático de textos que ficam diretamente sobre a cor do produto;
- favoritos em `localStorage`;
- compartilhamento por Web Share API com fallback para copiar link;
- busca e modo explorar;
- personalização integrada em overlay sem quebrar a linguagem visual;
- admin novo, simples e modular;
- sem pagamento nesta fase.

## Estrutura de dados

Nó Firebase novo e independente:

`canecafacil_v2`

### `canecafacil_v2/config`

```json
{
  "preco_padrao": 24.9,
  "marca": "CanecaFácil"
}
```

### `canecafacil_v2/produtos/{id}`

```json
{
  "nome": "Descanso entre séries",
  "slug": "descanso-entre-series",
  "ativo": true,
  "categoria": "Academia",
  "subcategoria": "Humor",
  "preco": 0,
  "mockup_png": "https://.../mockup.png",
  "arte_horizontal": "https://.../arte-horizontal.png",
  "fundo": "#FF6B1A",
  "personalizavel": true,
  "personalizador_modelo_key": "chave-do-produto-antigo",
  "descricao_curta": "...",
  "ordem": 10,
  "criado_em": "ISO",
  "atualizado_em": "ISO"
}
```

`preco = 0` significa usar o preço global.

## Personalização

Por enquanto o novo site reutiliza o personalizador existente em um overlay full-screen. O Admin possui o campo `personalizador_modelo_key`; isso permite ligar uma caneca V2 a um modelo já existente sem obrigar a migração imediata.

URL embutida:

`https://donaantonia.com.br/loja-integrada/personalizar/?model={key}&embed=1`

Depois podemos migrar o editor para um módulo nativo V2 sem mudar a interface pública.

## Cor e contraste

O produto controla `fundo`. O front calcula a luminância e escolhe automaticamente entre texto quase preto e branco conforme o maior contraste. As barras flutuantes continuam brancas.

## Segurança

Esta primeira versão do Admin usa a mesma API REST do Firebase já utilizada no projeto e deve ser tratada como protótipo operacional. Antes de publicar o Admin em URL pública, incluir Firebase Auth + regras de escrita restritas. Nenhum token de pagamento deve ser colocado no front-end.
