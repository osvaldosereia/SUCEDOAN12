# Atendimento: Prévia de Mídia Recebida Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar mídia recebida na conversa sob demanda usando o gateway autenticado atual.

**Architecture:** Um Server Action autenticado valida o UUID e consulta `admin-whatsapp-ops-v1?action=media`. Um parser server-only reduz a resposta a URL assinada curta, MIME, nome seguro e validade; um componente cliente carrega a mídia somente após clique e usa controles HTML nativos.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase SSR, Edge Function `admin-whatsapp-ops-v1` já ativa.

**Spec:** `docs/superpowers/specs/2026-10-27-attendance-inbound-media-design.md`

## Global Constraints

- Nunca expor credencial, metadado bruto, identificador do provedor, URL do provedor, CPF, custo ou payload Meta.
- Chamar a ação de mídia somente após clique; o gateway baixa e guarda a mídia em cache privado.
- Aceitar URL apenas da origem configurada do Supabase e do bucket privado `attendance-media-v1`; validade máxima aceita: 15 minutos.
- Não adicionar migration, upload, envio de mídia, ação Meta de escrita, alteração Bling ou emissão fiscal.
- Não adicionar nem executar testes automatizados; usar typecheck, Biome focado e diff check.

## Review Focus

- UUID arbitrário ou resposta malformada: rejeitar antes de projetar dados.
- URL assinada de outra origem, caminho ou bucket: nunca renderizar como mídia/link.
- Token expirado ou validade maior que o limite: mostrar erro genérico e permitir nova solicitação.
- MIME fora da allowlist atual do gateway: rejeitar; nunca assumir imagem pelo tipo da mensagem.
- Erro Meta, cache, sessão ou permissão: não mostrar corpo bruto nem interromper renderização do restante da conversa.

---

### Task 1: Resolver a mídia pela ação autenticada do gateway

**Files:**
- Modify: `src/lib/supabase/admin-attendance.ts`
- Create: `src/app/(admin)/atendimento/media-actions.ts`
- Modify: `docs/planning/implementation-ledger.md`

**Interfaces:**
- `getAttendanceMessageMedia(messageId: string): Promise<AttendanceMediaResult>` recebe UUID, exige sessão ativa e chama `GET /functions/v1/admin-whatsapp-ops-v1?action=media&message_id=<uuid>`.
- Resultado de sucesso: `{ ok: true, media: { url, mimeType, filename, expiresAt } }`; erro: união curta de códigos internos mapeados para texto genérico na UI.
- A validação aceita MIME suportado pelo gateway (imagem JPEG/PNG/WebP/GIF; áudio OGG/MPEG/MP4/AAC/WAV; vídeo MP4; documentos PDF, Office, ZIP ou binário genérico), URL na mesma origem configurada e prefixo do bucket esperado, token não vazio e expiração dentro de 15 minutos.

- [x] Implementar leitura server-only, sessão Supabase, validação estrita e projeção allowlisted.
- [x] Não devolver conteúdo do erro ou URL inválida; validar que a ação remota retorna `ok=true`.

### Task 2: Renderizar mídia sob demanda na conversa

**Files:**
- Create: `src/app/(admin)/atendimento/message-media.tsx`
- Modify: `src/app/(admin)/atendimento/workspace.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- `MessageMedia({ messageId, messageType }): JSX.Element` dispara `getAttendanceMessageMedia` somente no clique.
- Imagens/figurinhas usam `<img>` com `alt` fixo e dimensões responsivas; áudio e vídeo usam `<audio controls>` e `<video controls>`; documentos usam link com nome seguro, `target="_blank"` e `rel="noreferrer"`.
- Mensagens com texto mantêm o texto/legenda e adicionam controle de mídia quando o tipo suporta anexo.

- [x] Substituir fallback genérico somente para tipos de mídia conhecidos; criar rótulos legíveis para interação/botão/localização/contato sem tentar interpretar payload oculto.
- [x] Mostrar carregamento, disponibilidade e recuperação de URL expirada sem exibir a URL na interface.
- [x] Manter carrossel, pedido de Catálogo e mensagens Flow sem alterar seus contratos de dados ou status.

### Task 3: Verificação estática e registro do contrato

**Files:**
- Modify: `docs/planning/implementation-ledger.md`
- Modify: `docs/planning/plano-execucao.md`

- [x] Rodar `pnpm typecheck`.
- [x] Rodar Biome somente nos arquivos TypeScript/TSX alterados e `git diff --check`.
- [x] Registrar o resultado e os limites: versão remota do gateway, cache por clique, ausência de teste automatizado, gateway/dependências ainda sem homologação funcional em staging.
