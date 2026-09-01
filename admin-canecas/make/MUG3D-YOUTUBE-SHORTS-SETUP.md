# CanecaFácil — Mug3D → GitHub Actions → YouTube Shorts

## Fluxo final

1. O Admin coloca a caneca na fila com `video_360_status = pending`.
2. O workflow `.github/workflows/gerar-video-360-mug3d.yml` abre o Mug3D com Playwright.
3. A `arte_horizontal` é convertida para PNG e aplicada ao editor completo da caneca.
4. O workflow inicia a gravação WEBM e acompanha visualmente o preview até detectar que a caneca voltou à posição inicial após um giro.
5. O WEBM fica somente na pasta temporária do runner.
6. FFmpeg converte para MP4 vertical 9:16, sem áudio, e comprime para menos de 4,8 MB.
7. O MP4 temporário é enviado por multipart/form-data ao Custom Webhook do Make.
8. O Make publica no YouTube usando o módulo nativo `youtube:uploadVideo`.
9. O Make devolve o ID e o link do YouTube ao GitHub Action.
10. O Action grava no produto apenas `url_video_youtube`, `youtube_short_url`, `youtube_video_id` e o status da geração.
11. O card do Admin passa a mostrar `Ver Short 360°`; a sincronização existente da Loja Integrada usa `url_video_youtube`.
12. Ao terminar a execução, os arquivos WEBM/MP4 temporários desaparecem com o runner. Nenhum vídeo é commitado no repositório.

## Ativação única no Make

1. No Make, crie um cenário vazio e use **Import Blueprint**.
2. Importe `admin-canecas/make/CANECA-FACIL-MUG3D-YOUTUBE-SHORTS-V1.blueprint.json`.
3. Abra o primeiro módulo **GitHub Actions - receber MP4 temporário**.
4. Crie um Custom Webhook chamado `Caneca Facil - Mug3D YouTube`.
5. No webhook, em **Advanced settings → Data structure**, crie o campo `video` como **Collection** e dentro dele:
   - `name`: Text
   - `mime`: Text
   - `data`: Buffer
6. Acrescente também como Text os campos `product_key`, `title`, `description`, `privacy_status`, `embeddable` e `notify_subscribers`.
7. No módulo **Publicar como vídeo vertical / Short**, confirme a conexão existente do YouTube. O blueprint foi preparado para a conexão já usada nas automações da conta.
8. Confirme estas opções:
   - Privacy: Public
   - Allow Embedding: Yes
   - Notify Subscribers: No
   - Made for kids: No
9. Salve o cenário e deixe-o ativo/imediato.
10. Copie a URL do Custom Webhook.

## Ativação única no GitHub

No repositório `osvaldosereia/SUCEDOAN12`, crie o secret de Actions:

- Nome: `MAKE_YOUTUBE_WEBHOOK_URL`
- Valor: URL do Custom Webhook criado acima.

O workflow usa esse secret para enviar o MP4 temporário ao Make. Não coloque a URL do webhook em JavaScript público.

## Teste

1. Abra o Criador de Canecas no Admin.
2. Em uma caneca com `arte_horizontal`, clique em **Gerar vídeo 360°**.
3. O card deve passar por: fila → GitHub gerando → YouTube.
4. Quando o produto receber `video_360_status = ready`, aparece **Ver Short 360°**.
5. O vídeo deve abrir incorporado no Admin e a URL deve estar salva em `url_video_youtube`.

## Observações

- O workflow também roda a cada 5 minutos como recuperação da fila.
- Se o botão conseguir disparar `workflow_dispatch` pelo token GitHub configurado no Admin, a execução começa imediatamente.
- O upload do Make é mantido abaixo de 5 MB. Se necessário, o workflow faz uma segunda compressão automática.
- O vídeo final é 9:16 e curto, adequado para classificação como Short pelo YouTube.
