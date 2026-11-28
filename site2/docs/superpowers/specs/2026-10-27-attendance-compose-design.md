# Atendimento: composer de respostas rápidas e mídia

> Escopo histórico: este documento descreve a fatia de mídia/respostas rápidas. A proibição antiga de adicionar botão/lista genéricos foi substituída pelo contrato tipado e pelo backend isolado registrados em `docs/superpowers/specs/2026-10-27-attendance-interactive-messages-design.md`. Catálogo/Flow continuam em ações próprias.

## Objetivo

Completar o composer da inbox com inserção de respostas rápidas cadastradas e envio humano de anexos pela biblioteca privada já suportada pelo gateway ativo. A operação deve continuar simples: selecionar, revisar e enviar.

## Decisões fechadas

1. Resposta rápida preenche o campo de texto; nunca envia automaticamente. O atendente ainda revisa e clica em **Enviar**.
2. Arquivos sobem diretamente ao bucket privado `attendance-library-v1` por upload assinado. O servidor Next não recebe o corpo binário, evitando seu limite de payload.
3. A sequência de anexo é: validar tipo/tamanho no navegador, reservar item pelo gateway, gerar e subir miniatura JPEG quando for imagem, enviar original ao Storage com token de uso limitado, finalizar item no gateway, e só então habilitar **Enviar mídia**.
4. O envio passa por `library_send` com o ID da conversa, ID do item, legenda e chave de idempotência. O navegador não escolhe telefone, conta, `phone_number_id` nem destinatário.
5. Upload finalizado não dispara uma mensagem. O atendente executa explicitamente o envio.
6. A lista de respostas rápidas só oferece texto. Não afirmar que ela envia botão interativo.
7. Não adicionar um endpoint genérico de botão/lista/carrossel. A versão ativa do gateway não oferece ação arbitrária para esses formatos. Os fluxos de cesta e confirmação de pedido existentes preservam seus endpoints próprios.
8. Erros de envio incerto não geram reenvio automático. A UI bloqueia o composer de mídia até o atendente marcar explicitamente que conferiu a conversa; uma nova tentativa então recebe nova chave idempotente.

## Contratos remotos conferidos

- Projeto Supabase canônico: `ssbesxgaijknwsjbsbcz`.
- Edge Function `admin-whatsapp-ops-v1`: ativa, versão 39, import aponta para o commit `13d10dfcaa925340b0ce17011498cb6a502572fa` do repositório `osvaldosereia/SUCEDOAN12`.
- Ações existentes: `GET quick_replies`, `GET library_list`, `GET library_preview`, `POST library_upload_prepare`, `POST library_upload_complete`, `POST library_send`, além de `POST send_media` multipart.
- A reserva/finalização usa os RPCs `ops2_admin_attendance_library_reserve_v1` e `ops2_admin_attendance_library_finalize_v1`; o envio utiliza a fila Meta idempotente já existente.
- O `reserve` gera caminho `items/<uuid>/asset.<ext>` e, para imagem, `items/<uuid>/thumb.jpg`. O `finalize` exige que o objeto de miniatura exista quando `thumbnail_path` estiver preenchido; a miniatura é obrigatória para imagens.
- Upload assinado Supabase: `createSignedUploadUrl` retorna caminho/token; cliente JavaScript usa `storage.from(bucket).uploadToSignedUrl(path, token, file, options)`.
- MIME/tamanho do sender Meta existente: JPEG/PNG até 5 MB; áudio e vídeo permitidos até 16 MB; documentos permitidos até 25 MB. O sender valida conteúdo, não só extensão/MIME informado pelo navegador.
- A janela de atendimento, homologação/canário, autorização e incerteza são aplicadas no gateway. A interface não substitui essas validações.

## Interface

- Respostas rápidas: seletor compacto ao lado/antes da caixa de texto. Escolher uma resposta copia o conteúdo à caixa; editar e enviar seguem o fluxo atual.
- Anexo: botão **Anexar arquivo** junto ao composer, estados visíveis de preparação, upload, pronto e erro. Depois do upload, mostrar nome e tamanho e pedir ação explícita **Enviar mídia**.
- Legenda opcional limitada a 1.024 caracteres; o backend remove a legenda para áudio conforme o contrato Meta.
- Mostrar uma mensagem específica quando a janela ou homologação bloquear envio. Se o resultado for incerto, instruir conferência da conversa sem oferecer repetição automática.
- Manter a UI bloqueada quando `conversation.canSendText` for falso; o gateway continua fonte final de autorização.

## Tipos e limites iniciais no navegador

- Imagens: `image/jpeg`, `image/png`, até 5 MiB.
- Áudios: `audio/aac`, `audio/amr`, `audio/mpeg`, `audio/mp4`, `audio/ogg`, até 16 MiB.
- Vídeos: `video/mp4`, `video/3gpp`, até 16 MiB.
- Documentos: `application/pdf`, `text/plain`, DOC/DOCX, XLS/XLSX e PPT/PPTX, até 25 MiB.
- O MIME do navegador é somente filtro de UX; o gateway e a validação de bytes do servidor são autoritativos. Formatos não aceitos exibem instrução curta de conversão.

## Segurança e operação

- Todas as Server Actions exigem `requireAdminSession()` e reaproveitam a sessão Supabase existente.
- Retornar à UI somente campos projetados: IDs UUID, tipo, MIME allowlisted, nome higienizado, tamanho e estados/códigos mapeados. No upload, devolver só o token efêmero e o caminho esperado; a UI usa o bucket fixo e o token não é persistido. URLs assinadas de preview continuam limitadas à origem/bucket esperados.
- Token assinado de upload é capability temporária, usada exclusivamente no Storage. Não registrar em logs, URL de retorno, banco local ou HTML persistido.
- A chave de idempotência é nova por envio de mídia. Nunca repetir automaticamente após timeout/`meta_send_uncertain`.
- Nenhuma migration ou deploy é necessário para este recorte. Não executar envio real durante a implementação.

## Critérios de aceite

- A inbox mantém o envio de texto existente.
- Selecionar resposta rápida preenche a caixa sem enviar e o atendente consegue editar.
- Arquivo incompatível ou acima do teto não gera URL assinada nem grava no Storage.
- Arquivo válido pode ser preparado e enviado ao Storage pelo browser, depois finalizado no gateway.
- Imagem só fica pronta depois que a miniatura JPEG também for enviada e o `finalize` confirmar ambos os objetos.
- A ação de envio recebe apenas UUID da conversa/item, legenda e idempotency key; nenhum destino arbitrário entra na requisição.
- O usuário precisa apertar **Enviar mídia** e resultados incertos nunca levam a retry automático.
- A lista de mídia privada pode ser carregada para reutilizar item pronto.
- Typecheck, verificação focada de lint/formatação e build local são executados; nenhum teste automatizado ou envio externo é executado.

## Limites que continuam

- Botões/listas/carrosséis arbitrários continuam indisponíveis até existir contrato aprovado e validado no gateway/Meta.
- Validação ponta a ponta requer sessão autorizada e homologação no canal Meta; esta implementação local não libera produção.
