# Plano: publicar o Admin estático em GitHub Pages

## Objetivo

Disponibilizar o novo Admin em `https://donaantonia.com.br/site2/` pelo GitHub Pages existente, sem serviço de hospedagem adicional e sem afetar o site atual ou `/site/admin/`.

## Decisões fixas

- Repositório: `osvaldosereia/SUCEDOAN12`; app-fonte em `site2/`.
- Backend: projeto Supabase `ssbesxgaijknwsjbsbcz`.
- O navegador usa somente URL e chave publicável do Supabase; operações comerciais passam pelas Edge Functions/RPCs existentes com a sessão Auth do usuário.
- GitHub Pages não executa Node.js, SSR, cookies de servidor nem Next.js Server Actions. O código-fonte atual não pode ser publicado diretamente.
- Não alterar DNS, domínio, raiz do site ou o Admin legado. Não publicar Flow comercial, enviar mensagem real, escrever no Bling ou emitir NF-e durante esta etapa.
- Não mesclar o branch de desenvolvimento inteiro em `main`. Publicar apenas arquivos de saída em `site2/`, preservando o conteúdo já publicado.

## Etapas

1. Remover a configuração de Cloudflare/OpenNext que o proprietário rejeitou e manter o diretório-fonte `site2/`.
2. Configurar Next.js para exportação estática com `basePath: "/site2"` no build de publicação e links compatíveis com esse prefixo.
3. Migrar autenticação e proteção de páginas para componentes cliente. Validar a sessão no navegador e exigir vínculo/papel via gateway em cada operação.
4. Substituir páginas e carregadores de servidor por chamadas autenticadas ao gateway Supabase. Substituir Server Actions por chamadas de cliente às funções existentes. Não criar bypass de RLS nem expor `service_role`.
5. Remover rotas dinâmicas incompatíveis com exportação ou convertê-las para caminhos estáticos com o identificador em query string.
6. Gerar `out/` e fazer somente verificações essenciais de arquivos, links/basePath e build; não executar testes automatizados nesta rotina.
7. Preparar uma alteração aditiva baseada na branch que atualmente publica o Pages, contendo apenas `site2/`. Verificar o diff para garantir que raiz e `site/admin/` não mudaram.
8. Publicar e conferir o carregamento de `/site2/login`, autenticação da equipe e a primeira jornada de pedidos antes de considerar o MVP operacional.

## Gate de conclusão

O Admin só fica publicado quando `/site2/login` abre no domínio e os ativos estáticos carregam corretamente. O MVP só fica operacional quando o login autorizado e a jornada de pedido são validados sem afetar pedidos reais. Flow, mensagens Meta, Bling e NF-e permanecem sujeitos aos gates existentes; NF-e continua por último.

## Estado

Plano registrado em 28/10/2026. Ainda falta a conversão estática do app; não anunciar URL online até terminar e publicar o artefato.
