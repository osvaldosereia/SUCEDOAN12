# Upload e busca de imagens no cadastro de produtos

## Intenção
Permitir anexar ou trocar a imagem no cadastro de produtos e localizar uma foto pelo Google Imagens, mantendo o uso simples no admin.

## Estado atual
O formulário oferece apenas o campo `image_url`. A vitrine já lê esse campo. O bucket público `product-images` existe, e a função `site-admin-v1` valida o código administrativo e usa a chave de serviço do Supabase.

## Desenho aprovado
- O formulário mantém o campo de URL e ganha seletor de arquivo, prévia, botão Anexar/Trocar imagem e botão de busca.
- A busca abre o Google Imagens em outra aba com marca e nome do produto. O operador escolhe a imagem e a anexa; a busca não baixa imagens automaticamente.
- Ao selecionar o arquivo, o navegador converte para WebP (JPEG como fallback), reduz dimensões/qualidade quando necessário e mantém a saída em até 51.200 bytes.
- Ao salvar o produto, o arquivo comprimido segue para `site-admin-v1`; a função valida tipo e tamanho e grava no bucket existente. O endereço público retorna ao campo `image_url`.
- O servidor não recebe a imagem original em alta resolução. A verificação do tamanho no servidor impede que uma requisição alterada ultrapasse o limite.
- Nenhuma alteração global no bucket, coluna, política de escrita, nem mudança nos outros fluxos de imagens.

## Alternativas consideradas
- Manter apenas URL e incluir busca: não resolve o anexo direto.
- Fazer upload direto do navegador para Storage: exige ampliar permissões do Storage para o admin.
- Usar a função autenticada existente e o bucket atual: selecionada por aproveitar a autorização já usada pelo cadastro e não expor credenciais de escrita.

## Limites
A busca Google abre resultados; o usuário escolhe e salva a foto antes de anexar. A função não inclui recorte ou edição manual da imagem.
