# Store / Release Readiness — App Dona Antônia

**Estado:** PREPARADO DOCUMENTALMENTE / NÃO PUBLICADO / NÃO HOMOLOGADO NATIVAMENTE
**Data:** 19/09/2026

Este documento é um preflight fail-closed. Não autoriza build, assinatura, TestFlight, Play Console, App Store Connect ou publicação.

## Identidade prevista
- App ID Capacitor: `br.com.donaantonia.app`.
- Nome: `Dona Antônia`.
- Web dir: `dist`.
- Produção, pedidos reais, push real e executores externos: OFF.

## Gate Android
Antes de qualquer release Android, exigir evidência real de: dependências instaladas; Android SDK/ADB; plataforma nativa criada; Gradle build limpo; applicationId conferido; versionCode/versionName definidos; assinatura/release keystore tratada fora do repositório; permissões mínimas revisadas; network security revisada; App Links verificados; Photo Picker/câmera/microfone testados; secure storage/Keystore testado; deep links/push sintético testados; accessibility smoke; APK/AAB gerado e inspecionado; aparelho real testado.

**Estado atual:** BLOCKED_NATIVE_TOOLCHAIN. Não marcar Android homologado.

## Gate iOS
Antes de qualquer release iOS, exigir evidência real de: macOS/Xcode; plataforma nativa criada; bundle identifier conferido; version/build definidos; signing/provisioning; entitlements mínimos; privacy usage descriptions; ATS revisado; Universal Links verificados; Photo Picker/câmera/microfone testados; Keychain testado; deep links/push sintético testados; VoiceOver smoke; archive/IPA gerado e inspecionado; iPhone real testado.

**Estado atual:** BLOCKED_NATIVE_TOOLCHAIN. Não marcar iOS homologado.

## Metadata e revisão
Antes de submissão humana futura, preparar e revisar: descrição curta/longa; categoria; classificação etária; screenshots reais do build homologado; ícone/splash finais; URL de suporte; política de privacidade; contato de revisão; instruções de acesso somente com conta/fixture TEST quando aplicável. Nunca usar dados reais de clientes como reviewer data.

## Privacy / Data Safety
A declaração de loja deve ser derivada do comportamento do build final, não de intenção. Confirmar em build real: dados coletados, finalidade, retenção, compartilhamento, criptografia em trânsito, exclusão, permissões de mídia/microfone/câmera, telemetria e identificadores. Se qualquer comportamento divergir da política sintética atual, bloquear submissão até revisão.

## Artefatos exigidos antes de release
- relatório de `npm run native:preflight`;
- typecheck/testes associados ao mesmo HEAD;
- hash/versão do commit usado no build;
- evidência de build Android/iOS real;
- smoke test em dispositivo;
- checklist de privacidade preenchido contra o binário;
- confirmação de que `comprar/` permaneceu fora do escopo;
- confirmação de produção/pedidos/push reais OFF durante homologação.

## Regras de bloqueio
Falhar fechado se faltar toolchain, credencial, assinatura, console, aparelho, evidência de teste, política de privacidade, metadata obrigatória ou correspondência entre binário e HEAD. Não contornar quota, não apagar Edge Functions, não aumentar plano/spend cap e não publicar automaticamente.
