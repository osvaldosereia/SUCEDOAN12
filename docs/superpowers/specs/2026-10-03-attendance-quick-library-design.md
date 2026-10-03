# Biblioteca Rápida do Atendimento — Design

Data: 2026-10-03
Status: desenho aprovado em conversa; aguardando revisão da especificação escrita
Repositório: `osvaldosereia/SUCEDOAN12`
Supabase canônico: `ssbesxgaijknwsjbsbcz`

## 1. Objetivo

Criar dentro da Central de Atendimento uma biblioteca compartilhada de mídia reutilizável para apoiar o atendimento ao cliente. A equipe poderá cadastrar imagens de produtos e materiais de apoio, além de vídeos, áudios e documentos; pesquisar e organizar o acervo; selecionar vários itens; e enviá-los para a conversa ativa sem sair do Atendimento.

A solução deve priorizar rapidez no celular e desktop, baixo peso dos arquivos, segurança, rastreabilidade e conformidade com as regras do WhatsApp Business Platform / Meta.

## 2. Escopo aprovado

A Biblioteca Rápida será única e compartilhada entre os canais 0975 e 1018 e entre todos os usuários autorizados do Vitrine Admin.

Inclui:

- galeria de imagens, vídeos, áudios e documentos;
- busca por nome e etiquetas;
- categorias operacionais;
- upload de múltiplos arquivos;
- compactação automática de imagens antes do upload;
- thumbnails para navegação rápida;
- edição de metadados;
- desativação/remoção lógica de itens;
- seleção múltipla de até 10 itens por lote;
- envio sequencial para a conversa ativa;
- auditoria de upload, edição, remoção e envio;
- proteção obrigatória da janela de 24 horas;
- experiência responsiva para celular e desktop.

Não inclui nesta primeira versão:

- transcodificação pesada de vídeo no navegador;
- transcodificação server-side de vídeo/áudio;
- edição avançada de imagem;
- pastas privadas por atendente;
- biblioteca separada por canal;
- CDN público para os arquivos;
- envio de mídia livre fora da janela de 24 horas.

## 3. Princípios de arquitetura

### 3.1 Biblioteca permanente separada do cache temporário

Criar um bucket privado próprio: `attendance-library-v1`.

O bucket atual `attendance-media-v1` continua reservado ao fluxo/cache de mídia das conversas. A biblioteca permanente não deve compartilhar ciclo de vida com esse cache.

### 3.2 Transporte único

O envio deve reaproveitar o pipeline Meta já existente na Central (`send_media` e helpers relacionados), ampliando-o apenas onde necessário para vídeo e documentos adicionais.

Não criar um segundo transporte paralelo de WhatsApp.

### 3.3 Arquivo permanente no Storage

A origem de verdade da Biblioteca será o arquivo privado no Supabase Storage, não o `media_id` da Meta.

Na hora do envio:

1. o backend valida sessão/admin;
2. valida conversa/canal;
3. valida janela de 24h;
4. valida item ativo e tipo/tamanho;
5. lê o arquivo do Storage;
6. faz upload para a Meta;
7. envia a mensagem de mídia;
8. registra resultado e auditoria.

Isso permite reutilizar o mesmo item meses depois sem depender da validade do `media_id` da Meta.

## 4. Segurança e conformidade Meta

### 4.1 Janela de 24 horas é uma regra de backend

Toda mensagem livre da Central deve obedecer à janela de atendimento de 24 horas, incluindo:

- texto livre;
- anexos avulsos;
- imagem;
- vídeo;
- áudio;
- documento;
- respostas rápidas;
- itens enviados pela Biblioteca Rápida.

Fora da janela, o frontend desabilita o envio e o backend também recusa a operação.

A Biblioteca pode continuar aberta para consulta e seleção fora da janela; apenas o envio fica bloqueado.

### 4.2 Templates

Fora da janela de 24h, a Central só pode oferecer mecanismos explicitamente permitidos pela Meta, como templates aprovados já homologados no projeto. A Biblioteca Rápida não deve fornecer qualquer atalho para mídia livre fora da janela.

### 4.3 Validação antes de cada item do lote

Em envio múltiplo, o backend deve revalidar a janela antes de cada item. Se a janela expirar durante um lote, o lote é interrompido imediatamente e os itens restantes não são enviados.

### 4.4 Gates existentes permanecem

Devem continuar obrigatórios:

