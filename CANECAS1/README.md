# CANECAS1 — Caneca dos Sonhos

Novo projeto de personalização e venda de canecas da Dona Antônia. Esta aplicação foi criada separadamente do personalizador interno já existente no repositório.

## Versão atual

Protótipo visual responsivo para celular e desktop, com:

- galeria social organizada por categorias;
- avaliações com estrelas e favoritos;
- perfil do criador e créditos diários;
- estúdio de personalização em quatro etapas;
- seleção de modelo, upload de foto, nome e frase;
- autorização para publicação da arte;
- simulação da geração e do pedido pelo WhatsApp;
- reutilização de uma criação como modelo.

Nesta etapa, login, Firebase, créditos, geração de imagens e Make ainda estão simulados. As integrações reais serão implementadas na próxima fase.

## Tecnologias

- Next.js 16
- React 19
- TypeScript
- Next.js App Router
- hospedagem atual pelo ChatGPT Sites

## Executar localmente

Requisito: Node.js 22 ou superior.

```bash
npm install
npm run dev
```

## Validação

```bash
npm run lint
npm run build
```

## Site publicado

https://estudio-canecas-dona-antonia.juniorsereia.chatgpt.site

## Próximas etapas

1. Firebase Authentication com Google e acesso por e-mail.
2. Banco de usuários, artes, categorias, avaliações e favoritos.
3. Limite real de duas gerações diárias e crédito adicional por publicação autorizada.
4. Integração do Make para geração das artes.
5. Armazenamento seguro das imagens e moderação da galeria.
6. Pedidos reais pelo WhatsApp e regras de premiação.

## Isolamento

Todo o código deste projeto fica dentro de `CANECAS1/`. Nenhum arquivo da pasta antiga `canecas/` deve ser alterado por este projeto.
