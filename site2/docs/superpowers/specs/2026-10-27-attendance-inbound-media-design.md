# Prévia de mídia recebida no Atendimento

## Intenção

Permitir que a equipe entenda imagens, áudios, vídeos e documentos recebidos pelo WhatsApp sem transformar a inbox numa tela técnica. A mídia deve carregar somente quando o atendente solicitar, pois a resolução baixa o arquivo do provedor e o gateway atual o conserva em cache privado.

## O que já existe

- A inbox lista mensagens pelo gateway autenticado `admin-whatsapp-ops-v1?action=conversation`, mas projeta somente tipo, texto, estado e horário. Sem texto, a UI mostra genericamente `Mensagem do tipo ...`.
- O gateway ativo possui `GET action=media`, autenticado como equipe. A implementação remota validada está na versão 39 do gateway e encaminha a um commit histórico fixado no GitHub. A ação aceita `message_id`, busca mídia de Meta ou Papo.ai com limites, valida MIME, grava cache privado por até 30 dias e devolve URL assinada válida por 600 segundos, MIME, nome seguro e validade.
- A ação pode baixar/cadastrar cache, portanto não deve ser chamada automaticamente em cada render nem para todas as 30 mensagens da página.

## Abordagens consideradas

1. Incluir URL ou metadados do provedor no payload da conversa: rejeitada porque exporia identificadores de mídia e acoplava a UI a provedores.
2. Resolver toda mídia durante o carregamento da inbox: rejeitada porque provoca downloads e grava cache sem intenção do atendente, multiplica o custo e pode baixar até 30 arquivos de 20 MB.
3. Carregar sob demanda por Server Action autenticada, usando a ação de mídia do gateway e uma URL assinada curta: escolhida. Preserva o contrato operacional existente, não entrega tokens de provedor ao navegador e limita efeitos ao item que o atendente escolheu.

## Comportamento

- Para `image`, `audio`, `video`, `document` e `sticker` sem texto, a conversa mostra um controle simples para carregar a mídia. O botão indica carregamento e depois apresenta imagem, áudio ou vídeo com controles nativos; PDF e outros arquivos aparecem como link para abrir/baixar.
- O texto de legenda que já vier em `text_body` continua visível junto da mídia.
- Estados de sucesso, indisponível, grande demais, tipo não aceito e erro de conexão são traduzidos para mensagens curtas em português. Erros brutos do gateway, URLs, tokens, IDs do provedor e payloads nunca aparecem na tela ou nos logs do app.
- A URL assinada é validada no servidor: HTTPS (ou mesmo esquema/origem local quando em desenvolvimento), origem igual ao `SUPABASE_URL`, caminho do bucket privado `attendance-media-v1`, token presente, MIME em allowlist e validade futura de no máximo 15 minutos. A URL fica apenas no estado local do componente e não em query string, persistência ou prop de página.
- Recarregar mídia após validade gera nova URL pela mesma ação. O restante do histórico mantém seu comportamento atual.

## Limites

- Esta fatia trata somente visualização de mídia recebida; não envia arquivos, áudio, botões, templates ou mensagens interativas.
- A autorização de negócio continua no `admin-whatsapp-ops-v1`. O app confere sessão Supabase antes da chamada e não consulta tabelas operacionais diretamente.
- Sem arquivo recuperável, permissão Meta, MIME suportado ou URL válida, a mídia permanece oculta e a inbox segue utilizável.
- Nenhuma migration, publicação, envio de mensagem ou escrita Bling faz parte desta mudança.

## Aceite

1. Mensagens de imagem/áudio/vídeo/documento/figurinha não aparecem como texto genérico; têm rótulo e ação de carregamento sob demanda.
2. A ação passa somente UUID do registro de mensagem ao gateway e valida a projeção da resposta antes de devolver a URL à sessão autorizada.
3. Links assinados expirados podem ser atualizados; URL, token, erro bruto e metadados internos não são persistidos nem exibidos.
4. Texto, carrinho do Catálogo, tentativas do Flow, status, ordenação e envio atual de texto permanecem iguais.
5. `pnpm typecheck`, Biome focado e `git diff --check` passam; nenhum teste automatizado é adicionado ou executado nesta etapa.