- autenticação do Admin;
- `send_enabled=true`;
- `human_send_enabled=true`;
- transporte homologado;
- canal ativo;
- destino resolvido server-side a partir da conversa;
- idempotência;
- rate limit;
- demais proteções existentes do pipeline Meta.

## 5. Tipos e limites

Os limites de produto devem ser mais conservadores do que os limites físicos do Storage e compatíveis com o WhatsApp Cloud API.

### 5.1 Imagem

- JPEG e PNG;
- limite Meta atual: 5 MB;
- objetivo operacional após compactação: normalmente abaixo de 1–1,5 MB;
- thumbnail separada e pequena para a grade;
- PNG com transparência relevante pode permanecer PNG;
- fotos comuns devem preferir JPEG otimizado.

### 5.2 Vídeo

- MP4 e 3GPP;
- limite Meta atual: 16 MB;
- MP4 compatível com H.264 e AAC;
- primeira versão apenas valida formato/tamanho;
- sem transcodificação pesada no navegador.

### 5.3 Áudio

- AAC;
- AMR;
- MPEG/MP3;
- MP4/M4A;
- OGG com Opus;
- limite Meta atual: 16 MB.

### 5.4 Documentos

Suportar os MIME types de documento compatíveis com o pipeline Meta, incluindo inicialmente:

- PDF;
- TXT;
- Word (`.doc`, `.docx`);
- Excel (`.xls`, `.xlsx`);
- PowerPoint (`.ppt`, `.pptx`).

A Meta suporta documentos maiores, mas a Dona Antônia adotará limite operacional de 25 MB por arquivo na Biblioteca Rápida. Isso também permanece abaixo do limite global de 50 MB do Storage no plano Free atual.

### 5.5 Limite de lote

Máximo de 10 itens selecionados por envio em lote.

## 6. Compactação e processamento

### 6.1 Imagens

A compactação acontece antes do upload no navegador.

Pipeline:

1. ler arquivo;
2. corrigir orientação quando necessário;
3. reduzir dimensões para limite operacional adequado;
4. converter/compactar;
5. gerar thumbnail;
6. mostrar preview;
7. informar tamanho original e final;
8. enviar versão otimizada para o backend.

Exemplo visual esperado: `4,8 MB → 620 KB`.

Se o processamento falhar, não fazer upload silencioso do original pesado. Mostrar erro claro ao atendente.

### 6.2 Vídeo, áudio e documentos

Na v1:

- validar MIME;
- validar tamanho;
- fazer upload direto;
- não transcodificar.

## 7. Modelo de dados

Criar tabela `attendance_library_items_v1`.

Campos propostos:

- `id uuid primary key`;
- `title text not null`;
- `media_kind text not null` (`image`, `video`, `audio`, `document`);
- `mime_type text not null`;
- `storage_path text not null`;
- `thumbnail_path text null`;
- `original_filename text not null`;
- `original_size_bytes bigint null`;
- `stored_size_bytes bigint not null`;
- `width integer null`;
- `height integer null`;
- `duration_seconds numeric null`;
- `category text null`;
- `tags text[] not null default '{}'`;
- `sort_order integer not null default 0`;
- `is_active boolean not null default true`;
- `created_by uuid not null`;
- `updated_by uuid null`;
- `created_at timestamptz not null default now()`;
- `updated_at timestamptz not null default now()`;
- `deleted_at timestamptz null`;
- `deleted_by uuid null`.

Índices:

- `is_active`;
- `media_kind`;
- `category`;
- `created_at desc`;
- busca por título/tags conforme estratégia escolhida na implementação.

## 8. Auditoria

Registrar criação, edição, desativação e envio.

Para envio, registrar ao menos:

- atendente/admin;
- item da biblioteca;
- conversa;
- customer quando existir;
- canal 0975/1018;
- timestamp;
- janela de 24h válida no momento da tentativa;
- `outbox_id`;
- `message_id` canônico;
- provider message ID Meta quando existir;
- resultado;
- erro normalizado quando falhar.

A implementação pode usar tabela dedicada `attendance_library_send_audit_v1` ou integrar ao padrão de auditoria existente, desde que mantenha os campos acima e consulta simples.

## 9. Storage e acesso

### 9.1 Bucket

Criar bucket privado `attendance-library-v1`.

Nunca tornar esse bucket público.

### 9.2 Acesso pelo navegador

