# SUPERSEDED — 28/10/2026

O proprietário rejeitou Cloudflare. Não seguir esta especificação. A decisão vigente está em `docs/superpowers/plans/2026-10-28-github-pages-static-admin.md`.


# Publicação gratuita do Admin no Cloudflare Workers

## Intenção

Dar acesso ao Admin pela internet usando um endereço `workers.dev`, mantendo o código versionado no GitHub em `osvaldosereia/SUCEDOAN12`, branch `codex/whatsapp-admin-greenfield-20261026`, pasta `site2`. O proprietário não aceita hospedagem paga.

## Estado atual

O Admin usa Next.js 16 com App Router, Server Actions, Proxy, cookies de sessão e módulos `server-only` para conversar com o Supabase. O GitHub Pages hospeda conteúdo estático e não executa esse runtime. O Admin pode continuar sendo desenvolvido localmente com `next dev`.

## Abordagens

1. **GitHub Pages estático — rejeitada.** Exigiria retirar o runtime de servidor e redesenhar partes da autenticação e das ações; exportação estática não atende ao app atual.
2. **Vercel Hobby — rejeitada.** Embora suporte Next.js, seu plano gratuito restringe o uso a projetos pessoais ou não comerciais, incompatível com o Admin da empresa.
3. **Cloudflare Workers Free com OpenNext — escolhida.** Conecta o repositório GitHub, faz deploy automático e executa Next.js no servidor. A documentação oficial confirma suporte a Next 16, Server Actions, SSR e App Router. Next.js 16 `proxy.ts` usa Node por padrão, que ainda não tem suporte estável no adaptador Cloudflare; por isso a atualização de sessão será movida para o Middleware Edge compatível. A conta Free inclui até 100.000 requisições Worker por dia, 10 ms de CPU por invocação e 3.000 minutos mensais de build; exceder limites pode interromper as requisições/builds e não deve habilitar upgrade pago automaticamente.

## Decisões

- Manter Next.js padrão e adicionar o adaptador Cloudflare OpenNext, sem reescrever o app para Vinext.
- Trocar somente a convenção `src/proxy.ts` por `src/middleware.ts` para que a atualização de cookies rode no runtime Edge suportado pelo OpenNext. O helper existente usa `NextRequest`, `NextResponse`, Supabase SSR e Fetch, sem APIs exclusivas do Node. Next.js 16 depreca o nome `middleware`, mas conserva a funcionalidade; a escolha evita a camada Node de Proxy, que OpenNext Cloudflare ainda não oferece.
- A raiz de build no GitHub será `site2`; o ramo inicial será `codex/whatsapp-admin-greenfield-20261026`.
- O Worker terá nome `sucedoan12-admin` e usará o subdomínio gratuito `workers.dev`, sem domínio customizado.
- O login local no preview é só smoke check. Antes de declarar o Admin pronto para pedidos, validar páginas dinâmicas e Server Actions no Worker Free real; o limite de 10 ms de CPU pode interromper essas rotas. Se exceder, não fazer upgrade pago.
- O runtime continua usando somente o Supabase `ssbesxgaijknwsjbsbcz`.
- Não copiar, revelar ou versionar valores de secrets. `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` serão configuradas como Build Variables no Cloudflare; o Next.js as embute nos bundles do cliente e do Worker.
- Não alterar banco, migrations, Edge Functions, Meta, Bling, pedidos ou configuração fiscal durante a hospedagem.
- O deploy efetivo depende do proprietário conectar Cloudflare ao GitHub e fornecer, pelo painel seguro, as variáveis públicas Supabase necessárias ao build. Nenhum plano pago será ativado.

## Referências oficiais verificadas

- Cloudflare OpenNext: https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- Cloudflare Git integration: https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/
- Cloudflare Workers Builds limits: https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
- Cloudflare Workers Free limits: https://developers.cloudflare.com/workers/platform/limits/
- Vercel Hobby terms: https://vercel.com/docs/plans/hobby
