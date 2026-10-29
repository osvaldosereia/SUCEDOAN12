# Upload e busca de imagem de produto — Plano de implementação

> **Para executores agentes:** usar `superpowers:executing-plans` para implementar as tarefas nesta sessão. As etapas usam caixas de seleção.

**Objetivo:** permitir buscar uma imagem no Google Imagens e anexar/trocar a foto de um produto com arquivo final de até 51.200 bytes.

**Arquitetura:** o admin comprime e pré-visualiza no navegador; ao salvar, a função autenticada `site-admin-v1` valida e envia o arquivo ao bucket público `product-images`, gravando a URL já suportada em `products.image_url`.

**Stack:** JavaScript sem framework, Canvas/WebP (JPEG como fallback), Supabase Edge Function com supabase-js existente e Supabase Storage.

**Especificação:** `docs/superpowers/specs/2026-10-29-admin-product-image-upload-design.md`

## Restrições globais

- Limite final: 51.200 bytes, verificado no navegador e na função.
- O campo `image_url` e o bucket atual permanecem como destino.
- Escrita no Storage ocorre apenas dentro da função autenticada com código de admin.
- A busca Google abre resultados em outra aba usando marca e nome do produto.
- Nenhuma alteração global no limite do bucket nem nas permissões de upload do navegador.

## Arquivos e responsabilidades

- `site/admin/index.html`: controles de arquivo, prévia e busca no editor de produto.
- `site/admin/admin.css`: layout responsivo dos controles e da prévia.
- `site/admin/catalog-admin.js`: compressão, prévia, busca Google e inclusão do arquivo comprimido ao salvar.
- `supabase/functions/site-admin-v1/index.ts`: validação binária, upload autenticado e persistência da URL.
- `docs/superpowers/specs/2026-10-29-admin-product-image-upload-design.md`: registro do desenho.

## Pontos de revisão

1. Arquivo grande: a compressão reduz dimensões/qualidade e nunca permite envio acima de 51.200 bytes.
2. Formato inesperado ou dados base64 inválidos: a função rejeita antes do Storage.
3. Falha no upload: o cadastro permanece aberto e a URL antiga não é substituída.
4. Falha ao salvar a linha do produto após upload: a função remove o novo objeto para evitar arquivo órfão.
5. Produto novo sem nome/marca preenchidos: a busca abre Google Imagens com os termos disponíveis; não altera o cadastro.

---

### Tarefa 1: Interface e compressão no navegador

**Arquivos:**
- Modificar: `site/admin/index.html`
- Modificar: `site/admin/admin.css`
- Modificar: `site/admin/catalog-admin.js`

**Interfaces:**
- Estado interno: arquivo comprimido pendente e URL temporária da prévia.
- Formato enviado: `image_upload: { base64: string, content_type: "image/webp" | "image/jpeg" }`.

- [x] Adicionar seletor de arquivo, prévia, status e os botões Enviar/Trocar e Pesquisar no Google.
- [x] Implementar compressão em Canvas, preservando proporção e reduzindo dimensão/qualidade até produzir no máximo 51.200 bytes; usar JPEG se o navegador não codificar WebP.
- [x] Preencher a busca do Google Imagens com marca e nome, abrindo-a em nova aba.
- [x] Ao salvar, enviar somente o arquivo comprimido junto do payload atual; manter URL manual quando nenhum arquivo for selecionado.
- [x] Conferir sintaxe JavaScript e revisar o layout responsivo do diálogo em desktop/mobile.

### Tarefa 2: Upload autenticado e persistência

**Arquivo:**
- Modificar: `supabase/functions/site-admin-v1/index.ts`

**Interfaces:**
- Entrada opcional de `product_save`: `image_upload.base64` e `image_upload.content_type`.
- Saída: `product.image_url` com a URL pública do objeto criado.

- [x] Rejeitar conteúdo com MIME não permitido, cabeçalho incompatível, base64 inválido ou conteúdo acima de 51.200 bytes.
- [x] Enviar bytes para `product-images` com nome aleatório sob `admin-products/`, sem expor a chave de serviço no browser.
- [x] Gravar a URL pública no mesmo `product_save`; em falha ao salvar o produto, remover o novo objeto antes de retornar o erro.
- [x] Manter o fluxo atual para URLs manuais e os demais campos de produto.

### Tarefa 3: Publicação e conferência

**Arquivos:**
- Todos os arquivos acima.

- [ ] Revisar o diff e executar verificação de sintaxe das telas.
- [ ] Implantar a função Supabase e confirmar resposta ativa.
- [ ] Mesclar a alteração do site e confirmar conclusão da publicação Pages.
- [ ] Conferir no código publicado as quatro garantias: busca Google, prévia, limite de 51.200 bytes e persistência em `image_url`.

