# Admin Dona Antônia em `/site2` — Design

## Intenção

Manter o site atual e o Admin existente em `https://donaantonia.com.br/site/admin/` sem alterações, e disponibilizar o novo Admin Next.js em `https://donaantonia.com.br/site2`.

## Estado e restrições

- O `CNAME` da branch `main` associa `donaantonia.com.br` ao repositório `osvaldosereia/SUCEDOAN12`; o domínio atual responde com arquivos estáticos do GitHub Pages.
- O domínio usa nameservers `e.sec.dns.br` e `f.sec.dns.br`; os registros públicos apontam o domínio raiz ao GitHub Pages e `www` a `osvaldosereia.github.io`.
- O Admin novo usa Next.js App Router, autenticação por cookies, Server Actions e SSR. Guardar a pasta em `site2` não faz o GitHub Pages executar esse servidor.
- Não alterar o domínio, nameservers, registros DNS, GitHub Pages, `/site/admin/`, banco Supabase, Meta, Bling ou dados comerciais nesta mudança.
- Não contratar plano pago nem adicionar ou executar testes automatizados.

## Abordagens

1. **Publicar o novo Next.js como arquivos estáticos no GitHub Pages:** descartada porque o Admin depende de recursos de servidor que a exportação estática não executa.
2. **Iframe ou redirecionamento para `workers.dev`:** descartado como destino final porque não preserva um Admin integrado de forma confiável em `/site2`, especialmente para a sessão autenticada.
3. **Cloudflare Worker para `/site2*` e GitHub Pages para os demais caminhos:** escolhida. O Worker executa o Next.js com OpenNext e a opção `basePath` do Next.js prefixa links e recursos. Cloudflare Routes exige uma zona ativa e DNS proxied no Cloudflare; a configuração de domínio só será possível depois de o proprietário migrar os nameservers, preservando todos os registros existentes.

## Decisões de implementação

- Definir `basePath` pelo build variable não secreto `NEXT_PUBLIC_BASE_PATH`; valor do deploy desejado: `/site2`. Sem essa variável, o desenvolvimento local continua na raiz.
- Manter o Worker com `workers.dev` como destino disponível durante a configuração; não registrar a rota personalizada em `wrangler.jsonc` antes de a zona Cloudflare estar ativa.
- Após a configuração de DNS, adicionar a rota `donaantonia.com.br/site2*` ao Worker pelo painel Cloudflare. A raiz e `/site/admin/` continuam indo ao GitHub Pages.
- O proprietário deve copiar e conferir no Cloudflare todos os registros atuais antes de alterar os nameservers no Registro.br. A alteração pode afetar site e e-mail; o agente não a executará.

## Critérios de validação

- A build com `NEXT_PUBLIC_BASE_PATH=/site2` serve login e assets com prefixo `/site2` no preview local do Worker.
- A build sem `NEXT_PUBLIC_BASE_PATH` mantém o caminho local existente.
- Depois de uma rota real ser criada, confirmar `/site2/login` e as páginas autenticadas do Admin no Worker, e conferir que `/` e `/site/admin/` continuam servidos pelo GitHub Pages.
- Nenhuma disponibilidade no domínio será alegada antes de o domínio resolver pelo Worker e as rotas necessárias passarem pela validação autenticada.
