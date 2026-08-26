# Caneca 10

Gerador interno mobile de canecas da Dona Antônia.

## Uso

A entrada operacional é apenas `index.html`.

Fluxo:

1. escolher uma imagem de inspiração pela câmera ou galeria;
2. selecionar os mesmos comandos salvos usados pelo Produção em `canecas/comandos_criacao`;
3. informar uma instrução complementar, se necessário;
4. gerar a arte horizontal 2400×960;
5. executar a catalogação visual sem bloquear a criação caso ela falhe;
6. gerar três mockups: esquerda, direita e centro;
7. salvar a caneca em `/produtos/{id}` como inativa;
8. marcar a criação como `modelo_caneca: true`, mas `modelo_publico: false` e `personalizacao_publica: false`;
9. registrar também o modelo interno em `canecas/modelos_criacao/{id}`.

## Automação

O webhook Make está definido diretamente em `app-v2.js` para facilitar o uso no celular. Não existe configuração de webhook na interface.

Ações utilizadas:

- `generate_mug_art`
- `analyze_mug_product` — opcional / sem trava
- `finalize_mug_product`

A qualidade é sempre `high`.

## Página de resultado público

`resultado.html` e `resultado.js` permanecem nesta pasta apenas por compatibilidade com links já gerados pelo personalizador do site principal. Eles não aparecem na navegação do Caneca 10 e não fazem parte do gerador interno.

A antiga aba de teste `personalizar.html` e seus controladores foram removidos.