O navegador não deve receber service role nem acesso amplo ao bucket.

Operações de catálogo e Storage devem passar pelo gateway administrativo da Central, que já valida o JWT e `admin_users`.

### 9.3 Preview

O backend gera URLs assinadas de curta duração para preview.

A assinatura serve apenas para visualização temporária. A origem de verdade continua sendo `storage_path`.

### 9.4 Nomes físicos

Usar UUIDs/paths controlados pelo backend, não o nome original como path principal.

Exemplo:

`items/<item_uuid>/original-or-optimized.jpg`

`items/<item_uuid>/thumb.jpg`

## 10. Permissões

Na v1, todo usuário ativo e autorizado do Vitrine Admin pode:

- visualizar;
- buscar;
- selecionar;
- enviar;
- adicionar;
- editar;
- desativar itens.

A implementação deve manter a autorização centralizada no backend do Admin.

Separação de papéis por atendente/manager fica fora do escopo inicial, mas o modelo de auditoria deve permitir adicioná-la depois.

## 11. Exclusão

A ação de remover da Biblioteca faz soft delete:

- `is_active=false`;
- `deleted_at=now()`;
- `deleted_by=<admin>`.

O item desaparece da galeria normal e não pode ser enviado novamente.

O arquivo físico não precisa ser apagado imediatamente. Uma limpeza segura posterior pode remover objetos sem referência operacional.

Remover um item da Biblioteca nunca tenta apagar mensagens já enviadas no WhatsApp e nunca altera o histórico existente.

## 12. API / gateway

Preferência: estender `admin-whatsapp-ops-v1` ou criar um módulo/helper dedicado chamado por ele, preservando o mesmo padrão de autenticação.

Ações esperadas:

### Leitura

- listar biblioteca;
- buscar/filtrar;
- obter preview assinado;
- obter categorias/tags se necessário.

### Escrita

- criar item;
- atualizar metadados;
- desativar item;
- enviar item da biblioteca;
- envio de lote.

A API deve rejeitar qualquer tentativa de enviar para telefone/account fornecido pelo cliente. O destino continua sendo resolvido server-side a partir do `conversation_id`.

## 13. UX da galeria

A Biblioteca abre dentro do Atendimento como drawer/painel integrado, sem navegação para outra página.

### Desktop

- painel lateral ou overlay de largura confortável;
- busca no topo;
- filtros por tipo;
- categorias/tags;
- grade de cards;
- seleção múltipla;
- barra fixa de ações no rodapé.

### Mobile

- drawer de quase tela inteira;
- cards maiores;
- alvos de toque grandes;
- barra de ação fixa.

### Card

Cada card mostra:

- thumbnail/ícone;
- título;
- tipo;
- tamanho;
- categoria quando houver;
- estado de seleção.

### Controles

- `Adicionar à biblioteca`;
- `Editar`;
- `Remover`;
- `Limpar seleção`;
- `Enviar N itens`.

## 14. Upload

O upload aceita múltiplos arquivos.

A tela deve mostrar fila de processamento por item, incluindo:

- aguardando;
- compactando;
- pronto;
- enviando para Storage;
- concluído;
- erro.

Nenhum arquivo deve ser enviado automaticamente para cliente após ser cadastrado na Biblioteca.

## 15. Envio múltiplo

### 15.1 Semântica

Os itens são enviados sequencialmente, um por vez.

Não disparar todos em paralelo.

### 15.2 Idempotência

Cada item do lote recebe chave idempotente própria.

Repetir somente falhas não pode duplicar itens já aceitos.

### 15.3 Progresso

Exibir algo como:

`Enviando 2 de 5`

Resultado final:

`4 enviados · 1 falhou`

### 15.4 Falhas parciais

Se o item 3 falhar:

- itens 1 e 2 permanecem enviados;
- item 3 fica marcado como falha;
- itens 4 e 5 podem continuar somente se a falha não for de segurança/janela.

Erros que interrompem imediatamente o lote:

- `service_window_closed`;
- canal não homologado;
- transporte indisponível;
- sessão/admin inválido;
- conversa/destino inconsistente;
- outras falhas de segurança.

Erros de arquivo individual podem permitir seguir para o próximo item.

### 15.5 Retry

Oferecer `Tentar novamente os que falharam`.

Retry reutiliza idempotência apropriada e não reenvia os já concluídos.

## 16. Estado da janela de 24h na UI

Quando aberta:

