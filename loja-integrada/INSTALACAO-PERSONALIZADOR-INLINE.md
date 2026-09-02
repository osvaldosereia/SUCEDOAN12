# CanecaFácil · Personalizador Inline

> **Documento atualizado para a arquitetura consolidada.**

## Instalação atual

O personalizador não possui mais um código próprio para ser instalado no painel da Loja Integrada.

Manter somente uma entrada global:

- **Descrição:** `BASE UX V1.js`
- **Local:** Rodapé
- **Página:** Todas as páginas exceto checkout
- **Tipo:** JavaScript
- **Código:** conteúdo de `CODIGO-BASE-UX-REMOTO.txt`

O `canecafacil-site-runtime-v1.js` detecta páginas de produto e carrega automaticamente:

`loader-personalizador-inline-producao-v10.js`

## Comportamento

- o personalizador aparece na própria página do produto;
- somente produtos/configurações compatíveis devem ativar a experiência de personalização;
- os campos disponíveis continuam sendo definidos no Admin Canecas;
- a arte-base oficial permanece separada dos dados enviados pelo cliente;
- carrinho, pedido, login, checkout e frete permanecem sob responsabilidade da Loja Integrada;
- recursos comerciais complementares são tratados pelos módulos centrais do GitHub.

## Arquitetura

`BASE UX V1.js` → `canecafacil-site-runtime-v1.js` → `loader-personalizador-inline-producao-v10.js` → módulos do personalizador / backend

Não instalar loaders paralelos, hotfixes antigos ou scripts `personalizador-inline-v2.js` diretamente no painel.

## Arquivos legados

Os arquivos abaixo existem apenas para histórico e estão marcados como **NÃO INSTALAR**:

- `CODIGO-RODAPE-PERSONALIZADOR-PRODUCAO.txt`
- `HOTFIX-PERSONALIZADOR-PRODUTO-V1.txt`

Para visão completa da arquitetura e códigos antigos que devem sair do painel, consulte `ARQUITETURA-CANECA-FACIL-V3.md`.
