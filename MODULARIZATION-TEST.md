# Homologação do index modular

Esta versão existe para testar a extração segura do CSS e do JavaScript antes de qualquer alteração no `index.html` de produção.

## Arquivos

- `index-modular-test.html`: página paralela com `noindex`.
- `assets/modular/*.css`: estilos extraídos em três camadas, mantendo a ordem original.
- `assets/modular/*.js`: scripts extraídos por bloco, mantendo a ordem original.
- `scripts/build-modular-index-test.mjs`: regenera a versão paralela a partir do `index.html` atual.
- `scripts/verify-modular-index-test.mjs`: compara byte a byte o conteúdo extraído e verifica a ordem das referências.

## Regenerar e validar

```bash
node scripts/build-modular-index-test.mjs
node scripts/verify-modular-index-test.mjs
for file in assets/modular/*.js; do node --check "$file"; done
```

O `index.html` só deverá ser substituído em outra mudança, após homologação funcional e aprovação explícita.