- mostrar envio habilitado;
- manter indicador de tempo restante já existente na Central.

Quando fechada:

- Biblioteca continua navegável;
- seleção pode continuar;
- botão de envio fica bloqueado;
- mostrar mensagem clara: `Janela de atendimento encerrada. Mídia livre não pode ser enviada.`

Essa restrição visual não substitui a validação de backend.

## 17. Compatibilidade com o pipeline atual

A implementação deve preservar:

- envio de texto existente;
- anexos avulsos existentes;
- histórico canônico;
- status de entrega;
- canais 0975/1018;
- Humano/ANA;
- templates;
- regras de idempotência e rate limit;
- layout responsivo da Central.

A Biblioteca é uma fonte adicional de anexos; não substitui o composer nem o anexo avulso.

## 18. Testes obrigatórios

### Banco / Storage

- criação de item;
- edição;
- soft delete;
- item inativo não pode ser enviado;
- bucket privado;
- preview assinado;
- autorização administrativa.

### Upload

- JPEG;
- PNG;
- compactação;
- thumbnail;
- múltiplos uploads;
- falha de compactação;
- MIME inválido;
- tamanho acima do limite;
- vídeo válido/inválido;
- áudio válido/inválido;
- documento válido/inválido.

### Biblioteca

- busca;
- categoria;
- tags;
- seleção/deseleção;
- limite de 10;
- mobile;
- desktop.

### Envio

- lote com 1 item;
- lote com 10 itens;
- sucesso integral;
- falha parcial;
- retry somente de falha;
- idempotência;
- troca de conversa durante seleção;
- conversa inexistente;
- item removido antes do envio.

### Compliance Meta

- janela aberta permite envio;
- janela fechada bloqueia frontend;
- janela fechada bloqueia backend;
- janela expira no meio do lote e interrompe restantes;
- tentativa de contornar frontend continua bloqueada;
- 0975;
- 1018.

### Regressão

Continuar executando as suítes atuais da Central/Meta, incluindo os contratos de envio de mídia e os gates de homologação.

## 19. Rollout

Executar em etapas pequenas e revisáveis:

1. banco + bucket + contratos de segurança;
2. API de catálogo;
3. upload + compactação de imagem;
4. galeria e gerenciamento;
5. seleção múltipla;
6. envio da biblioteca pelo pipeline Meta;
7. compliance de 24h e interrupção de lote;
8. auditoria;
9. testes completos;
10. PR final e merge somente após CI verde e verificação em produção sem envio para clientes reais não autorizados.

## 20. Critérios de aceite

A feature só é considerada pronta quando:

- o acervo é compartilhado entre 0975/1018;
- imagens ficam leves após upload;
- galeria é rápida em celular e desktop;
- imagem, vídeo, áudio e documento suportados podem ser cadastrados;
- itens podem ser editados e removidos;
- múltiplos itens podem ser selecionados;
- lote envia sequencialmente;
- retry não duplica mídia já enviada;
- auditoria registra cada tentativa;
- fora da janela de 24h, nenhuma mídia livre sai, mesmo por chamada direta ao backend;
- toda a Central continua obedecendo o gate de 24h para mensagens livres;
- suítes atuais e novas ficam verdes;
- não há regressão nos fluxos existentes de Atendimento.

## 21. Observações de implementação

- Validar novamente os limites/formats suportados pela Meta imediatamente antes de codificar os validators, pois regras externas podem mudar.
- O plano Free atual do Supabase impõe limite global de 50 MB para arquivos; por isso o limite operacional de 25 MB para documentos da Biblioteca é deliberadamente conservador.
- Não expor service role, tokens Meta ou paths privilegiados no frontend.
- Não criar bucket público.
- Não permitir que o navegador determine o número de destino.
- Não confundir upload para a Biblioteca com envio para o cliente.

## 22. Decisões aprovadas

Aprovado pelo usuário durante o desenho:

- biblioteca compartilhada para 0975/1018;
- bucket privado dedicado;
- reaproveitamento do pipeline Meta atual;
- compactação de imagens no navegador;
- vídeo/áudio sem transcodificação pesada na v1;
- documentos com limite operacional de 25 MB;
- máximo de 10 itens por lote;
- envio sequencial;
- soft delete;
- auditoria completa;
- janela de 24h obrigatória no frontend e backend;
- nenhuma mídia livre fora da janela de 24h.
